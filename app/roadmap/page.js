'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const NAVBAR_H = 64;

const PHASES = [
  {
    n: '01',
    status: 'live',
    statusLabel: 'Live now',
    title: 'Sepolia Testnet',
    chain: 'Ethereum Sepolia',
    sub: 'A fully functional bilateral escrow — no admin, no middleman, running live on testnet.',
    items: [
      'Bilateral 20% deposit — both buyer and seller have skin in the game, making honest behavior the rational choice.',
      'Real GHN integration — sellers create a shipping order right inside the app, with the tracking code saved to chat.',
      'Built-in chat with IPFS-stored evidence photos, used to resolve disputes.',
      'Time-based auto-resolution — cancel/return requests resolve after 72 hours, claims unlock after 17 days of no response.',
    ],
  },
  {
    n: '02',
    status: 'next',
    statusLabel: 'Up next',
    title: 'Migrating to Rialo',
    chain: 'Rialo Testnet',
    sub: 'Once Rialo opens a public testnet, EscrowMAD will move over to solve what Ethereum doesn\'t handle well.',
    items: [
      'Private transactions via REX — buyer/seller identity and amounts stay hidden, while the chain still verifies the contract is valid.',
      'No oracle middleman — smart contracts call HTTPS directly for pricing data, cutting cost and third-party risk.',
      'Self-triggering timeouts — refunds and claims fire on schedule without an external bot or cron job watching.',
      'Email or SMS login — no need to understand MetaMask or seed phrases.',
    ],
  },
  {
    n: '03',
    status: 'future',
    statusLabel: 'Future',
    title: 'eBay on the Blockchain',
    chain: 'Mainnet',
    sub: 'Growing EscrowMAD into a large-scale marketplace — anyone can sell, fees are near zero, and trust isn\'t required.',
    items: [
      'An open marketplace for everyone — listing items requires no signup or approval.',
      'No platform fees, no commission — users only pay gas, thanks to Rialo mainnet\'s low operating cost.',
      'Trust comes from the bilateral deposit and on-chain escrow mechanism, replacing traditional review/reputation systems.',
      'Expansion beyond Vietnam into more markets, with support for more item types and delivery methods.',
    ],
  },
];

export default function RoadmapPage() {
  const router = useRouter();
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
        .logo { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(135deg, #b9a4ff, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-right: 1.5rem; white-space: nowrap; font-family: var(--font-syne, inherit); }
        .nav-btn { background: transparent; border: 1px solid transparent; padding: 0.5rem 1.2rem; color: var(--muted); font-family: var(--font-mono); font-size: 0.9rem; font-weight: 600; letter-spacing: 0.03em; cursor: pointer; border-radius: 8px; transition: all 0.15s; white-space: nowrap; }
        .nav-btn:hover { color: var(--text); background: rgba(124,58,237,0.08); border-color: rgba(124,58,237,0.2); }
        .nav-btn.active { color: #b9a4ff; background: rgba(124,58,237,0.12); border-color: rgba(124,58,237,0.3); }

        .page { max-width: 760px; margin: 0 auto; padding: 2rem 2rem 6rem; padding-top: calc(var(--navbar-h) + 2.5rem); }
        .back-btn { background: transparent; border: none; color: var(--muted); font-family: var(--font-mono); font-size: 0.72rem; cursor: pointer; padding: 0; margin-bottom: 2.5rem; display: flex; align-items: center; gap: 0.3rem; transition: color 0.15s; }
        .back-btn:hover { color: var(--text); }

        .rm-eyebrow { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.24em; color: var(--accent2); text-transform: uppercase; margin-bottom: 0.9rem; }
        .rm-title { font-size: clamp(2.4rem, 6vw, 3.2rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin-bottom: 1rem; font-family: var(--font-syne, inherit); }
        .rm-sub { font-family: var(--font-mono); font-size: 0.92rem; color: var(--muted); line-height: 1.8; max-width: 540px; margin-bottom: 3.5rem; }

        /* Timeline */
        .timeline { position: relative; }
        .tl-rail { position: absolute; left: 23px; top: 6px; bottom: 6px; width: 2px; background: linear-gradient(180deg, var(--accent) 0%, var(--accent) 38%, rgba(6,182,212,0.5) 55%, rgba(90,90,122,0.25) 75%, rgba(90,90,122,0.08) 100%); }

        .phase { position: relative; padding-left: 64px; margin-bottom: 3.25rem; }
        .phase:last-child { margin-bottom: 0; }

        .phase-marker { position: absolute; left: 0; top: 0; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-weight: 700; font-size: 0.95rem; z-index: 1; background: var(--bg); border: 2px solid; }
        .phase.live   .phase-marker { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 0 4px rgba(124,58,237,0.1); }
        .phase.next   .phase-marker { border-color: var(--accent2); color: var(--accent2); }
        .phase.future .phase-marker { border-color: var(--border); color: var(--muted); }

        .phase-head { display: flex; align-items: baseline; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 0.3rem; padding-top: 0.55rem; }
        .phase-title { font-size: 1.45rem; font-weight: 800; color: var(--text); letter-spacing: -0.015em; font-family: var(--font-syne, inherit); }
        .phase-chain { font-family: var(--font-mono); font-size: 0.74rem; color: var(--muted); }
        .phase-status { font-family: var(--font-mono); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.18rem 0.55rem; border-radius: 999px; border: 1px solid currentColor; margin-left: auto; flex-shrink: 0; }
        .phase.live   .phase-status { color: var(--success); }
        .phase.next   .phase-status { color: var(--accent2); }
        .phase.future .phase-status { color: var(--muted); }

        .phase-sub { font-family: var(--font-mono); font-size: 0.82rem; color: var(--muted); line-height: 1.75; margin-bottom: 1.15rem; max-width: 520px; }

        .phase-list { display: flex; flex-direction: column; gap: 0.55rem; }
        .phase-li { display: flex; gap: 0.65rem; align-items: flex-start; font-family: var(--font-mono); font-size: 0.83rem; color: var(--text); line-height: 1.65; }
        .phase-li::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--muted); margin-top: 0.55rem; flex-shrink: 0; opacity: 0.6; }
        .phase.live .phase-li::before { background: var(--accent); opacity: 0.9; }
        .phase.next .phase-li::before { background: var(--accent2); opacity: 0.9; }

        @media (max-width: 600px) {
          .page { padding: 1rem 1.1rem 4rem; padding-top: calc(var(--navbar-h) + 1.5rem); }
          .navbar { padding: 0 1rem; }
          .nav-btn { padding: 0.4rem 0.6rem; font-size: 0.78rem; }
          .logo { font-size: 1.2rem; }
          .phase { padding-left: 52px; }
          .phase-marker { width: 40px; height: 40px; font-size: 0.82rem; }
          .tl-rail { left: 19px; }
          .phase-status { margin-left: 0; }
        }
      `}</style>

      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-left">
          <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginRight:'1.5rem', cursor:'pointer'}} onClick={() => router.push('/')}>
            <img src="/logo.png" alt="EscrowMAD" style={{width:'32px', height:'32px', objectFit:'contain', borderRadius:'6px'}} />
            <div className="logo">EscrowMAD</div>
          </div>
          <button className="nav-btn" onClick={() => router.push('/my-contracts')}>Profile</button>
          <button className="nav-btn" onClick={() => router.push('/?panel=contract')}>Contract</button>
          <button className="nav-btn active">Roadmap</button>
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

        <div className="rm-eyebrow">Where EscrowMAD is headed</div>
        <div className="rm-title">Roadmap</div>
        <p className="rm-sub">
          Three phases, from the current testnet to a fee-free, trustless marketplace.
        </p>

        <div className="timeline">
          <div className="tl-rail" />
          {PHASES.map((p) => (
            <div key={p.n} className={`phase ${p.status}`}>
              <div className="phase-marker">{p.n}</div>
              <div className="phase-head">
                <span className="phase-title">{p.title}</span>
                <span className="phase-status">{p.statusLabel}</span>
              </div>
              <div className="phase-chain" style={{marginBottom:'0.9rem'}}>{p.chain}</div>
              <p className="phase-sub">{p.sub}</p>
              <div className="phase-list">
                {p.items.map((it, idx) => (
                  <div className="phase-li" key={idx}>{it}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}