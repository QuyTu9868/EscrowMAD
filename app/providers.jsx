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
        // Doc tu env de chay duoc tren chain local (chainId da set trung Sepolia).
        // Truoc day URL bi viet cung nen giao dien luon noi chuyen voi Sepolia
        // du API route da tro vao chain local.
        [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
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
