// Gan vi agent vao EscrowFactory. Chi owner (vi deploy) goi duoc.
//
//   FACTORY=0x... AGENT=0x... npx hardhat run scripts/setAgent.js --network sepolia
const { ethers } = require("hardhat");

async function main() {
  const factoryAddress = process.env.FACTORY;
  const agentAddress = process.env.AGENT;
  if (!factoryAddress || !agentAddress) {
    throw new Error("Thieu bien FACTORY hoac AGENT");
  }

  const [owner] = await ethers.getSigners();
  const factory = await ethers.getContractAt("EscrowFactory", factoryAddress);

  const currentOwner = await factory.owner();
  if (currentOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(`Vi dang dung (${owner.address}) khong phai owner (${currentOwner})`);
  }

  const before = await factory.agent();
  if (before.toLowerCase() === agentAddress.toLowerCase()) {
    console.log("Agent da dung roi:", before);
    return;
  }

  console.log("Dang set agent...");
  const tx = await factory.setAgent(agentAddress);
  await tx.wait();

  console.log("owner   :", await factory.owner());
  console.log("agent   :", await factory.agent());
  console.log("tx      : https://sepolia.etherscan.io/tx/" + tx.hash);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
