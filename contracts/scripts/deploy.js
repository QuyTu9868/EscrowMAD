/**
 * deploy.js — Deploy EscrowSBT + EscrowFactory lên Sepolia
 *
 * Chạy:
 *   npx hardhat run scripts/deploy.js --network sepolia
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n🚀 Deploying EscrowMAD system...");
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  // ─── Bước 1: Deploy EscrowSBT ───────────────────────────────────────────
  console.log("\n📦 Step 1: Deploying EscrowSBT...");
  const EscrowSBT = await ethers.getContractFactory("EscrowSBT");
  const sbt = await EscrowSBT.deploy();
  await sbt.waitForDeployment();
  const sbtAddress = await sbt.getAddress();
  console.log(`   ✅ EscrowSBT: ${sbtAddress}`);

  // ─── Bước 2: Deploy EscrowFactory ───────────────────────────────────────
  console.log("\n📦 Step 2: Deploying EscrowFactory...");
  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const factory = await EscrowFactory.deploy(sbtAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`   ✅ EscrowFactory: ${factoryAddress}`);

  // ─── Bước 3: Set factory trong SBT ──────────────────────────────────────
  console.log("\n🔐 Step 3: Setting factory in SBT...");
  const tx = await sbt.setFactory(factoryAddress);
  await tx.wait();
  console.log(`   ✅ Factory authorized in SBT`);

  // ─── Tóm tắt ────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  📋 DEPLOYMENT SUMMARY");
  console.log("═".repeat(60));
  console.log(`  EscrowSBT:     ${sbtAddress}`);
  console.log(`  EscrowFactory: ${factoryAddress}`);
  console.log("\n  👉 Copy 2 địa chỉ này vào .env của frontend!");
  console.log("\n  👉 Đăng ký Chainlink Automation tại:");
  console.log("     https://automation.chain.link/sepolia");
  console.log(`     Target contract: ${sbtAddress}`);
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});