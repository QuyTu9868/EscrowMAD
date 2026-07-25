// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

interface IERC5192 {
    function locked(uint256 tokenId) external view returns (bool);
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
}

/**
 * @title EscrowSBT
 * @notice SBT (Soulbound Token) mint cho buyer khi hoàn thành đơn hàng
 * Tự động burn sau 3 tháng qua Chainlink Automation
 */
contract EscrowSBT is ERC721, IERC5192, Ownable, AutomationCompatibleInterface {

    // ─── Storage ──────────────────────────────────────────────────────────────

    uint256 public nextTokenId;
    uint256 public constant BURN_DELAY = 90 days;

    struct SBTData {
        address escrowContract;  // địa chỉ EscrowMAD tạo ra SBT này
        string  imageHash;       // IPFS hash ảnh hàng
        uint256 mintedAt;        // timestamp mint
        bool    burned;          // đã burn chưa
    }

    mapping(uint256 => SBTData) public sbtData;
    mapping(address => bool)    public authorizedMinters; // EscrowMAD contracts được phép mint
    uint256[] public activeTokens; // danh sách token chưa burn để Chainlink check

    // ─── Events ───────────────────────────────────────────────────────────────

    event Minted(uint256 indexed tokenId, address indexed buyer, address indexed escrowContract);
    event Burned(uint256 indexed tokenId);
    event MinterAuthorized(address indexed escrowContract);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() ERC721("EscrowMAD SBT", "ESBT") Ownable(msg.sender) {}

    // ─── Authorization ────────────────────────────────────────────────────────

    /**
     * @notice Owner thêm EscrowMAD contract được phép mint SBT
     */
    address public factory;

    function setFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "Invalid address");
        factory = _factory;
    }

    function authorizeMinter(address escrowContract) external {
        require(
            msg.sender == owner() || msg.sender == factory,
            "Not authorized"
                );
        require(escrowContract != address(0), "Invalid address");
        authorizedMinters[escrowContract] = true;
        emit MinterAuthorized(escrowContract);
    }

    // ─── Mint ─────────────────────────────────────────────────────────────────

    /**
     * @notice Chỉ EscrowMAD contract đã được authorize mới mint được
     */
    function mint(address to, string calldata imageHash) external {
        require(authorizedMinters[msg.sender], "Not authorized minter");
        require(bytes(imageHash).length > 0,   "Empty image hash");

        uint256 tokenId = nextTokenId++;
        _mint(to, tokenId);

        sbtData[tokenId] = SBTData({
            escrowContract: msg.sender,
            imageHash:      imageHash,
            mintedAt:       block.timestamp,
            burned:         false
        });

        activeTokens.push(tokenId);

        emit Minted(tokenId, to, msg.sender);
        emit Locked(tokenId);
    }

    // ─── SBT: khóa transfer ───────────────────────────────────────────────────

    function locked(uint256 tokenId) external pure override returns (bool) {
        return true; // luôn locked — không thể transfer
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Chỉ cho phép mint (from = 0) và burn (to = 0)
        require(from == address(0) || to == address(0), "SBT: non-transferable");
        return super._update(to, tokenId, auth);
    }

    // ─── Chainlink Automation ─────────────────────────────────────────────────

    /**
     * @notice Chainlink check xem có token nào cần burn không
     */
    function checkUpkeep(bytes calldata)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256[] memory toBurn = new uint256[](activeTokens.length);
        uint256 count = 0;

        for (uint256 i = 0; i < activeTokens.length; i++) {
            uint256 tokenId = activeTokens[i];
            SBTData memory data = sbtData[tokenId];
            if (!data.burned && block.timestamp >= data.mintedAt + BURN_DELAY) {
                toBurn[count++] = tokenId;
            }
        }

        if (count > 0) {
            // cắt array đúng size
            uint256[] memory result = new uint256[](count);
            for (uint256 i = 0; i < count; i++) result[i] = toBurn[i];
            return (true, abi.encode(result));
        }

        return (false, "");
    }

    /**
     * @notice Chainlink gọi hàm này để burn các token đã hết hạn
     */
    function performUpkeep(bytes calldata performData) external override {
        uint256[] memory toBurn = abi.decode(performData, (uint256[]));
        for (uint256 i = 0; i < toBurn.length; i++) {
            _burnToken(toBurn[i]);
        }
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _burnToken(uint256 tokenId) internal {
        SBTData storage data = sbtData[tokenId];
        require(!data.burned, "Already burned");
        require(block.timestamp >= data.mintedAt + BURN_DELAY, "Not yet");

        data.burned = true;
        _burn(tokenId);

        // xóa khỏi activeTokens
        for (uint256 i = 0; i < activeTokens.length; i++) {
            if (activeTokens[i] == tokenId) {
                activeTokens[i] = activeTokens[activeTokens.length - 1];
                activeTokens.pop();
                break;
            }
        }

        emit Burned(tokenId);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getSBTData(uint256 tokenId) external view returns (SBTData memory) {
        return sbtData[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        SBTData memory data = sbtData[tokenId];
        return string(abi.encodePacked("ipfs://", data.imageHash));
    }
}