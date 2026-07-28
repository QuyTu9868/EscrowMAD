import { defineConfig, devices } from '@playwright/test';

// Nap .env.local de test doc duoc ADMIN_TOTP_SECRET. Next tu nap file nay cho
// dev server, nhung tien trinh Playwright thi khong.
try { process.loadEnvFile('.env.local'); } catch { /* khong co file thi bo qua */ }

// Test chay tren chain local, KHONG bao gio dung tien that.
// Truoc khi chay phai co Hardhat node + contract da deploy:
//   cd contracts && npx hardhat node
//   cd contracts && npx hardhat run scripts/deploy.js --network localhost
const LOCAL_RPC = 'http://127.0.0.1:8545';
const LOCAL_FACTORY = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // dung chung mot chain local nen chay tuan tu cho de doan
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.js',

  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Chay tren cong 3100 de khong dam vao dev server dang mo o 3000
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_RPC_URL: LOCAL_RPC,
      NEXT_PUBLIC_FACTORY_ADDRESS: LOCAL_FACTORY,
      // Vi agent cua Hardhat node (account #1) - chi ton tai tren chain local
      AGENT_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      ESCROWMAD_GATEWAY_TOKEN: 'e2e-test-token',
      AGENT_MODEL_NAME: 'e2e-mock',
    },
  },
});
