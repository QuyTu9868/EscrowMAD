const { ethers } = require("hardhat");

const FACTORY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

async function main() {
  const [owner, , other] = await ethers.getSigners();
  const factory = await ethers.getContractAt("EscrowFactory", FACTORY_ADDRESS);

  const agent = await factory.agent();
  console.log("agent() =", agent);

  try {
    await factory.connect(other).setAgent(other.address);
    console.log("FAIL: non-owner setAgent did not revert");
  } catch (err) {
    console.log("OK: non-owner setAgent reverted ->", err.shortMessage || err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
