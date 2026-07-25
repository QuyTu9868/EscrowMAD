import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

const SBT_ADDRESS = '0xdEbE0367cFC3CEabd29217084e115150224C5BeA';
const ESCROW_ADDRESS = '0xdd1615fd17aa98a25ae554abc807285327c33465';

const SBT_ABI = [
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'authorizedMinters',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'factory',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const client = createPublicClient({
  chain: sepolia,
  transport: http('https://eth-sepolia.g.alchemy.com/v2/oMfhl_VEAr9EQK9-UBrHy'),
});

async function main() {
  const isAuthorized = await client.readContract({
    address: SBT_ADDRESS,
    abi: SBT_ABI,
    functionName: 'authorizedMinters',
    args: [ESCROW_ADDRESS],
  });

  const factory = await client.readContract({
    address: SBT_ADDRESS,
    abi: SBT_ABI,
    functionName: 'factory',
  });

  console.log('authorizedMinters[escrow] =', isAuthorized);
  console.log('factory address on SBT     =', factory);
}

main();