'use client';

if (typeof globalThis.indexedDB === 'undefined') globalThis.indexedDB = {};
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };

import '@rainbow-me/rainbowkit/styles.css';
import {
  getDefaultConfig,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { http } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

let config;
let queryClient;

function getConfig() {
  if (!config) {
    config = getDefaultConfig({
      appName: 'EscrowMAD',
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'escrowmad-demo',
      chains: [sepolia],
      transports: {
        [sepolia.id]: http('https://eth-sepolia.g.alchemy.com/v2/oMfhl_VEAr9EQK9-UBrHy'),
      },
      ssr: false,
      multiInjectedProviderDiscovery: true,
    });
    queryClient = new QueryClient();
  }
  return { config, queryClient };
}

export function Providers({ children }) {
  const { config, queryClient } = getConfig();
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
