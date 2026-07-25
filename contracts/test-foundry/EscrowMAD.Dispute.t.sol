// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {EscrowMAD} from "../contracts/EscrowMAD.sol";
import {EscrowFactory} from "../contracts/EscrowFactory.sol";
import {EscrowSBT} from "../contracts/EscrowSBT.sol";

/// @notice CP-1: raiseDispute() / resolveDispute() / onlyAgent — scoped test,
/// không test lại toàn bộ luồng escrow cũ (đã có test/EscrowTest.js, tuy đang
/// hỏng vì lý do khác không liên quan tới CP-1, xem implementation-notes.md).
contract EscrowMADDisputeTest is Test {
    EscrowSBT sbt;
    EscrowFactory factory;
    EscrowMAD escrow;

    address deployer = address(this);
    address agent    = makeAddr("agent");
    address seller   = makeAddr("seller");
    address buyer    = makeAddr("buyer");
    address outsider = makeAddr("outsider");

    uint256 constant ITEM_PRICE = 1 ether;
    uint256 constant DEPOSIT    = ITEM_PRICE / 5;
    uint256 constant POOL       = ITEM_PRICE + 2 * DEPOSIT; // 1.4 ether

    function setUp() public {
        sbt     = new EscrowSBT();
        factory = new EscrowFactory(address(sbt));
        sbt.setFactory(address(factory));
        factory.setAgent(agent);

        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);

        vm.prank(seller);
        address escrowAddr = factory.createEscrow{value: DEPOSIT}(ITEM_PRICE, "Test item");
        escrow = EscrowMAD(escrowAddr);

        vm.prank(buyer);
        escrow.joinAsBuyer{value: ITEM_PRICE + DEPOSIT}("QmBuyerAddressHash");
        // state == ACTIVE, contract balance == POOL
    }

    // ─── raiseDispute ───────────────────────────────────────────────────────

    function test_RaiseDispute_ByBuyer_MovesToDisputed() public {
        vm.prank(buyer);
        escrow.raiseDispute();
        assertEq(uint256(escrow.getState()), 7); // DISPUTED
    }

    function test_RaiseDispute_BySeller_MovesToDisputed() public {
        vm.prank(seller);
        escrow.raiseDispute();
        assertEq(uint256(escrow.getState()), 7);
    }

    function test_RaiseDispute_RevertsForOutsider() public {
        vm.prank(outsider);
        vm.expectRevert("Only participants");
        escrow.raiseDispute();
    }

    function test_RaiseDispute_RevertsWhenAwaitingBuyer() public {
        vm.prank(seller);
        address freshAddr = factory.createEscrow{value: DEPOSIT}(ITEM_PRICE, "No buyer yet");
        EscrowMAD fresh = EscrowMAD(freshAddr);

        vm.prank(seller);
        vm.expectRevert("Cannot raise dispute in this state");
        fresh.raiseDispute();
    }

    function test_RaiseDispute_RevertsWhenCompleted() public {
        vm.prank(seller);
        escrow.uploadItemImage("QmItemImage");

        vm.prank(buyer);
        escrow.confirmDelivery();
        assertEq(uint256(escrow.getState()), 4); // COMPLETED

        vm.prank(buyer);
        vm.expectRevert("Cannot raise dispute in this state");
        escrow.raiseDispute();
    }

    // ─── resolveDispute: authorization ─────────────────────────────────────

    function test_ResolveDispute_RevertsForNonAgent() public {
        vm.prank(buyer);
        escrow.raiseDispute();

        vm.prank(outsider);
        vm.expectRevert("Not agent");
        escrow.resolveDispute(true);
    }

    function test_ResolveDispute_RevertsForSellerOrBuyerThemselves() public {
        vm.prank(buyer);
        escrow.raiseDispute();

        vm.prank(seller);
        vm.expectRevert("Not agent");
        escrow.resolveDispute(true);

        vm.prank(buyer);
        vm.expectRevert("Not agent");
        escrow.resolveDispute(false);
    }

    function test_ResolveDispute_RevertsWhenNotDisputed() public {
        // still ACTIVE, never raised
        vm.prank(agent);
        vm.expectRevert("Invalid state");
        escrow.resolveDispute(true);
    }

    // ─── resolveDispute: fund movement ──────────────────────────────────────

    function test_ResolveDispute_ReleaseToSeller_SendsFullPoolToSeller() public {
        vm.prank(buyer);
        escrow.raiseDispute();

        uint256 sellerBefore = seller.balance;
        uint256 buyerBefore  = buyer.balance;

        vm.prank(agent);
        escrow.resolveDispute(true);

        assertEq(seller.balance - sellerBefore, POOL);
        assertEq(buyer.balance, buyerBefore); // buyer nhận 0
        assertEq(uint256(escrow.getState()), 4); // COMPLETED
        assertEq(address(escrow).balance, 0);
    }

    function test_ResolveDispute_RefundToBuyer_SendsFullPoolToBuyer() public {
        vm.prank(seller);
        escrow.raiseDispute();

        uint256 sellerBefore = seller.balance;
        uint256 buyerBefore  = buyer.balance;

        vm.prank(agent);
        escrow.resolveDispute(false);

        assertEq(buyer.balance - buyerBefore, POOL);
        assertEq(seller.balance, sellerBefore); // seller nhận 0
        assertEq(uint256(escrow.getState()), 4); // COMPLETED
    }

    function test_ResolveDispute_RevertsOnSecondCall() public {
        vm.prank(buyer);
        escrow.raiseDispute();

        vm.prank(agent);
        escrow.resolveDispute(true);

        vm.prank(agent);
        vm.expectRevert("Invalid state");
        escrow.resolveDispute(false);
    }

    // ─── raiseDispute from other pre-dispute states ─────────────────────────

    function test_RaiseDispute_FromCancelRequested_MovesToDisputed() public {
        vm.prank(seller);
        escrow.requestCancel();
        assertEq(uint256(escrow.getState()), 2); // CANCEL_REQUESTED

        vm.prank(buyer);
        escrow.raiseDispute();
        assertEq(uint256(escrow.getState()), 7);
    }

    function test_RaiseDispute_FromReturnRequested_MovesToDisputed() public {
        vm.prank(buyer);
        escrow.requestReturn("QmEvidenceHash");
        assertEq(uint256(escrow.getState()), 3); // RETURN_REQUESTED

        vm.prank(seller);
        escrow.raiseDispute();
        assertEq(uint256(escrow.getState()), 7);
    }

    // ─── Factory: onlyOwner on setAgent ──────────────────────────────────────

    function test_SetAgent_RevertsForNonOwner() public {
        vm.prank(outsider);
        vm.expectRevert("Not owner");
        factory.setAgent(outsider);
    }

    function test_SetAgent_RevertsForZeroAddress() public {
        vm.expectRevert("Invalid agent");
        factory.setAgent(address(0));
    }

    // ─── Constructor: factory address ────────────────────────────────────────

    function test_Constructor_RevertsWhenFactoryIsZero() public {
        vm.expectRevert("Invalid factory");
        new EscrowMAD{value: DEPOSIT}(ITEM_PRICE, "x", address(sbt), seller, address(0));
    }
}
