'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, usePublicClient } from 'wagmi';
import DemoContracts from './DemoContracts';
import { SunIcon, MoonIcon, ArrowLeftIcon, TrashIcon, InboxIcon, ArrowRightIcon } from '../components/Icons';

const GET_STATE_ABI = [
  { inputs: [], name: 'getState',        outputs: [{ type: 'uint8'  }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'itemDescription', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'itemImageHash',   outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
];

const STATE_INFO = {
  0: { label: 'AWAITING BUYER', desc: 'Waiting for a buyer to join',              color: '#93641E', bg: 'rgba(147,100,30,0.1)',  border: 'rgba(147,100,30,0.3)'  },
  1: { label: 'ACTIVE',         desc: 'Transaction in progress',                  color: '#3E6B43', bg: 'rgba(62,107,67,0.1)',   border: 'rgba(62,107,67,0.3)'   },
  2: { label: 'CANCEL REQ',     desc: 'Cancellation requested, pending approval', color: '#A23A34', bg: 'rgba(162,58,52,0.1)',   border: 'rgba(162,58,52,0.3)'   },
  3: { label: 'RETURN REQ',     desc: 'Return requested, pending seller response',color: '#A23A34', bg: 'rgba(162,58,52,0.1)',   border: 'rgba(162,58,52,0.3)'   },
  4: { label: 'COMPLETED',      desc: 'Transaction completed successfully',       color: '#2B6C93', bg: 'rgba(43,108,147,0.1)',  border: 'rgba(43,108,147,0.3)'  },
  5: { label: 'CANCELLED',      desc: 'Contract cancelled, funds refunded',       color: '#A23A34', bg: 'rgba(162,58,52,0.1)',   border: 'rgba(162,58,52,0.3)'   },
  6: { label: 'SELLER CLAIMED', desc: 'Seller claimed funds after timeout',       color: '#A23A34', bg: 'rgba(162,58,52,0.1)',   border: 'rgba(162,58,52,0.3)'   },
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
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const [contracts, setContracts] = useState([]);
  const [contractStates, setContractStates] = useState({});
  const [contractDescriptions, setContractDescriptions] = useState({});
  const [contractImages, setContractImages] = useState({});

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

  useEffect(() => {
    if (!publicClient || contracts.length === 0) return;
    const fetchImages = async () => {
      const results = {};
      await Promise.all(contracts.map(async (c) => {
        try {
          const hash = await publicClient.readContract({ address: c.addr, abi: GET_STATE_ABI, functionName: 'itemImageHash' });
          results[c.addr] = hash;
        } catch { results[c.addr] = ''; }
      }));
      if (Object.keys(results).length > 0) setContractImages(prev => ({ ...prev, ...results }));
    };
    fetchImages();
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
        :root { --navbar-h: ${NAVBAR_H}px; }

        .page { max-width: 860px; margin: 0 auto; padding: 2rem 2rem 5rem; padding-top: calc(var(--navbar-h) + 2.5rem); }
        .page-header { margin-bottom: 2rem; }
        .page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; font-family: var(--font-display); color: var(--text); margin-bottom: 0.35rem; }
        .page-sub { font-family: var(--font-mono); font-size: 0.7rem; color: var(--muted); }

        .load-bar { display: flex; gap: 0.5rem; margin-bottom: 2rem; }
        .load-bar .input { flex: 1; margin-bottom: 0; }
        .load-bar .btn { flex-direction: row; }

        .contract-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 0.85rem; }
        .contract-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.15rem 1.2rem 0.95rem; cursor: pointer; transition: border-color 0.15s; position: relative; display: flex; flex-direction: column; gap: 0.7rem; }
        .contract-card:hover { border-color: var(--text); }
        .contract-card:hover .card-arrow { opacity: 1; }
        .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
        .card-desc { font-size: 0.9rem; font-weight: 700; color: var(--text); word-break: break-word; line-height: 1.3; flex: 1; }
        .card-arrow { color: var(--text); opacity: 0; transition: opacity 0.15s; flex-shrink: 0; margin-top: 0.1rem; display: flex; }
        .card-meta { display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap; }
        .card-addr { font-family: var(--font-mono); font-size: 0.66rem; color: var(--muted); background: var(--surface-2); padding: 0.18rem 0.45rem; border-radius: 4px; border: 1px solid var(--border); }
        .card-deposit { font-family: var(--font-mono); font-size: 0.68rem; color: var(--accent2); font-weight: 700; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 0.2rem; }
        .btn-remove { background: transparent; border: none; color: var(--muted); font-family: var(--font-mono); font-size: 0.62rem; cursor: pointer; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.15s, background 0.15s; display: inline-flex; align-items: center; gap: 0.25rem; }
        .btn-remove:hover { color: var(--danger); background: var(--danger-bg); }
        .open-tag { font-family: var(--font-mono); font-size: 0.6rem; color: var(--accent2); background: var(--accent2-bg); border: 1px solid var(--accent2); padding: 0.18rem 0.5rem; border-radius: 4px; font-weight: 700; letter-spacing: 0.05em; }

        .empty { text-align: center; padding: 5rem 2rem; color: var(--muted); font-family: var(--font-mono); }
        .empty-icon { display: flex; justify-content: center; margin-bottom: 1rem; opacity: 0.5; }
        .empty-title { font-size: 0.86rem; color: var(--text); font-weight: 700; margin-bottom: 0.4rem; font-family: var(--font-display); }
        .empty-sub { font-size: 0.72rem; line-height: 1.7; }

        @media (max-width: 600px) {
          .page { padding: 1rem 1rem 4rem; padding-top: calc(var(--navbar-h) + 1.5rem); }
          .contract-grid { grid-template-columns: 1fr; }
          .navbar { padding: 0 1rem; }
          .nav-btn { padding: 0.4rem 0.6rem; font-size: 0.74rem; }
          .logo { font-size: 1.1rem; }
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
          <button className="nav-btn active">Profile</button>
          <button className="nav-btn" onClick={() => router.push('/?panel=contract')}>Contract</button>
          <button className="nav-btn" onClick={() => router.push('/roadmap')}>Roadmap</button>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
          <button className="theme-toggle" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? <SunIcon size={15}/> : <MoonIcon size={15}/>}
          </button>
          <ConnectButton chainStatus="icon" showBalance={false} />
        </div>
      </nav>

      <div className="page">
        <button className="back-btn" onClick={() => router.push('/')}><ArrowLeftIcon size={13}/> Back</button>

        <div className="page-header">
          <div className="page-title">Profile</div>
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
            <div className="empty-icon"><InboxIcon size={30}/></div>
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
                {contractImages[c.addr] && (
                  <img
                    src={`https://gateway.pinata.cloud/ipfs/${contractImages[c.addr]}`}
                    alt={contractDescriptions[c.addr] || c.description || 'Item'}
                    style={{width:'100%',height:'100px',objectFit:'contain',background:'var(--bg)',borderRadius:'8px',border:'1px solid var(--border)',marginBottom:'-0.1rem'}}
                  />
                )}
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
                      <TrashIcon size={11}/> Remove
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
            <DemoContracts walletAddress={address} />
          </div>
        )}
      </div>
    </div>
  );
}