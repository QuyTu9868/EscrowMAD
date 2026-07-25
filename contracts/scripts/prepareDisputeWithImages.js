// Helper dev-only: tao 1 escrow DISPUTED co du ca 2 anh (itemImageHash +
// returnEvidenceHash) de test scripts/agent/resolve-disputes.mjs.
const { ethers } = require("hardhat");

const FACTORY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const IMAGE_HASH = "QmXMNaSvCR8dDwmWX4bBnpP9QRqkqMWh2GmF66eXLtc1ZM";

async function main() {
  const [, , seller, buyer] = await ethers.getSigners();
  const factory = await ethers.getContractAt("EscrowFactory", FACTORY_ADDRESS);

  const itemPrice = ethers.parseEther("1");
  const deposit = itemPrice / 5n;

  const tx = await factory.connect(seller).createEscrow(itemPrice, "Red sneakers size 42", { value: deposit });
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "EscrowCreated");
  const escrowAddress = event.args.escrowAddress;
  const orderId = Number(await factory.getTotalEscrows()) - 1;

  const escrow = await ethers.getContractAt("EscrowMAD", escrowAddress);
  await (await escrow.connect(seller).uploadItemImage(IMAGE_HASH)).wait();
  await (await escrow.connect(buyer).joinAsBuyer("QmBuyerAddressHash", { value: itemPrice + deposit })).wait();
  await (await escrow.connect(buyer).requestReturn(IMAGE_HASH)).wait();
  await (await escrow.connect(buyer).raiseDispute()).wait();

  console.log("escrow:", escrowAddress, "orderId =", orderId);
  console.log("state =", await escrow.getState(), "(7 = DISPUTED)");
  console.log("itemImageHash =", await escrow.itemImageHash());
  console.log("returnEvidenceHash =", await escrow.returnEvidenceHash());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
