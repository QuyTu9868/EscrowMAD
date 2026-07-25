// Tao du lieu demo tren chain local: upload anh that len IPFS roi tao 10 escrow
// o nhieu trang thai khac nhau, trong do co 5 don DISPUTED de test agent nhieu lan.
//
//   npx hardhat run scripts/seedLocalDemo.js --network localhost
//
// Moi escrow chi dispute duoc 1 lan (resolveDispute day sang COMPLETED vinh vien),
// nen can nhieu don DISPUTED de test lap lai.
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const FACTORY_ADDRESS = process.env.FACTORY || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// PINATA_JWT nam trong .env.local cua frontend (thu muc cha), khong phai contracts/.env
function readPinataJwt() {
  const envPath = path.join(__dirname, "..", "..", ".env.local");
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((l) => l.startsWith("PINATA_JWT="));
  if (!line) throw new Error("Khong tim thay PINATA_JWT trong ../.env.local");
  return line.slice("PINATA_JWT=".length).trim();
}

async function uploadToIpfs(jwt, seed) {
  const res = await fetch(`https://picsum.photos/seed/${seed}/600/450`);
  if (!res.ok) throw new Error(`Tai anh ${seed} that bai: HTTP ${res.status}`);
  const blob = await res.blob();

  const form = new FormData();
  form.append("file", blob, `${seed}.jpg`);

  const pin = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!pin.ok) throw new Error(`Pinata tu choi ${seed}: HTTP ${pin.status} ${await pin.text()}`);

  const { IpfsHash } = await pin.json();
  console.log(`   anh ${seed} -> ${IpfsHash}`);
  return IpfsHash;
}

// Mo ta don hang. Anh "listing" va "arrived" la 2 anh KHAC NHAU de agent co gi ma so.
const ORDERS = [
  { desc: "iPhone 15 Pro 256GB - Natural Titanium",  price: "0.05",  seedA: "demo-iphone-listing",  seedB: "demo-iphone-arrived",  final: "DISPUTED" },
  { desc: "Nike Air Force 1 - White, US 9",          price: "0.015", seedA: "demo-nike-listing",    seedB: "demo-nike-arrived",    final: "DISPUTED" },
  { desc: "Canon EOS R50 Body",                      price: "0.085", seedA: "demo-canon-listing",   seedB: "demo-canon-arrived",   final: "DISPUTED" },
  { desc: "Sony WH-1000XM5 Headphones",              price: "0.02",  seedA: "demo-sony-listing",    seedB: "demo-sony-arrived",    final: "DISPUTED" },
  { desc: "Herman Miller Aeron Chair - Size B",      price: "0.035", seedA: "demo-aeron-listing",   seedB: "demo-aeron-arrived",   final: "DISPUTED" },
  { desc: "MacBook Air M2 13 inch",                  price: "0.12",  seedA: "demo-macbook-listing", seedB: "demo-macbook-arrived", final: "RETURN_REQUESTED" },
  { desc: "iPad Air 11 inch WiFi 128GB",             price: "0.045", seedA: "demo-ipad-listing",    seedB: null,                   final: "ACTIVE" },
  { desc: "Kindle Paperwhite 11th Gen",              price: "0.01",  seedA: "demo-kindle-listing",  seedB: null,                   final: "ACTIVE" },
  { desc: "Logitech MX Master 3S",                   price: "0.008", seedA: "demo-mouse-listing",   seedB: null,                   final: "COMPLETED" },
  { desc: "Samsung T7 Shield 2TB SSD",               price: "0.012", seedA: "demo-ssd-listing",     seedB: null,                   final: "AWAITING_BUYER" },
];

async function main() {
  const jwt = readPinataJwt();
  const [deployer, agent, seller, buyer] = await ethers.getSigners();
  const factory = await ethers.getContractAt("EscrowFactory", FACTORY_ADDRESS);

  console.log("Factory :", FACTORY_ADDRESS);
  console.log("Agent   :", agent.address);
  console.log("Seller  :", seller.address);
  console.log("Buyer   :", buyer.address);

  if ((await factory.agent()).toLowerCase() !== agent.address.toLowerCase()) {
    await (await factory.connect(deployer).setAgent(agent.address)).wait();
    console.log("\nDa set agent.");
  }

  // Upload truoc toan bo anh de khong phai cho giua chung
  console.log("\nUpload anh len IPFS...");
  const hashes = {};
  for (const order of ORDERS) {
    for (const seed of [order.seedA, order.seedB]) {
      if (seed && !hashes[seed]) hashes[seed] = await uploadToIpfs(jwt, seed);
    }
  }

  console.log("\nTao escrow...");
  const summary = [];

  for (const order of ORDERS) {
    const itemPrice = ethers.parseEther(order.price);
    const deposit = itemPrice / 5n;

    const tx = await factory.connect(seller).createEscrow(itemPrice, order.desc, { value: deposit });
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "EscrowCreated");

    const address = event.args.escrowAddress;
    const orderId = Number(await factory.getTotalEscrows()) - 1;
    const escrow = await ethers.getContractAt("EscrowMAD", address);

    await (await escrow.connect(seller).uploadItemImage(hashes[order.seedA])).wait();

    if (order.final !== "AWAITING_BUYER") {
      await (await escrow.connect(buyer).joinAsBuyer("QmDemoBuyerAddressHash", { value: itemPrice + deposit })).wait();
    }

    if (order.final === "COMPLETED") {
      await (await escrow.connect(buyer).confirmDelivery()).wait();
    }

    if (order.final === "RETURN_REQUESTED" || order.final === "DISPUTED") {
      await (await escrow.connect(buyer).requestReturn(hashes[order.seedB])).wait();
    }

    if (order.final === "DISPUTED") {
      await (await escrow.connect(buyer).raiseDispute()).wait();
    }

    const state = Number(await escrow.getState());
    summary.push({ orderId, state: order.final, address, desc: order.desc, stateNum: state });
    console.log(`   #${orderId} ${order.final.padEnd(17)} ${address}  ${order.desc}`);
  }

  const disputed = summary.filter((s) => s.state === "DISPUTED");
  console.log(`\nXong. ${summary.length} escrow, trong do ${disputed.length} dang DISPUTED (orderId: ${disputed.map((d) => d.orderId).join(", ")}).`);
  console.log("\nDe test bang MetaMask, import 2 vi nay (chi dung tren chain local):");
  console.log(`   Seller: ${seller.address}`);
  console.log(`   Buyer : ${buyer.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
