'use client';

import { useState, useRef, useEffect } from 'react';

// ─── Helpers ────────────────────────────────────────────────────────────────
const short = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';
const fmtDateTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─── State constants ─────────────────────────────────────────────────────────
const STATE = {
  AWAITING_BUYER: 0,
  ACTIVE: 1,
  CANCEL_REQUESTED: 2,
  RETURN_REQUESTED: 3,
  COMPLETED: 4,
  CANCELLED: 5,
  SELLER_CLAIMED: 6,
};

const STATE_INFO = {
  0: { label: 'AWAITING BUYER',   color: '#f59e0b', desc: 'Waiting for a buyer to join' },
  1: { label: 'ACTIVE',           color: '#22c55e', desc: 'Transaction in progress' },
  2: { label: 'CANCEL REQ',       color: '#ef4444', desc: 'Cancellation requested' },
  3: { label: 'RETURN REQ',       color: '#8b5cf6', desc: 'Return requested' },
  4: { label: 'COMPLETED',        color: '#3b82f6', desc: 'Transaction completed successfully' },
  5: { label: 'CANCELLED',        color: '#6b7280', desc: 'Contract cancelled, funds refunded' },
  6: { label: 'SELLER CLAIMED',   color: '#6b7280', desc: 'Seller claimed funds after timeout' },
};

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_SELLER = '0xDEAD1234567890AbCdEf1234567890AbCdEf1234';
const DEMO_BUYER  = '0xBEEF1234567890AbCdEf1234567890AbCdEf5678';

const BASE_CONTRACTS = [
  {
    id: 'demo-1',
    description: 'iPhone 15 Pro 256GB — Natural Titanium',
    price: '0.05',
    deposit: '0.01',
    image: 'https://picsum.photos/seed/iphone15/400/300',
    state: STATE.AWAITING_BUYER,
    shipped: false,
    role: 'seller',
    address: '45 Lê Lợi, Quận 1, TP.HCM',
    ghn: null,
    cancelInitiator: null,
    createdAt: Date.now() - 3600_000,
    chat: [
      { sender: 'system', type: 'system',  message: '🔔 Contract deployed. Waiting for a buyer.',                   ts: Date.now() - 3600_000 },
      { sender: DEMO_SELLER, type: 'text', message: 'Hi, item is brand new, still has original seal.',              ts: Date.now() - 3500_000 },
    ],
  },
  {
    id: 'demo-2',
    description: 'MacBook Air M2 8GB/256GB — Midnight',
    price: '0.12',
    deposit: '0.024',
    image: 'https://picsum.photos/seed/macbookm2/400/300',
    state: STATE.ACTIVE,
    shipped: false,
    role: 'buyer',
    address: '88 Trần Hưng Đạo, Quận 5, TP.HCM',
    ghn: null,
    cancelInitiator: null,
    createdAt: Date.now() - 86400_000,
    chat: [
      { sender: 'system',    type: 'system', message: '🛒 Buyer has joined and sent payment. Transaction is now active.', ts: Date.now() - 86400_000 },
      { sender: DEMO_BUYER,  type: 'text',   message: 'Joined, please ship as soon as you can.',                          ts: Date.now() - 85000_000 },
      { sender: DEMO_SELLER, type: 'text',   message: 'Sure, will pack and drop off tomorrow morning.',                   ts: Date.now() - 84000_000 },
    ],
  },
  {
    id: 'demo-3',
    description: 'Sony WH-1000XM5 Wireless Headphones',
    price: '0.018',
    deposit: '0.0036',
    image: 'https://picsum.photos/seed/sonyheadphones/400/300',
    state: STATE.ACTIVE,
    shipped: true,
    role: 'buyer',
    address: '12 Nguyễn Văn Cừ, Quận 10, TP.HCM',
    ghn: { code: 'GHN-SN10293847', shippedAt: Date.now() - 172800_000 },
    cancelInitiator: null,
    createdAt: Date.now() - 259200_000,
    chat: [
      { sender: 'system',    type: 'system', message: '🛒 Buyer has joined and sent payment.',                                                                 ts: Date.now() - 259200_000 },
      { sender: DEMO_SELLER, type: 'text',   message: 'Packed and ready, dropping off today.',                                                                 ts: Date.now() - 200000_000 },
      { sender: 'system',    type: 'system', message: '📦 Seller has shipped the item. GHN order: GHN-SN10293847 — Track: https://donhang.ghn.vn/?order_code=GHN-SN10293847', ts: Date.now() - 172800_000 },
      { sender: DEMO_BUYER,  type: 'text',   message: 'Ok got the tracking, will check.',                                                                      ts: Date.now() - 170000_000 },
    ],
  },
  {
    id: 'demo-4',
    description: 'Nintendo Switch OLED — White',
    price: '0.022',
    deposit: '0.0044',
    image: 'https://picsum.photos/seed/switcholed/400/300',
    state: STATE.CANCEL_REQUESTED,
    shipped: false,
    role: 'buyer',
    address: '5 Võ Văn Tần, Quận 3, TP.HCM',
    ghn: null,
    cancelInitiator: 'buyer',
    createdAt: Date.now() - 43200_000,
    chat: [
      { sender: 'system',   type: 'system', message: '🛒 Buyer has joined and sent payment.',           ts: Date.now() - 43200_000 },
      { sender: DEMO_BUYER, type: 'text',   message: 'Actually I need to cancel, something came up.',  ts: Date.now() - 40000_000 },
      { sender: 'system',   type: 'system', message: '✕ Buyer has requested to cancel this transaction.', ts: Date.now() - 39900_000 },
    ],
  },
  {
    id: 'demo-5',
    description: 'Fujifilm X100VI Camera',
    price: '0.08',
    deposit: '0.016',
    image: 'https://picsum.photos/seed/fujifilm/400/300',
    state: STATE.CANCEL_REQUESTED,
    shipped: false,
    role: 'seller',
    address: '300 Điện Biên Phủ, Bình Thạnh, TP.HCM',
    ghn: null,
    cancelInitiator: 'seller',
    createdAt: Date.now() - 50000_000,
    chat: [
      { sender: 'system',    type: 'system', message: '🛒 Buyer has joined and sent payment.',               ts: Date.now() - 50000_000 },
      { sender: DEMO_SELLER, type: 'text',   message: 'Sorry I need to cancel, item got damaged in storage.', ts: Date.now() - 48000_000 },
      { sender: 'system',    type: 'system', message: '✕ Seller has requested to cancel.',                    ts: Date.now() - 47900_000 },
    ],
  },
  {
    id: 'demo-6',
    description: 'DJI Mini 4 Pro Drone',
    price: '0.04',
    deposit: '0.008',
    image: 'https://picsum.photos/seed/djidrone/400/300',
    state: STATE.RETURN_REQUESTED,
    shipped: true,
    role: 'buyer',
    address: '67 Hoàng Diệu, Quận 4, TP.HCM',
    ghn: { code: 'GHN-DJ99182736', shippedAt: Date.now() - 345600_000 },
    cancelInitiator: 'buyer',
    createdAt: Date.now() - 432000_000,
    chat: [
      { sender: 'system',   type: 'system', message: '🛒 Buyer has joined and sent payment.',                                                               ts: Date.now() - 432000_000 },
      { sender: 'system',   type: 'system', message: '📦 Seller shipped. GHN order: GHN-DJ99182736 — Track: https://donhang.ghn.vn/?order_code=GHN-DJ99182736', ts: Date.now() - 345600_000 },
      { sender: DEMO_BUYER, type: 'text',   message: 'Item arrived but one propeller is broken.',            ts: Date.now() - 300000_000 },
      { sender: 'system',   type: 'system', message: '↩ Buyer has requested a return.',                      ts: Date.now() - 299000_000 },
    ],
  },
  {
    id: 'demo-7',
    description: 'Vintage Seiko 5 Automatic Watch',
    price: '0.009',
    deposit: '0.0018',
    image: 'https://picsum.photos/seed/seikowatch/400/300',
    state: STATE.COMPLETED,
    shipped: true,
    role: 'buyer',
    address: '22 Bùi Viện, Quận 1, TP.HCM',
    ghn: { code: 'GHN-WC00192837', shippedAt: Date.now() - 691200_000 },
    cancelInitiator: null,
    createdAt: Date.now() - 864000_000,
    chat: [
      { sender: 'system',   type: 'system', message: '🛒 Buyer has joined and sent payment.',                                                                  ts: Date.now() - 864000_000 },
      { sender: 'system',   type: 'system', message: '📦 Seller shipped. GHN order: GHN-WC00192837 — Track: https://donhang.ghn.vn/?order_code=GHN-WC00192837', ts: Date.now() - 691200_000 },
      { sender: DEMO_BUYER, type: 'text',   message: 'Received, looks great. Confirming now.',                                                                 ts: Date.now() - 600000_000 },
      { sender: 'system',   type: 'system', message: '✅ Buyer has confirmed delivery. Funds released to seller.',                                             ts: Date.now() - 599000_000 },
    ],
  },
  {
    id: 'demo-8',
    description: 'Herman Miller Aeron Chair — Size B',
    price: '0.035',
    deposit: '0.007',
    image: 'https://picsum.photos/seed/aeronchair/400/300',
    state: STATE.SELLER_CLAIMED,
    shipped: true,
    role: 'seller',
    address: '101 Cộng Hòa, Tân Bình, TP.HCM',
    ghn: { code: 'GHN-HM77364819', shippedAt: Date.now() - 1728000_000 },
    cancelInitiator: null,
    createdAt: Date.now() - 1900000_000,
    chat: [
      { sender: 'system',    type: 'system', message: '🛒 Buyer has joined and sent payment.',                                                                   ts: Date.now() - 1900000_000 },
      { sender: 'system',    type: 'system', message: '📦 Seller shipped. GHN order: GHN-HM77364819 — Track: https://donhang.ghn.vn/?order_code=GHN-HM77364819', ts: Date.now() - 1728000_000 },
      { sender: DEMO_SELLER, type: 'text',   message: 'Buyer has not responded for over 17 days, claiming funds.',                                               ts: Date.now() - 100000_000 },
      { sender: 'system',    type: 'system', message: '⏰ Seller claimed funds after buyer timeout.',                                                             ts: Date.now() - 99000_000 },
    ],
  },
];

// ─── Demo Modal ───────────────────────────────────────────────────────────────
function DemoModal({ contract, onClose, onStateChange }) {
  const [chatInput, setChatInput] = useState('');
  const [localChat, setLocalChat] = useState(contract.chat);
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipForm, setShipForm] = useState({ name: '', phone: '', address: contract.address || '', district: '', ward: '', weight: '', length: '', width: '', height: '' });
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localChat]);

  // Sync chat khi contract thay đổi từ ngoài
  useEffect(() => {
    setLocalChat(contract.chat);
  }, [contract.id]);

  const addSystemMsg = (msg) => {
    const newMsg = { sender: 'system', type: 'system', message: msg, ts: Date.now() };
    const updated = [...localChat, newMsg];
    setLocalChat(updated);
    onStateChange(contract.id, { chat: updated });
  };

  const isSeller = contract.role === 'seller';
  const isBuyer  = contract.role === 'buyer';
  const s = contract.state;
  const shipped = contract.shipped;
  const isInitiator = contract.cancelInitiator === contract.role;

  const doStateChange = (newState, extra = {}) => {
    onStateChange(contract.id, { state: newState, ...extra });
  };

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleConfirmDelivery = () => {
    addSystemMsg('✅ Buyer has confirmed delivery. Funds released to seller.');
    doStateChange(STATE.COMPLETED);
  };

  const handleRequestCancel = () => {
    const who = isBuyer ? 'buyer' : 'seller';
    const msg = isBuyer ? '✕ Buyer has requested to cancel this transaction.' : '✕ Seller has requested to cancel.';
    const updated = [...localChat, { sender: 'system', type: 'system', message: msg, ts: Date.now() }];
    setLocalChat(updated);
    doStateChange(STATE.CANCEL_REQUESTED, { cancelInitiator: who, chat: updated });
  };

  const handleApproveCancel = () => {
    addSystemMsg('✅ Cancel approved. Funds returned to both parties.');
    doStateChange(STATE.CANCELLED);
  };

  const handleWithdrawCancel = () => {
    addSystemMsg('↩ Cancel request withdrawn.');
    doStateChange(STATE.ACTIVE, { cancelInitiator: null });
  };

  const handleRequestReturn = () => {
    addSystemMsg('↩ Buyer has requested a return.');
    doStateChange(STATE.RETURN_REQUESTED, { cancelInitiator: 'buyer' });
  };

  const handleApproveReturn = () => {
    addSystemMsg('✅ Return approved. Funds returned to buyer.');
    doStateChange(STATE.CANCELLED);
  };

  const handleWithdrawReturn = () => {
    addSystemMsg('↩ Return request withdrawn.');
    doStateChange(STATE.ACTIVE, { cancelInitiator: null });
  };

  const handleClaimTimeout = () => {
    addSystemMsg('⏰ Seller claimed funds after buyer timeout.');
    doStateChange(STATE.SELLER_CLAIMED);
  };

  const handleShip = () => {
    const code = `GHN-DEMO${Math.floor(Math.random() * 90000000 + 10000000)}`;
    const now = Date.now();
    const msg = `📦 Seller has shipped the item. GHN order: ${code} — Track: https://donhang.ghn.vn/?order_code=${code}`;
    const updated = [...localChat, { sender: 'system', type: 'system', message: msg, ts: now }];
    setLocalChat(updated);
    doStateChange(STATE.ACTIVE, { shipped: true, ghn: { code, shippedAt: now }, chat: updated });
    setShowShipForm(false);
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const newMsg = { sender: contract.role === 'seller' ? DEMO_SELLER : DEMO_BUYER, type: 'text', message: chatInput.trim(), ts: Date.now() };
    const updated = [...localChat, newMsg];
    setLocalChat(updated);
    onStateChange(contract.id, { chat: updated });
    setChatInput('');
  };

  const stateInfo = STATE_INFO[contract.state];

  return (
    <div style={{position:'fixed',inset:0,z:300,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem',zIndex:300}} onClick={onClose}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'16px',width:'100%',maxWidth:'640px',maxHeight:'90vh',overflowY:'auto',position:'relative'}} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'1.25rem 1.25rem 0',borderBottom:'1px solid var(--border)',paddingBottom:'1rem',position:'sticky',top:0,background:'var(--surface)',zIndex:10,borderRadius:'16px 16px 0 0'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'0.75rem'}}>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.4rem'}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',background:'rgba(124,58,237,0.15)',color:'#a78bfa',border:'1px solid rgba(124,58,237,0.3)',padding:'0.15rem 0.5rem',borderRadius:'4px',fontWeight:700,letterSpacing:'0.08em'}}>DEMO</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:stateInfo.color,fontWeight:700}}>{stateInfo.label}</span>
              </div>
              <div style={{fontSize:'1rem',fontWeight:700,color:'var(--text)',lineHeight:1.3}}>{contract.description}</div>
            </div>
            <button onClick={onClose} style={{background:'transparent',border:'none',color:'var(--muted)',fontSize:'1.3rem',cursor:'pointer',lineHeight:1,padding:'0.1rem',flexShrink:0}}>✕</button>
          </div>
        </div>

        <div style={{padding:'1.25rem',display:'flex',flexDirection:'column',gap:'1rem'}}>

          {/* Product image */}
          <img src={contract.image} alt={contract.description} style={{width:'100%',height:'200px',objectFit:'cover',borderRadius:'10px',border:'1px solid var(--border)'}} />

          {/* Contract info */}
          <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'10px',overflow:'hidden'}}>
            {[
              ['Item Price', `${contract.price} ETH`],
              ['Deposit (20%)', `${contract.deposit} ETH`],
              ['Your Role', contract.role.charAt(0).toUpperCase() + contract.role.slice(1)],
              ['Delivery Address', contract.address],
              ...(contract.ghn ? [['GHN Tracking', contract.ghn.code], ['Track Link', `donhang.ghn.vn/?order_code=${contract.ghn.code}`]] : []),
            ].map(([label, value], i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.55rem 0.85rem',borderBottom:'1px solid var(--border)',gap:'0.5rem'}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.75rem',color:'var(--muted)',flexShrink:0}}>{label}</span>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color: label === 'GHN Tracking' ? '#06b6d4' : label === 'Your Role' ? '#a78bfa' : 'var(--text)',fontWeight:600,textAlign:'right',wordBreak:'break-all'}}>{value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--muted)',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:'0.1rem'}}>Actions</div>

            {/* AWAITING BUYER — buyer chưa join (chỉ hiện với seller) */}
            {s === STATE.AWAITING_BUYER && isSeller && (
              <div style={{fontFamily:'var(--font-mono)',fontSize:'0.8rem',color:'var(--muted)',padding:'0.75rem',background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'8px'}}>
                ⏳ Waiting for a buyer to join. Share the contract link.
              </div>
            )}

            {/* ACTIVE chưa ship — buyer có thể cancel */}
            {s === STATE.ACTIVE && isBuyer && !shipped && (
              <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'0.5rem'}}>
                <DemoBtn variant="danger" onClick={handleRequestCancel}>✕ Request Cancel</DemoBtn>
              </div>
            )}

            {/* ACTIVE đã ship — buyer confirm hoặc return */}
            {s === STATE.ACTIVE && isBuyer && shipped && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                <DemoBtn variant="success" onClick={handleConfirmDelivery}>✓ Confirm Delivery</DemoBtn>
                <DemoBtn variant="warn" onClick={handleRequestReturn}>↩ Request Return</DemoBtn>
              </div>
            )}

            {/* ACTIVE — seller: ship hoặc cancel */}
            {s === STATE.ACTIVE && isSeller && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                {!shipped ? (
                  <>
                    <DemoBtn variant="cyan" onClick={() => setShowShipForm(v => !v)}>📦 Mark as Shipped</DemoBtn>
                    <DemoBtn variant="danger" onClick={handleRequestCancel}>✕ Request Cancel</DemoBtn>
                  </>
                ) : (
                  <>
                    <div style={{fontFamily:'var(--font-mono)',fontSize:'0.75rem',color:'#06b6d4',padding:'0.65rem 0.85rem',background:'rgba(6,182,212,0.08)',border:'1px solid rgba(6,182,212,0.25)',borderRadius:'8px',textAlign:'center'}}>
                      📦 Shipped ✓
                    </div>
                    <DemoBtn variant="cyan-outline" onClick={handleClaimTimeout}>⏰ Claim (Demo)</DemoBtn>
                  </>
                )}
              </div>
            )}

            {/* Ship form ảo */}
            {showShipForm && s === STATE.ACTIVE && isSeller && !shipped && (
              <div style={{background:'rgba(6,182,212,0.05)',border:'1px solid rgba(6,182,212,0.2)',borderRadius:'10px',padding:'1rem',display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--muted)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'0.2rem'}}>GHN Shipping Info</div>
                {[
                  ['Recipient name', 'name'],
                  ['Phone', 'phone'],
                  ['Address', 'address'],
                  ['District ID', 'district'],
                  ['Ward Code', 'ward'],
                  ['Weight (g)', 'weight'],
                  ['Length (cm)', 'length'],
                  ['Width (cm)', 'width'],
                  ['Height (cm)', 'height'],
                ].map(([placeholder, key]) => (
                  <input key={key} className="input" placeholder={placeholder} value={shipForm[key]} onChange={e => setShipForm(f => ({ ...f, [key]: e.target.value }))} style={{marginBottom:0}} />
                ))}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem',marginTop:'0.25rem'}}>
                  <DemoBtn variant="primary" onClick={handleShip}>Confirm Ship</DemoBtn>
                  <DemoBtn variant="ghost" onClick={() => setShowShipForm(false)}>Cancel</DemoBtn>
                </div>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--muted)',padding:'0.4rem 0.6rem',background:'rgba(124,58,237,0.06)',border:'1px solid rgba(124,58,237,0.15)',borderRadius:'6px'}}>
                  ℹ️ Demo mode — a fake GHN tracking code will be generated.
                </div>
              </div>
            )}

            {/* CANCEL REQUESTED */}
            {s === STATE.CANCEL_REQUESTED && (
              <>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'#ef4444',padding:'0.6rem 0.75rem',background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'8px'}}>
                  ✕ Cancel requested by {isInitiator ? 'you' : 'the other party'}.{isInitiator ? ' Waiting for the other party.' : ' Do you agree?'}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                  {!isInitiator && <DemoBtn variant="danger" onClick={handleApproveCancel}>✓ Approve Cancel</DemoBtn>}
                  {isInitiator  && <DemoBtn variant="secondary" onClick={handleWithdrawCancel}>↩ Withdraw Request</DemoBtn>}
                </div>
              </>
            )}

            {/* RETURN REQUESTED */}
            {s === STATE.RETURN_REQUESTED && (
              <>
                <div style={{fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'#8b5cf6',padding:'0.6rem 0.75rem',background:'rgba(139,92,246,0.07)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:'8px'}}>
                  ↩ Return requested by {isBuyer ? 'you' : 'buyer'}.{isBuyer ? ' Waiting for the seller.' : ' Do you agree to accept the return?'}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                  {isSeller && <DemoBtn variant="warn" onClick={handleApproveReturn}>✓ Approve Return</DemoBtn>}
                  {isBuyer  && <DemoBtn variant="secondary" onClick={handleWithdrawReturn}>↩ Withdraw Request</DemoBtn>}
                </div>
              </>
            )}

            {/* Terminal states */}
            {s === STATE.COMPLETED && (
              <div style={{fontFamily:'var(--font-mono)',fontSize:'0.82rem',color:'#22c55e',padding:'0.75rem',background:'rgba(34,197,94,0.07)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:'8px',textAlign:'center'}}>
                ✅ Escrow completed. {isSeller ? '💰 Funds released to your wallet.' : '📦 Delivery confirmed. Thank you!'}
              </div>
            )}
            {s === STATE.CANCELLED && (
              <div style={{fontFamily:'var(--font-mono)',fontSize:'0.82rem',color:'var(--muted)',padding:'0.75rem',background:'rgba(107,114,128,0.07)',border:'1px solid rgba(107,114,128,0.2)',borderRadius:'8px',textAlign:'center'}}>
                🚫 Escrow cancelled. {isSeller ? 'Deposit returned.' : 'Payment refunded.'}
              </div>
            )}
            {s === STATE.SELLER_CLAIMED && (
              <div style={{fontFamily:'var(--font-mono)',fontSize:'0.82rem',color: isSeller ? '#22c55e' : '#ef4444',padding:'0.75rem',background: isSeller ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',border:`1px solid ${isSeller ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,borderRadius:'8px',textAlign:'center'}}>
                ⏰ {isSeller ? '💰 Funds claimed after buyer timeout.' : '⚠️ Seller claimed funds due to no response.'}
              </div>
            )}
          </div>

          {/* Chat */}
          <div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--muted)',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:'0.6rem'}}>Chat</div>
            <div style={{maxHeight:'260px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'0.45rem',marginBottom:'0.6rem',paddingRight:'0.2rem'}}>
              {localChat.map((m, i) => {
                const isSystem = m.sender === 'system' || m.type === 'system';
                const mine = !isSystem && m.sender === (contract.role === 'seller' ? DEMO_SELLER : DEMO_BUYER);
                return (
                  <div key={i} style={{
                    alignSelf: isSystem ? 'center' : mine ? 'flex-end' : 'flex-start',
                    maxWidth: isSystem ? '95%' : '80%',
                    width: isSystem ? '100%' : undefined,
                    background: isSystem ? 'rgba(6,182,212,0.06)' : mine ? 'rgba(124,58,237,0.15)' : 'var(--border)',
                    border: `1px solid ${isSystem ? 'rgba(6,182,212,0.2)' : mine ? 'rgba(124,58,237,0.25)' : 'var(--border)'}`,
                    borderRadius: '8px',
                    padding: '0.45rem 0.65rem',
                  }}>
                    {!isSystem && (
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'var(--muted)',marginBottom:'0.15rem'}}>
                        {mine ? 'You' : short(m.sender)} · {fmtDateTime(m.ts)}
                      </div>
                    )}
                    {isSystem && (
                      <div style={{fontFamily:'var(--font-mono)',fontSize:'0.6rem',color:'var(--muted)',textAlign:'center',marginBottom:'0.15rem'}}>
                        🔔 System · {fmtDateTime(m.ts)}
                      </div>
                    )}
                    <div style={{
                      fontSize:'0.8rem',
                      color: isSystem ? '#06b6d4' : 'var(--text)',
                      fontFamily: isSystem ? 'var(--font-mono)' : 'inherit',
                      wordBreak:'break-word',
                      textAlign: isSystem ? 'center' : 'left',
                    }}>{m.message}</div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
              <input
                className="input"
                placeholder="Type a message..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                style={{marginBottom:0,flex:1}}
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
                style={{background:'var(--accent)',color:'#fff',border:'none',borderRadius:'8px',padding:'0.65rem 1rem',fontFamily:'var(--font-mono)',fontSize:'0.8rem',fontWeight:700,cursor:'pointer',opacity:chatInput.trim() ? 1 : 0.4,transition:'all 0.15s'}}
              >Send</button>
            </div>
          </div>

          {/* Demo notice */}
          <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--muted)',textAlign:'center',padding:'0.4rem',borderTop:'1px solid var(--border)',paddingTop:'0.75rem'}}>
            🧪 This is a demo contract — no wallet signature required. State resets on wallet change.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small button helper ──────────────────────────────────────────────────────
function DemoBtn({ variant, onClick, children, disabled }) {
  const styles = {
    primary:      { background: 'var(--accent)',  color: '#fff',        border: '1px solid var(--accent)' },
    success:      { background: '#22c55e',         color: '#fff',        border: '1px solid #22c55e' },
    danger:       { background: 'transparent',     color: '#ef4444',     border: '1px solid #ef4444' },
    warn:         { background: 'transparent',     color: '#f97316',     border: '1px solid #f97316' },
    secondary:    { background: 'transparent',     color: '#06b6d4',     border: '1px solid #06b6d4' },
    cyan:         { background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid #06b6d4' },
    'cyan-outline': { background: 'transparent',  color: '#06b6d4',     border: '1px solid rgba(6,182,212,0.4)' },
    ghost:        { background: 'transparent',     color: 'var(--muted)',border: '1px solid var(--border)' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant] || styles.ghost,
        padding: '0.65rem 0.85rem',
        borderRadius: '8px',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.15s',
        letterSpacing: '0.03em',
      }}
    >{children}</button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function DemoContracts({ walletAddress }) {
  // Reset khi đổi ví
  const [demoContracts, setDemoContracts] = useState(() =>
    BASE_CONTRACTS.map(c => ({ ...c, chat: [...c.chat] }))
  );
  const prevAddress = useRef(walletAddress);

  useEffect(() => {
    if (prevAddress.current !== walletAddress) {
      setDemoContracts(BASE_CONTRACTS.map(c => ({ ...c, chat: [...c.chat] })));
      prevAddress.current = walletAddress;
    }
  }, [walletAddress]);

  const [activeId, setActiveId] = useState(null);
  const activeContract = demoContracts.find(c => c.id === activeId);

  const handleStateChange = (id, updates) => {
    setDemoContracts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  return (
    <>
      {demoContracts.map((c) => {
        const info = STATE_INFO[c.state];
        return (
          <div
            key={c.id}
            className="contract-card"
            onClick={() => setActiveId(c.id)}
            style={{opacity: 0.88, position: 'relative'}}
          >
            {/* Ảnh thumbnail */}
            <img
              src={c.image}
              alt={c.description}
              style={{width:'100%',height:'100px',objectFit:'cover',borderRadius:'8px',border:'1px solid var(--border)',marginBottom:'-0.1rem'}}
            />

            <div className="card-top">
              <div className="card-desc">{c.description}</div>
              <div className="card-arrow">→</div>
            </div>

            <div className="card-meta">
              <span className="card-addr">demo contract</span>
              <span className="card-deposit">Deposit: {c.deposit} ETH</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:'0.62rem',background:'rgba(124,58,237,0.12)',color:'#a78bfa',border:'1px solid rgba(124,58,237,0.25)',padding:'0.15rem 0.45rem',borderRadius:'4px',fontWeight:700,letterSpacing:'0.06em'}}>DEMO</span>
            </div>

            <div style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--muted)'}}>
              {info.desc}
            </div>

            <div className="card-footer">
              <span style={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--muted)'}}>
                Status: <span style={{color: info.color, fontWeight: 700}}>{info.label}</span>
              </span>
              <span className="open-tag">OPEN →</span>
            </div>
          </div>
        );
      })}

      {activeContract && (
        <DemoModal
          contract={activeContract}
          onClose={() => setActiveId(null)}
          onStateChange={handleStateChange}
        />
      )}
    </>
  );
}
