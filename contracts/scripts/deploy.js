/**
 * deploy.js — Deploy EscrowFactory
 *
 * Chạy:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *
 * Sau khi deploy phải gán ví agent, nếu không resolveDispute revert voi moi nguoi:
 *   FACTORY=0x... AGENT=0x... npx hardhat run scripts/setAgent.js --network sepolia
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("\n🚀 Deploying EscrowMAD system...");
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  console.log("\n📦 Deploying EscrowFactory...");
  const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
  const factory = await EscrowFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log(`   ✅ EscrowFactory: ${factoryAddress}`);

  console.log("\n" + "═".repeat(60));
  console.log("  📋 DEPLOYMENT SUMMARY");
  console.log("═".repeat(60));
  console.log(`  EscrowFactory: ${factoryAddress}`);
  console.log(`  owner:         ${await factory.owner()}`);
  console.log(`  agent:         ${await factory.agent()}  (0x0 = chua set)`);
  console.log("\n  👉 Cap nhat NEXT_PUBLIC_FACTORY_ADDRESS trong .env.local");
  console.log("     va FACTORY_ADDRESS trong scripts/agent/.env");
  console.log("\n  👉 Roi gan vi agent:");
  console.log(`     FACTORY=${factoryAddress} AGENT=0x... npx hardhat run scripts/setAgent.js --network sepolia`);
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
