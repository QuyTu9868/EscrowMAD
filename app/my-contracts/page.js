'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, usePublicClient } from 'wagmi';

const GET_STATE_ABI = [
  { inputs: [], name: 'getState',        outputs: [{ type: 'uint8'  }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'itemDescription', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
];

const STATE_INFO = {
  0: { label: 'AWAITING BUYER', desc: 'Waiting for a buyer to join',              color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
  1: { label: 'ACTIVE',         desc: 'Transaction in progress',                  color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)'   },
  2: { label: 'CANCEL REQ',     desc: 'Cancellation requested, pending approval', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
  3: { label: 'RETURN REQ',     desc: 'Return requested, pending seller response',color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
  4: { label: 'COMPLETED',      desc: 'Transaction completed successfully',       color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)'  },
  5: { label: 'CANCELLED',      desc: 'Contract cancelled, funds refunded',       color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
  6: { label: 'SELLER CLAIMED', desc: 'Seller claimed funds after timeout',       color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
};

const MY_CONTRACTS_KEY = 'escrowmad_contracts';

function loadSavedContracts() {
  try { return JSON.parse(localStorage.getItem(MY_CONTRACTS_KEY) || '[]'); } catch { return []; }
}

function removeContract(addr) {
  const list = loadSavedContracts().filter(c => c.addr !== addr);
  localStorage.setItem(MY_CONTRACTS_KEY, JSON.stringify(list));
}

const short = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : '—';

const NAVBAR_H = 64;

export default function MyContractsPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [contracts, setContracts] = useState([]);
  const [contractStates, setContractStates] = useState({});
  const [contractDescriptions, setContractDescriptions] = useState({});

  useEffect(() => {
    if (!publicClient || contracts.length === 0) return;
    const fetchStates = async () => {
      const results = {};
      await Promise.all(contracts.map(async (c) => {
        try {
          const state = await publicClient.readContract({ address: c.addr, abi: GET_STATE_ABI, functionName: 'getState' });
          results[c.addr] = Number(state);
        } catch { results[c.addr] = null; }
      }));
      setContractStates(results);
    };
    fetchStates();
  }, [publicClient, contracts]);

  useEffect(() => {
    if (!publicClient || contracts.length === 0) return;
    const fetchDescriptions = async () => {
      const results = {};
      await Promise.all(contracts.map(async (c) => {
        if (c.description) return;
        try {
          const desc = await publicClient.readContract({ address: c.addr, abi: GET_STATE_ABI, functionName: 'itemDescription' });
          results[c.addr] = desc;
        } catch { results[c.addr] = ''; }
      }));
      if (Object.keys(results).length > 0) setContractDescriptions(prev => ({ ...prev, ...results }));
    };
    fetchDescriptions();
  }, [publicClient, contracts]);

  const [inputAddr, setInputAddr] = useState('');
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('escrowmad_theme');
    if (saved === 'light') setIsDark(false);
  }, []);

  const toggleTheme = () => {
    setIsDark(v => {
      localStorage.setItem('escrowmad_theme', v ? 'light' : 'dark');
      return !v;
    });
  };

  useEffect(() => {
    setContracts(loadSavedContracts());
  }, []);

  const handleOpen = (addr) => {
    router.push(`/?contract=${addr}`);
  };

  const handleRemove = (e, addr) => {
    e.stopPropagation();
    if (!confirm('Remove this contract from your list?')) return;
    removeContract(addr);
    setContracts(loadSavedContracts());
  };

  const handleLoadManual = () => {
    let addr = inputAddr.trim();
    try {
      const url = new URL(addr);
      const param = url.searchParams.get('contract');
      if (param) addr = param;
    } catch {}
    if (addr.startsWith('0x') && addr.length === 42) {
      router.push(`/?contract=${addr}`);
    } else {
      alert('Invalid input — paste a contract address (0x...) or a share link');
    }
  };

  return (
    <div className={isDark ? 'theme-dark' : 'theme-light'} style={{minHeight:'100vh'}}>
      <style>{`
        :root {
          --font-mono: monospace;
          --navbar-h: ${NAVBAR_H}px;
          --accent: #7c3aed; --accent2: #06b6d4;
          --danger: #ef4444; --success: #22c55e;
        }
        .theme-dark { --bg: #0a0a0f; --surface: #111118; --border: #1e1e2e; --text: #e2e2f0; --muted: #5a5a7a; --navbar-bg: rgba(10,10,15,0.95); --grid-color: #1e1e2e; --grid-opacity: 0.35; --input-bg: #0a0a0f; background: #0a0a0f; color: #e2e2f0; }
        .theme-light { --bg: #f0f4ff; --surface: #ffffff; --border: #dde3f0; --text: #1a1a2e; --muted: #6b7280; --navbar-bg: rgba(240,244,255,0.95); --grid-color: #c7d0e8; --grid-opacity: 0.6; --input-bg: #f8faff; background: #f0f4ff; color: #1a1a2e; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: transparent; color: var(--text); font-family: sans-serif; min-height: 100vh; transition: background 0.25s, color 0.25s; }
        .theme-dark::before, .theme-light::before { content: ''; position: fixed; inset: 0; pointer-events: none; background-image: linear-gradient(var(--grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color) 1px, transparent 1px); background-size: 40px 40px; opacity: var(--grid-opacity); z-index: -1; }
        .theme-toggle { background: transparent; border: none; cursor: pointer; font-size: 1.4rem; line-height: 1; padding: 0.25rem 0.4rem; border-radius: 50%; transition: transform 0.2s; display: flex; align-items: center; }
        .theme-toggle:hover { transform: scale(1.2); }
        .navbar { position: fixed; top: 0; left: 0; right: 0; z-index: 200; background: var(--navbar-bg); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 2rem; height: var(--navbar-h); width: 100%; }
        .nav-left { display: flex; align-items: center; gap: 0.5rem; flex: 1; }
        .logo { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(135deg, #a78bfa, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-right: 1.5rem; white-space: nowrap; }
        .nav-btn { background: transparent; border: 1px solid transparent; padding: 0.5rem 1.2rem; color: var(--muted); font-family: var(--font-mono); font-size: 0.9rem; font-weight: 600; letter-spacing: 0.03em; cursor: pointer; border-radius: 8px; transition: all 0.15s; white-space: nowrap; }
        .nav-btn:hover { color: var(--text); background: rgba(124,58,237,0.08); border-color: rgba(124,58,237,0.2); }
        .nav-btn.active { color: #a78bfa; background: rgba(124,58,237,0.12); border-color: rgba(124,58,237,0.3); }

        .page { max-width: 860px; margin: 0 auto; padding: 2rem 2rem 5rem; padding-top: calc(var(--navbar-h) + 2.5rem); }
        .page-header { margin-bottom: 2rem; }
        .page-title { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(135deg, #a78bfa, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.35rem; }
        .page-sub { font-family: var(--font-mono); font-size: 0.72rem; color: var(--muted); }

        .load-bar { display: flex; gap: 0.5rem; margin-bottom: 2rem; }
        .input { flex: 1; background: var(--input-bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.65rem 0.85rem; color: var(--text); font-family: var(--font-mono); font-size: 0.85rem; outline: none; transition: border 0.15s; }
        .input:focus { border-color: var(--accent); }
        .input::placeholder { color: var(--muted); }
        .btn { display: flex; align-items: center; justify-content: center; gap: 0.35rem; padding: 0.65rem 1.1rem; border-radius: 8px; font-family: var(--font-mono); font-size: 0.8rem; font-weight: 700; letter-spacing: 0.04em; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; white-space: nowrap; }
        .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
        .btn-primary:hover { background: #6d28d9; transform: translateY(-1px); }

        .contract-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1rem; }
        .contract-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem 1.25rem 1rem; cursor: pointer; transition: border-color 0.15s, transform 0.12s; position: relative; display: flex; flex-direction: column; gap: 0.75rem; }
        .contract-card:hover { border-color: rgba(124,58,237,0.5); transform: translateY(-2px); }
        .contract-card:hover .card-arrow { opacity: 1; }
        .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
        .card-desc { font-size: 0.95rem; font-weight: 700; color: var(--text); word-break: break-word; line-height: 1.3; flex: 1; }
        .card-arrow { font-size: 1rem; color: var(--accent); opacity: 0; transition: opacity 0.15s; flex-shrink: 0; margin-top: 0.1rem; }
        .card-meta { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
        .card-addr { font-family: var(--font-mono); font-size: 0.7rem; color: var(--muted); background: rgba(255,255,255,0.04); padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid var(--border); }
        .card-deposit { font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent2); font-weight: 700; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 0.25rem; }
        .btn-remove { background: transparent; border: none; color: var(--muted); font-family: var(--font-mono); font-size: 0.65rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 4px; transition: all 0.15s; }
        .btn-remove:hover { color: var(--danger); background: rgba(239,68,68,0.08); }
        .open-tag { font-family: var(--font-mono); font-size: 0.62rem; color: #a78bfa; background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.25); padding: 0.2rem 0.55rem; border-radius: 4px; font-weight: 700; letter-spacing: 0.05em; }

        .empty { text-align: center; padding: 5rem 2rem; color: var(--muted); font-family: var(--font-mono); }
        .empty-icon { font-size: 2.5rem; margin-bottom: 1rem; opacity: 0.5; }
        .empty-title { font-size: 0.9rem; color: var(--text); font-weight: 700; margin-bottom: 0.4rem; }
        .empty-sub { font-size: 0.75rem; line-height: 1.7; }

        .back-btn { background: transparent; border: none; color: var(--muted); font-family: var(--font-mono); font-size: 0.72rem; cursor: pointer; padding: 0; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.3rem; transition: color 0.15s; }
        .back-btn:hover { color: var(--text); }

        @media (max-width: 600px) {
          .page { padding: 1rem 1rem 4rem; padding-top: calc(var(--navbar-h) + 1.5rem); }
          .contract-grid { grid-template-columns: 1fr; }
          .navbar { padding: 0 1rem; }
          .nav-btn { padding: 0.4rem 0.6rem; font-size: 0.78rem; }
          .logo { font-size: 1.2rem; }
          .load-bar { flex-wrap: wrap; }
        }
      `}</style>

      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-left">
          <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginRight:'1.5rem', cursor:'pointer'}} onClick={() => router.push('/')}>
            <img src="/logo.png" alt="EscrowMAD" style={{width:'32px', height:'32px', objectFit:'contain', borderRadius:'6px'}} />
            <div className="logo">EscrowMAD</div>
          </div>
          <button className="nav-btn active">My Contracts</button>
          <button className="nav-btn" onClick={() => router.push('/?panel=deploy')}>+ New Contract</button>
          <button className="nav-btn" onClick={() => router.push('/?panel=join')}>Join Contract</button>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
          <button className="theme-toggle" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <ConnectButton chainStatus="icon" showBalance={false} />
        </div>
      </nav>

      <div className="page">
        <button className="back-btn" onClick={() => router.push('/')}>← Back</button>

        <div className="page-header">
          <div className="page-title">My Contracts</div>
          <div className="page-sub">{contracts.length} saved contract{contracts.length !== 1 ? 's' : ''} on this device</div>
        </div>

        <div className="load-bar">
          <input
            className="input"
            placeholder="Paste contract address 0x... or share link to open"
            value={inputAddr}
            onChange={e => setInputAddr(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoadManual()}
          />
          <button className="btn btn-primary" onClick={handleLoadManual}>Open</button>
        </div>

        {contracts.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📭</div>
            <div className="empty-title">No contracts yet</div>
            <div className="empty-sub">
              Deploy a new contract or join an existing one.<br/>
              They'll be saved here automatically.
            </div>
          </div>
        ) : (
          <div className="contract-grid">
            {contracts.map((c, i) => (
              <div key={i} className="contract-card" onClick={() => handleOpen(c.addr)}>
                <div className="card-top">
                  <div className="card-desc">{contractDescriptions[c.addr] || c.description || 'Unnamed contract'}</div>
                  <div className="card-arrow">→</div>
                </div>
                <div className="card-meta">
                  <span className="card-addr">{short(c.addr)}</span>
                  {c.deposit && <span className="card-deposit">Deposit: {c.deposit} ETH</span>}
                </div>
                {contractStates[c.addr] != null && STATE_INFO[contractStates[c.addr]] && (
                  <div style={{fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--muted)', marginTop:'-0.25rem'}}>
                    {STATE_INFO[contractStates[c.addr]].desc}
                  </div>
                )}
                <div className="card-footer">
                  <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                    <button className="btn-remove" onClick={(e) => handleRemove(e, c.addr)}>
                      🗑 Remove
                    </button>
                    {contractStates[c.addr] != null && STATE_INFO[contractStates[c.addr]] && (
                      <span style={{fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--muted)'}}>
                        Status: <span style={{color: STATE_INFO[contractStates[c.addr]].color, fontWeight:700}}>
                          {STATE_INFO[contractStates[c.addr]].label}
                        </span>
                      </span>
                    )}
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                    <span className="open-tag">OPEN →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}