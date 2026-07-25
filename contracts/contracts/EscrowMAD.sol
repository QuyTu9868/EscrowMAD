// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title EscrowMAD v3
 * @notice Hợp đồng ký quỹ 2 bên: Seller và Buyer (không có Arbiter)
 *
 * ─── Cơ chế tiền ───────────────────────────────────────────
 *   Seller gửi:   deposit = itemPrice / 5  (20% cọc)
 *   Buyer gửi:    itemPrice + deposit       (tiền hàng + 20% cọc)
 *   Pool tổng:    itemPrice + 2 * deposit
 *
 * ─── Luồng trạng thái ──────────────────────────────────────
 *   AWAITING_BUYER → ACTIVE → COMPLETED
 *   AWAITING_BUYER → CANCELLED          (seller cancel sau 24h)
 *   ACTIVE → CANCEL_REQUESTED → COMPLETED  (mutual cancel, approve bởi bên kia)
 *                             → ACTIVE     (rút lại request)
 *   ACTIVE → RETURN_REQUESTED → COMPLETED  (approve hoặc timeout 72h)
 *                             → ACTIVE     (rút lại request)
 *   ACTIVE → SELLER_CLAIMED              (buyer mất tích sau 14 ngày)
 *
 * ─── Phân phối tiền ────────────────────────────────────────
 *   confirmDelivery:           Seller: itemPrice+deposit | Buyer: deposit
 *   mutual cancel:             Seller: deposit           | Buyer: itemPrice+deposit
 *   return approved/timeout:   Seller: deposit           | Buyer: itemPrice+deposit
 *   seller claim (14 ngày):    Seller: itemPrice+deposit | Buyer: 0 (phạt)
 *   seller cancel (24h):       Seller: deposit           | Buyer: —
 */

interface IEscrowSBT {
    function mint(address to, string calldata imageHash) external;
}
contract EscrowMAD {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum State {
        AWAITING_BUYER,    // 0 — chờ buyer tham gia
        ACTIVE,            // 1 — đang giao dịch
        CANCEL_REQUESTED,  // 2 — đang chờ đồng thuận hủy
        RETURN_REQUESTED,  // 3 — đang chờ đồng thuận trả hàng
        COMPLETED,         // 4 — hoàn thành
        CANCELLED,         // 5 — đã hủy (seller cancel sau 24h)
        SELLER_CLAIMED     // 6 — seller tự lấy tiền sau 14 ngày buyer mất tích
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public immutable seller;
    address public buyer;
    address public immutable sbtContract;

    uint256 public itemPrice;
    uint256 public deposit;        // 20% itemPrice

    State   public state;
    uint256 public createdAt;      // timestamp deploy
    uint256 public activeAt;       // timestamp buyer join
    uint256 public requestedAt;    // timestamp cancel/return request
    uint256 public shippedAt; // timestamp seller mark shipped
    uint256 public claimPausedAt;

    // ─── Request tracking ─────────────────────────────────────────────────────
    address public requestInitiator;   // ai gửi request (cancel hoặc return)

    // ─── Timeouts ─────────────────────────────────────────────────────────────
    uint256 public constant AWAITING_TIMEOUT = 24 hours;  // seller cancel nếu không có buyer
    uint256 public constant ACTIVE_TIMEOUT   = 17 days;   // seller claim nếu buyer mất tích
    uint256 public constant RETURN_TIMEOUT   = 72 hours;  // auto approve return nếu bên kia im lặng

    // ─── IPFS Evidence ────────────────────────────────────────────────────────
    string public itemDescription;
    string public itemImageHash;
    string public buyerAddressHash;
    string public deliveryProofHash;
    string public returnEvidenceHash;  // bằng chứng hàng lỗi khi return

    // ─── Events ───────────────────────────────────────────────────────────────

    event BuyerJoined(address indexed buyer);
    event BuyerAddressSubmitted(string ipfsHash);
    event ItemImageUploaded(string ipfsHash);
    event DeliveryProofUploaded(string ipfsHash);
    event DeliveryConfirmed();
    event EscrowCancelled();
    event SellerClaimedAfterTimeout();

    event CancelRequested(address indexed by);
    event CancelRequestWithdrawn(address indexed by);
    event MutualCancelCompleted();

    event ReturnRequested(address indexed by, string evidenceHash);
    event ReturnRequestWithdrawn(address indexed by);
    event ReturnApproved();
    event ReturnAutoApproved();

    event MessageSent(address indexed from, string message, uint256 timestamp);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlySeller() { require(msg.sender == seller, "Only seller"); _; }
    modifier onlyBuyer()  { require(msg.sender == buyer,  "Only buyer");  _; }
    modifier onlyParticipant() {
        require(msg.sender == seller || msg.sender == buyer, "Only participants");
        _;
    }
    modifier inState(State _state) {
        require(state == _state, "Invalid state");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────
    /**
     * @param _itemPrice    Giá hàng (wei) — phải chia hết cho 5
     * @param _description  Mô tả hàng hóa
     * Seller gửi kèm: deposit = itemPrice / 5
     */
    constructor(
        uint256 _itemPrice,
        string memory _description,
        address _sbtContract,
        address _seller 
    ) payable {
        require(_itemPrice > 0,       "Price must be > 0");
        require(_itemPrice % 5 == 0,  "Price must be divisible by 5");
        require(_sbtContract != address(0), "Invalid SBT contract");

        uint256 requiredDeposit = _itemPrice / 5;
        require(msg.value == requiredDeposit, "Seller must send 20% deposit");

        seller          = _seller;
        itemPrice       = _itemPrice;
        deposit         = requiredDeposit;
        itemDescription = _description;
        sbtContract     = _sbtContract;
        state           = State.AWAITING_BUYER;
        createdAt       = block.timestamp;
}

    // ─── Seller upload ảnh hàng ───────────────────────────────────────────────

    function uploadItemImage(string calldata ipfsHash) external onlySeller {
        require(bytes(ipfsHash).length > 0, "Empty hash");
        itemImageHash = ipfsHash;
        emit ItemImageUploaded(ipfsHash);
    }

    // ─── Buyer tham gia ───────────────────────────────────────────────────────

    function joinAsBuyer(string calldata _addressHash)
        external
        payable
        inState(State.AWAITING_BUYER)
    {
        require(msg.sender != seller,             "Seller cannot be buyer");
        require(msg.value == itemPrice + deposit, "Buyer must send itemPrice + 20% deposit");
        require(bytes(_addressHash).length > 0,   "Must submit delivery address");

        buyer            = msg.sender;
        buyerAddressHash = _addressHash;
        state            = State.ACTIVE;
        activeAt         = block.timestamp;

        emit BuyerJoined(msg.sender);
        emit BuyerAddressSubmitted(_addressHash);
    }

    // ─── Buyer xác nhận nhận hàng ─────────────────────────────────────────────
    /**
     * Seller nhận: itemPrice + deposit
     * Buyer nhận:  deposit
     */
    function confirmDelivery() external onlyBuyer inState(State.ACTIVE) {
        require(bytes(itemImageHash).length > 0, "Seller must upload item image first");
        state = State.COMPLETED;
        emit DeliveryConfirmed();
        _transfer(seller, itemPrice + deposit);
        _transfer(buyer,  deposit);
    IEscrowSBT(sbtContract).mint(buyer, itemImageHash);
}

    // ─── Seller upload bằng chứng giao hàng ──────────────────────────────────

    function uploadDeliveryProof(string calldata ipfsHash)
        external
        onlySeller
        inState(State.ACTIVE)
    {
        require(bytes(ipfsHash).length > 0, "Empty hash");
        deliveryProofHash = ipfsHash;
        emit DeliveryProofUploaded(ipfsHash);
    }
    // ─── Seller mark đã ship hàng ────────────────────────────────────────────

    function markShipped() external onlySeller inState(State.ACTIVE) {
    require(shippedAt == 0, "Already marked as shipped");
    shippedAt = block.timestamp;
    }
    // ─── Seller cancel sau 24h không có buyer ────────────────────────────────

    function cancelAfter24h() external onlySeller inState(State.AWAITING_BUYER) {
        require(block.timestamp >= createdAt + AWAITING_TIMEOUT, "Cannot cancel before 24h");
        state = State.CANCELLED;
        emit EscrowCancelled();
        _transfer(seller, deposit);
    }

    // ─── Seller claim sau 14 ngày buyer mất tích ─────────────────────────────
    /**
     * Seller nhận: itemPrice + deposit
     * Buyer nhận:  0 (phạt mất tích)
     */
    function claimAfterBuyerTimeout() external onlySeller inState(State.ACTIVE) {
    require(shippedAt > 0, "Must mark as shipped first");
    require(
        block.timestamp >= shippedAt + ACTIVE_TIMEOUT,
        "Cannot claim before 14 days after shipped"
    );
    state = State.SELLER_CLAIMED;
    emit SellerClaimedAfterTimeout();
    _transfer(seller, itemPrice + deposit * 2);
}
        // deposit của buyer bị giữ lại (phạt mất tích)

    // ═══════════════════════════════════════════════════════════════════════════
    // MUTUAL CANCEL
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Bất kỳ bên nào gửi request hủy giao dịch
     * Không có timeout — lệnh đứng cho đến khi bên kia approve hoặc initiator rút lại
     */
    function requestCancel() external onlyParticipant inState(State.ACTIVE) {
        state            = State.CANCEL_REQUESTED;
        requestInitiator = msg.sender;
        requestedAt      = block.timestamp;
        emit CancelRequested(msg.sender);
    }

    /**
     * @notice Rút lại request cancel — chỉ người đã gửi request mới được rút
     */
    function withdrawCancelRequest()
        external
        onlyParticipant
        inState(State.CANCEL_REQUESTED)
    {
        require(msg.sender == requestInitiator, "Only initiator can withdraw");
        state            = State.ACTIVE;
        requestInitiator = address(0);
        emit CancelRequestWithdrawn(msg.sender);
    }

    /**
     * @notice Bên kia đồng ý hủy
     * Seller nhận lại: deposit
     * Buyer nhận lại:  itemPrice + deposit
     */
    function approveCancel()
        external
        onlyParticipant
        inState(State.CANCEL_REQUESTED)
    {
        require(msg.sender != requestInitiator, "Cannot approve your own request");
        state = State.COMPLETED;
        emit MutualCancelCompleted();
        _transfer(seller, deposit);
        _transfer(buyer,  itemPrice + deposit);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RETURN ITEM
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Bất kỳ bên nào gửi request trả hàng kèm bằng chứng IPFS
     * Nếu bên kia không phản hồi sau 72h → tự động approve
     * @param evidenceHash IPFS hash của bằng chứng (ảnh hàng lỗi, ảnh gửi trả, v.v.)
     */
    function requestReturn(string calldata evidenceHash)
        external
        onlyBuyer
        inState(State.ACTIVE)
    {
        require(bytes(evidenceHash).length > 0, "Must provide evidence");
        state              = State.RETURN_REQUESTED;
        requestInitiator   = msg.sender;
        requestedAt        = block.timestamp;
        returnEvidenceHash = evidenceHash;
        claimPausedAt      = block.timestamp;
        emit ReturnRequested(msg.sender, evidenceHash);
    }

    /**
     * @notice Rút lại request return — chỉ người đã gửi request mới được rút
     */
    function withdrawReturnRequest()
        external
        onlyParticipant
        inState(State.RETURN_REQUESTED)
    {
        require(msg.sender == requestInitiator, "Only initiator can withdraw");
        if (claimPausedAt > 0 && shippedAt > 0) {
        shippedAt = shippedAt + (block.timestamp - claimPausedAt);
    }
        claimPausedAt      = 0;
        state              = State.ACTIVE;
        requestInitiator   = address(0);
        returnEvidenceHash = "";
        emit ReturnRequestWithdrawn(msg.sender);
    }

    /**
     * @notice Bên kia chủ động đồng ý trả hàng
     * Seller nhận lại: deposit
     * Buyer nhận lại:  itemPrice + deposit
     */
    function approveReturn()
        external
        onlyParticipant
        inState(State.RETURN_REQUESTED)
    {
        require(msg.sender != requestInitiator, "Cannot approve your own request");
        claimPausedAt = 0;
        state = State.COMPLETED;
        emit ReturnApproved();
        _transfer(seller, deposit);
        _transfer(buyer,  itemPrice + deposit);
    }

    /**
     * @notice Kích hoạt auto-approve sau 72h bên kia không phản hồi
     * Ai cũng có thể gọi hàm này sau khi timeout
     * Seller nhận lại: deposit
     * Buyer nhận lại:  itemPrice + deposit
     */
    function executeReturnAfterTimeout() external inState(State.RETURN_REQUESTED) {
        require(
            block.timestamp >= requestedAt + RETURN_TIMEOUT,"72h timeout not reached");
        claimPausedAt = 0;
        state = State.COMPLETED;
        emit ReturnAutoApproved();
        _transfer(seller, deposit);
        _transfer(buyer,  itemPrice + deposit);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHAT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Gửi tin nhắn — chỉ emit event, không lưu storage → gas rẻ
     * Buyer và seller có thể nhắn khi đang giao dịch (ACTIVE, CANCEL_REQUESTED, RETURN_REQUESTED)
     */
    function sendMessage(string calldata message) external onlyParticipant {
        require(
            state == State.ACTIVE ||
            state == State.CANCEL_REQUESTED ||
            state == State.RETURN_REQUESTED,
            "Cannot message in this state"
        );
        require(bytes(message).length > 0,    "Empty message");
        require(bytes(message).length <= 500, "Message too long (max 500 chars)");
        emit MessageSent(msg.sender, message, block.timestamp);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _transfer(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getBalance() external view returns (uint256) { return address(this).balance; }
    function getState()   external view returns (State)   { return state; }

    /**
     * @notice Trả về toàn bộ thông tin contract trong 1 lần call
     */
    function getInfo() external view returns (
        address _seller,
        address _buyer,
        uint256 _itemPrice,
        uint256 _deposit,
        State   _state,
        uint256 _createdAt,
        uint256 _activeAt,
        uint256 _requestedAt,
        address _requestInitiator,
        string memory _description,
        string memory _itemImageHash,
        string memory _buyerAddressHash,
        string memory _deliveryProofHash,
        string memory _returnEvidenceHash
    ) {
        return (
            seller, buyer,
            itemPrice, deposit,
            state,
            createdAt, activeAt, requestedAt,
            requestInitiator,
            itemDescription, itemImageHash,
            buyerAddressHash, deliveryProofHash,
            returnEvidenceHash
        );
    }
}
