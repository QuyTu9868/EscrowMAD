'use client';

import artifact from './EscrowMAD.json';
const BYTECODE = artifact.bytecode;

import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, usePublicClient,
  useDeployContract,
} from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from './firebase';
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';

const ABI = [
  { inputs: [], name: 'seller',             outputs: [{ type: 'address' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'buyer',              outputs: [{ type: 'address' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'itemPrice',          outputs: [{ type: 'uint256' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'deposit',            outputs: [{ type: 'uint256' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'getState',           outputs: [{ type: 'uint8'   }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'getBalance',         outputs: [{ type: 'uint256' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'createdAt',          outputs: [{ type: 'uint256' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'activeAt',           outputs: [{ type: 'uint256' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'requestedAt',        outputs: [{ type: 'uint256' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'requestInitiator',   outputs: [{ type: 'address' }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'itemDescription',    outputs: [{ type: 'string'  }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'itemImageHash',      outputs: [{ type: 'string'  }], stateMutability: 'view',    type: 'function' },
  { inputs: [], name: 'returnEvidenceHash', outputs: [{ type: 'string'  }], stateMutability: 'view',    type: 'function' },
  { inputs: [{ name: '_addressHash', type: 'string' }],  name: 'joinAsBuyer',               outputs: [], stateMutability: 'payable',    type: 'function' },
  { inputs: [],                                           name: 'confirmDelivery',           outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [],                                           name: 'cancelAfter24h',            outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [],                                           name: 'claimAfterBuyerTimeout',    outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [],                                           name: 'requestCancel',             outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [],                                           name: 'withdrawCancelRequest',     outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [],                                           name: 'approveCancel',             outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'evidenceHash', type: 'string' }],  name: 'requestReturn',             outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [],                                           name: 'withdrawReturnRequest',     outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [],                                           name: 'approveReturn',             outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [],                                           name: 'executeReturnAfterTimeout', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'ipfsHash', type: 'string' }],      name: 'uploadItemImage',           outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { name: 'CancelRequested', type: 'event', inputs: [{ name: 'by', type: 'address', indexed: true }] },
  { name: 'ReturnRequested', type: 'event', inputs: [{ name: 'by', type: 'address', indexed: true }, { name: 'evidenceHash', type: 'string', indexed: false }] },
];

const DEPLOY_ABI = [
  { inputs: [{ name: '_itemPrice', type: 'uint256' }, { name: '_description', type: 'string' }], stateMutability: 'payable', type: 'constructor' },
];

const STATE = { AWAITING_BUYER: 0, ACTIVE: 1, CANCEL_REQUESTED: 2, RETURN_REQUESTED: 3, COMPLETED: 4, CANCELLED: 5, SELLER_CLAIMED: 6 };
const STATE_LABELS = ['AWAITING BUYER', 'ACTIVE', 'CANCEL REQUESTED', 'RETURN REQUESTED', 'COMPLETED', 'CANCELLED', 'SELLER CLAIMED'];
const STATE_COLORS = ['#f59e0b', '#22c55e', '#f97316', '#8b5cf6', '#6366f1', '#6b7280', '#6b7280'];

// States considered "done" — navbar Deploy/Join buttons reappear
const DONE_STATES = [STATE.COMPLETED, STATE.CANCELLED, STATE.SELLER_CLAIMED];

const short  = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : '—';
const fmt    = (w) => w != null ? `${formatEther(w)} ETH` : '—';
const isZero = (a) => !a || a === '0x0000000000000000000000000000000000000000';

function countdown(targetTs) {
  const now  = Math.floor(Date.now() / 1000);
  const diff = Number(targetTs) - now;
  if (diff <= 0) return 'Expired';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isCountdownExpired(targetTs) {
  if (!targetTs) return false;
  return Math.floor(Date.now() / 1000) >= Number(targetTs);
}

function fmtDateTime(ts) {
  if (!ts) return '...';
  const d = ts?.toDate ? ts.toDate() : new Date(ts * 1000);
  return d.toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const MY_CONTRACTS_KEY = 'escrowmad_contracts';
function loadSavedContracts() {
  try { return JSON.parse(localStorage.getItem(MY_CONTRACTS_KEY) || '[]'); } catch { return []; }
}
function saveContract(addr, description = '', deposit = '') {
  const list = loadSavedContracts();
  const existing = list.findIndex(c => c.addr === addr);
  const entry = { addr, description, deposit };
  if (existing >= 0) { list[existing] = { ...list[existing], ...entry }; }
  else { list.unshift(entry); }
  localStorage.setItem(MY_CONTRACTS_KEY, JSON.stringify(list.slice(0, 20)));
}

function shippedKey(addr) { return `escrowmad_shipped_${addr}`; }

async function uploadToPinata(file) {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!jwt) throw new Error('NEXT_PUBLIC_PINATA_JWT not set in .env.local');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });
  if (!res.ok) throw new Error('Pinata upload failed: ' + res.statusText);
  const data = await res.json();
  return data.IpfsHash;
}

const NAVBAR_H = 56;

function LandingCards() {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const cards = ref.current.querySelectorAll('.why-card');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    cards.forEach(c => io.observe(c));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{width:'100%', maxWidth:'800px', display:'flex', flexDirection:'column', alignItems:'center'}}>

      {/* ── scroll → About ── */}
      <div className="scroll-sep"><span>SCROLL</span><span className="scroll-arrow">↓</span></div>

      {/* ── About ── */}
      <div className="landing-section">
        <div className="landing-section-label">About</div>
        <div className="about-bento">
          <div className="about-cell wide">
            <span className="about-icon">⛓️</span>
            <div className="about-cell-title">What is EscrowMAD?</div>
            <div className="about-cell-body">
              EscrowMAD is a fully on-chain escrow protocol for peer-to-peer transactions on Ethereum Sepolia.
              Funds are locked inside a smart contract — <strong>no third party ever touches your money</strong>.
              The seller stakes a <strong>20% security deposit</strong> to ensure accountability.
              Every action — shipping, cancellation, dispute — is time-locked and verifiable on-chain forever.
            </div>
          </div>
          <div className="about-cell">
            <span className="about-icon">🛒</span>
            <div className="about-cell-title">For Buyers</div>
            <div className="about-cell-body">
              Inspect item details and verify the seller's deposit before paying a single wei.
              Your funds remain locked until you confirm delivery — or auto-resolve after a timeout.
              Built-in chat with IPFS image proofs keeps every dispute resolvable.
            </div>
          </div>
          <div className="about-cell">
            <span className="about-icon">🏷️</span>
            <div className="about-cell-title">For Sellers</div>
            <div className="about-cell-body">
              Deploy a contract in seconds — set price, upload an item photo to IPFS, share a link.
              Your 20% deposit is returned in full once the buyer confirms delivery,
              making honest behaviour the only rational strategy.
            </div>
          </div>
        </div>
      </div>

      <hr className="landing-divider" style={{marginTop:'4rem'}} />
      {/* ── scroll → Why ── */}
      <div className="scroll-sep"><span>SCROLL</span><span className="scroll-arrow">↓</span></div>

      {/* ── Why ── */}
      <div className="landing-section">
        <div className="landing-section-label">Why EscrowMAD?</div>
        <div className="why-grid">
          {[
            { icon:'🔒', title:'No Trusted Third Party',      desc:'Code is the only arbiter. No platform can freeze funds, take fees, or reverse decisions.' },
            { icon:'🛡️', title:'Scam-Resistant by Design',    desc:'Seller must post a 20% deposit before activation. Scammers have real skin in the game.' },
            { icon:'⏱️', title:'Time-Locked Auto-Resolution', desc:'Disputes auto-resolve in 72 hours. Shipping claims close in 17 days. Zero deadlock.' },
            { icon:'💬', title:'Built-in Evidence Chat',      desc:'On-chain messages with IPFS image uploads. Every claim backed by immutable proof.' },
            { icon:'🔍', title:'Fully Auditable State',       desc:'Every state transition lives on-chain. Verify any contract\'s full history via Etherscan.' },
            { icon:'💸', title:'Zero Platform Fees',          desc:'No subscription, no listing fee, no commission. You pay only Ethereum gas.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="why-card">
              <span className="why-card-icon">{icon}</span>
              <div className="why-card-title">{title}</div>
              <div className="why-card-desc">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <hr className="landing-divider" style={{marginTop:'4rem'}} />
      {/* ── scroll → How to Use ── */}
      <div className="scroll-sep"><span>SCROLL</span><span className="scroll-arrow">↓</span></div>

      {/* ── How to Use ── */}
      <div className="landing-section">
        <div className="landing-section-label">How to Use</div>
        <div className="tl-track">
          {[
            { num:'①', label:'Deploy',   desc:'Seller sets item & price, pays 20% deposit' },
            { num:'②', label:'Share',    desc:'Copy contract link and send to buyer' },
            { num:'③', label:'Join',     desc:'Buyer inspects item, pays price + deposit' },
            { num:'④', label:'Ship',     desc:'Seller marks shipped, 17-day clock starts' },
            { num:'⑤', label:'Confirm',  desc:'Buyer confirms, funds released instantly' },
            { num:'⑥', label:'Dispute?', desc:'Cancel / return — 72h auto-resolve' },
          ].map(({ num, label, desc }) => (
            <div key={label} className="tl-step">
              <div className="tl-num">{num}</div>
              <div className="tl-label">{label}</div>
              <div className="tl-desc">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer CTA ── */}
      <div className="landing-footer-cta">
        <div className="footer-glow" />
        <h2 className="footer-cta-title">Ready to transact<br/>without trust?</h2>
        <p className="footer-cta-sub">Connect your wallet. Deploy your first escrow in under 60 seconds.</p>
        <div style={{marginTop:'1.5rem'}}>
          <ConnectButton label="Connect Wallet" />
        </div>
      </div>

      <div className="landing-footer-bottom">
        © 2025 EscrowMAD &nbsp;·&nbsp; Built on Ethereum Sepolia &nbsp;·&nbsp; Trustless by design
      </div>

    </div>
  );
}

export default function Home() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [contractAddr,    setContractAddr]    = useState('');
  const [inputAddr,       setInputAddr]       = useState('');
  const [navPanel,        setNavPanel]        = useState(null);
  const [myContracts,     setMyContracts]     = useState([]);
  // 'home' | 'mycontracts'
  const [currentView,     setCurrentView]     = useState('home');

  const [deployDesc,    setDeployDesc]    = useState('');
  const [deployPrice,   setDeployPrice]   = useState('');
  const [deployImgHash, setDeployImgHash] = useState('');
  const [deployUploading, setDeployUploading] = useState(false);
  const [txStatus,      setTxStatus]      = useState('');
  const [chatMessages,  setChatMessages]  = useState([]);
  const [chatInput,     setChatInput]     = useState('');
  const [addressHash,   setAddressHash]   = useState('');
  const [copied,        setCopied]        = useState(false);
  const [uploadingImg,  setUploadingImg]  = useState(false);
  const [uploadingChat, setUploadingChat] = useState(false);
  const [shipped,       setShipped]       = useState(false);
  const [shippedAt,     setShippedAt]     = useState(null);
  const [isDark,        setIsDark]        = useState(true);

  // Sync theme với localStorage
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

  // Ticker to re-render countdown every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const pendingAction = useRef(null);
  const chatEndRef    = useRef(null);
  const fileInputRef     = useRef(null);
  const deployImgRef     = useRef(null);
  const chatImgRef    = useRef(null);

  const contractAddress = contractAddr || null;

  useEffect(() => {
    const c = searchParams.get('contract');
    if (c && c.startsWith('0x')) { setContractAddr(c); saveContract(c); }
    setMyContracts(loadSavedContracts());
  }, [searchParams]);

  useEffect(() => {
    if (!contractAddress) return;
    const key = shippedKey(contractAddress);
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      setShipped(true);
      setShippedAt(parsed.at);
    } else {
      setShipped(false);
      setShippedAt(null);
    }
  }, [contractAddress]);

  const ro = { address: contractAddress, abi: ABI, query: { enabled: !!contractAddress } };
  const { data: seller,           refetch: rs  } = useReadContract({ ...ro, functionName: 'seller' });
  const { data: buyer,            refetch: rb  } = useReadContract({ ...ro, functionName: 'buyer' });
  const { data: itemPrice,        refetch: rp  } = useReadContract({ ...ro, functionName: 'itemPrice' });
  const { data: deposit,          refetch: rd  } = useReadContract({ ...ro, functionName: 'deposit' });
  const { data: state,            refetch: rst } = useReadContract({ ...ro, functionName: 'getState' });
  const { data: balance,          refetch: rba } = useReadContract({ ...ro, functionName: 'getBalance' });
  const { data: createdAt,        refetch: rc  } = useReadContract({ ...ro, functionName: 'createdAt' });
  const { data: activeAt,         refetch: ra  } = useReadContract({ ...ro, functionName: 'activeAt' });
  const { data: requestedAt,      refetch: rra } = useReadContract({ ...ro, functionName: 'requestedAt' });
  const { data: requestInitiator, refetch: ri  } = useReadContract({ ...ro, functionName: 'requestInitiator' });
  const { data: itemDescription                } = useReadContract({ ...ro, functionName: 'itemDescription' });
  const { data: itemImageHash, refetch: rimg   } = useReadContract({ ...ro, functionName: 'itemImageHash' });
  const { data: returnEvidenceHash             } = useReadContract({ ...ro, functionName: 'returnEvidenceHash' });

  const refetchAll = useCallback(() => {
    [rs,rb,rp,rd,rst,rba,rc,ra,rra,ri,rimg].forEach(r => r());
  }, []);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { deployContract, data: deployTxHash, isPending: isDeployPending } = useDeployContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });
  const { isLoading: isDeployConfirming, isSuccess: isDeployConfirmed } =
    useWaitForTransactionReceipt({ hash: deployTxHash });

  const sendChatNotif = useCallback(async (message) => {
    if (!contractAddress) return;
    await addDoc(collection(db, 'chats', contractAddress.toLowerCase(), 'messages'), {
      sender: 'system',
      message,
      type: 'system',
      timestamp: serverTimestamp(),
    });
  }, [contractAddress]);

  useEffect(() => {
    if (isConfirmed) {
      setTxStatus('✅ Transaction confirmed!');
      refetchAll();
      if (pendingAction.current) {
        sendChatNotif(pendingAction.current);
        pendingAction.current = null;
      }
      setTimeout(() => setTxStatus(''), 5000);
    }
  }, [isConfirmed]);

  useEffect(() => {
    if (isDeployConfirmed && deployTxHash && publicClient) {
      publicClient.getTransactionReceipt({ hash: deployTxHash }).then(receipt => {
        if (receipt?.contractAddress) {
          const addr   = receipt.contractAddress;
          const depEth = deployPrice ? (parseFloat(deployPrice) / 5).toFixed(6) : '';
          saveContract(addr, deployDesc, depEth);
          if (deployImgHash) {
            tx('uploadItemImage', [deployImgHash], null, '🖼️ Seller has uploaded an item image to IPFS.');
            setTimeout(() => rimg(), 3000);
            setDeployImgHash('');
          }
          setMyContracts(loadSavedContracts());
          setContractAddr(addr);
          setNavPanel(null);
          router.push(`?contract=${addr}`);
          setTxStatus(`✅ Contract deployed at ${addr}`);
        }
      });
    }
  }, [isDeployConfirmed, deployTxHash]);

  useEffect(() => {
    if (!contractAddress) return;
    const q = query(
      collection(db, 'chats', contractAddress.toLowerCase(), 'messages'),
      orderBy('timestamp', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [contractAddress]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const isSeller    = address && seller && address.toLowerCase() === seller.toLowerCase();
  const isBuyer     = address && buyer  && address.toLowerCase() === buyer.toLowerCase();
  const isInitiator = address && requestInitiator && address.toLowerCase() === requestInitiator.toLowerCase();
  const stateNum    = state !== undefined ? Number(state) : null;
  const isLoading   = isPending || isConfirming || isDeployPending || isDeployConfirming;

  // Contract is finished — show Deploy/Join buttons again
  const isDone           = stateNum !== null && DONE_STATES.includes(stateNum);
  const showDeployJoinNav = !contractAddress || isDone;

  // Claim timer
  const claimAvailableTs = shippedAt
    ? shippedAt + 17 * 86400
    : (activeAt ? Number(activeAt) + 14 * 86400 : null);
  const claimCountdown   = claimAvailableTs ? countdown(claimAvailableTs) : null;
  const claimReady       = claimAvailableTs ? isCountdownExpired(claimAvailableTs) : false;

  // Auto-cancel: ACTIVE + seller chưa shipped sau 72h kể từ activeAt
  const autoCancelTs        = (!shipped && activeAt) ? Number(activeAt) + 72 * 3600 : null;
  const autoCancelReady     = autoCancelTs ? isCountdownExpired(autoCancelTs) : false;
  const autoCancelCountdown = autoCancelTs ? countdown(autoCancelTs) : null;

  // Return: chỉ available sau 3 ngày kể từ shippedAt
  const returnAvailableTs    = shippedAt ? shippedAt + 3 * 86400 : null;
  const returnReady          = returnAvailableTs ? isCountdownExpired(returnAvailableTs) : false;
  const returnCountdown      = returnAvailableTs ? countdown(returnAvailableTs) : null;

  useEffect(() => {
    if (contractAddress && itemDescription && deposit) {
      saveContract(contractAddress, itemDescription, formatEther(deposit));
      setMyContracts(loadSavedContracts());
    }
  }, [contractAddress, itemDescription, deposit]);

  const tx = (functionName, args = [], value, chatMsg = null) => {
    writeContract({ address: contractAddress, abi: ABI, functionName, args, ...(value ? { value } : {}), gas: 300_000n });
    setTxStatus('⏳ Waiting for confirmation...');
    pendingAction.current = chatMsg;
  };

  const handleJoin = () => {
    if (!addressHash.trim()) return alert('Please enter your delivery address');
    tx('joinAsBuyer', [addressHash], itemPrice + deposit,
      `🛒 A buyer has joined the escrow and sent payment. The transaction is now active.`
    );
  };

  const handleShipped = async () => {
    if (!contractAddress || !address) return;
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem(shippedKey(contractAddress), JSON.stringify({ at: now }));
    setShipped(true);
    setShippedAt(now);
    await sendChatNotif(`📦 Seller has shipped the item. The buyer should receive it within 3 days. Claim will be available in 17 days if buyer does not respond.`);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !address || !contractAddress) return;
    await addDoc(collection(db, 'chats', contractAddress.toLowerCase(), 'messages'), {
      sender: address, message: chatInput.trim(), type: 'text', timestamp: serverTimestamp(),
    });
    setChatInput('');
  };

  const handleChatImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !address || !contractAddress) return;
    setUploadingChat(true);
    try {
      const hash = await uploadToPinata(file);
      await addDoc(collection(db, 'chats', contractAddress.toLowerCase(), 'messages'), {
        sender: address, message: `https://gateway.pinata.cloud/ipfs/${hash}`, type: 'image', timestamp: serverTimestamp(),
      });
    } catch (err) { alert('Image upload failed: ' + err.message); }
    finally { setUploadingChat(false); e.target.value = ''; }
  };

  const handleItemImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const hash = await uploadToPinata(file);
      tx('uploadItemImage', [hash], null, `🖼️ Seller has uploaded an item image to IPFS.`);
    } catch (err) { alert('Upload failed: ' + err.message); }
    finally { setUploadingImg(false); e.target.value = ''; }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}?contract=${contractAddress}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadContract = () => {
    let addr = inputAddr.trim();
    try { const url = new URL(addr); const param = url.searchParams.get('contract'); if (param) addr = param; } catch {}
    if (addr.startsWith('0x') && addr.length === 42) {
      saveContract(addr);
      setMyContracts(loadSavedContracts());
      setContractAddr(addr);
      setNavPanel(null);
      router.push(`?contract=${addr}`);
    } else {
      alert('Invalid input — paste a contract address (0x...) or a share link');
    }
  };

  const handleDeployImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDeployUploading(true);
    try {
      const hash = await uploadToPinata(file);
      setDeployImgHash(hash);
    } catch (err) { alert('Upload failed: ' + err.message); }
    finally { setDeployUploading(false); e.target.value = ''; }
  };

  const handleDeploy = async () => {
    if (!deployDesc.trim() || !deployPrice.trim()) return alert('Please fill in all fields');
    try {
      const price = parseEther(deployPrice);
      const dep   = price / 5n;
      deployContract({ abi: DEPLOY_ABI, bytecode: BYTECODE, args: [price, deployDesc], value: dep, gas: 3_000_000n });
      setTxStatus('⏳ Check your wallet to sign the deploy transaction...');
    } catch (e) { setTxStatus('❌ ' + (e.shortMessage || e.message)); }
  };

  const openContract = (addr) => {
    setContractAddr(addr);
    setNavPanel(null);
    setCurrentView('home');
    router.push(`?contract=${addr}`);
  };

  return (
    <div className={isDark ? 'theme-dark' : 'theme-light'} style={{minHeight:'100vh', position:'relative'}}>
      <style>{`
        :root {
          --font-mono: monospace;
          --navbar-h: ${NAVBAR_H}px;
          --accent: #7c3aed; --accent2: #06b6d4;
          --danger: #ef4444; --success: #22c55e; --warn: #f97316;
        }
        .theme-dark {
          --bg: #0a0a0f; --surface: #111118; --border: #1e1e2e;
          --text: #e2e2f0; --muted: #5a5a7a;
          --navbar-bg: rgba(10,10,15,0.95);
          --grid-color: #1e1e2e; --grid-opacity: 0.35;
          --input-bg: #0a0a0f;
          background: #0a0a0f; color: #e2e2f0;
        }
        .theme-light {
          --bg: #f0f4ff; --surface: #ffffff; --border: #dde3f0;
          --text: #1a1a2e; --muted: #6b7280;
          --navbar-bg: rgba(240,244,255,0.95);
          --grid-color: #c7d0e8; --grid-opacity: 0.6;
          --input-bg: #f8faff;
          background: #f0f4ff; color: #1a1a2e;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: transparent; color: var(--text); font-family: sans-serif; min-height: 100vh; transition: background 0.25s, color 0.25s; }
        .theme-dark::before, .theme-light::before {
          content: ''; position: fixed; inset: 0; pointer-events: none;
          background-image: linear-gradient(var(--grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
          background-size: 40px 40px; opacity: var(--grid-opacity);
          z-index: -1;
        }
        .theme-toggle {
          background: transparent; border: none; cursor: pointer;
          font-size: 1.25rem; line-height: 1; padding: 0.25rem 0.4rem;
          border-radius: 50%; transition: transform 0.2s;
          display: flex; align-items: center; margin-left: 0.25rem;
        }
        .theme-toggle:hover { transform: scale(1.2); }
        .navbar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 200;
          background: var(--navbar-bg); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 1.5rem; height: var(--navbar-h);
        }
        .nav-left { display: flex; align-items: center; gap: 0.25rem; }
        .logo { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(135deg, #a78bfa, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-right: 1rem; white-space: nowrap; }
        .nav-btn { background: transparent; border: none; padding: 0.4rem 0.85rem; color: var(--muted); font-family: var(--font-mono); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; cursor: pointer; border-radius: 6px; transition: all 0.15s; white-space: nowrap; }
        .nav-btn:hover { color: var(--text); background: rgba(124,58,237,0.08); }
        .nav-btn.active { color: #a78bfa; background: rgba(124,58,237,0.12); }

        /* ── Nav panel: centered, narrow ── */
        .nav-panel {
          position: fixed; top: var(--navbar-h); left: 0; right: 0; z-index: 199;
          background: var(--surface); border-bottom: 1px solid var(--border);
          padding: 1.5rem;
          animation: slideDown 0.15s ease;
          max-height: calc(100vh - var(--navbar-h)); overflow-y: auto;
          display: flex;
          justify-content: center;
        }
        .panel-form {
          width: 100%;
          max-width: 420px;
        }
        .panel-form-wide {
          width: 100%;
          max-width: 680px;
        }

        @keyframes slideDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        .mc-table { width: 100%; border-collapse: collapse; }
        .mc-table th { font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; padding: 0 0.5rem 0.6rem; text-align: left; border-bottom: 1px solid var(--border); }
        .mc-table td { padding: 0.55rem 0.5rem; font-size: 0.8rem; border-bottom: 1px solid rgba(30,30,46,0.5); }
        .mc-table tr:last-child td { border-bottom: none; }
        .mc-table tr:hover td { background: rgba(124,58,237,0.06); cursor: pointer; }
        .mc-table .td-desc { font-weight: 600; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .mc-table .td-dep  { font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent2); white-space: nowrap; }
        .mc-table .td-addr { font-family: var(--font-mono); font-size: 0.72rem; color: var(--muted); white-space: nowrap; }
        .mc-empty { color: var(--muted); font-size: 0.8rem; font-family: var(--font-mono); padding: 0.5rem 0; }
        .panel-title { font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; margin-bottom: 1rem; }
        .app { max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem 5rem; padding-top: calc(var(--navbar-h) + 2rem); }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; position: relative; z-index: 1; }
        .card-title { font-size: 0.65rem; font-family: var(--font-mono); letter-spacing: 0.15em; color: var(--muted); text-transform: uppercase; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid var(--border); background: transparent; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-size: 0.75rem; color: var(--muted); font-family: var(--font-mono); }
        .info-value { font-size: 0.85rem; font-weight: 600; color: var(--text); }
        .mono { font-family: var(--font-mono); font-size: 0.75rem !important; }
        .you-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.6rem; font-family: var(--font-mono); font-weight: 700; margin-left: 0.4rem; background: rgba(124,58,237,0.2); color: #a78bfa; border: 1px solid rgba(124,58,237,0.3); }
        .state-badge { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 1rem; border-radius: 999px; font-size: 0.7rem; font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.1em; border: 1px solid currentColor; margin-bottom: 1.25rem; }
        .state-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem; }
        .actions.single { grid-template-columns: 1fr; }
        .actions.triple { grid-template-columns: 1fr 1fr 1fr; }
        .btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.2rem; padding: 0.7rem 1rem; border-radius: 8px; font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; cursor: pointer; transition: all 0.15s; border: 1px solid transparent; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-primary   { background: var(--accent);  color: #fff; border-color: var(--accent); }
        .btn-primary:hover:not(:disabled)   { background: #6d28d9; transform: translateY(-1px); }
        .btn-secondary { background: transparent; color: var(--accent2); border-color: var(--accent2); }
        .btn-secondary:hover:not(:disabled) { background: rgba(6,182,212,0.1); transform: translateY(-1px); }
        .btn-danger    { background: transparent; color: var(--danger); border-color: var(--danger); }
        .btn-danger:hover:not(:disabled)    { background: rgba(239,68,68,0.1); transform: translateY(-1px); }
        .btn-success   { background: var(--success); color: #fff; border-color: var(--success); }
        .btn-success:hover:not(:disabled)   { background: #16a34a; transform: translateY(-1px); }
        .btn-warn      { background: transparent; color: var(--warn); border-color: var(--warn); }
        .btn-warn:hover:not(:disabled)      { background: rgba(249,115,22,0.1); transform: translateY(-1px); }
        .btn-shipped   { background: rgba(6,182,212,0.12); color: var(--accent2); border-color: var(--accent2); }
        .btn-shipped:hover:not(:disabled)   { background: rgba(6,182,212,0.2); transform: translateY(-1px); }
        .btn-shipped.done { opacity: 0.6; cursor: default; }
        /* Claim locked until timer expires */
        .btn-claim-locked {
          opacity: 0.35; cursor: not-allowed;
          background: transparent; color: var(--accent2); border-color: var(--accent2);
        }
        .btn-icon { background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.75rem; color: var(--muted); cursor: pointer; transition: all 0.15s; font-size: 1rem; line-height: 1; }
        .btn-icon:hover:not(:disabled) { border-color: var(--accent); color: #a78bfa; }
        .btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-sub { font-size: 0.58rem; opacity: 0.75; font-weight: 400; }
        .btn-label { display: flex; align-items: center; gap: 0.35rem; }
        .spinner { width: 11px; height: 11px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status-bar { background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.3); border-radius: 8px; padding: 0.7rem 1rem; font-family: var(--font-mono); font-size: 0.75rem; color: #a78bfa; margin-bottom: 1rem; text-align: center; }
        .input { width: 100%; background: var(--input-bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.65rem 0.85rem; color: var(--text); font-family: var(--font-mono); font-size: 0.8rem; outline: none; transition: border 0.15s; margin-bottom: 0.6rem; }
        .input:focus { border-color: var(--accent); }
        .input::placeholder { color: var(--muted); }
        .no-role { text-align: center; padding: 1rem; color: var(--muted); font-size: 0.78rem; font-family: var(--font-mono); }
        .timeout-bar { margin-top: 0.75rem; padding: 0.6rem 0.75rem; border-radius: 8px; background: rgba(249,115,22,0.08); border: 1px solid rgba(249,115,22,0.2); font-family: var(--font-mono); font-size: 0.72rem; color: var(--warn); display: flex; justify-content: space-between; }
        .share-row { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.75rem; }
        .share-input { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.75rem; color: var(--muted); font-family: var(--font-mono); font-size: 0.7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .load-contract { display: flex; gap: 0.5rem; margin-bottom: 0.6rem; }
        .load-contract .input { margin-bottom: 0; flex: 1; }
        .evidence-notice { background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 8px; padding: 0.6rem 0.75rem; font-family: var(--font-mono); font-size: 0.72rem; color: #a78bfa; margin-bottom: 0.75rem; }
        .etherscan-link { font-family: var(--font-mono); font-size: 0.7rem; color: var(--muted); text-decoration: none; transition: color 0.15s; }
        .etherscan-link:hover { color: var(--accent2); }
        .back-btn { background: transparent; border: none; color: var(--muted); font-family: var(--font-mono); font-size: 0.72rem; cursor: pointer; padding: 0; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.3rem; transition: color 0.15s; }
        .back-btn:hover { color: var(--text); }
        .deploy-note { font-size: 0.72rem; font-family: var(--font-mono); color: var(--muted); margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(6,182,212,0.06); border: 1px solid rgba(6,182,212,0.15); border-radius: 8px; }

        /* ── Landing: Orb background ── */
        .landing-orbs { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
        .orb { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.16; animation: orbFloat 12s ease-in-out infinite; }
        .orb-1 { width: 520px; height: 520px; background: radial-gradient(circle, #7c3aed, transparent 70%); top: -120px; left: -100px; animation-delay: 0s; }
        .orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, #06b6d4, transparent 70%); bottom: -80px; right: -80px; animation-delay: -4s; }
        .orb-3 { width: 280px; height: 280px; background: radial-gradient(circle, #a78bfa, transparent 70%); top: 45%; left: 52%; animation-delay: -8s; }
        @keyframes orbFloat { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-28px) scale(1.04)} }

        /* ── Hero ── */
        .connect-prompt { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 2rem; }
        .connect-logo { width: 200px; height: 200px; object-fit: contain; margin-bottom: 1.75rem; filter: drop-shadow(0 0 48px rgba(167,139,250,0.45)); animation: logoIn 0.85s cubic-bezier(0.34,1.56,0.64,1) both; }
        @keyframes logoIn { from{opacity:0;transform:scale(0.72) translateY(22px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .connect-eyebrow { font-family: var(--font-mono); font-size: 0.6rem; letter-spacing: 0.2em; color: var(--accent2); text-transform: uppercase; display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.75rem; animation: fadeUpL 0.6s 0.05s ease both; }
        .eyebrow-line { width: 24px; height: 1px; background: var(--accent2); opacity: 0.45; }
        .connect-title { font-size: clamp(2.8rem, 7vw, 5rem); font-weight: 800; letter-spacing: -0.04em; line-height: 0.95; margin-bottom: 1rem; background: linear-gradient(135deg, #e0d4ff 0%, #a78bfa 35%, #06b6d4 65%, #c4b5fd 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: logoIn 0.7s 0.15s ease both, shimmerGrad 6s 1s linear infinite; }
        @keyframes shimmerGrad { 0%{background-position:0%} 100%{background-position:200%} }
        .connect-sub { font-family: var(--font-mono); font-size: 0.84rem; color: var(--muted); max-width: 420px; line-height: 1.85; margin-bottom: 0.6rem; animation: fadeUpL 0.6s 0.3s ease both; }
        .connect-sub strong { color: var(--accent); font-weight: 500; }
        .connect-cta { margin-bottom: 3.5rem; animation: fadeUpL 0.6s 0.45s ease both; }
        .connect-wallet-btn { font-family: var(--font-mono); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.07em; color: #09090f; background: linear-gradient(135deg, #a78bfa, #06b6d4); border: none; border-radius: 12px; padding: 0.9rem 2.2rem; cursor: pointer; position: relative; overflow: hidden; transition: transform 0.2s, box-shadow 0.2s; }
        .connect-wallet-btn::after { content:''; position:absolute; inset:0; background:linear-gradient(135deg,rgba(255,255,255,0.18),transparent); opacity:0; transition:opacity 0.2s; }
        .connect-wallet-btn:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(124,58,237,0.45); }
        .connect-wallet-btn:hover::after { opacity:1; }
        @keyframes fadeUpL { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }

        /* ── Scroll separator ── */
        .scroll-sep { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 2rem 0 0.5rem; width: 100%; font-family: var(--font-mono); font-size: 0.54rem; letter-spacing: 0.2em; color: var(--muted); text-transform: uppercase; opacity: 0.5; }
        .scroll-sep .scroll-arrow { animation: bounceD 1.6s ease-in-out infinite; font-size: 0.78rem; }
        @keyframes bounceD { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }

        /* ── Section divider ── */
        .landing-divider { border: none; border-top: 1px solid var(--border); width: 75vw; max-width: 1100px; margin: 0 auto; }

        /* ── Section shell ── */
        .landing-section { width: 75vw; max-width: 1100px; padding: 4rem 0 0; text-align: left; }
        .landing-section-label { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.22em; color: var(--accent2); text-transform: uppercase; margin-bottom: 1.4rem; display: flex; align-items: center; gap: 0.6rem; }
        .landing-section-label::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,rgba(6,182,212,0.28),transparent); }

        /* ── About bento ── */
        .about-bento { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border-radius: 18px; overflow: hidden; border: 1px solid var(--border); }
        .about-cell { background: var(--surface); padding: 1.75rem; transition: background 0.22s; }
        .about-cell:hover { background: rgba(124,58,237,0.055); }
        .about-cell.wide { grid-column: 1/-1; }
        .about-icon { font-size: 1.8rem; margin-bottom: 0.9rem; display: block; }
        .about-cell-title { font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 0.6rem; }
        .about-cell-body { font-family: var(--font-mono); font-size: 0.88rem; color: var(--muted); line-height: 1.85; }
        .about-cell-body strong { color: var(--accent); font-weight: 500; }

        /* ── Why glass cards ── */
        .why-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.7rem; }
        .why-card { background: rgba(255,255,255,0.03); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid var(--border); border-radius: 15px; padding: 1.4rem 1.2rem; position: relative; overflow: hidden; opacity: 0; transform: translateY(24px); transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s, opacity 0.5s ease; }
        .why-card::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(167,139,250,0.55),transparent); opacity:0; transition:opacity 0.3s; }
        .why-card.visible { opacity:1; transform:translateY(0); }
        .why-card:nth-child(2).visible { transition-delay:0.07s; }
        .why-card:nth-child(3).visible { transition-delay:0.14s; }
        .why-card:nth-child(4).visible { transition-delay:0.21s; }
        .why-card:nth-child(5).visible { transition-delay:0.28s; }
        .why-card:nth-child(6).visible { transition-delay:0.35s; }
        .why-card:hover { transform:translateY(-5px); box-shadow:0 14px 44px rgba(124,58,237,0.14); border-color:rgba(167,139,250,0.4); }
        .why-card:hover::before { opacity:1; }
        .why-card-icon  { font-size:1.8rem; display:block; margin-bottom:0.85rem; }
        .why-card-title { font-size:1rem; font-weight:700; color:var(--text); margin-bottom:0.4rem; }
        .why-card-desc  { font-family:var(--font-mono); font-size:0.82rem; color:var(--muted); line-height:1.7; }

        /* ── Timeline ── */
        .tl-track { display:grid; grid-template-columns:repeat(6,1fr); gap:0; position:relative; }
        .tl-track::before { content:''; position:absolute; top:27px; left:calc(100%/12); right:calc(100%/12); height:1px; background:linear-gradient(90deg,transparent,rgba(167,139,250,0.38) 15%,rgba(6,182,212,0.38) 85%,transparent); z-index:0; }
        .tl-step { display:flex; flex-direction:column; align-items:center; text-align:center; padding:0 0.4rem; position:relative; z-index:1; cursor:default; }
        .tl-num { width:54px; height:54px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-size:1rem; font-weight:700; color:var(--accent); background:rgba(124,58,237,0.1); border:1.5px solid rgba(167,139,250,0.22); margin-bottom:0.9rem; transition:background 0.22s,border-color 0.22s,box-shadow 0.22s,transform 0.22s,color 0.22s; }
        .tl-step:hover .tl-num { background:rgba(124,58,237,0.28); border-color:var(--accent); box-shadow:0 0 22px rgba(167,139,250,0.38); transform:scale(1.12); color:#fff; }
        .tl-label { font-size:0.88rem; font-weight:700; color:var(--text); margin-bottom:0.3rem; font-family:var(--font-mono); }
        .tl-desc  { font-size:0.76rem; color:var(--muted); line-height:1.55; font-family:var(--font-mono); }
        .tl-step:hover .tl-desc { color:var(--text); }

        /* ── Tech box ── */
        .tech-box { background:rgba(255,255,255,0.03); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border:1px solid var(--border); border-radius:16px; padding:1.75rem; display:grid; grid-template-columns:1fr 1fr; gap:1.75rem; }
        .tech-group-label { font-family:var(--font-mono); font-size:0.7rem; letter-spacing:0.18em; color:var(--accent2); text-transform:uppercase; margin-bottom:0.8rem; }
        .tech-chips { display:flex; flex-wrap:wrap; gap:0.45rem; }
        .tech-chip { font-family:var(--font-mono); font-size:0.8rem; letter-spacing:0.04em; color:var(--accent); background:rgba(124,58,237,0.1); border:1px solid rgba(124,58,237,0.2); border-radius:7px; padding:0.32rem 0.85rem; white-space:nowrap; cursor:default; transition:background 0.15s,border-color 0.15s,transform 0.15s,box-shadow 0.15s; }
        .tech-chip:hover { background:rgba(124,58,237,0.22); border-color:rgba(167,139,250,0.55); transform:scale(1.06); box-shadow:0 0 12px rgba(167,139,250,0.22); }

        /* ── Footer CTA ── */
        .landing-footer-cta { text-align:center; padding:5rem 0 4rem; position:relative; width:100%; }
        .footer-glow { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:500px; height:280px; background:radial-gradient(ellipse,rgba(124,58,237,0.12),transparent 70%); pointer-events:none; }
        .footer-cta-title { font-size:clamp(2rem,4vw,3rem); font-weight:800; letter-spacing:-0.03em; margin-bottom:0.8rem; line-height:1.1; position:relative; }
        .footer-cta-sub { font-family:var(--font-mono); font-size:0.9rem; color:var(--muted); margin-bottom:2.2rem; position:relative; }
        .landing-footer-bottom { font-family:var(--font-mono); font-size:0.7rem; color:var(--muted); letter-spacing:0.06em; padding:1.5rem 0 2rem; border-top:1px solid var(--border); width:100%; text-align:center; }

        /* ── Responsive ── */
        @media (max-width:720px) {
          .about-bento { grid-template-columns:1fr; } .about-cell.wide { grid-column:1; }
          .why-grid { grid-template-columns:1fr 1fr; }
          .tl-track { grid-template-columns:repeat(3,1fr); row-gap:1.5rem; } .tl-track::before { display:none; }
          .tech-box { grid-template-columns:1fr; gap:1.4rem; }
        }
        @media (max-width:480px) {
          .why-grid { grid-template-columns:1fr; }
          .tl-track { grid-template-columns:repeat(2,1fr); }
          .connect-title { font-size:2.2rem; }
        }
        .chat-messages { max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; padding-right: 0.25rem; }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .chat-msg { padding: 0.5rem 0.75rem; border-radius: 8px; max-width: 80%; }
        .chat-msg.mine  { align-self: flex-end; background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.25); }
        .chat-msg.other { align-self: flex-start; background: var(--border); border: 1px solid var(--border); }
        .chat-msg.system {
          align-self: center; max-width: 95%; width: 100%;
          background: rgba(6,182,212,0.06); border: 1px solid rgba(6,182,212,0.2);
          text-align: center; border-radius: 8px;
        }
        .chat-meta { font-size: 0.6rem; font-family: var(--font-mono); color: var(--muted); margin-bottom: 0.2rem; }
        .chat-text { font-size: 0.8rem; color: var(--text); word-break: break-word; }
        .chat-text.system-text { color: var(--accent2); font-size: 0.75rem; font-family: var(--font-mono); }
        .chat-img { max-width: 220px; max-height: 200px; border-radius: 6px; margin-top: 0.25rem; cursor: pointer; }
        .chat-input-row { display: flex; gap: 0.5rem; align-items: center; }
        .chat-input-row .input { margin-bottom: 0; flex: 1; }
        @media (max-width: 600px) {
          .app { padding: 1rem 1rem 4rem; padding-top: calc(var(--navbar-h) + 1rem); }
          .connect-title { font-size: 2rem; }
          .actions.triple, .actions { grid-template-columns: 1fr; }
          .share-row, .load-contract { flex-wrap: wrap; }
          .navbar { padding: 0 1rem; }
          .nav-btn { padding: 0.4rem 0.5rem; font-size: 0.62rem; }
          .logo { font-size: 1.05rem; margin-right: 0.4rem; }
        }
      `}</style>

      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="nav-left">
          {isConnected ? (
            <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginRight:'0.75rem'}}>
              <img src="/logo.png" alt="EscrowMAD" style={{width:'28px', height:'28px', objectFit:'contain', borderRadius:'6px'}} />
              <div className="logo">EscrowMAD</div>
            </div>
          ) : (
            <div className="logo">EscrowMAD</div>
          )}
          {isConnected && (
            <>
              <button
                className="nav-btn"
                onClick={() => router.push('/my-contracts')}
              >
                My Contracts {myContracts.length > 0 && `(${myContracts.length})`}
              </button>

              {/*
                ── Deploy / Join: hidden while a contract is active ──
                   Only shown when: no contract loaded, OR contract is done
              */}
              {showDeployJoinNav && (
                <>
                  <button
                    className={`nav-btn ${navPanel === 'deploy' ? 'active' : ''}`}
                    onClick={() => setNavPanel(v => v === 'deploy' ? null : 'deploy')}
                  >
                    + New Contract
                  </button>
                  <button
                    className={`nav-btn ${navPanel === 'join' ? 'active' : ''}`}
                    onClick={() => setNavPanel(v => v === 'join' ? null : 'join')}
                  >
                    Join Contract
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'0.25rem'}}>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          {isConnected && <ConnectButton chainStatus="icon" showBalance={false} />}
        </div>
      </nav>

      {/* ── Nav Panels ── */}
      {/* My Contracts panel đã chuyển sang full-page view bên dưới */}

      {navPanel === 'deploy' && (
        <div className="nav-panel">
          <div className="panel-form">
            <div className="panel-title">Deploy New Contract</div>
            <input className="input" placeholder="Item description (e.g. iPhone 15 Pro 256GB)" value={deployDesc} onChange={e => setDeployDesc(e.target.value)} />
            <input className="input" placeholder="Item price in ETH (e.g. 0.005)" value={deployPrice} onChange={e => setDeployPrice(e.target.value)} />

            {deployPrice && !isNaN(parseFloat(deployPrice)) && parseFloat(deployPrice) > 0 && (
              <div className="deploy-note">
                You send <strong>{(parseFloat(deployPrice) / 5).toFixed(6)} ETH</strong> deposit (20%).
                Buyer sends <strong>{(parseFloat(deployPrice) * 1.2).toFixed(6)} ETH</strong>.
              </div>
            )}
            <div className="actions single">
              <button className="btn btn-primary" onClick={handleDeploy} disabled={isLoading || !deployDesc || !deployPrice}>
                {isLoading && <span className="spinner" />}Deploy & Send Deposit
              </button>
            </div>
            {txStatus && <div className="status-bar" style={{marginTop:'0.75rem'}}>{txStatus}</div>}
          </div>
        </div>
      )}

      {navPanel === 'join' && (
        <div className="nav-panel">
          <div className="panel-form">
            <div className="panel-title">Join Existing Contract</div>
            <div className="load-contract">
              <input className="input" placeholder="Paste contract address 0x... or share link" value={inputAddr} onChange={e => setInputAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLoadContract()} />
              <button className="btn btn-primary" onClick={handleLoadContract}>Load</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <div className="app">
        {!isConnected ? (
          <div className="connect-prompt">
            {/* Animated background orbs */}
            <div className="landing-orbs">
              <div className="orb orb-1" />
              <div className="orb orb-2" />
              <div className="orb orb-3" />
            </div>

            {/* Hero */}
            <div className="connect-eyebrow">
              <span className="eyebrow-line" />
              Trustless · On-chain · Permissionless
              <span className="eyebrow-line" />
            </div>
            <img src="/logo.png" alt="EscrowMAD" className="connect-logo" />
            <div className="connect-title">EscrowMAD</div>
            <p className="connect-sub">
              Peer-to-peer escrow on Ethereum.<br />
              <strong>No middleman. No arbiter. No trust needed.</strong><br />
              Just code, deposits, and cryptographic finality.
            </p>
            <div className="connect-cta">
              <ConnectButton label="Connect Wallet to Start" />
            </div>

            {/* Sections */}
            <LandingCards />
          </div>

        ) : !contractAddress ? (
          <div style={{textAlign:'center', marginTop:'3rem', color:'var(--muted)', fontFamily:'var(--font-mono)', fontSize:'0.85rem', lineHeight:'1.8'}}>
            Select a contract from <strong style={{color:'var(--text)'}}>My Contracts</strong>,<br/>
            deploy a new one with <strong style={{color:'var(--text)'}}>+ New Contract</strong>,<br/>
            or load one with <strong style={{color:'var(--text)'}}>Join Contract</strong>.
          </div>

        ) : (
          <>
            <button className="back-btn" onClick={() => { setContractAddr(''); setCurrentView('home'); router.push('/'); }}>← Back</button>

            {stateNum !== null && (
              <div className="state-badge" style={{ color: STATE_COLORS[stateNum] }}>
                <span className="state-dot" />{STATE_LABELS[stateNum]}
              </div>
            )}

            {txStatus && <div className="status-bar">{txStatus}</div>}

            {/* Contract Info */}
            <div className="card">
              <div className="card-title">Contract Info</div>
              <div className="info-row">
                <span className="info-label">Address</span>
                <a className="etherscan-link mono" href={`https://sepolia.etherscan.io/address/${contractAddress}`} target="_blank" rel="noreferrer">{short(contractAddress)} ↗</a>
              </div>
              {itemDescription && <div className="info-row"><span className="info-label">Item</span><span className="info-value">{itemDescription}</span></div>}
              <div className="info-row"><span className="info-label">Item Price</span><span className="info-value">{fmt(itemPrice)}</span></div>
              <div className="info-row"><span className="info-label">Deposit (20%)</span><span className="info-value">{fmt(deposit)}</span></div>
              <div className="info-row"><span className="info-label">Pool Balance</span><span className="info-value">{fmt(balance)}</span></div>

              {isSeller && stateNum === STATE.AWAITING_BUYER && (
                <>
                  <div className="share-row">
                    <input className="share-input" readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}?contract=${contractAddress}`} />
                    <button className="btn btn-secondary" onClick={handleCopyLink}>{copied ? '✓ Copied!' : '📋 Copy Link for Buyer'}</button>
                  </div>

                </>
              )}
              {stateNum === STATE.AWAITING_BUYER && createdAt && (
                <div className="timeout-bar"><span>Cancel available in</span><span>{countdown(BigInt(createdAt) + BigInt(86400))}</span></div>
              )}
              {stateNum === STATE.ACTIVE && activeAt && !shipped && (
                <div className="timeout-bar" style={{background: autoCancelReady ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.08)', borderColor: autoCancelReady ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.2)', color: autoCancelReady ? 'var(--danger)' : 'var(--warn)'}}>
                  <span>⚠️ Auto-cancel if seller inactive</span>
                  <span>{autoCancelReady ? 'Available now!' : autoCancelCountdown}</span>
                </div>
              )}
              {stateNum === STATE.RETURN_REQUESTED && requestedAt && (
                <div className="timeout-bar"><span>Auto-approve return in</span><span>{countdown(BigInt(requestedAt) + BigInt(72 * 3600))}</span></div>
              )}
            </div>

            {/* Participants */}
            <div className="card">
              <div className="card-title">Participants</div>
              <div className="info-row">
                <span className="info-label">Seller</span>
                <span className="mono">{short(seller)}{isSeller && <span className="you-badge">YOU</span>}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Buyer</span>
                <span className="mono">{isZero(buyer) ? 'Waiting...' : short(buyer)}{isBuyer && <span className="you-badge">YOU</span>}</span>
              </div>
              {(stateNum === STATE.CANCEL_REQUESTED || stateNum === STATE.RETURN_REQUESTED) && requestInitiator && (
                <div className="info-row">
                  <span className="info-label">Request by</span>
                  <span className="mono">{short(requestInitiator)}{isInitiator && <span className="you-badge">YOU</span>}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="card">
              <div className="card-title">Actions</div>

              {/* ── AWAITING BUYER: buyer joins ── */}
              {stateNum === STATE.AWAITING_BUYER && !isSeller && (
                <>
                  <input className="input" placeholder="Your delivery address" value={addressHash} onChange={e => setAddressHash(e.target.value)} />
                  <div className="actions single">
                    <button className="btn btn-primary" onClick={handleJoin} disabled={isLoading}>
                      <span className="btn-label">{isLoading && <span className="spinner" />}Join as Buyer — {fmt(itemPrice && deposit ? itemPrice + deposit : 0n)}</span>
                    </button>
                  </div>
                </>
              )}

              {/* ── AWAITING BUYER: seller cancel after 24h ── */}
              {stateNum === STATE.AWAITING_BUYER && isSeller && (() => {
                const cancelAvailableTs = createdAt ? Number(createdAt) + 86400 : null;
                const cancelReady = cancelAvailableTs ? isCountdownExpired(cancelAvailableTs) : false;
                const cancelCd = cancelAvailableTs ? countdown(BigInt(cancelAvailableTs)) : null;
                return (
                  <div className="actions single">
                    {!cancelReady && cancelCd && (
                      <div className="timeout-bar" style={{marginBottom:'0.5rem'}}>
                        <span>🔒 Cancel available in</span>
                        <span>{cancelCd}</span>
                      </div>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={() => tx('cancelAfter24h', [], null, '🚫 Seller cancelled the escrow before a buyer joined. Deposit has been refunded.')}
                      disabled={isLoading || !cancelReady}
                      title={cancelReady ? 'Cancel and refund deposit' : `Available in ${cancelCd}`}
                    >
                      <span className="btn-label">{isLoading && <span className="spinner" />}Cancel & Refund</span>
                      {!cancelReady && cancelCd && <span className="btn-sub">Locked — {cancelCd} remaining</span>}
                    </button>
                  </div>
                );
              })()}

              {/* ── ACTIVE: Auto-cancel sau 72h seller không hành động ── */}
              {stateNum === STATE.ACTIVE && !shipped && (isBuyer || isSeller) && autoCancelReady && (
                <div className="actions single" style={{marginBottom:'0.5rem'}}>
                  <button className="btn btn-danger" onClick={() => tx('requestCancel', [], null, '🚫 Contract tự hủy: seller không có hành động sau 72h. Cả hai nhận lại tiền.')} disabled={isLoading}>
                    <span className="btn-label">{isLoading && <span className="spinner" />}🚫 Auto-Cancel (seller inactive 72h)</span>
                  </button>
                </div>
              )}
              {stateNum === STATE.ACTIVE && !shipped && (isBuyer || isSeller) && !autoCancelReady && autoCancelCountdown && (
                <div className="no-role" style={{fontSize:'0.7rem', padding:'0.5rem', background:'rgba(249,115,22,0.06)', borderRadius:'8px', border:'1px solid rgba(249,115,22,0.15)', color:'var(--warn)', marginBottom:'0.5rem'}}>
                  ⏳ Auto-cancel available in <strong>{autoCancelCountdown}</strong> if seller hasn't shipped
                </div>
              )}

              {/*
                ── ACTIVE: BUYER ──
                Before shipped → Cancel only (Confirm + Return hidden)
                After shipped  → Confirm + Return (Cancel hidden)
              */}
              {stateNum === STATE.ACTIVE && isBuyer && (
                <>
                  {/* Before shipped: only Cancel */}
                  {!shipped && (
                    <div className="actions single">
                      <button className="btn btn-danger" onClick={() => tx('requestCancel', [], null, '✕ Buyer has requested to cancel this transaction. Seller please respond.')} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}✕ Cancel</span>
                      </button>
                    </div>
                  )}
                  {/* Confirm + Return — available immediately after shipped */}
                  <div className="actions" style={{gridTemplateColumns: '1fr 1fr'}}>
                    <button
                      className={`btn ${shipped ? 'btn-success' : 'btn-claim-locked'}`}
                      onClick={shipped ? () => tx('confirmDelivery', [], null, '✅ Buyer has confirmed delivery. The escrow is now complete and funds have been released to the seller.') : undefined}
                      disabled={isLoading || !shipped}
                      title={shipped ? 'Confirm delivery' : 'Waiting for seller to ship'}
                    >
                      <span className="btn-label">{isLoading && shipped && <span className="spinner" />}✓ Confirm</span>
                      {!shipped && <span className="btn-sub">Awaiting shipment</span>}
                    </button>
                    <button
                      className={`btn ${shipped ? 'btn-warn' : 'btn-claim-locked'}`}
                      onClick={shipped ? () => tx('requestReturn', ['evidence'], null, '↩ Buyer has requested a return. Seller please respond.') : undefined}
                      disabled={isLoading || !shipped}
                      title={shipped ? 'Request return' : 'Waiting for seller to ship'}
                    >
                      <span className="btn-label">{isLoading && shipped && <span className="spinner" />}↩ Return</span>
                      {!shipped && <span className="btn-sub">Awaiting shipment</span>}
                    </button>
                  </div>
                </>
              )}

              {/*
                ── ACTIVE: SELLER ──
                Before shipped → [Mark as Shipped] [Cancel]
                After shipped  → [Shipped ✓ done] [Claim — locked until timer]
                Cancel disappears after shipping.
                Claim is dimmed and unclickable until claimReady === true.
              */}
              {stateNum === STATE.ACTIVE && isSeller && (
                <div className="actions" style={{gridTemplateColumns: '1fr 1fr'}}>
                  {/* Shipped */}
                  <button
                    className={`btn btn-shipped ${shipped ? 'done' : ''}`}
                    onClick={shipped ? undefined : handleShipped}
                    disabled={shipped}
                  >
                    <span className="btn-label">📦 {shipped ? 'Shipped ✓' : 'Mark as Shipped'}</span>
                    {shipped && shippedAt && (
                      <span className="btn-sub">{fmtDateTime({toDate: () => new Date(shippedAt * 1000)})}</span>
                    )}
                  </button>

                  {/* Before shipped: Cancel */}
                  {!shipped && (
                    <button className="btn btn-danger" onClick={() => tx('requestCancel', [], null, '✕ Seller has requested to cancel this transaction. Buyer please respond.')} disabled={isLoading}>
                      <span className="btn-label">{isLoading && <span className="spinner" />}✕ Cancel</span>
                    </button>
                  )}

                  {/* After shipped: Claim (locked until timer expires) */}
                  {shipped && (
                    <button
                      className={`btn ${claimReady ? 'btn-secondary' : 'btn-claim-locked'}`}
                      onClick={claimReady ? () => tx('claimAfterBuyerTimeout', [], null, '⏰ Seller has claimed funds after buyer timeout.') : undefined}
                      disabled={isLoading || !claimReady}
                      title={claimReady ? 'Claim funds now' : `Locked — available in ${claimCountdown}`}
                    >
                      <span className="btn-label">{isLoading && claimReady && <span className="spinner" />}⏰ Claim</span>
                      {!claimReady && claimCountdown
                        ? <span className="btn-sub">{claimCountdown} remaining</span>
                        : <span className="btn-sub">Available now</span>
                      }
                    </button>
                  )}
                </div>
              )}

              {/* ── CANCEL REQUESTED ── */}
              {stateNum === STATE.CANCEL_REQUESTED && (
                <>
                  <div className="evidence-notice">
                    ✕ Cancel requested by {isInitiator ? 'you' : short(requestInitiator)}.
                    {isInitiator ? ' Waiting for the other party to approve.' : ' Do you agree to cancel?'}
                  </div>
                  <div className="actions">
                    {!isInitiator && (
                      <button className="btn btn-danger" onClick={() => tx('approveCancel', [], null, '✅ Cancel request approved. The escrow has been cancelled and funds returned.')} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}✓ Approve Cancel</span>
                      </button>
                    )}
                    {isInitiator && (
                      <button className="btn btn-secondary" onClick={() => tx('withdrawCancelRequest', [], null, '↩ Cancel request has been withdrawn. The escrow is back to active.')} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}↩ Withdraw Request</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* ── RETURN REQUESTED ── */}
              {stateNum === STATE.RETURN_REQUESTED && (
                <>
                  <div className="evidence-notice">
                    ↩ Return requested by {isInitiator ? 'you' : short(requestInitiator)}.
                    {isInitiator ? ' Waiting for the other party.' : ' Do you agree to accept the return?'}
                  </div>
                  <div className="actions single" style={{display:'flex', justifyContent:'center'}}>
                    {!isInitiator && (
                      <button className="btn btn-warn" style={{width:'100%'}} onClick={() => tx('approveReturn', [], null, '✅ Return approved. Funds have been returned to the buyer.')} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}✓ Approve Return</span>
                      </button>
                    )}
                    {isInitiator && (
                      <button className="btn btn-secondary" style={{width:'100%'}} onClick={() => tx('withdrawReturnRequest', [], null, '↩ Buyer has withdrawn the return request. The escrow is back to active.')} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}↩ Withdraw Request</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* ── DONE ── */}
              {stateNum === STATE.COMPLETED && (
                <div className="no-role">
                  ✅ Escrow completed successfully.
                  {isSeller && <div style={{marginTop:'0.5rem',color:'var(--success)',fontWeight:700}}>💰 Transaction complete — funds have been released to your wallet.</div>}
                  {isBuyer  && <div style={{marginTop:'0.5rem',color:'var(--accent2)',fontWeight:700}}>📦 Delivery confirmed. Thank you for using EscrowMAD!</div>}
                </div>
              )}
              {stateNum === STATE.CANCELLED && (
                <div className="no-role">
                  🚫 Escrow was cancelled.
                  {isSeller && <div style={{marginTop:'0.5rem',color:'var(--muted)',fontWeight:700}}>Your deposit has been returned to your wallet.</div>}
                  {isBuyer  && <div style={{marginTop:'0.5rem',color:'var(--muted)',fontWeight:700}}>Your payment has been refunded to your wallet.</div>}
                </div>
              )}
              {stateNum === STATE.SELLER_CLAIMED && (
                <div className="no-role">
                  ⏰ Buyer timeout.
                  {isSeller && <div style={{marginTop:'0.5rem',color:'var(--success)',fontWeight:700}}>💰 Buyer was unresponsive — funds have been released to your wallet.</div>}
                  {isBuyer  && <div style={{marginTop:'0.5rem',color:'var(--danger)',fontWeight:700}}>⚠️ You failed to respond in time. Funds have been claimed by the seller.</div>}
                </div>
              )}
            </div>

            {/* Chat */}
            {(isBuyer || isSeller || stateNum === STATE.AWAITING_BUYER) && stateNum !== null && (
              <div className="card">
                <div className="card-title">Chat</div>
                <div className="chat-messages">
                  {chatMessages.length === 0 && <div className="no-role" style={{padding:'0.5rem'}}>No messages yet.</div>}
                  {chatMessages.map((m) => {
                    const isSystem = m.sender === 'system' || m.type === 'system';
                    const mine = !isSystem && address && m.sender?.toLowerCase() === address.toLowerCase();
                    return (
                      <div key={m.id} className={`chat-msg ${isSystem ? 'system' : mine ? 'mine' : 'other'}`}>
                        {!isSystem && (
                          <div className="chat-meta">
                            {mine ? 'You' : short(m.sender)} · {fmtDateTime(m.timestamp)}
                          </div>
                        )}
                        {isSystem && (
                          <div className="chat-meta" style={{textAlign:'center'}}>
                            🔔 System · {fmtDateTime(m.timestamp)}
                          </div>
                        )}
                        {m.type === 'image'
                          ? <img src={m.message} alt="shared" className="chat-img" onClick={() => window.open(m.message, '_blank')} />
                          : <div className={`chat-text ${isSystem ? 'system-text' : ''}`}>{m.message}</div>
                        }
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                <div className="chat-input-row">
                  <input className="input" placeholder="Type a message..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                  <input ref={chatImgRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleChatImage} />
                  <button className="btn-icon" onClick={() => chatImgRef.current?.click()} disabled={uploadingChat} title="Send image">
                    {uploadingChat ? <span className="spinner" style={{borderTopColor:'var(--muted)'}} /> : '🖼️'}
                  </button>
                  <button className="btn btn-primary" style={{flexDirection:'row', padding:'0.7rem 1.1rem'}} onClick={handleSendMessage} disabled={!chatInput.trim() || !address}>Send</button>
                </div>
              </div>
            )}

            <div style={{textAlign:'center', marginTop:'1rem'}}>
              <a className="etherscan-link" href={`https://sepolia.etherscan.io/address/${contractAddress}`} target="_blank" rel="noreferrer">View on Etherscan ↗</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}