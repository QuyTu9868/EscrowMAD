'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, usePublicClient,
} from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useReveal } from './hooks/useReveal';
import { db } from './firebase';
import { collection, addDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import ShipModal from './components/ShipModal';
import EvidenceModal from './components/EvidenceModal';
import ReviewPanel from './components/ReviewPanel';
import ReviewsModal from './components/ReviewsModal';
import PartyLink from './components/PartyLink';
import { sendEscrowEmail } from './emailService';
import {
  CheckIcon, CloseIcon, UndoIcon, PackageIcon, SunIcon, MoonIcon, LockIcon, MailIcon,
  ArrowLeftIcon, ExternalLinkIcon, ImageIcon, FolderIcon, ShieldIcon, ChainIcon, CartIcon,
  TagIcon, ChatIcon, CoinIcon, BellIcon, CelebrateIcon, ClockIcon, AlertIcon, CameraIcon, StarIcon,
} from './components/Icons';
import { ESCROW_ABI as ABI, FACTORY_ABI, STATE, STATE_LABELS, STATE_COLORS, DONE_STATES } from '../lib/escrowAbi';

const WHY_ICONS = { LockIcon, ShieldIcon, ClockIcon, ChatIcon, PackageIcon, MailIcon, CoinIcon, StarIcon, CameraIcon, AlertIcon };

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;


// Chi coi la co anh khi hash trong giong CID that. Ban cu tung luu chuoi
// 'evidence' cung, gay ra tranh chap ma agent tai anh khong duoc.
const isIpfsHash = (h) => typeof h === 'string' && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{50,})$/.test(h);

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
function saveContract(addr, description = '', deposit = '', sellerEmail = '', buyerEmail = '') {
  const list = loadSavedContracts();
  const existing = list.findIndex(c => c.addr === addr);
  const entry = { addr, description, deposit, sellerEmail, buyerEmail };
  if (existing >= 0) { list[existing] = { ...list[existing], ...entry }; }
  else { list.unshift(entry); }
  localStorage.setItem(MY_CONTRACTS_KEY, JSON.stringify(list.slice(0, 20)));
}
function shippedKey(addr) { return `escrowmad_shipped_${addr}`; }

function getEmailsForContract(addr) {
  try {
    const list = loadSavedContracts();
    const found = list.find(c => c.addr?.toLowerCase() === addr?.toLowerCase());
    return { sellerEmail: found?.sellerEmail || '', buyerEmail: found?.buyerEmail || '' };
  } catch { return { sellerEmail: '', buyerEmail: '' }; }
}

async function getEmailsFromFirestore(addr) {
  try {
    const snap = await getDocs(collection(db, 'contracts', addr.toLowerCase(), 'emails'));
    let sellerEmail = '', buyerEmail = '';
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.sellerEmail) sellerEmail = data.sellerEmail;
      if (data.buyerEmail) buyerEmail = data.buyerEmail;
    });
    return { sellerEmail, buyerEmail };
  } catch { return { sellerEmail: '', buyerEmail: '' }; }
}

async function uploadToPinata(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload-ipfs', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.hash;
}

const NAVBAR_H = 64;

// Tiêu đề hero tách từng chữ, mỗi chữ "nét dần" (mờ + hơi lệch xuống + blur)
// bay vào lần lượt — chỉ chạy 1 lần lúc trang tải, không phụ thuộc cuộn.
function SplitTitle({ text, className = '' }) {
  return (
    <div className={className} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span
          key={i}
          className="split-letter"
          style={{ animationDelay: `${140 + i * 45}ms` }}
          aria-hidden="true"
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </div>
  );
}

function Reveal({ as: Tag = 'div', className = '', delay = 0, interactive = false, children, ...rest }) {
  const ref = useRef(null);
  const raf = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add('reveal-visible');
          io.unobserve(el);
        }
      });
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  // interactive=true: thẻ nghiêng theo hướng con trỏ chuột (tilt 3D) + có
  // vệt sáng "sheen" di theo chuột. Chỉ set inline style khi hover, còn lại
  // để CSS class .reveal/.reveal-visible điều khiển trạng thái cuộn-hiện.
  const onMouseMove = !interactive ? undefined : (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rx = (0.5 - py) * 10;
    const ry = (px - 0.5) * 10;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    });
  };
  const onMouseLeave = !interactive ? undefined : () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
  };

  return (
    <Tag
      ref={ref}
      className={`reveal ${interactive ? 'reveal-tilt' : ''} ${className}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      {interactive && <span className="tilt-sheen" />}
      {children}
    </Tag>
  );
}

// Nút "hút" theo con trỏ chuột khi rê gần — giống nam châm. Bọc quanh nút
// CTA chính, không đụng tới các nút chức năng khác trong app.
function Magnetic({ children, strength = 0.4, className = '' }) {
  const ref = useRef(null);
  const raf = useRef(null);
  const onMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = e.clientX - (rect.left + rect.width / 2);
    const relY = e.clientY - (rect.top + rect.height / 2);
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `translate(${(relX * strength).toFixed(1)}px, ${(relY * strength).toFixed(1)}px)`;
    });
  };
  const onMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'translate(0,0)';
  };
  return (
    <span ref={ref} className={`magnetic ${className}`} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      {children}
    </span>
  );
}

const WHY_ITEMS = [
  { icon:'ShieldIcon',title:'AI Settles Deadlocks',        desc:'When neither side backs down, a vision model reads the listing, the dispatch photo and what actually arrived, then releases or refunds on-chain. No human arbiter, no waiting on support.' },
  { icon:'LockIcon',  title:'The Agent Is Kept On A Leash',desc:'It never holds a key. Every instruction clears a Latch policy gateway first, and the contract only accepts a winner, never an amount or an address.' },
  { icon:'CameraIcon',title:'Photographed At Every Step',  desc:'The seller photographs what they ship, the buyer photographs what arrives. Both land on IPFS, and both are what the agent reads.' },
  { icon:'CoinIcon',  title:'No Trusted Third Party',      desc:'Code is the only arbiter. No platform can freeze funds, take fees, or reverse decisions.' },
  { icon:'ShieldIcon',title:'Scam-Resistant by Design',    desc:'Both parties post a 20% deposit before activation. Scammers have real skin in the game.' },
  { icon:'ClockIcon', title:'Time-Locked Auto-Resolution', desc:'Disputes auto-resolve in 72 hours. Shipping claims close in 17 days. Zero deadlock.' },
  { icon:'ChatIcon',  title:'Built-in Evidence Chat',      desc:'Real-time chat with IPFS image uploads. Every claim backed by immutable, on-chain proof.' },
  { icon:'PackageIcon',title:'GHN Delivery Built-in',      desc:'Create a real GHN shipping order directly inside the app. Buyer gets a tracking link via email instantly.' },
  { icon:'MailIcon',  title:'Email Notifications',         desc:'Both parties get email alerts at every key event: payment received, item shipped, delivery confirmed, dispute raised.' },
  { icon:'StarIcon',  title:'Buyer & Seller Reviews',      desc:'Rate your counterpart after every completed deal. Reviews are signature-verified against on-chain deal state — no fake ratings.' },
  { icon:'CoinIcon',  title:'Zero Platform Fees',          desc:'No subscription, no listing fee, no commission. You pay only Ethereum gas.' },
];

const HOW_STEPS = [
  { num:'①', label:'Deploy',   desc:'Seller sets item & price, uploads photo to IPFS, pays 20% deposit' },
  { num:'②', label:'Share',    desc:'Copy contract link and send to buyer' },
  { num:'③', label:'Join',     desc:'Buyer inspects item, pays price + 20% deposit' },
  { num:'④', label:'Ship',     desc:'Seller creates GHN order in-app — buyer gets email + tracking link' },
  { num:'⑤', label:'Confirm',  desc:'Buyer confirms delivery — funds released instantly to seller' },
  { num:'⑥', label:'Return',   desc:'Buyer returns with a photo of what arrived — 72h auto-approve if the seller stays quiet' },
  { num:'⑦', label:'Dispute',  desc:'Still stuck? Either side escalates. The agent reads both photos and settles it on-chain' },
];


// Doi phien ban thi sua duy nhat o day.
const APP_VERSION = '1.1.0';

const AGENT_FLOW = [
  { icon:'AlertIcon',  title:'Either side escalates', desc:'Buyer or seller raises a dispute. Funds freeze where they are, and every other action on the escrow closes.' },
  { icon:'CameraIcon', title:'Three photos go up',    desc:'What the seller listed, what they photographed as they shipped it, and what the buyer says turned up. All were on IPFS before the dispute started.' },
  { icon:'ShieldIcon', title:'The agent reads them',  desc:'A vision model weighs all three against the item description and picks a side, in writing, with its reasoning recorded. Damage that appears only after dispatch points at the carrier, not the seller.' },
  { icon:'CoinIcon',   title:'Latch lets it through', desc:'The verdict travels through a policy gateway that can only ever forward one instruction to one endpoint. Then the contract pays the winner the whole pool, in a single transaction.' },
];

function LandingCards() {
  return (
      <div style={{width:'100%', maxWidth:'1100px', display:'flex', flexDirection:'column', alignItems:'center'}}>
      <div className="scroll-sep"><span>SCROLL</span><span className="scroll-arrow">↓</span></div>
      <div className="landing-section">
        <Reveal className="landing-section-label">About</Reveal>
        <div className="about-bento">
          <Reveal as="div" className="about-cell wide" interactive>
            <ChainIcon className="about-icon" size={28} />
            <div className="about-cell-title">What is EscrowMAD?</div>
            <div className="about-cell-body">
              EscrowMAD is a fully on-chain escrow protocol for peer-to-peer transactions on Ethereum Sepolia.
              Funds are locked inside a smart contract — <strong>no third party ever touches your money</strong>.
              The seller stakes a <strong>20% security deposit</strong> to ensure accountability.
              Every action — shipping, cancellation, dispute — is time-locked and verifiable on-chain forever.
              Built-in <strong>GHN delivery integration</strong> and <strong>email notifications</strong> complete the full transaction lifecycle.
            </div>
          </Reveal>
          <Reveal as="div" className="about-cell" delay={80} interactive>
            <CartIcon className="about-icon" size={28} />
            <div className="about-cell-title">For Buyers</div>
            <div className="about-cell-body">
              Inspect item details and verify the seller's deposit before paying a single wei.
              Your funds remain locked until you confirm delivery — or auto-resolve after a timeout.
              Built-in chat with IPFS image proofs keeps every dispute resolvable.
              Get <strong>email alerts</strong> the moment your item ships, with a <strong>GHN tracking link</strong> sent directly to your inbox.
            </div>
          </Reveal>
          <Reveal as="div" className="about-cell" delay={140} interactive>
            <TagIcon className="about-icon" size={28} />
            <div className="about-cell-title">For Sellers</div>
            <div className="about-cell-body">
              Deploy a contract in seconds — set price, upload an item photo to IPFS, share a link.
              Your 20% deposit is returned in full once the buyer confirms delivery,
              making honest behaviour the only rational strategy.
              Create a real <strong>GHN shipping order directly inside the app</strong> — no switching tabs.
              Receive <strong>email notifications</strong> at every key milestone: buyer joined, delivery confirmed, dispute raised.
            </div>
          </Reveal>
        </div>
      </div>
      <hr className="landing-divider" style={{marginTop:'4rem'}} />
      <div className="scroll-sep"><span>SCROLL</span><span className="scroll-arrow">↓</span></div>
      <div className="landing-section">
        <Reveal className="landing-section-label">Why EscrowMAD?</Reveal>
        <div className="why-grid">
          {WHY_ITEMS.map(({ icon, title, desc }, i) => {
            const Icon = WHY_ICONS[icon];
            return (
              <Reveal as="div" className="why-card" key={title} delay={(i % 4) * 60} interactive>
                <Icon className="why-card-icon" size={24} />
                <div className="why-card-title">{title}</div>
                <div className="why-card-desc">{desc}</div>
              </Reveal>
            );
          })}
        </div>
      </div>
      <hr className="landing-divider" style={{marginTop:'4rem'}} />
      <div className="scroll-sep"><span>SCROLL</span><span className="scroll-arrow">↓</span></div>
      <div className="landing-section">
        <Reveal className="landing-section-label">How to Use</Reveal>
        <div className="tl-track">
          {HOW_STEPS.map(({ num, label, desc }, i) => (
            <Reveal as="div" className="tl-step" key={label} delay={i * 70}>
              <div className="tl-num">{num}</div>
              <div className="tl-label">{label}</div>
              <div className="tl-desc">{desc}</div>
            </Reveal>
          ))}
        </div>
      </div>
      <hr className="landing-divider" style={{marginTop:'4rem'}} />
      <div className="landing-section">
        <Reveal className="landing-section-label">When Both Sides Dig In</Reveal>
        <Reveal as="p" className="agent-lead" delay={60}>
          Most escrows never get here. For the ones that do, a vision model looks at
          the photographs and settles it, so nobody waits on a support queue. It reaches
          the contract through Latch, a policy gateway that holds it to exactly one
          instruction and refuses everything else.
        </Reveal>

        <div className="agent-flow">
          {AGENT_FLOW.map(({ icon, title, desc }, i) => {
            const Icon = WHY_ICONS[icon];
            return (
              <Reveal as="div" className="agent-step" key={title} delay={i * 90}>
                <span className="agent-step-mark"><Icon size={15} /></span>
                <div className="agent-step-title">{title}</div>
                <div className="agent-step-desc">{desc}</div>
              </Reveal>
            );
          })}
        </div>

        <Reveal as="div" className="agent-guard" delay={140}>
          <div className="agent-guard-label"><LockIcon size={13} /> What the agent cannot do</div>
          <ul className="agent-guard-list">
            <li>Hold a private key. Signing happens server-side, never in the agent.</li>
            <li>Name an amount or a recipient. The contract takes a winner and nothing else.</li>
            <li>Reach any other endpoint, send more than twenty instructions an hour, or add a field to the request. Latch rejects all three before they land.</li>
            <li>Reopen a settled case. Once funds move, the state is final.</li>
          </ul>
        </Reveal>
      </div>

      <Reveal as="div" className="landing-footer-cta">
        <div className="footer-glow" />
        <h2 className="footer-cta-title">Ready to transact<br/>without trust?</h2>
        <p className="footer-cta-sub">Connect your wallet. Deploy your first escrow in under 60 seconds.</p>
        <div style={{marginTop:'1.5rem', display:'flex', justifyContent:'center', alignItems:'center'}}>
          <Magnetic strength={0.35}>
            <ConnectButton label="Connect Wallet" />
          </Magnetic>
        </div>
      </Reveal>
      <div className="landing-footer-bottom">
        © 2025 EscrowMAD &nbsp;·&nbsp; Built on Ethereum Sepolia &nbsp;·&nbsp; Trustless by design
      </div>
    </div>
  );
}

function HomeInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [contractAddr,    setContractAddr]    = useState('');
  const [inputAddr,       setInputAddr]       = useState('');
  const [navPanel,        setNavPanel]        = useState(null);
  const [myContracts,     setMyContracts]     = useState([]);
  const [deployDesc,      setDeployDesc]      = useState('');
  const [deployPrice,     setDeployPrice]     = useState('');
  const [deployImgHash,   setDeployImgHash]   = useState('');
  const [deployUploading, setDeployUploading] = useState(false);
  const [uploadingChat,   setUploadingChat]   = useState(false);
  const [txStatus,        setTxStatus]        = useState('');
  const [chatMessages,    setChatMessages]    = useState([]);
  const [chatInput,       setChatInput]       = useState('');
  const [addressHash,     setAddressHash]     = useState('');
  const [copied,          setCopied]          = useState(false);
  const [shipped,         setShipped]         = useState(false);
  const [shippedAt,       setShippedAt]       = useState(null);
  const [isDark,          setIsDark]          = useState(true);
  const [isDeploying,     setIsDeploying]     = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  // Dia chi dang xem danh gia. null = popup dong.
  const [reviewsFor, setReviewsFor] = useState(null);
  const [deployEmail,   setDeployEmail]   = useState('');
  const [buyerEmail,    setBuyerEmail]    = useState('');
  const [buyerProvince, setBuyerProvince] = useState('');
  const [buyerDistrict, setBuyerDistrict] = useState('');
  const [buyerWard,     setBuyerWard]     = useState('');
  const [buyerStreet,   setBuyerStreet]   = useState('');
  const [addrProvinces, setAddrProvinces] = useState([]);
  const [addrDistricts, setAddrDistricts] = useState([]);
  const [addrWards,     setAddrWards]     = useState([]);

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

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const pendingAction    = useRef(null);
  const pendingDeploy    = useRef({ desc: '', price: '', imgHash: '' });
  const chatEndRef       = useRef(null);
  const chatImgRef       = useRef(null);
  const deployImgRef = useRef(null);
  const contractAddress = contractAddr || null;

  // Nền hero phản ứng nhẹ theo chuột (mouse parallax) — chỉ áp dụng cho
  // khối .landing-orbs, các orb con vẫn tự trôi độc lập bằng CSS animation
  // riêng nên không xung đột transform.
  const orbsRef = useRef(null);
  useEffect(() => {
    let raf = null;
    let tx = 0, ty = 0;
    const onMove = (e) => {
      if (!orbsRef.current) return;
      const nx = (e.clientX / window.innerWidth - 0.5);
      const ny = (e.clientY / window.innerHeight - 0.5);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        tx += (nx * 26 - tx) * 0.08;
        ty += (ny * 26 - ty) * 0.08;
        if (orbsRef.current) orbsRef.current.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
        raf = null;
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // Spotlight: vùng sáng nhỏ đi theo chuột trong khu vực hero, giống cầm
  // đèn pin soi trên nền tối. Chỉ tính toạ độ, không re-render React.
  const heroRef = useRef(null);
  const spotlightRef = useRef(null);
  // Spotlight bam viewport nen dung thang toa do chuot, khong tru rect.
  // Truoc day no bam .connect-prompt - phan tu da bi .app thut vao 2rem -
  // nen hieu ung hien ra thanh mot o chu nhat thay vi phu het man hinh.
  const handleHeroMove = (e) => {
    const el = spotlightRef.current;
    if (!el) return;
    el.style.background = `radial-gradient(480px circle at ${e.clientX}px ${e.clientY}px, rgba(255,255,255,0.16), transparent 62%)`;
    el.style.opacity = '1';
  };
  const showSpotlight = () => { if (spotlightRef.current) spotlightRef.current.style.opacity = '1'; };
  const hideSpotlight = () => { if (spotlightRef.current) spotlightRef.current.style.opacity = '0'; };

  // Nghe tren window chu khong tren rieng .connect-prompt: neu gan vao phan tu
  // do thi dai padding 2rem hai ben va vung navbar thanh diem chet, chuot vao
  // day la hieu ung dung im.
  useEffect(() => {
    if (isConnected) return undefined;
    const move = (e) => handleHeroMove(e);
    const leave = () => hideSpotlight();
    window.addEventListener('mousemove', move);
    document.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('mousemove', move);
      document.removeEventListener('mouseleave', leave);
    };
  }, [isConnected]);


  useEffect(() => {
    const c = searchParams.get('contract');
    if (c && c.startsWith('0x')) { setContractAddr(c); saveContract(c); }
    setMyContracts(loadSavedContracts());
    const p = searchParams.get('panel');
    if (p === 'contract') setNavPanel(p);
  }, [searchParams]);

  useEffect(() => {
    if (!contractAddress) return;
    const key = shippedKey(contractAddress);
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      setShipped(true); setShippedAt(parsed.at);
    } else {
      setShipped(false); setShippedAt(null);
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
  const { data: itemImageHash,    refetch: rimg} = useReadContract({ ...ro, functionName: 'itemImageHash' });
  const { data: returnEvidenceHash             } = useReadContract({ ...ro, functionName: 'returnEvidenceHash' });

  const refetchAll = useCallback(() => {
    [rs,rb,rp,rd,rst,rba,rc,ra,rra,ri,rimg].forEach(r => r());
  }, []);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });


  const isSeller    = address && seller && address.toLowerCase() === seller.toLowerCase();
  const isBuyer     = address && buyer  && address.toLowerCase() === buyer.toLowerCase();
  const isInitiator = address && requestInitiator && address.toLowerCase() === requestInitiator.toLowerCase();
  const stateNum    = state !== undefined ? Number(state) : null;

  // Card chi render sau khi doc xong contract, nen phai chay lai observer
  // moi khi doi hop dong hoac doi trang thai.
  useReveal([contractAddress, stateNum]);
  const sendChatNotif = useCallback(async (message) => {
    if (!contractAddress) return;
    await addDoc(collection(db, 'chats', contractAddress.toLowerCase(), 'messages'), {
      sender: 'system', message, type: 'system', timestamp: serverTimestamp(),
    });
  }, [contractAddress]);

  // ─── Tx lỗi hoặc bị user từ chối ──────────────────────────────────────────
  // writeContract() KHÔNG ném lỗi khi user bấm từ chối trong ví - lỗi đi vào
  // trường error của hook. Nên khối try/catch quanh nó không bao giờ chạy, và
  // isDeploying kẹt ở true khiến nút disabled vĩnh viễn, phải tải lại trang.
  useEffect(() => {
    if (!writeError) return;
    setIsDeploying(false);
    const rejected = writeError.name === 'UserRejectedRequestError'
      || writeError.cause?.code === 4001
      || /user rejected|denied|rejected the request/i.test(writeError.message || '');
    setTxStatus(rejected ? 'You rejected the transaction' : '' + (writeError.shortMessage || writeError.message));
    setTimeout(() => setTxStatus(''), 5000);
  }, [writeError]);

  // ─── Confirmed: normal tx ─────────────────────────────────────────────────
  useEffect(() => {
    if (isConfirmed) {
      setTxStatus('Transaction confirmed!');
      refetchAll();
      if (pendingAction.current) {
        sendChatNotif(pendingAction.current);
        pendingAction.current = null;
      }
      setTimeout(() => setTxStatus(''), 5000);
    }
  }, [isConfirmed]);


  // ─── Confirmed: sau createEscrow từ factory ───────────────────────────────
  useEffect(() => {
    if (!isConfirmed || !isDeploying || !hash || !publicClient) return;
    setIsDeploying(false);
    publicClient.getTransactionReceipt({ hash }).then(receipt => {
      const log = receipt?.logs?.find(l =>
        l.address?.toLowerCase() === FACTORY_ADDRESS?.toLowerCase()
      );
      if (!log) return;
      const addr = '0x' + log.topics[1]?.slice(26);
      if (!addr || addr.length !== 42) return;
      const { desc, price, imgHash } = pendingDeploy.current;
      const depEth = price ? (parseFloat(price) / 5).toFixed(6) : '';
      saveContract(addr, desc, depEth, pendingDeploy.current.sellerEmail || '', '');
      if (pendingDeploy.current.sellerEmail) {
        addDoc(collection(db, 'contracts', addr.toLowerCase(), 'emails'), {
          sellerEmail: pendingDeploy.current.sellerEmail,
          timestamp: serverTimestamp()
        }).catch(() => {});
      }
      if (imgHash) {
        writeContract({ address: addr, abi: ABI, functionName: 'uploadItemImage', args: [imgHash], gas: 300_000n });
        setTimeout(() => rimg(), 3000);
        pendingDeploy.current.imgHash = '';
      }
      setMyContracts(loadSavedContracts());
      setContractAddr(addr);
      setNavPanel(null);
      router.push(`?contract=${addr}`);
      setTxStatus(`Contract deployed at ${addr}`);
    });
  }, [isConfirmed, isDeploying, hash]);

  useEffect(() => {
    if (!contractAddress) return;
    const q = query(collection(db, 'chats', contractAddress.toLowerCase(), 'messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, snap => { setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))); });
    return () => unsub();
  }, [contractAddress]);

  // Load tỉnh/thành cho buyer form
useEffect(() => {
  fetch('/api/ghn-master?type=province')
    .then(r => r.json()).then(d => { if (d.code === 200) setAddrProvinces(d.data || []); }).catch(() => {});
}, []);

useEffect(() => {
  if (!buyerProvince) { setAddrDistricts([]); setAddrWards([]); setBuyerDistrict(''); setBuyerWard(''); return; }
  fetch(`/api/ghn-master?type=district&province_id=${buyerProvince}`)
    .then(r => r.json()).then(d => { if (d.code === 200) setAddrDistricts(d.data || []); }).catch(() => {});
  setBuyerDistrict(''); setBuyerWard(''); setAddrWards([]);
}, [buyerProvince]);

useEffect(() => {
  if (!buyerDistrict) { setAddrWards([]); setBuyerWard(''); return; }
  fetch(`/api/ghn-master?type=ward&district_id=${buyerDistrict}`)
    .then(r => r.json()).then(d => { if (d.code === 200) setAddrWards(d.data || []); }).catch(() => {});
  setBuyerWard('');
}, [buyerDistrict]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const isLoading   = isPending || isConfirming || isDeploying;
  const isDone      = stateNum !== null && DONE_STATES.includes(stateNum);
  const showDeployJoinNav = !contractAddress || isDone;

  const claimAvailableTs = shippedAt ? shippedAt + 17 * 86400 : (activeAt ? Number(activeAt) + 14 * 86400 : null);
  const claimCountdown   = claimAvailableTs ? countdown(claimAvailableTs) : null;
  const claimReady       = claimAvailableTs ? isCountdownExpired(claimAvailableTs) : false;
  const autoCancelTs        = (!shipped && activeAt) ? Number(activeAt) + 72 * 3600 : null;
  const autoCancelReady     = autoCancelTs ? isCountdownExpired(autoCancelTs) : false;
  const autoCancelCountdown = autoCancelTs ? countdown(autoCancelTs) : null;

  const tx = (functionName, args = [], value, chatMsg = null) => {
    writeContract({ address: contractAddress, abi: ABI, functionName, args, ...(value ? { value } : {}), gas: 300_000n });
    setTxStatus('Waiting for confirmation...');
    pendingAction.current = chatMsg;
  };

  const handleJoin = () => {
  if (!buyerStreet.trim() || !buyerDistrict || !buyerWard || !buyerProvince) return alert('Please fill in your full delivery address');
  const provinceName = addrProvinces.find(p => String(p.ProvinceID) === String(buyerProvince))?.ProvinceName || '';
  const districtName = addrDistricts.find(d => String(d.DistrictID) === String(buyerDistrict))?.DistrictName || '';
  const wardName     = addrWards.find(w => String(w.WardCode) === String(buyerWard))?.WardName || '';
  const builtAddress = `${buyerStreet.trim()}, ${wardName}, ${districtName}, ${provinceName}`;

  // Lưu địa chỉ buyer vào Firestore để seller dùng khi ship
  addDoc(collection(db, 'contracts', contractAddress.toLowerCase(), 'buyerAddress'), {
    district_id: Number(buyerDistrict),
    ward_code:   String(buyerWard),
    address:     builtAddress,
    street:      buyerStreet.trim(),
    timestamp:   serverTimestamp()
  }).catch(() => {});
    // Lưu buyerEmail vào localStorage và Firestore
    if (buyerEmail.trim()) {
      const { sellerEmail: existingSellerEmail } = getEmailsForContract(contractAddress);
      saveContract(contractAddress, '', '', existingSellerEmail, buyerEmail.trim());
      addDoc(collection(db, 'contracts', contractAddress.toLowerCase(), 'emails'), {
        buyerEmail: buyerEmail.trim(),
        timestamp: serverTimestamp()
      }).catch(() => {});
    }
    tx('joinAsBuyer', [builtAddress], itemPrice + deposit,
      `A buyer has joined the escrow and sent payment. The transaction is now active.`);
    // Gửi email thông báo cho seller
    getEmailsFromFirestore(contractAddress).then(({ sellerEmail }) => {
      sendEscrowEmail({
        toEmail: sellerEmail,
        recipientName: 'Seller',
        eventTitle: 'A buyer has joined your escrow',
        eventMessage: 'A buyer has joined and sent payment. Your escrow is now active. Please ship the item as soon as possible.',
        itemDescription: itemDescription,
        contractAddress: contractAddress,
        amount: itemPrice != null ? `${formatEther(itemPrice)} ETH` : '—',
      });
    });
  };

  const handleConfirmDelivery = async () => {
    if (!contractAddress || !address) return;
    try {
      tx('confirmDelivery', [], null, 'Buyer has confirmed delivery. Funds released to seller.');
      // Gửi email thông báo cho seller
      const { sellerEmail } = await getEmailsFromFirestore(contractAddress);
      sendEscrowEmail({
        toEmail: sellerEmail,
        recipientName: 'Seller',
        eventTitle: 'Buyer confirmed delivery',
        eventMessage: 'The buyer has confirmed delivery. Funds have been released to your wallet.',
        itemDescription: itemDescription,
        contractAddress: contractAddress,
        amount: itemPrice != null ? `${formatEther(itemPrice)} ETH` : '—',
      });
    } catch (e) {
      setTxStatus('' + (e.shortMessage || e.message));
    }
  };


  // Buyer doi tra hang kem anh that. Truoc day cho nay gui chuoi 'evidence'
  // cung nen agent khong bao gio tai duoc anh.
  const handleRequestReturn = async (evidenceHash, note) => {
    setShowEvidenceModal(false);
    tx('requestReturn', [evidenceHash], null,
       note ? `Buyer requested a return: ${note}` : 'Buyer has requested a return.');

    const { sellerEmail } = await getEmailsFromFirestore(contractAddress);
    sendEscrowEmail({
      toEmail: sellerEmail,
      recipientName: 'Seller',
      eventTitle: 'Buyer requested a return',
      eventMessage: 'The buyer has requested to return the item, with a photo attached. Please review and approve, or wait for auto-resolution in 72 hours.',
      itemDescription: itemDescription,
      contractAddress: contractAddress,
      amount: itemPrice != null ? `${formatEther(itemPrice)} ETH` : '—',
    });
  };

  const handleShipped = async (orderCode, proofHash) => {
    // Luu anh tinh trang hang luc gui di. Contract da co san ham nay,
    // truoc gio chua ai goi. Day la bang chung phia seller.
    if (proofHash) tx('uploadDeliveryProof', [proofHash], null, null);

    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem(shippedKey(contractAddress), JSON.stringify({ at: now }));
    setShipped(true); setShippedAt(now);
    setShowShipModal(false);
    await sendChatNotif(`Seller has shipped the item. GHN order: ${orderCode} — Track: https://donhang.ghn.vn/?order_code=${orderCode}`);

    // Gửi email thông báo cho buyer
    const { buyerEmail: bEmail } = await getEmailsFromFirestore(contractAddress);
    console.log('[DEBUG] buyerEmail:', bEmail, 'contractAddress:', contractAddress);
    sendEscrowEmail({
      toEmail: bEmail,
      recipientName: 'Buyer',
      eventTitle: 'Your item has been shipped',
      eventMessage: `The seller has shipped your item. GHN tracking code: ${orderCode}. Track your order at: https://donhang.ghn.vn/?order_code=${orderCode}`,
      itemDescription: itemDescription,
      contractAddress: contractAddress,
      amount: itemPrice != null ? `${formatEther(itemPrice)} ETH` : '—',
    });
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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}?contract=${contractAddress}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadContract = () => {
    let addr = inputAddr.trim();
    try { const url = new URL(addr); const param = url.searchParams.get('contract'); if (param) addr = param; } catch {}
    if (addr.startsWith('0x') && addr.length === 42) {
      saveContract(addr); setMyContracts(loadSavedContracts());
      setContractAddr(addr); setNavPanel(null); router.push(`?contract=${addr}`);
    } else { alert('Invalid input — paste a contract address (0x...) or a share link'); }
  };

  // ─── handleDeploy — dùng Factory ─────────────────────────────────────────
  const handleDeploy = async () => {
    if (!deployDesc.trim() || !deployPrice.trim()) return alert('Please fill in all fields');
    if (!FACTORY_ADDRESS) return alert('Factory address not configured');
    try {
      const price = parseEther(deployPrice);
      const dep   = price / 5n;
      pendingDeploy.current = { desc: deployDesc, price: deployPrice, imgHash: deployImgHash, sellerEmail: deployEmail };
      setIsDeploying(true);
      writeContract({
        address: FACTORY_ADDRESS,
        abi:     FACTORY_ABI,
        functionName: 'createEscrow',
        args:  [price, deployDesc],
        value: dep,
        gas:   3_000_000n,
      });
      setTxStatus('Check your wallet to sign the deploy transaction...');
    } catch (e) {
      setIsDeploying(false);
      setTxStatus('' + (e.shortMessage || e.message));
    }
  };

  return (
    <div className={isDark ? 'theme-dark' : 'theme-light'} style={{minHeight:'100vh', position:'relative'}}>
      <style>{`
        :root { --navbar-h: ${NAVBAR_H}px; }
        .nav-panel { position: fixed; top: var(--navbar-h); left: 0; right: 0; z-index: 199; background: var(--surface); border-bottom: 1px solid var(--border); padding: 1.75rem; animation: slideDown 0.18s ease; max-height: calc(100vh - var(--navbar-h)); overflow-y: auto; display: flex; justify-content: center; }
        .panel-form { width: 100%; max-width: 420px; }
        .panel-form-group { display: flex; gap: 2.5rem; width: 100%; max-width: 880px; justify-content: center; }
        .panel-form-group .panel-form { flex: 1; }
        @keyframes slideDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        .panel-title { font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.16em; color: var(--muted); text-transform: uppercase; margin-bottom: 1.1rem; padding-bottom: 0.7rem; border-bottom: 1px solid var(--border); }
        .app { width: 100%; margin: 0 auto; padding: 2rem 2rem 5rem; padding-top: calc(var(--navbar-h) + 2rem); }
        .app-inner { max-width: 760px; margin: 0 auto; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0; border-bottom: 1px solid var(--border); }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-size: 0.74rem; color: var(--muted); font-family: var(--font-mono); }
        .info-value { font-size: 0.86rem; font-weight: 600; color: var(--text); }
        .you-badge { display: inline-block; padding: 0.13rem 0.45rem; border-radius: 4px; font-size: 0.6rem; font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.04em; margin-left: 0.4rem; background: var(--accent2-bg); color: var(--accent2); border: 1px solid var(--accent2); }
        .state-badge { display: inline-flex; align-items: center; gap: 0.55rem; padding: 0.45rem 1.05rem; border-radius: 999px; font-size: 0.72rem; font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; border: 1px solid currentColor; margin-bottom: 1.25rem; }
        .state-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; margin-top: 0.7rem; }
        .actions.single { grid-template-columns: 1fr; }
        .status-bar { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 0.65rem 1rem; font-family: var(--font-mono); font-size: 0.76rem; color: var(--text); margin-bottom: 1rem; text-align: center; }
        .timeout-bar { margin-top: 0.7rem; padding: 0.55rem 0.7rem; border-radius: 8px; background: var(--warn-bg); border: 1px solid var(--warn); font-family: var(--font-mono); font-size: 0.72rem; color: var(--warn); display: flex; justify-content: space-between; }
        .share-row { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.7rem; }
        .share-input { flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.7rem; color: var(--muted); font-family: var(--font-mono); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .load-contract { display: flex; gap: 0.5rem; margin-bottom: 0.6rem; }
        .load-contract .input { margin-bottom: 0; flex: 1; }
        .evidence-notice { background: var(--warn-bg); border: 1px solid var(--warn); border-radius: 8px; padding: 0.6rem 0.7rem; font-family: var(--font-mono); font-size: 0.72rem; color: var(--warn); margin-bottom: 0.7rem; }
        .etherscan-link { font-family: var(--font-mono); font-size: 0.72rem; color: var(--muted); text-decoration: none; transition: color 0.15s; display: inline-flex; align-items: center; gap: 0.3rem; }
        .etherscan-link:hover { color: var(--text); }
        .deploy-note { font-size: 0.74rem; font-family: var(--font-mono); color: var(--muted); margin-bottom: 0.7rem; padding: 0.5rem 0.7rem; background: var(--accent2-bg); border: 1px solid var(--accent2); border-radius: 8px; }
        .landing-orbs { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; will-change: transform; }
        .orb { position: absolute; border-radius: 50%; filter: blur(100px); }
        .orb-1 { width: 800px; height: 800px; background: radial-gradient(circle, var(--text), transparent 70%); top: -250px; left: -200px; opacity: 0.05; animation: driftOrb 22s ease-in-out infinite alternate; }
        .orb-2 { width: 620px; height: 620px; background: radial-gradient(circle, var(--accent2), transparent 70%); bottom: -220px; right: -160px; opacity: 0.07; animation: driftOrb2 30s ease-in-out infinite alternate; }
        @keyframes driftOrb { from { transform: translate(0,0) scale(1); } to { transform: translate(50px, 35px) scale(1.06); } }
        @keyframes driftOrb2 { from { transform: translate(0,0) scale(1); } to { transform: translate(-45px, -30px) scale(1.08); } }
        .connect-prompt { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 3rem; width: 100%; min-height: calc(100vh - var(--navbar-h)); justify-content: center; padding-bottom: 4rem; }
        .connect-logo { width: 160px; height: 160px; object-fit: contain; margin-bottom: 1.75rem; filter: drop-shadow(0 8px 30px rgba(0,0,0,0.06)); animation: logoIn 0.7s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes logoIn { from{opacity:0;transform:scale(0.85) translateY(14px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .connect-eyebrow { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.22em; color: var(--muted); text-transform: uppercase; display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1.75rem; animation: fadeUpL 0.6s 0.05s ease both; }
        .eyebrow-line { width: 32px; height: 1px; background: var(--muted); opacity: 0.4; }
        .connect-title { display: flex; flex-wrap: wrap; justify-content: center; font-size: clamp(3.2rem, 8vw, 6.2rem); font-weight: 400; letter-spacing: -0.03em; line-height: 0.98; margin-bottom: 1.4rem; font-family: var(--font-serif); color: var(--text); }
        .split-letter { display: inline-block; opacity: 0; filter: blur(6px); transform: translateY(22px); animation: letterIn 0.65s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes letterIn { to { opacity: 1; filter: blur(0); transform: translateY(0); } }
        .connect-sub { font-family: var(--font-mono); font-size: 0.95rem; color: var(--muted); max-width: 540px; line-height: 1.8; margin-bottom: 0.8rem; animation: fadeUpL 0.6s 0.22s ease both; }
        .connect-sub strong { color: var(--text); font-weight: 700; }
        .connect-cta { margin-bottom: 4rem; animation: fadeUpL 0.6s 0.32s ease both; margin-top: 0.5rem; }
        @keyframes fadeUpL { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .reveal { opacity: 0; transform: translateY(16px); transition: opacity 700ms cubic-bezier(0.16,1,0.3,1), transform 700ms cubic-bezier(0.16,1,0.3,1); }
        .reveal-visible { opacity: 1; transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; transform: none; transition: none; }
        }
        /* Tilt 3D + sheen — thẻ nghiêng theo chuột, có vệt sáng chạy theo con trỏ */
        .reveal-tilt { position: relative; transform-style: preserve-3d; will-change: transform; }
        .reveal-tilt.reveal-visible { transition: opacity 700ms cubic-bezier(0.16,1,0.3,1), transform 150ms ease-out; }
        .tilt-sheen { position: absolute; inset: 0; pointer-events: none; opacity: 0; z-index: 2; border-radius: inherit; transition: opacity 0.35s ease; mix-blend-mode: overlay; background: radial-gradient(circle at var(--mx,50%) var(--my,50%), #ffffff, transparent 60%); }
        .reveal-tilt:hover .tilt-sheen { opacity: 0.55; }
        /* Nút hút theo chuột (magnetic) */
        .magnetic { display: inline-block; transition: transform 0.2s cubic-bezier(0.16,1,0.3,1); will-change: transform; }
        /* Vùng sáng theo chuột trên nền hero tối */
        .hero-spotlight { position: fixed; inset: 0; pointer-events: none; z-index: 2; opacity: 0; mix-blend-mode: soft-light; transition: opacity 0.4s ease; }
        .scroll-sep { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 2rem 0 0.5rem; width: 100%; font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.22em; color: var(--muted); text-transform: uppercase; opacity: 0.45; }
        .scroll-sep .scroll-arrow { font-size: 0.8rem; }

        /* ── Khối giới thiệu AI agent xử lý tranh chấp ── */
        .agent-lead { font-family: var(--font-mono); font-size: 0.92rem; color: var(--muted); line-height: 1.85; max-width: 60ch; margin-bottom: 2.75rem; }

        .agent-flow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.1rem; counter-reset: agentstep; }
        .agent-step { position: relative; padding: 1.5rem 1.35rem 1.6rem; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), border-color 0.3s; }
        .agent-step:hover { transform: translateY(-3px); border-color: var(--accent2); }
        /* Đường nối giữa các bước, ẩn ở bước cuối */
        .agent-step::after { content: ''; position: absolute; top: 2.35rem; right: -1.1rem; width: 1.1rem; height: 1px; background: var(--border); }
        .agent-step:last-child::after { display: none; }
        .agent-step-mark { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border); color: var(--accent2); margin-bottom: 0.95rem; }
        .agent-step-title { font-family: var(--font-display); font-size: 0.94rem; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 0.5rem; }
        .agent-step-desc { font-family: var(--font-mono); font-size: 0.73rem; color: var(--muted); line-height: 1.75; }

        .agent-guard { margin-top: 2.25rem; border: 1px solid var(--border); border-left: 2px solid var(--danger); border-radius: 12px; padding: 1.5rem 1.75rem; background: var(--surface); }
        .agent-guard-label { display: flex; align-items: center; gap: 0.45rem; font-family: var(--font-mono); font-size: 0.64rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--danger); margin-bottom: 1rem; }
        .agent-guard-list { list-style: none; display: grid; gap: 0.7rem; }
        .agent-guard-list li { position: relative; padding-left: 1.1rem; font-family: var(--font-mono); font-size: 0.76rem; color: var(--muted); line-height: 1.8; }
        .agent-guard-list li::before { content: ''; position: absolute; left: 0; top: 0.68em; width: 5px; height: 1px; background: var(--danger); }

        @media (max-width: 900px) {
          .agent-flow { grid-template-columns: repeat(2, 1fr); }
          .agent-step::after { display: none; }
        }
        @media (max-width: 560px) {
          .agent-flow { grid-template-columns: 1fr; }
        }

        .landing-divider { border: none; border-top: 1px solid var(--border); width: 90%; max-width: 1100px; margin: 0 auto; }
        .landing-section { width: 90%; max-width: 1100px; padding: 4rem 0 0; text-align: left; }
        .landing-section-label { font-family: var(--font-mono); font-size: 0.74rem; letter-spacing: 0.24em; color: var(--muted); text-transform: uppercase; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.6rem; }
        .landing-section-label::after { content:''; flex:1; height:1px; background: var(--border); }
        .about-bento { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
        .about-cell { background: var(--surface); padding: 2rem; transition: background 0.2s; }
        .about-cell:hover { background: var(--surface-2); }
        .about-cell.wide { grid-column: 1/-1; }
        .about-icon { width: 28px; height: 28px; margin-bottom: 1rem; display: block; color: var(--text); }
        .about-cell-title { font-size: 1.1rem; font-weight: 700; color: var(--text); margin-bottom: 0.6rem; font-family: var(--font-display); }
        .about-cell-body { font-family: var(--font-mono); font-size: 0.86rem; color: var(--muted); line-height: 1.85; }
        .about-cell-body strong { color: var(--text); font-weight: 700; }
        .why-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .why-card { background: var(--surface); padding: 1.6rem 1.4rem; transition: background 0.2s; }
        .why-card:hover { background: var(--surface-2); }
        .why-card-icon  { width: 24px; height: 24px; display:block; margin-bottom:0.85rem; color: var(--text); }
        .why-card-title { font-size:0.98rem; font-weight:700; color:var(--text); margin-bottom:0.4rem; font-family: var(--font-display); }
        .why-card-desc  { font-family:var(--font-mono); font-size:0.8rem; color:var(--muted); line-height:1.7; }
        .tl-track { display:grid; grid-template-columns:repeat(7,1fr); gap:0; position:relative; }
        .tl-track::before { content:''; position:absolute; top:23px; left:calc(100%/14); right:calc(100%/14); height:1px; background: var(--border); z-index:0; }
        .tl-step { display:flex; flex-direction:column; align-items:center; text-align:center; padding:0 0.5rem; position:relative; z-index:1; }
        .tl-num { width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-size:0.9rem; font-weight:700; color:var(--text); background:var(--surface); border:1.5px solid var(--border); margin-bottom:0.9rem; transition:border-color 0.2s; }
        .tl-step:hover .tl-num { border-color: var(--text); }
        .tl-label { font-size:0.88rem; font-weight:700; color:var(--text); margin-bottom:0.35rem; font-family:var(--font-mono); }
        .tl-desc  { font-size:0.76rem; color:var(--muted); line-height:1.55; font-family:var(--font-mono); }
        .landing-footer-cta { text-align:center; padding:5rem 0 4rem; position:relative; width:100%; display:flex; flex-direction:column; align-items:center; }
        .footer-glow { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:600px; height:300px; background:radial-gradient(ellipse,var(--muted),transparent 70%); opacity: 0.05; pointer-events:none; }
        .footer-cta-title { font-size:clamp(2.2rem,4.5vw,3.4rem); font-weight:400; letter-spacing:-0.02em; margin-bottom:1rem; line-height:1.12; position:relative; font-family: var(--font-serif); color: var(--text); }
        .footer-cta-sub { font-family:var(--font-mono); font-size:0.92rem; color:var(--muted); margin-bottom:2.25rem; position:relative; }
        .landing-footer-bottom { font-family:var(--font-mono); font-size:0.7rem; color:var(--muted); letter-spacing:0.06em; padding:1.5rem 0 2rem; border-top:1px solid var(--border); width:100%; text-align:center; }
        .chat-messages { max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; padding-right: 0.25rem; }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .chat-msg { padding: 0.5rem 0.75rem; border-radius: 8px; max-width: 80%; }
        .chat-msg.mine   { align-self: flex-end; background: var(--success-bg); border: 1px solid var(--success); }
        .chat-msg.other  { align-self: flex-start; background: var(--surface-2); border: 1px solid var(--border); }
        .chat-msg.system { align-self: center; max-width: 95%; width: 100%; background: var(--accent2-bg); border: 1px solid var(--accent2); text-align: center; border-radius: 8px; }
        .chat-meta { font-size: 0.6rem; font-family: var(--font-mono); color: var(--muted); margin-bottom: 0.2rem; }
        .chat-text { font-size: 0.8rem; color: var(--text); word-break: break-word; }
        .chat-text.system-text { color: var(--accent2); font-size: 0.75rem; font-family: var(--font-mono); }
        .chat-img { max-width: 220px; max-height: 200px; border-radius: 6px; margin-top: 0.25rem; cursor: pointer; }
        .chat-input-row { display: flex; gap: 0.5rem; align-items: center; }
        .chat-input-row .input { margin-bottom: 0; flex: 1; }
        @media (max-width:720px) {
          .about-bento { grid-template-columns:1fr; } .about-cell.wide { grid-column:1; }
          .why-grid { grid-template-columns:1fr 1fr; }
          .tl-track { grid-template-columns:repeat(2,1fr); row-gap:1.6rem; } .tl-track::before { display:none; }
        }
        @media (max-width:480px) {
          .why-grid { grid-template-columns:1fr; }
          .tl-track { grid-template-columns:repeat(2,1fr); }
          .connect-title { font-size:2.4rem; }
          .connect-prompt { justify-content: flex-start; padding-top: 2rem; }
        }
        @media (max-width: 600px) {
          .app { padding: 1rem 1rem 4rem; padding-top: calc(var(--navbar-h) + 1rem); }
          .actions { grid-template-columns: 1fr; }
          .share-row, .load-contract { flex-wrap: wrap; }
          .navbar { padding: 0 1rem; }
          .nav-btn { padding: 0.4rem 0.6rem; font-size: 0.74rem; }
          .logo { font-size: 1.1rem; margin-right: 0.5rem; }
          .panel-form-group { flex-direction: column; gap: 1.5rem; }
        }
      `}</style>

      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-left">
          {isConnected ? (
            <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginRight:'1rem'}}>
              <img src="/logo.png" alt="EscrowMAD" style={{width:'32px', height:'32px', objectFit:'contain', borderRadius:'6px'}} />
              <div className="logo-stack">
                <span className="logo-version">v{APP_VERSION}</span>
                <div className="logo">EscrowMAD</div>
              </div>
            </div>
          ) : (
            <div className="logo-stack">
              <span className="logo-version">v{APP_VERSION}</span>
              <div className="logo">EscrowMAD</div>
            </div>
          )}
          {isConnected && (
            <>
              <button className="nav-btn" onClick={() => router.push('/my-contracts')}>
                Profile {myContracts.length > 0 && `(${myContracts.length})`}
              </button>
              {showDeployJoinNav && (
                <button className={`nav-btn ${navPanel === 'contract' ? 'active' : ''}`} onClick={() => setNavPanel(v => v === 'contract' ? null : 'contract')}>
                  Contract
                </button>
              )}
              <button className="nav-btn" onClick={() => router.push('/roadmap')}>
                Roadmap
              </button>
            </>
          )}
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
          <button className="theme-toggle" onClick={toggleTheme} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? <SunIcon size={15}/> : <MoonIcon size={15}/>}
          </button>
          {isConnected && <ConnectButton chainStatus="icon" showBalance={false} />}
        </div>
      </nav>

      {/* Contract Panel — gồm Deploy form + Join form */}
      {navPanel === 'contract' && (
        <div className="nav-panel">
          <div className="panel-form-group">
            <div className="panel-form">
              <div className="panel-title">Deploy New Contract</div>
              <input className="input" placeholder="Item description (e.g. iPhone 15 Pro 256GB)" value={deployDesc} onChange={e => setDeployDesc(e.target.value)} />
              <input className="input" placeholder="Item price in ETH (e.g. 0.005)" value={deployPrice} onChange={e => setDeployPrice(e.target.value)} />
              <input className="input" placeholder="Your email for order notifications" value={deployEmail} onChange={e => setDeployEmail(e.target.value)} />
              <div style={{fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--accent2)', marginBottom:'0.6rem', padding:'0.4rem 0.6rem', background:'var(--accent2-bg)', border:'1px solid var(--accent2)', borderRadius:'6px', display:'flex', alignItems:'center', gap:'0.35rem'}}>
                <MailIcon size={13}/> This email will be used for order event notifications only.
              </div>

              <div style={{marginBottom:'0.6rem'}}>
                 <label style={{fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--muted)', display:'flex', alignItems:'center', gap:'0.35rem', marginBottom:'0.4rem'}}>
                 <CameraIcon size={13}/> Item photo (optional, uploaded to IPFS)
              </label>
               <input
                      type="file"
                      accept="image/*"
                      style={{display:'none'}}
                      ref={deployImgRef}
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setDeployUploading(true);
        try {
          const h = await uploadToPinata(file);
          setDeployImgHash(h);
        } catch (err) {
          alert('Upload failed: ' + err.message);
        } finally {
          setDeployUploading(false);
          e.target.value = '';
        }
      }}
    />
    <button
      type="button"
      className="btn btn-secondary"
      style={{width:'100%', flexDirection:'row', gap:'0.5rem'}}
      onClick={() => deployImgRef.current?.click()}
      disabled={deployUploading}
    >
      {deployUploading ? <><span className="spinner" /> Uploading...</> : deployImgHash ? <><CheckIcon size={13}/> Photo uploaded</> : <><FolderIcon size={13}/> Choose photo</>}
    </button>
    {deployImgHash && (
      <img
        src={`https://gateway.pinata.cloud/ipfs/${deployImgHash}`}
        alt="preview"
        style={{width:'100%', objectFit:'contain', borderRadius:'8px', marginTop:'0.5rem', border:'1px solid var(--border)'}}
      />
    )}
  </div>
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

            <div className="panel-form">
              <div className="panel-title">Join Existing Contract</div>
              <div className="load-contract">
                <input className="input" placeholder="Paste contract address 0x... or share link" value={inputAddr} onChange={e => setInputAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLoadContract()} />
                <button className="btn btn-primary" onClick={handleLoadContract}>Load</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="app">
        {!isConnected ? (
          <div
            className="connect-prompt"
            ref={heroRef}
            onMouseMove={handleHeroMove}
            onMouseEnter={showSpotlight}
            onMouseLeave={hideSpotlight}
          >
            <div className="landing-orbs" ref={orbsRef}>
              <div className="orb orb-1" />
              <div className="orb orb-2" />
            </div>
            <div className="hero-spotlight" ref={spotlightRef} />
            <div className="connect-eyebrow">
              <span className="eyebrow-line" />Trustless · On-chain · Permissionless<span className="eyebrow-line" />
            </div>
            <img src="/logo.png" alt="EscrowMAD" className="connect-logo" />
            <SplitTitle text="EscrowMAD" className="connect-title" />
            <p className="connect-sub">
              Peer-to-peer escrow on Ethereum.<br />
              <strong>No middleman. No arbiter. No trust needed.</strong><br />
              Just code, deposits, and cryptographic finality.
            </p>
            <div className="connect-cta">
              <Magnetic strength={0.35}>
                <ConnectButton label="Connect Wallet to Start" />
              </Magnetic>
            </div>
            <LandingCards />
          </div>

        ) : !contractAddress ? (
          <div style={{textAlign:'center', marginTop:'3rem', color:'var(--muted)', fontFamily:'var(--font-mono)', fontSize:'0.95rem', lineHeight:'1.8'}}>
            Select a contract from <strong style={{color:'var(--text)'}}>Profile</strong>,<br/>
            or deploy / join one from <strong style={{color:'var(--text)'}}>Contract</strong>.
          </div>

        ) : !isZero(buyer) && !isSeller && !isBuyer ? (
          <div style={{textAlign:'center', marginTop:'6rem', fontFamily:'var(--font-mono)'}}>
            <div style={{display:'flex', justifyContent:'center', marginBottom:'1rem', color:'var(--muted)'}}><LockIcon size={28}/></div>
            <div style={{fontSize:'1rem', fontWeight:700, color:'var(--text)', marginBottom:'0.5rem'}}>
              This contract is private
            </div>
            <div style={{fontSize:'0.8rem', color:'var(--muted)', lineHeight:'1.8'}}>
              Both parties have already joined.<br/>
              Only the seller and buyer can view this contract.
            </div>
            <button className="back-btn" style={{marginTop:'2rem', display:'inline-flex'}} onClick={() => { setContractAddr(''); router.push('/'); }}><ArrowLeftIcon size={13}/> Back</button>
          </div>

        ) : (
          <div className="app-inner">
            <button className="back-btn" onClick={() => { setContractAddr(''); router.push('/'); }}><ArrowLeftIcon size={13}/> Back</button>
            {stateNum !== null && (
              <div className="state-badge" style={{ color: STATE_COLORS[stateNum] }}>
                <span className="state-dot" />{STATE_LABELS[stateNum]}
              </div>
            )}

            {txStatus && <div className="status-bar">{txStatus}</div>}

<div className="card reveal" style={{ '--index': 0 }}>
  <div className="card-title">Contract Info</div>

  {itemImageHash && (
    <img
      src={`https://gateway.pinata.cloud/ipfs/${itemImageHash}`}
      alt="Item"
      style={{
        width: '100%',
        maxHeight: '400px',
        objectFit: 'contain',
        background: 'var(--bg)',
        borderRadius: '8px',
        marginBottom: '1rem',
        border: '1px solid var(--border)',
        cursor: 'pointer',
      }}
      onClick={() => window.open(`https://gateway.pinata.cloud/ipfs/${itemImageHash}`, '_blank')}
    />
  )}

  <div className="info-row">
    <span className="info-label">Address</span>
                <a className="etherscan-link mono" href={`https://sepolia.etherscan.io/address/${contractAddress}`} target="_blank" rel="noreferrer">{short(contractAddress)} <ExternalLinkIcon size={11}/></a>
              </div>
              {itemDescription && <div className="info-row"><span className="info-label">Item</span><span className="info-value">{itemDescription}</span></div>}
              <div className="info-row"><span className="info-label">Item Price</span><span className="info-value">{fmt(itemPrice)}</span></div>
              <div className="info-row"><span className="info-label">Deposit (20%)</span><span className="info-value">{fmt(deposit)}</span></div>
              <div className="info-row"><span className="info-label">Pool Balance</span><span className="info-value">{fmt(balance)}</span></div>
              {isSeller && stateNum === STATE.AWAITING_BUYER && (
                <div className="share-row">
                  <input className="share-input" readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}?contract=${contractAddress}`} />
                  <button className="btn btn-secondary" style={{flexDirection:'row', gap:'0.35rem'}} onClick={handleCopyLink}>{copied ? <><CheckIcon size={13}/> Copied!</> : <><TagIcon size={13}/> Copy Link for Buyer</>}</button>
                </div>
              )}
            </div>

            <div className="card reveal" style={{ '--index': 1 }}>
              <div className="card-title">Participants</div>
              <div className={`info-row${isSeller ? ' info-row-you' : ''}`}>
                  <span className="info-label">Seller</span>
                  <PartyLink address={seller} isYou={isSeller} onOpen={setReviewsFor} />
              </div>
              <div className={`info-row${isBuyer ? ' info-row-you' : ''}`}>
                  <span className="info-label">Buyer</span>
                  {isZero(buyer)
                    ? <span className="info-value mono">not joined yet</span>
                    : <PartyLink address={buyer} isYou={isBuyer} onOpen={setReviewsFor} />}
            </div>
            </div>

            <div className="card reveal" style={{ '--index': 2 }}>
              <div className="card-title">Actions</div>

              {stateNum === STATE.AWAITING_BUYER && isBuyer === false && !isSeller && (
                <div className="actions single">
                  <select className="input" value={buyerProvince} onChange={e => setBuyerProvince(e.target.value)}>
  <option value="">— Select Province / City —</option>
  {addrProvinces.map(p => <option key={p.ProvinceID} value={p.ProvinceID}>{p.ProvinceName}</option>)}
</select>
<select className="input" value={buyerDistrict} onChange={e => setBuyerDistrict(e.target.value)} disabled={!buyerProvince}>
  <option value="">— Select District —</option>
  {addrDistricts.map(d => <option key={d.DistrictID} value={d.DistrictID}>{d.DistrictName}</option>)}
</select>
<select className="input" value={buyerWard} onChange={e => setBuyerWard(e.target.value)} disabled={!buyerDistrict}>
  <option value="">— Select Ward —</option>
  {addrWards.map(w => <option key={w.WardCode} value={w.WardCode}>{w.WardName}</option>)}
</select>
<input className="input" placeholder="Street address (e.g. 72 Nguyễn Trãi)" value={buyerStreet} onChange={e => setBuyerStreet(e.target.value)} />
                  <input className="input" placeholder="Your email for order notifications" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} />
                  <div style={{fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--accent2)', marginBottom:'0.6rem', padding:'0.4rem 0.6rem', background:'var(--accent2-bg)', border:'1px solid var(--accent2)', borderRadius:'6px', display:'flex', alignItems:'center', gap:'0.35rem'}}>
                    <MailIcon size={13}/> This email will be used for order event notifications only.
                  </div>
                  <button className="btn btn-primary" onClick={handleJoin} disabled={isLoading}>
                    <span className="btn-label">{isLoading && <span className="spinner" />}Join & Send Payment</span>
                  </button>
                </div>
              )}

              {stateNum === STATE.ACTIVE && isBuyer && (
                <>
                  {!shipped && (
                    <div className="actions single">
                      <button className="btn btn-danger" onClick={() => {
                        tx('requestCancel', [], null, 'Buyer has requested to cancel this transaction.');
                        getEmailsFromFirestore(contractAddress).then(({ sellerEmail }) => {
                          sendEscrowEmail({ toEmail: sellerEmail, recipientName: 'Seller', eventTitle: 'Buyer requested cancellation', eventMessage: 'The buyer has requested to cancel this transaction. You can approve or wait for auto-resolution.', itemDescription: itemDescription, contractAddress: contractAddress, amount: itemPrice != null ? `${formatEther(itemPrice)} ETH` : '—' });
                        });
                      }} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}<CloseIcon size={13}/> Cancel</span>
                      </button>
                    </div>
                  )}
                  <div className="actions">
                    <button className={`btn ${shipped ? 'btn-success' : 'btn-claim-locked'}`} onClick={shipped ? handleConfirmDelivery : undefined} disabled={isLoading || !shipped}>
                      <span className="btn-label">
                        {isLoading && shipped && <span className="spinner" />}
                        <CheckIcon size={13}/> Confirm
                      </span>
                      {!shipped && <span className="btn-sub">Awaiting shipment</span>}
                    </button>
                    <button className={`btn ${shipped ? 'btn-warn' : 'btn-claim-locked'}`} onClick={shipped ? () => setShowEvidenceModal(true) : undefined} disabled={isLoading || !shipped}>
                      <span className="btn-label">{isLoading && shipped && <span className="spinner" />}<UndoIcon size={13}/> Return</span>
                      {!shipped && <span className="btn-sub">Awaiting shipment</span>}
                    </button>
                  </div>
                </>
              )}

              {stateNum === STATE.ACTIVE && isSeller && (
                <div className="actions">
                  <button className={`btn btn-shipped ${shipped ? 'done' : ''}`}
                     onClick={shipped ? undefined : () => setShowShipModal(true)}
                     disabled={shipped}>
                    <span className="btn-label"><PackageIcon size={14}/> {shipped ? <>Shipped <CheckIcon size={12}/></> : 'Mark as Shipped'}</span>
                    {shipped && shippedAt && <span className="btn-sub">{fmtDateTime(shippedAt)}</span>}
                  </button>
                  {!shipped && (
                    <button className="btn btn-danger" onClick={() => {
                      tx('requestCancel', [], null, 'Seller has requested to cancel.');
                      getEmailsFromFirestore(contractAddress).then(({ buyerEmail: bEmail }) => {
                        sendEscrowEmail({ toEmail: bEmail, recipientName: 'Buyer', eventTitle: 'Seller requested cancellation', eventMessage: 'The seller has requested to cancel this transaction. You can approve or wait for auto-resolution.', itemDescription: itemDescription, contractAddress: contractAddress, amount: itemPrice != null ? `${formatEther(itemPrice)} ETH` : '—' });
                      });
                    }} disabled={isLoading}>
                      <span className="btn-label">{isLoading && <span className="spinner" />}<CloseIcon size={13}/> Cancel</span>
                    </button>
                  )}
                  {shipped && (
                    <button className={`btn ${claimReady ? 'btn-secondary' : 'btn-claim-locked'}`} onClick={claimReady ? () => {
                      tx('claimAfterBuyerTimeout', [], null, 'Seller claimed funds after buyer timeout.');
                      getEmailsFromFirestore(contractAddress).then(({ buyerEmail: bEmail }) => {
                        sendEscrowEmail({ toEmail: bEmail, recipientName: 'Buyer', eventTitle: 'Seller claimed funds', eventMessage: 'You did not confirm delivery within the allowed time. The seller has claimed the funds.', itemDescription: itemDescription, contractAddress: contractAddress, amount: itemPrice != null ? `${formatEther(itemPrice)} ETH` : '—' });
                      });
                    } : undefined} disabled={isLoading || !claimReady}>
                      <span className="btn-label">{isLoading && claimReady && <span className="spinner" />}<ClockIcon size={13}/> Claim</span>
                      {!claimReady && claimCountdown ? <span className="btn-sub">{claimCountdown} remaining</span> : <span className="btn-sub">Available now</span>}
                    </button>
                  )}
                </div>
              )}

              {stateNum === STATE.CANCEL_REQUESTED && (
                <>
                  <div className="evidence-notice"><CloseIcon size={13}/> Cancel requested by {isInitiator ? 'you' : short(requestInitiator)}.{isInitiator ? ' Waiting for the other party.' : ' Do you agree to cancel?'}</div>
                  <div className="actions">
                    {!isInitiator && (
                      <button className="btn btn-danger" onClick={() => {
                        tx('approveCancel', [], null, 'Cancel approved. Funds returned.');
                        getEmailsFromFirestore(contractAddress).then(({ sellerEmail, buyerEmail: bEmail }) => {
                          const targetEmail = isInitiator ? '' : (isSeller ? bEmail : sellerEmail);
                          sendEscrowEmail({ toEmail: targetEmail, recipientName: isInitiator ? '' : (isSeller ? 'Buyer' : 'Seller'), eventTitle: 'Cancellation approved', eventMessage: 'The cancellation has been approved. Funds have been returned to both parties.', itemDescription: itemDescription, contractAddress: contractAddress, amount: deposit != null ? `${formatEther(deposit)} ETH` : '—' });
                        });
                      }} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}<CheckIcon size={13}/> Approve Cancel</span>
                      </button>
                    )}
                    {isInitiator && (
                      <button className="btn btn-secondary" onClick={() => tx('withdrawCancelRequest', [], null, 'Cancel request withdrawn.')} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}<UndoIcon size={13}/> Withdraw Request</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {stateNum === STATE.RETURN_REQUESTED && (
                <>
                  <div className="evidence-notice"><UndoIcon size={13}/> Return requested by {isInitiator ? 'you' : short(requestInitiator)}.{isInitiator ? ' Waiting for the other party.' : ' Do you agree?'}</div>
                  <div className="actions single">
                    {!isInitiator && (
                      <button className="btn btn-warn" style={{width:'100%'}} onClick={() => {
                        tx('approveReturn', [], null, 'Return approved. Funds returned to buyer.');
                        getEmailsFromFirestore(contractAddress).then(({ buyerEmail: bEmail }) => {
                          sendEscrowEmail({ toEmail: bEmail, recipientName: 'Buyer', eventTitle: 'Return approved', eventMessage: 'The seller has approved your return request. Funds have been returned to your wallet.', itemDescription: itemDescription, contractAddress: contractAddress, amount: itemPrice != null ? `${formatEther(itemPrice)} ETH` : '—' });
                        });
                      }} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}<CheckIcon size={13}/> Approve Return</span>
                      </button>
                    )}
                    {isInitiator && (
                      <button className="btn btn-secondary" style={{width:'100%'}} onClick={() => tx('withdrawReturnRequest', [], null, 'Return request withdrawn.')} disabled={isLoading}>
                        <span className="btn-label">{isLoading && <span className="spinner" />}<UndoIcon size={13}/> Withdraw Request</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {[STATE.ACTIVE, STATE.CANCEL_REQUESTED, STATE.RETURN_REQUESTED].includes(stateNum) && (isBuyer || isSeller) && (
                <div className="actions single" style={{marginTop:'0.75rem'}}>
                  {isIpfsHash(itemImageHash) && isIpfsHash(returnEvidenceHash) ? (
                    <button className="btn btn-danger" style={{width:'100%'}} disabled={isLoading} onClick={() => {
                      if (!window.confirm('Raise a dispute?\n\nAn AI agent will compare the listing photo with your photo of the delivered item, then release the funds to whoever it decides. This cannot be undone.')) return;
                      tx('raiseDispute', [], null, 'Dispute raised. An AI agent will review the evidence.');
                    }}>
                      <span className="btn-label">{isLoading && <span className="spinner" />}<AlertIcon size={13}/> Raise Dispute</span>
                    </button>
                  ) : (
                    <div className="evidence-notice"><AlertIcon size={13}/> A dispute needs both photos: the seller&apos;s listing photo and the buyer&apos;s photo of what arrived. Attach the second one through Request Return first.</div>
                  )}
                </div>
              )}

              {stateNum === STATE.DISPUTED && (
                <div className="no-role"><AlertIcon size={14}/> Dispute under review.
                  <div style={{marginTop:'0.5rem',color:'var(--muted)',fontWeight:700}}>An AI agent is comparing the listing photo with the photo of the delivered item. Funds stay locked until it decides.</div>
                </div>
              )}

              {stateNum === STATE.COMPLETED && (
                <div className="no-role"><CheckIcon size={14}/> Escrow completed.
                  {isSeller && <div style={{marginTop:'0.5rem',color:'var(--success)',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:'0.35rem'}}><CoinIcon size={13}/> Funds released to your wallet.</div>}
                  {isBuyer  && (
                    <div style={{marginTop:'0.5rem',color:'var(--accent2)',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:'0.35rem'}}><PackageIcon size={13}/> Delivery confirmed. Thank you!</div>
                  )}
                </div>
              )}
              {stateNum === STATE.COMPLETED && (isSeller || isBuyer) && (
                <ReviewPanel
                  dealAddress={contractAddress}
                  myAddress={address}
                  counterpartAddress={isSeller ? buyer : seller}
                />
              )}
              {stateNum === STATE.CANCELLED && (
                <div className="no-role"><CloseIcon size={14}/> Escrow cancelled.
                  {isSeller && <div style={{marginTop:'0.5rem',color:'var(--muted)',fontWeight:700}}>Deposit returned.</div>}
                  {isBuyer  && <div style={{marginTop:'0.5rem',color:'var(--muted)',fontWeight:700}}>Payment refunded.</div>}
                </div>
              )}
              {stateNum === STATE.SELLER_CLAIMED && (
                <div className="no-role"><ClockIcon size={14}/> Buyer timeout.
                  {isSeller && <div style={{marginTop:'0.5rem',color:'var(--success)',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:'0.35rem'}}><CoinIcon size={13}/> Funds released to your wallet.</div>}
                  {isBuyer  && <div style={{marginTop:'0.5rem',color:'var(--danger)',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:'0.35rem'}}><AlertIcon size={13}/> Funds claimed by the seller.</div>}
                </div>
              )}
            </div>

            {(isBuyer || isSeller) && stateNum !== null && (
              <div className="card reveal" style={{ '--index': 3 }}>
                <div className="card-title">Chat</div>
                <div className="chat-messages">
                  {chatMessages.length === 0 && <div className="no-role" style={{padding:'0.5rem'}}>No messages yet.</div>}
                  {chatMessages.map((m) => {
                    const isSystem = m.sender === 'system' || m.type === 'system';
                    const mine = !isSystem && address && m.sender?.toLowerCase() === address.toLowerCase();
                    return (
                      <div key={m.id} className={`chat-msg ${isSystem ? 'system' : mine ? 'mine' : 'other'}`}>
                        {!isSystem && <div className="chat-meta">{mine ? 'You' : short(m.sender)} · {fmtDateTime(m.timestamp)}</div>}
                        {isSystem && <div className="chat-meta" style={{textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.25rem'}}><BellIcon size={11}/> System · {fmtDateTime(m.timestamp)}</div>}
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
                  <button className="btn-icon" onClick={() => chatImgRef.current?.click()} disabled={uploadingChat}>
                    {uploadingChat ? <span className="spinner" style={{borderTopColor:'var(--muted)'}} /> : <ImageIcon size={16}/>}
                  </button>
                  <button className="btn btn-primary" style={{flexDirection:'row', padding:'0.7rem 1.1rem'}} onClick={handleSendMessage} disabled={!chatInput.trim() || !address}>Send</button>
                </div>
              </div>
            )}

            <div style={{textAlign:'center', marginTop:'1rem'}}>
              <a className="etherscan-link" href={`https://sepolia.etherscan.io/address/${contractAddress}`} target="_blank" rel="noreferrer">View on Etherscan <ExternalLinkIcon size={11}/></a>
            </div>
          </div>
        )}
      </div>
      <EvidenceModal
  isOpen={showEvidenceModal}
  onClose={() => setShowEvidenceModal(false)}
  onConfirm={handleRequestReturn}
  isLoading={isLoading}
/>

<ShipModal
  isOpen={showShipModal}
  onClose={() => setShowShipModal(false)}
  onConfirm={handleShipped}
  itemDescription={itemDescription}
  isLoading={isLoading}
  contractAddress={contractAddress}
/>

<ReviewsModal
  isOpen={reviewsFor !== null}
  address={reviewsFor}
  onClose={() => setReviewsFor(null)}
/>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
