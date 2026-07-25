import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

const SBT_ADDRESS    = '0xdEbE0367cFC3CEabd29217084e115150224C5BeA';
const ESCROW_ADDRESS = '0x5dc2af4e0a58dc4ca910519d620a633e2e51601e';
const BUYER_ADDRESS  = '0xc70869062be8f8e08fee5e3a386d5ea48bd708c4';
const IMAGE_HASH     = 'QmXMNaSvCR8dDwmWX4bBnpP9QRqkqMWh2GmF66eXLtc1ZM'; // ví dụ: QmXMNaSvCR8dDwmWX4bBnpP9QRqkqMWh2GmF66eXLtc1ZM

const SBT_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'imageHash', type: 'string' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const client = createPublicClient({
  chain: sepolia,
  transport: http('https://eth-sepolia.g.alchemy.com/v2/oMfhl_VEAr9EQK9-UBrHy'),
});

async function main() {
  try {
    const result = await client.simulateContract({
      address: SBT_ADDRESS,
      abi: SBT_ABI,
      functionName: 'mint',
      args: [BUYER_ADDRESS, IMAGE_HASH],
      account: ESCROW_ADDRESS, // giả lập escrow contract gọi mint
    });
    console.log('Simulate OK:', result);
  } catch (err) {
    console.log('Simulate FAILED:');
    console.log(err.shortMessage || err.message);
  }
}

main();