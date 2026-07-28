// Vi gia tiem vao trang (Cach A trong skill frontend-e2e-wallet).
//
// Khong dung extension that. Hardhat node da MO KHOA san cac vi, nen vi gia
// chi can chuyen tiep JSON-RPC toi node la node tu ky ho. Nho vay trinh duyet
// khong bao gio cham vao private key, va khong co popup nao de phai xu ly.
//
// wagmi dang bat multiInjectedProviderDiscovery nen phai thong bao theo chuan
// EIP-6963, dong thoi van gan window.ethereum cho connector kieu cu.

export const RPC_URL = 'http://127.0.0.1:8545';

// Tai khoan mac dinh cua Hardhat node
export const ACCOUNTS = {
  deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  agent: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  seller: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  buyer: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  outsider: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
};

/**
 * Tiem vi gia vao page. Phai goi TRUOC page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} address - vi nao dang dung app
 * @param {{ rejectAll?: boolean }} options - rejectAll gia lap user bam tu choi
 */
export async function installMockWallet(page, address, options = {}) {
  await page.addInitScript(
    ({ addr, rpc, rejectAll }) => {
      let nextId = 1;

      async function rpcCall(method, params) {
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params: params || [] }),
        });
        const json = await res.json();
        if (json.error) {
          const err = new Error(json.error.message);
          err.code = json.error.code;
          throw err;
        }
        return json.result;
      }

      const provider = {
        isMetaMask: true,
        _events: {},

        async request({ method, params }) {
          // Gia lap user bam "Tu choi" trong vi
          if (rejectAll && (method === 'eth_sendTransaction' || method === 'personal_sign')) {
            const err = new Error('User rejected the request.');
            err.code = 4001; // ma loi chuan cua EIP-1193 cho user reject
            throw err;
          }

          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [addr];
            case 'wallet_switchEthereumChain':
            case 'wallet_addEthereumChain':
              return null; // dang o dung chain roi
            case 'wallet_requestPermissions':
              return [{ parentCapability: 'eth_accounts' }];
            case 'eth_sendTransaction': {
              // Node da mo khoa vi nen tu ky ho, khong can private key
              const tx = { ...params[0], from: addr };
              return rpcCall('eth_sendTransaction', [tx]);
            }
            default:
              return rpcCall(method, params);
          }
        },

        on(event, handler) {
          (this._events[event] ||= []).push(handler);
        },
        removeListener(event, handler) {
          this._events[event] = (this._events[event] || []).filter((h) => h !== handler);
        },
      };

      window.ethereum = provider;

      // EIP-6963: wagmi phat hien vi qua su kien nay
      const detail = Object.freeze({
        info: {
          uuid: '11111111-2222-3333-4444-555555555555',
          name: 'Mock Wallet',
          icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
          rdns: 'io.escrowmad.mock',
        },
        provider,
      });

      const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
      window.addEventListener('eip6963:requestProvider', announce);
      announce();
    },
    { addr: address, rpc: RPC_URL, rejectAll: Boolean(options.rejectAll) },
  );
}

/**
 * Dam bao app da ket noi vi.
 *
 * RainbowKit thuong TU DONG ket noi lai vi gia qua EIP-6963 (no nho phien truoc),
 * luc do khong co nut "Connect Wallet" nao de bam. Nen ham nay cho dia chi hien
 * ra truoc, chi bam khi that su can.
 */
export async function connectWallet(page, address) {
  // RainbowKit hien dang rut gon '0xAB…CDEF' nen doi chieu 4 ky tu cuoi cho chac
  const short = address ? address.slice(-4).toLowerCase() : null;

  const alreadyConnected = async () => {
    const body = (await page.locator('body').innerText()).toLowerCase();
    return short ? body.includes(short) : /0x[0-9a-f]{2}…/i.test(body);
  };

  for (let i = 0; i < 10; i += 1) {
    if (await alreadyConnected()) return;
    await page.waitForTimeout(1_000);
  }

  const connectButton = page.getByRole('button', { name: /connect wallet/i }).first();
  if (await connectButton.count()) {
    await connectButton.click();
    await page.getByText('Mock Wallet', { exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-rk] [role="dialog"]'), { timeout: 15_000 });
  }
}
