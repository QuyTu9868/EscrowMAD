// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./EscrowMAD.sol";
import "./EscrowSBT.sol";

/**
 * @title EscrowFactory
 * @notice Deploy EscrowMAD mới + tự động authorize mint SBT
 */
contract EscrowFactory {

    // ─── Storage ──────────────────────────────────────────────────────────────

    EscrowSBT public immutable sbtContract;
    address[]  public allEscrows;

    // ─── Events ───────────────────────────────────────────────────────────────

    event EscrowCreated(
        address indexed escrowAddress,
        address indexed seller,
        uint256 itemPrice,
        string  description
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _sbtContract) {
        require(_sbtContract != address(0), "Invalid SBT address");
        sbtContract = EscrowSBT(_sbtContract);
    }

    // ─── Create Escrow ────────────────────────────────────────────────────────

    /**
     * @notice Seller gọi hàm này thay vì deploy EscrowMAD trực tiếp
     * @param _itemPrice   Giá hàng (wei) — phải chia hết cho 5
     * @param _description Mô tả hàng hóa
     * Seller gửi kèm: deposit = itemPrice / 5
     */
    function createEscrow(
        uint256 _itemPrice,
        string calldata _description
    ) external payable returns (address) {
        // Deploy EscrowMAD mới
        EscrowMAD escrow = new EscrowMAD{value: msg.value}(
            _itemPrice,
            _description,
            address(sbtContract),
            msg.sender
        );

        address escrowAddress = address(escrow);

        // Tự động authorize EscrowMAD này được mint SBT
        sbtContract.authorizeMinter(escrowAddress);

        // Lưu lại danh sách
        allEscrows.push(escrowAddress);

        emit EscrowCreated(escrowAddress, msg.sender, _itemPrice, _description);

        return escrowAddress;
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getAllEscrows() external view returns (address[] memory) {
        return allEscrows;
    }

    function getTotalEscrows() external view returns (uint256) {
        return allEscrows.length;
    }
}