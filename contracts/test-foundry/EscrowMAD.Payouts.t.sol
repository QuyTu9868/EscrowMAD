// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {EscrowMAD} from "../contracts/EscrowMAD.sol";
import {EscrowFactory} from "../contracts/EscrowFactory.sol";

/// @notice Kiem tra TOAN BO cac nhanh chia tien, doi chieu tung dong wei.
/// Viet sau khi go SBT khoi confirmDelivery de chac chan khong nhanh nao lech.
contract EscrowMADPayoutsTest is Test {
    EscrowFactory factory;

    address agent  = makeAddr("agent");
    address seller = makeAddr("seller");
    address buyer  = makeAddr("buyer");

    uint256 constant ITEM_PRICE = 1 ether;
    uint256 constant DEPOSIT    = ITEM_PRICE / 5;      // 0.2
    uint256 constant POOL       = ITEM_PRICE + 2 * DEPOSIT; // 1.4

    function setUp() public {
        factory = new EscrowFactory();
        factory.setAgent(agent);
        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);
    }

    function _create() internal returns (EscrowMAD) {
        vm.prank(seller);
        return EscrowMAD(factory.createEscrow{value: DEPOSIT}(ITEM_PRICE, "Item"));
    }

    function _createActive() internal returns (EscrowMAD e) {
        e = _create();
        vm.prank(buyer);
        e.joinAsBuyer{value: ITEM_PRICE + DEPOSIT}("QmAddr");
    }

    // Tien vao contract phai dung bang pool ngay sau khi buyer tham gia
    function test_PoolIsFullyFundedAfterJoin() public {
        EscrowMAD e = _createActive();
        assertEq(address(e).balance, POOL);
    }

    // confirmDelivery: seller nhan itemPrice + deposit, buyer nhan lai deposit
    function test_ConfirmDelivery_SplitsCorrectly() public {
        EscrowMAD e = _createActive();
        vm.prank(seller);
        e.uploadItemImage("QmImg");

        uint256 s0 = seller.balance;
        uint256 b0 = buyer.balance;

        vm.prank(buyer);
        e.confirmDelivery();

        assertEq(seller.balance - s0, ITEM_PRICE + DEPOSIT, "seller nhan sai");
        assertEq(buyer.balance - b0, DEPOSIT, "buyer nhan sai");
        assertEq(address(e).balance, 0, "escrow con du tien");
        assertEq(uint256(e.getState()), 4);
    }

    // mutual cancel: seller lay lai coc, buyer lay lai tien hang + coc
    function test_ApproveCancel_RefundsBothSides() public {
        EscrowMAD e = _createActive();
        vm.prank(seller);
        e.requestCancel();

        uint256 s0 = seller.balance;
        uint256 b0 = buyer.balance;

        vm.prank(buyer);
        e.approveCancel();

        assertEq(seller.balance - s0, DEPOSIT);
        assertEq(buyer.balance - b0, ITEM_PRICE + DEPOSIT);
        assertEq(address(e).balance, 0);
    }

    // return duoc dong y: chia giong mutual cancel
    function test_ApproveReturn_RefundsBothSides() public {
        EscrowMAD e = _createActive();
        vm.prank(buyer);
        e.requestReturn("QmEvidence");

        uint256 s0 = seller.balance;
        uint256 b0 = buyer.balance;

        vm.prank(seller);
        e.approveReturn();

        assertEq(seller.balance - s0, DEPOSIT);
        assertEq(buyer.balance - b0, ITEM_PRICE + DEPOSIT);
        assertEq(address(e).balance, 0);
    }

    // return tu dong duyet sau 72h neu ben kia im lang
    function test_ExecuteReturnAfterTimeout_RefundsBothSides() public {
        EscrowMAD e = _createActive();
        vm.prank(buyer);
        e.requestReturn("QmEvidence");

        vm.warp(block.timestamp + 72 hours + 1);

        uint256 s0 = seller.balance;
        uint256 b0 = buyer.balance;
        e.executeReturnAfterTimeout();

        assertEq(seller.balance - s0, DEPOSIT);
        assertEq(buyer.balance - b0, ITEM_PRICE + DEPOSIT);
        assertEq(address(e).balance, 0);
    }

    // seller huy sau 24h khong co buyer: lay lai dung coc da bo ra
    function test_CancelAfter24h_ReturnsSellerDeposit() public {
        EscrowMAD e = _create();
        vm.warp(block.timestamp + 24 hours + 1);

        uint256 s0 = seller.balance;
        vm.prank(seller);
        e.cancelAfter24h();

        assertEq(seller.balance - s0, DEPOSIT);
        assertEq(address(e).balance, 0);
    }

    // buyer mat tich sau 17 ngay ke tu luc ship: seller lay toan bo pool
    function test_ClaimAfterBuyerTimeout_GivesSellerEverything() public {
        EscrowMAD e = _createActive();
        vm.prank(seller);
        e.markShipped();

        vm.warp(block.timestamp + 17 days + 1);

        uint256 s0 = seller.balance;
        uint256 b0 = buyer.balance;
        vm.prank(seller);
        e.claimAfterBuyerTimeout();

        assertEq(seller.balance - s0, POOL, "seller phai nhan toan bo pool");
        assertEq(buyer.balance, b0, "buyer khong duoc nhan gi");
        assertEq(address(e).balance, 0);
    }

    // Khong nhanh nao duoc lam boc hoi tien: tong ra luon bang tong vao
    function test_NoPathLosesFunds() public {
        EscrowMAD e = _createActive();
        uint256 totalIn = DEPOSIT + ITEM_PRICE + DEPOSIT;

        uint256 s0 = seller.balance;
        uint256 b0 = buyer.balance;

        vm.prank(buyer);
        e.raiseDispute();
        vm.prank(agent);
        e.resolveDispute(false);

        uint256 paidOut = (seller.balance - s0) + (buyer.balance - b0);
        assertEq(paidOut, totalIn, "tong chi ra phai bang tong nap vao");
        assertEq(address(e).balance, 0);
    }
}
