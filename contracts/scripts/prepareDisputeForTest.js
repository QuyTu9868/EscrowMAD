// One-off helper: tạo 1 escrow ở trạng thái DISPUTED trên local node,
// dùng để test thủ công app/api/agent/resolve-dispute (CP-2). Không phải
// script sản xuất — chỉ dùng khi dev.
const { ethers } = require("hardhat");

const FACTORY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const AGENT_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat account #1

async function main() {
  const [deployer, , seller, buyer] = await ethers.getSigners();

  const factory = await ethers.getContractAt("EscrowFactory", FACTORY_ADDRESS);
  await (await factory.connect(deployer).setAgent(AGENT_ADDRESS)).wait();
  console.log("agent set:", AGENT_ADDRESS);

  const itemPrice = ethers.parseEther("1");
  const deposit = itemPrice / 5n;

  const tx = await factory.connect(seller).createEscrow(itemPrice, "Test dispute item", { value: deposit });
  const receipt = await tx.wait();
  const event = receipt.logs.map(l => { try { return factory.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === "EscrowCreated");
  const escrowAddress = event.args.escrowAddress;
  console.log("escrow created:", escrowAddress, "(orderId = 0, index in allEscrows)");

  const escrow = await ethers.getContractAt("EscrowMAD", escrowAddress);
  await (await escrow.connect(buyer).joinAsBuyer("QmBuyerAddressHash", { value: itemPrice + deposit })).wait();
  console.log("buyer joined");

  await (await escrow.connect(buyer).raiseDispute()).wait();
  console.log("dispute raised, state =", await escrow.getState(), "(7 = DISPUTED)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
