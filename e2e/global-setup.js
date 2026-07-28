import { ensureMulticall3 } from './helpers/multicall.js';
import { publicClient, FACTORY_ADDRESS } from './helpers/chain.js';

export default async function globalSetup() {
  // 1. Chain local phai dang chay
  try {
    await publicClient.getBlockNumber();
  } catch {
    throw new Error(
      'Khong ket noi duoc chain local tai 127.0.0.1:8545.\n' +
      'Chay truoc: cd contracts && npx hardhat node',
    );
  }

  // 2. Contract phai da deploy
  const code = await publicClient.getBytecode({ address: FACTORY_ADDRESS });
  if (!code || code === '0x') {
    throw new Error(
      `Khong thay EscrowFactory tai ${FACTORY_ADDRESS}.\n` +
      'Chay truoc: cd contracts && npx hardhat run scripts/deploy.js --network localhost',
    );
  }

  // 3. Multicall3 - thieu cai nay thi moi lenh doc contract deu that bai am tham
  const installed = await ensureMulticall3();
  console.log(installed ? '  Da nap Multicall3 vao chain local' : '  Multicall3 da co san');
}
