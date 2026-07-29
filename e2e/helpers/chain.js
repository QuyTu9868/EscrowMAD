// Thao tac truc tiep len chain local de dung san trang thai cho tung test.
// Dung vi da mo khoa cua Hardhat node (truyen address, khong can private key).
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { sepolia } from 'viem/chains';
import { ESCROW_ABI, FACTORY_ABI } from '../../lib/escrowAbi.mjs';
import { ACCOUNTS, RPC_URL } from './mockWallet.js';

// Dia chi co dinh khi deploy len Hardhat node vua khoi dong. Doi khi so contract
// trong deploy.js thay doi (vd luc go SBT, factory tut xuong dia chi dau tien).
export const FACTORY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

// Anh that tren IPFS, dung de escrow co du bang chung cho nut Raise Dispute.
export const IMAGE_HASH = 'QmXMNaSvCR8dDwmWX4bBnpP9QRqkqMWh2GmF66eXLtc1ZM';

export const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

function wallet(address) {
  return createWalletClient({ account: address, chain: sepolia, transport: http(RPC_URL) });
}

async function send(address, params) {
  const hash = await wallet(address).writeContract(params);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Tao escrow moi, tra ve dia chi. */
export async function createEscrow({ itemPrice = '0.05', description = 'E2E test item' } = {}) {
  const price = parseEther(itemPrice);
  const before = await publicClient.readContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTotalEscrows',
  });

  await send(ACCOUNTS.seller, {
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'createEscrow',
    args: [price, description], value: price / 5n,
  });

  return publicClient.readContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'allEscrows', args: [before],
  });
}

export async function uploadItemImage(escrow, hash = IMAGE_HASH) {
  return send(ACCOUNTS.seller, { address: escrow, abi: ESCROW_ABI, functionName: 'uploadItemImage', args: [hash] });
}

export async function joinAsBuyer(escrow) {
  const [itemPrice, deposit] = await Promise.all([
    publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: 'itemPrice' }),
    publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: 'deposit' }),
  ]);
  return send(ACCOUNTS.buyer, {
    address: escrow, abi: ESCROW_ABI, functionName: 'joinAsBuyer',
    args: ['QmE2EBuyerAddressHash'], value: itemPrice + deposit,
  });
}

export async function requestReturn(escrow, hash = IMAGE_HASH) {
  return send(ACCOUNTS.buyer, { address: escrow, abi: ESCROW_ABI, functionName: 'requestReturn', args: [hash] });
}

export function getState(escrow) {
  return publicClient.readContract({ address: escrow, abi: ESCROW_ABI, functionName: 'getState' });
}

export function getBalance(address) {
  return publicClient.getBalance({ address });
}

/** Escrow o trang thai ACTIVE, seller da dang anh (chua co bang chung cua buyer). */
export async function makeActiveEscrow(opts) {
  const escrow = await createEscrow(opts);
  await uploadItemImage(escrow);
  await joinAsBuyer(escrow);
  return escrow;
}

/** Escrow da co DU 2 anh - dieu kien de nut Raise Dispute hien ra. */
export async function makeEscrowWithBothImages(opts) {
  const escrow = await makeActiveEscrow(opts);
  await requestReturn(escrow);
  return escrow;
}

/** Dua escrow vao trang thai DISPUTED de no xuat hien tren trang admin. */
export async function raiseDispute(escrow) {
  return send(ACCOUNTS.buyer, { address: escrow, abi: ESCROW_ABI, functionName: 'raiseDispute' });
}

/** orderId = chi so trong allEscrows, tuc escrow moi nhat co id = tong - 1. */
export async function latestOrderId() {
  const total = await publicClient.readContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getTotalEscrows',
  });
  return Number(total) - 1;
}
