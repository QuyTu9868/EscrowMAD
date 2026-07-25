const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * EscrowMAD v3 — Test Cases (không có Arbiter)
 *
 * TC1:  Buyer join → confirm delivery → seller nhận tiền
 * TC2:  Seller cancel sau 24h không có buyer
 * TC3:  Không thể cancel trước 24h
 * TC4:  Seller claim sau 14 ngày buyer mất tích
 * TC5:  Mutual cancel — seller request, buyer approve
 * TC6:  Mutual cancel — buyer request, seller approve
 * TC7:  Rút lại cancel request
 * TC8:  Return item — buyer request, seller approve
 * TC9:  Return item — seller request, buyer approve
 * TC10: Rút lại return request
 * TC11: Auto approve return sau 72h
 * TC12: Chat — gửi tin nhắn
 * TC13: Guard checks
 */
describe("EscrowMAD v3", function () {

  const ITEM_PRICE  = ethers.parseEther("1");     // phải chia hết cho 5
  const DEPOSIT     = ethers.parseEther("0.2");   // 20%
  const SELLER_SEND = DEPOSIT;
  const BUYER_SEND  = ITEM_PRICE + DEPOSIT;       // 1.2 ETH
  const DESCRIPTION = "Test item v3";
  const ADDR_HASH   = "QmBuyerAddressHash123";

  let seller, buyer, other;
  let EscrowFactory;

  async function deployEscrow() {
    const escrow = await EscrowFactory.connect(seller).deploy(
      ITEM_PRICE,
      DESCRIPTION,
      { value: SELLER_SEND }
    );
    await escrow.waitForDeployment();
    return escrow;
  }

  async function deployAndActivate() {
    const escrow = await deployEscrow();
    await escrow.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });
    return escrow;
  }

  beforeEach(async function () {
    [seller, buyer, other] = await ethers.getSigners();
    EscrowFactory = await ethers.getContractFactory("EscrowMAD");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC1 — Buyer join → confirm delivery
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC1: Buyer join → confirm delivery → seller nhận tiền", function () {
    it("should transfer correct amounts on confirmDelivery", async function () {
      const escrow = await deployEscrow();
      await escrow.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });
      expect(await escrow.getState()).to.equal(1); // ACTIVE

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const buyerBefore  = await ethers.provider.getBalance(buyer.address);

      const tx      = await escrow.connect(buyer).confirmDelivery();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      const buyerAfter  = await ethers.provider.getBalance(buyer.address);

      expect(sellerAfter - sellerBefore).to.equal(ITEM_PRICE + DEPOSIT);
      expect(buyerAfter - buyerBefore + gasCost).to.equal(DEPOSIT);
      expect(await escrow.getBalance()).to.equal(0n);
      expect(await escrow.getState()).to.equal(4); // COMPLETED
    });

    it("should emit DeliveryConfirmed event", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(buyer).confirmDelivery())
        .to.emit(escrow, "DeliveryConfirmed");
    });

    it("should reject confirmDelivery from non-buyer", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(other).confirmDelivery())
        .to.be.revertedWith("Only buyer");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC2 — Seller cancel sau 24h
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC2: Seller cancel sau 24h không có buyer", function () {
    it("should refund seller deposit after 24h", async function () {
      const escrow = await deployEscrow();
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const tx      = await escrow.connect(seller).cancelAfter24h();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      expect(sellerAfter - sellerBefore + gasCost).to.equal(DEPOSIT);
      expect(await escrow.getState()).to.equal(5); // CANCELLED
      expect(await escrow.getBalance()).to.equal(0n);
    });

    it("should emit EscrowCancelled event", async function () {
      const escrow = await deployEscrow();
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(escrow.connect(seller).cancelAfter24h())
        .to.emit(escrow, "EscrowCancelled");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC3 — Không thể cancel trước 24h
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC3: Không thể cancel trước 24h", function () {
    it("should revert if cancel before 24h", async function () {
      const escrow = await deployEscrow();
      await expect(escrow.connect(seller).cancelAfter24h())
        .to.be.revertedWith("Cannot cancel before 24h");
    });

    it("should revert at 23h59m", async function () {
      const escrow = await deployEscrow();
      await ethers.provider.send("evm_increaseTime", [23 * 60 * 60 + 59 * 60]);
      await ethers.provider.send("evm_mine");
      await expect(escrow.connect(seller).cancelAfter24h())
        .to.be.revertedWith("Cannot cancel before 24h");
    });

    it("should revert if non-seller calls cancel", async function () {
      const escrow = await deployEscrow();
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(escrow.connect(other).cancelAfter24h())
        .to.be.revertedWith("Only seller");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC4 — Seller claim sau 14 ngày buyer mất tích
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC4: Seller claim sau 14 ngày buyer mất tích", function () {
    it("seller should claim itemPrice+deposit after 14 days", async function () {
      const escrow = await deployAndActivate();
      await ethers.provider.send("evm_increaseTime", [14 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const tx      = await escrow.connect(seller).claimAfterBuyerTimeout();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      expect(sellerAfter - sellerBefore + gasCost).to.equal(ITEM_PRICE + DEPOSIT);
      expect(await escrow.getState()).to.equal(6); // SELLER_CLAIMED
    });

    it("should revert if claimed before 14 days", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(seller).claimAfterBuyerTimeout())
        .to.be.revertedWith("Cannot claim before 14 days");
    });

    it("should emit SellerClaimedAfterTimeout event", async function () {
      const escrow = await deployAndActivate();
      await ethers.provider.send("evm_increaseTime", [14 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(escrow.connect(seller).claimAfterBuyerTimeout())
        .to.emit(escrow, "SellerClaimedAfterTimeout");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC5 — Mutual cancel: seller request, buyer approve
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC5: Mutual cancel — seller request, buyer approve", function () {
    it("both should get refunds on mutual cancel", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestCancel();
      expect(await escrow.getState()).to.equal(2); // CANCEL_REQUESTED

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const buyerBefore  = await ethers.provider.getBalance(buyer.address);

      const tx      = await escrow.connect(buyer).approveCancel();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      const buyerAfter  = await ethers.provider.getBalance(buyer.address);

      expect(sellerAfter - sellerBefore).to.equal(DEPOSIT);
      expect(buyerAfter - buyerBefore + gasCost).to.equal(ITEM_PRICE + DEPOSIT);
      expect(await escrow.getBalance()).to.equal(0n);
      expect(await escrow.getState()).to.equal(4); // COMPLETED
    });

    it("should emit MutualCancelCompleted event", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestCancel();
      await expect(escrow.connect(buyer).approveCancel())
        .to.emit(escrow, "MutualCancelCompleted");
    });

    it("should revert if initiator tries to approve own request", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestCancel();
      await expect(escrow.connect(seller).approveCancel())
        .to.be.revertedWith("Cannot approve your own request");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC6 — Mutual cancel: buyer request, seller approve
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC6: Mutual cancel — buyer request, seller approve", function () {
    it("buyer can request cancel and seller can approve", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestCancel();
      expect(await escrow.requestInitiator()).to.equal(buyer.address);

      await escrow.connect(seller).approveCancel();

      expect(await escrow.getBalance()).to.equal(0n);
      expect(await escrow.getState()).to.equal(4); // COMPLETED
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC7 — Rút lại cancel request
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC7: Rút lại cancel request", function () {
    it("initiator can withdraw → state back to ACTIVE", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestCancel();
      expect(await escrow.getState()).to.equal(2);

      await escrow.connect(seller).withdrawCancelRequest();
      expect(await escrow.getState()).to.equal(1); // ACTIVE
      expect(await escrow.requestInitiator()).to.equal(ethers.ZeroAddress);
    });

    it("non-initiator cannot withdraw", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestCancel();
      await expect(escrow.connect(buyer).withdrawCancelRequest())
        .to.be.revertedWith("Only initiator can withdraw");
    });

    it("should emit CancelRequestWithdrawn", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestCancel();
      await expect(escrow.connect(buyer).withdrawCancelRequest())
        .to.emit(escrow, "CancelRequestWithdrawn");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC8 — Return item: buyer request, seller approve
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC8: Return item — buyer request, seller approve", function () {
    it("should refund both on approved return", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestReturn("QmEvidenceHash");
      expect(await escrow.getState()).to.equal(3); // RETURN_REQUESTED
      expect(await escrow.returnEvidenceHash()).to.equal("QmEvidenceHash");

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const buyerBefore  = await ethers.provider.getBalance(buyer.address);

      const tx      = await escrow.connect(seller).approveReturn();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      const buyerAfter  = await ethers.provider.getBalance(buyer.address);

      expect(sellerAfter - sellerBefore + gasCost).to.equal(DEPOSIT);
      expect(buyerAfter - buyerBefore).to.equal(ITEM_PRICE + DEPOSIT);
      expect(await escrow.getBalance()).to.equal(0n);
      expect(await escrow.getState()).to.equal(4); // COMPLETED
    });

    it("should revert if evidence hash is empty", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(buyer).requestReturn(""))
        .to.be.revertedWith("Must provide evidence");
    });

    it("should emit ReturnRequested event", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(buyer).requestReturn("QmEvidenceHash"))
        .to.emit(escrow, "ReturnRequested")
        .withArgs(buyer.address, "QmEvidenceHash");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC9 — Return item: seller request, buyer approve
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC9: Return item — seller request, buyer approve", function () {
    it("seller can request return and buyer can approve", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestReturn("QmSellerEvidenceHash");
      expect(await escrow.requestInitiator()).to.equal(seller.address);

      await escrow.connect(buyer).approveReturn();

      expect(await escrow.getBalance()).to.equal(0n);
      expect(await escrow.getState()).to.equal(4); // COMPLETED
    });

    it("should revert if initiator tries to approve own return request", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestReturn("QmEvidenceHash");
      await expect(escrow.connect(buyer).approveReturn())
        .to.be.revertedWith("Cannot approve your own request");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC10 — Rút lại return request
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC10: Rút lại return request", function () {
    it("initiator can withdraw return → state back to ACTIVE", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestReturn("QmEvidenceHash");
      expect(await escrow.getState()).to.equal(3);

      await escrow.connect(buyer).withdrawReturnRequest();
      expect(await escrow.getState()).to.equal(1); // ACTIVE
      expect(await escrow.requestInitiator()).to.equal(ethers.ZeroAddress);
      expect(await escrow.returnEvidenceHash()).to.equal("");
    });

    it("non-initiator cannot withdraw return request", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestReturn("QmEvidenceHash");
      await expect(escrow.connect(seller).withdrawReturnRequest())
        .to.be.revertedWith("Only initiator can withdraw");
    });

    it("should emit ReturnRequestWithdrawn", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestReturn("QmEvidenceHash");
      await expect(escrow.connect(seller).withdrawReturnRequest())
        .to.emit(escrow, "ReturnRequestWithdrawn");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC11 — Auto approve return sau 72h
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC11: Auto approve return sau 72h", function () {
    it("should auto approve after 72h", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestReturn("QmEvidenceHash");

      await ethers.provider.send("evm_increaseTime", [72 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const buyerBefore  = await ethers.provider.getBalance(buyer.address);

      // other trigger để đo balance chính xác
      await escrow.connect(other).executeReturnAfterTimeout();

      const sellerAfter = await ethers.provider.getBalance(seller.address);
      const buyerAfter  = await ethers.provider.getBalance(buyer.address);

      expect(sellerAfter - sellerBefore).to.equal(DEPOSIT);
      expect(buyerAfter  - buyerBefore).to.equal(ITEM_PRICE + DEPOSIT);
      expect(await escrow.getBalance()).to.equal(0n);
      expect(await escrow.getState()).to.equal(4); // COMPLETED
    });

    it("should revert if called before 72h", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestReturn("QmEvidenceHash");
      await ethers.provider.send("evm_increaseTime", [71 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      await expect(escrow.connect(other).executeReturnAfterTimeout())
        .to.be.revertedWith("72h timeout not reached");
    });

    it("should emit ReturnAutoApproved", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestReturn("QmEvidenceHash");
      await ethers.provider.send("evm_increaseTime", [72 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(escrow.connect(other).executeReturnAfterTimeout())
        .to.emit(escrow, "ReturnAutoApproved");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC12 — Chat
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC12: Chat — gửi tin nhắn", function () {
    it("buyer and seller can send messages when ACTIVE", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(buyer).sendMessage("Hàng đến chưa?"))
        .to.emit(escrow, "MessageSent");
      await expect(escrow.connect(seller).sendMessage("Đã ship rồi nhé!"))
        .to.emit(escrow, "MessageSent");
    });

    it("can send message during CANCEL_REQUESTED", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestCancel();
      await expect(escrow.connect(buyer).sendMessage("Tại sao muốn hủy?"))
        .to.emit(escrow, "MessageSent");
    });

    it("can send message during RETURN_REQUESTED", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).requestReturn("QmEvidenceHash");
      await expect(escrow.connect(seller).sendMessage("Tôi sẽ xử lý ngay"))
        .to.emit(escrow, "MessageSent");
    });

    it("should revert if outsider sends message", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(other).sendMessage("Hello"))
        .to.be.revertedWith("Only participants");
    });

    it("should revert if message is empty", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(buyer).sendMessage(""))
        .to.be.revertedWith("Empty message");
    });

    it("should revert if message exceeds 500 chars", async function () {
      const escrow = await deployAndActivate();
      await expect(escrow.connect(buyer).sendMessage("a".repeat(501)))
        .to.be.revertedWith("Message too long (max 500 chars)");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TC13 — Guard checks
  // ═══════════════════════════════════════════════════════════════════════════

  describe("TC13: Guard checks", function () {
    it("should revert if itemPrice not divisible by 5", async function () {
      // 1000000000000000001 wei — không chia hết cho 5
      const badPrice = 1000000000000000001n;
      await expect(
        EscrowFactory.connect(seller).deploy(
          badPrice,
          DESCRIPTION,
          { value: badPrice / 5n }
        )
      ).to.be.revertedWith("Price must be divisible by 5");
    });

    it("should revert if seller sends wrong deposit", async function () {
      await expect(
        EscrowFactory.connect(seller).deploy(ITEM_PRICE, DESCRIPTION, { value: ITEM_PRICE })
      ).to.be.revertedWith("Seller must send 20% deposit");
    });

    it("should revert if buyer sends wrong amount", async function () {
      const escrow = await deployEscrow();
      await expect(
        escrow.connect(buyer).joinAsBuyer(ADDR_HASH, { value: ITEM_PRICE })
      ).to.be.revertedWith("Buyer must send itemPrice + 20% deposit");
    });

    it("should revert if seller tries to join as buyer", async function () {
      const escrow = await deployEscrow();
      await expect(
        escrow.connect(seller).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND })
      ).to.be.revertedWith("Seller cannot be buyer");
    });

    it("should revert requestCancel when not ACTIVE", async function () {
      const escrow = await deployEscrow();
      await expect(escrow.connect(seller).requestCancel())
        .to.be.revertedWith("Invalid state");
    });

    it("should revert requestReturn when not ACTIVE", async function () {
      const escrow = await deployEscrow();
      await expect(escrow.connect(seller).requestReturn("QmHash"))
        .to.be.revertedWith("Invalid state");
    });

    it("cannot have cancel and return request at same time", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(seller).requestCancel();
      await expect(escrow.connect(buyer).requestReturn("QmHash"))
        .to.be.revertedWith("Invalid state");
    });

    it("should revert sendMessage after COMPLETED", async function () {
      const escrow = await deployAndActivate();
      await escrow.connect(buyer).confirmDelivery();
      await expect(escrow.connect(buyer).sendMessage("Hello"))
        .to.be.revertedWith("Cannot message in this state");
    });
  });
});