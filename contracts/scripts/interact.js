/**
 * interact.js — Simulate tất cả luồng EscrowMAD v3 trên Hardhat Local
 *
 * Chạy:
 *   Terminal 1: npx hardhat node
 *   Terminal 2: npx hardhat run scripts/interact.js --network localhost
 */

const { ethers } = require("hardhat");

const fmt = (wei) => ethers.formatEther(wei) + " ETH";

async function getBalances(label, accounts) {
  console.log(`\n  📊 Số dư [${label}]:`);
  for (const [name, signer] of accounts) {
    const bal = await ethers.provider.getBalance(signer.address);
    console.log(`     ${name.padEnd(10)}: ${fmt(bal)}`);
  }
}

function separator(title) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function step(msg) { console.log(`\n  ➤ ${msg}`); }

async function main() {
  const [deployer, seller, buyer, other] = await ethers.getSigners();

  const ITEM_PRICE = ethers.parseEther("1");
  const DEPOSIT    = ITEM_PRICE / 5n;
  const BUYER_SEND = ITEM_PRICE + DEPOSIT;
  const ADDR_HASH  = "QmBuyerAddressHash";
  const IMG_HASH   = "QmItemImageHash";

  const accounts = [["Seller", seller], ["Buyer", buyer]];

  console.log("\n🚀 EscrowMAD v3 — Interact Script");
  console.log(`   itemPrice = ${fmt(ITEM_PRICE)}`);
  console.log(`   deposit   = ${fmt(DEPOSIT)} (20%)`);

  // ─── Setup: Deploy SBT + Factory ─────────────────────────────────────────

  separator("SETUP: Deploy EscrowSBT + EscrowFactory");

  step("Deploy EscrowSBT...");
  const EscrowSBT = await ethers.getContractFactory("EscrowSBT", deployer);
  const sbt = await EscrowSBT.deploy();
  await sbt.waitForDeployment();
  console.log(`     EscrowSBT: ${await sbt.getAddress()}`);

  step("Deploy EscrowFactory...");
  const EscrowFactory = await ethers.getContractFactory("EscrowFactory", deployer);
  const factory = await EscrowFactory.deploy(await sbt.getAddress());
  await factory.waitForDeployment();
  console.log(`     EscrowFactory: ${await factory.getAddress()}`);

  step("Set factory trong SBT...");
  await sbt.connect(deployer).setFactory(await factory.getAddress());
  console.log(`     ✅ Done`);

  // Helper: tạo escrow mới qua factory
  async function createEscrow(desc = "Test item v3") {
    const tx = await factory.connect(seller).createEscrow(
      ITEM_PRICE,
      desc,
      { value: DEPOSIT }
    );
    const receipt = await tx.wait();
    const event = receipt.logs
      .map(log => { try { return factory.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === "EscrowCreated");
    const escrowAddress = event.args.escrowAddress;
    const EscrowMAD = await ethers.getContractFactory("EscrowMAD");
    return EscrowMAD.attach(escrowAddress);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LUỒNG 1 — Giao dịch thành công
  // ═══════════════════════════════════════════════════════════════════════════

  separator("LUỒNG 1: Giao dịch thành công (confirmDelivery)");
  await getBalances("trước", accounts);

  step("Seller tạo contract qua factory...");
  const e1 = await createEscrow();
  console.log(`     Contract: ${await e1.getAddress()}`);

  step("Seller upload ảnh hàng...");
  await e1.connect(seller).uploadItemImage(IMG_HASH);
  console.log(`     ✅ Image uploaded`);

  step("Buyer tham gia, gửi 1.2 ETH...");
  await e1.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });
  console.log(`     State: ACTIVE (${await e1.getState()})`);

  step("Seller đánh dấu đã ship...");
  await e1.connect(seller).markShipped();
  console.log(`     ✅ Marked as shipped`);

  step("Buyer xác nhận nhận hàng → mint SBT...");
  await e1.connect(buyer).confirmDelivery();
  console.log(`     State: COMPLETED (${await e1.getState()})`);
  console.log(`     Balance contract: ${fmt(await e1.getBalance())} ← phải = 0`);

  await getBalances("sau", accounts);
  console.log("\n  ✅ Seller nhận 1.2 ETH, Buyer nhận lại 0.2 ETH cọc + SBT");

  // ═══════════════════════════════════════════════════════════════════════════
  // LUỒNG 2 — Mutual cancel
  // ═══════════════════════════════════════════════════════════════════════════

  separator("LUỒNG 2: Mutual Cancel (cả 2 đồng ý hủy)");
  await getBalances("trước", accounts);

  const e2 = await createEscrow();
  await e2.connect(seller).uploadItemImage(IMG_HASH);
  await e2.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });

  step("Seller gửi requestCancel...");
  await e2.connect(seller).requestCancel();
  console.log(`     State: CANCEL_REQUESTED (${await e2.getState()})`);

  step("Buyer approve cancel...");
  await e2.connect(buyer).approveCancel();
  console.log(`     State: COMPLETED (${await e2.getState()})`);
  console.log(`     Balance contract: ${fmt(await e2.getBalance())} ← phải = 0`);

  await getBalances("sau", accounts);
  console.log("\n  ✅ Seller nhận lại 0.2 ETH cọc, Buyer nhận lại 1.2 ETH");

  // ═══════════════════════════════════════════════════════════════════════════
  // LUỒNG 3 — Return item (seller approve)
  // ═══════════════════════════════════════════════════════════════════════════

  separator("LUỒNG 3: Return Item — Seller đồng ý nhận hàng trả");
  await getBalances("trước", accounts);

  const e3 = await createEscrow();
  await e3.connect(seller).uploadItemImage(IMG_HASH);
  await e3.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });
  await e3.connect(seller).markShipped();

  step("Buyer phát hiện hàng lỗi, gửi requestReturn...");
  await e3.connect(buyer).requestReturn("QmFaultyItemEvidenceHash");
  console.log(`     State: RETURN_REQUESTED (${await e3.getState()})`);
  console.log(`     Evidence: ${await e3.returnEvidenceHash()}`);

  step("Seller đồng ý nhận hàng trả...");
  await e3.connect(seller).approveReturn();
  console.log(`     State: COMPLETED (${await e3.getState()})`);
  console.log(`     Balance contract: ${fmt(await e3.getBalance())} ← phải = 0`);

  await getBalances("sau", accounts);
  console.log("\n  ✅ Seller nhận lại 0.2 ETH cọc, Buyer nhận lại 1.2 ETH");

  // ═══════════════════════════════════════════════════════════════════════════
  // LUỒNG 4 — Return item (auto timeout 72h)
  // ═══════════════════════════════════════════════════════════════════════════

  separator("LUỒNG 4: Return Item — Auto approve sau 72h seller im lặng");
  await getBalances("trước", accounts);

  const e4 = await createEscrow();
  await e4.connect(seller).uploadItemImage(IMG_HASH);
  await e4.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });
  await e4.connect(seller).markShipped();

  step("Buyer gửi requestReturn...");
  await e4.connect(buyer).requestReturn("QmReturnEvidenceHash");
  console.log(`     State: RETURN_REQUESTED (${await e4.getState()})`);

  step("Nhảy thời gian lên 72h + 1 giây...");
  await ethers.provider.send("evm_increaseTime", [72 * 60 * 60 + 1]);
  await ethers.provider.send("evm_mine");
  console.log("     ⏩ Đã qua 72h, seller không phản hồi");

  step("Bất kỳ ai trigger executeReturnAfterTimeout...");
  await e4.connect(other).executeReturnAfterTimeout();
  console.log(`     State: COMPLETED (${await e4.getState()})`);
  console.log(`     Balance contract: ${fmt(await e4.getBalance())} ← phải = 0`);

  await getBalances("sau", accounts);
  console.log("\n  ✅ Auto approve: Seller 0.2 ETH, Buyer 1.2 ETH");

  // ═══════════════════════════════════════════════════════════════════════════
  // LUỒNG 5 — Rút lại cancel request
  // ═══════════════════════════════════════════════════════════════════════════

  separator("LUỒNG 5: Rút lại cancel request → tiếp tục giao dịch");

  const e5 = await createEscrow();
  await e5.connect(seller).uploadItemImage(IMG_HASH);
  await e5.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });

  step("Buyer gửi requestCancel...");
  await e5.connect(buyer).requestCancel();
  console.log(`     State: CANCEL_REQUESTED (${await e5.getState()})`);

  step("Buyer đổi ý, rút lại request...");
  await e5.connect(buyer).withdrawCancelRequest();
  console.log(`     State: ACTIVE (${await e5.getState()}) ← quay về bình thường`);

  step("Seller mark shipped + Buyer confirm...");
  await e5.connect(seller).markShipped();
  await e5.connect(buyer).confirmDelivery();
  console.log(`     State: COMPLETED (${await e5.getState()})`);
  console.log("\n  ✅ Giao dịch hoàn thành sau khi rút cancel request");

  // ═══════════════════════════════════════════════════════════════════════════
  // LUỒNG 6 — Seller claim sau 17 ngày
  // ═══════════════════════════════════════════════════════════════════════════

  separator("LUỒNG 6: Seller claim sau 17 ngày buyer mất tích");
  await getBalances("trước", accounts);

  const e6 = await createEscrow();
  await e6.connect(seller).uploadItemImage(IMG_HASH);
  await e6.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });

  step("Seller mark shipped...");
  await e6.connect(seller).markShipped();
  console.log(`     ✅ Marked as shipped`);

  step("Nhảy thời gian lên 17 ngày + 1 giây...");
  await ethers.provider.send("evm_increaseTime", [17 * 24 * 60 * 60 + 1]);
  await ethers.provider.send("evm_mine");
  console.log("     ⏩ Đã qua 17 ngày, buyer mất tích");

  step("Seller claim tiền...");
  await e6.connect(seller).claimAfterBuyerTimeout();
  console.log(`     State: SELLER_CLAIMED (${await e6.getState()})`);
  console.log(`     Balance contract: ${fmt(await e6.getBalance())} ← phải = 0`);

  await getBalances("sau", accounts);
  console.log("\n  ✅ Seller nhận 1.4 ETH (itemPrice + deposit*2), Buyer mất cọc (phạt)");

  // ═══════════════════════════════════════════════════════════════════════════
  // LUỒNG 7 — Tạm dừng đồng hồ claim khi return request
  // ═══════════════════════════════════════════════════════════════════════════

  separator("LUỒNG 7: Tạm dừng đồng hồ claim khi buyer request return");
  await getBalances("trước", accounts);

  const e7 = await createEscrow();
  await e7.connect(seller).uploadItemImage(IMG_HASH);
  await e7.connect(buyer).joinAsBuyer(ADDR_HASH, { value: BUYER_SEND });
  await e7.connect(seller).markShipped();

  step("Nhảy thời gian lên 16 ngày (chưa đủ 17)...");
  await ethers.provider.send("evm_increaseTime", [16 * 24 * 60 * 60]);
  await ethers.provider.send("evm_mine");

  step("Buyer request return → đồng hồ tạm dừng...");
  await e7.connect(buyer).requestReturn("QmEvidenceHash");
  console.log(`     State: RETURN_REQUESTED (${await e7.getState()})`);

  step("Nhảy thêm 5 ngày (tổng 21 ngày, nhưng đồng hồ bị pause)...");
  await ethers.provider.send("evm_increaseTime", [5 * 24 * 60 * 60]);
  await ethers.provider.send("evm_mine");

  step("Buyer rút return request → đồng hồ tiếp tục...");
  await e7.connect(buyer).withdrawReturnRequest();
  console.log(`     State: ACTIVE (${await e7.getState()})`);

  step("Seller thử claim ngay — phải thất bại vì chưa đủ 17 ngày thực...");
  try {
    await e7.connect(seller).claimAfterBuyerTimeout();
    console.log("     ❌ Claim thành công — sai logic!");
  } catch {
    console.log("     ✅ Claim bị revert đúng như mong đợi");
  }

  step("Nhảy thêm 2 ngày (đủ 17 ngày thực sau ship)...");
  await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
  await ethers.provider.send("evm_mine");

  step("Seller claim thành công...");
  await e7.connect(seller).claimAfterBuyerTimeout();
  console.log(`     State: SELLER_CLAIMED (${await e7.getState()})`);

  await getBalances("sau", accounts);
  console.log("\n  ✅ Đồng hồ pause hoạt động đúng");

  separator("XONG! Tất cả 7 luồng đã chạy thành công 🎉");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});