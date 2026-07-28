// Nap Multicall3 vao chain local.
//
// wagmi gop nhieu lenh doc thanh mot lenh multicall, va viem biet dia chi
// Multicall3 tren Sepolia nen tu dung. Hardhat node khong co san contract do,
// nen moi eth_call tra ve "0x" rong va TOAN BO lenh doc that bai AM THAM -
// giao dien chi hien "—" chu khong bao loi gi. Rat kho doan neu khong soi RPC.
//
// Khong hardcode bytecode (dai, de chep sai). Thay vao do lay bytecode that
// tu Sepolia roi dat vao dung dia chi tren node local bang hardhat_setCode.
import { RPC_URL } from './mockWallet.js';

export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

/**
 * Dam bao chain local co Multicall3. Idempotent.
 * @returns {Promise<boolean>} true neu vua nap, false neu da co san
 */
export async function ensureMulticall3() {
  const existing = await rpc(RPC_URL, 'eth_getCode', [MULTICALL3_ADDRESS, 'latest']);
  if (existing && existing !== '0x') return false;

  const source = process.env.NEXT_PUBLIC_RPC_URL;
  if (!source || source.includes('127.0.0.1')) {
    throw new Error(
      'Can NEXT_PUBLIC_RPC_URL tro toi Sepolia that de lay bytecode Multicall3.\n' +
      'Kiem tra .env.local co bien nay khong.',
    );
  }

  const bytecode = await rpc(source, 'eth_getCode', [MULTICALL3_ADDRESS, 'latest']);
  if (!bytecode || bytecode === '0x') {
    throw new Error('Khong lay duoc bytecode Multicall3 tu Sepolia');
  }

  await rpc(RPC_URL, 'hardhat_setCode', [MULTICALL3_ADDRESS, bytecode]);

  const after = await rpc(RPC_URL, 'eth_getCode', [MULTICALL3_ADDRESS, 'latest']);
  if (!after || after === '0x') throw new Error('Nap Multicall3 that bai');
  return true;
}
