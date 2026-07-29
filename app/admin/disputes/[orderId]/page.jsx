import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient, http, formatEther } from 'viem';
import { sepolia } from 'viem/chains';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { ADMIN_COOKIE, isSessionValid } from '../../../../lib/adminSession';
import { ESCROW_ABI, FACTORY_ABI, STATE_LABELS } from '../../../../lib/escrowAbi';
import ThemeShell from '../../../components/ThemeShell';

export const dynamic = 'force-dynamic';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

// Hash cu tu thoi chua co EvidenceModal la chuoi thuong ('evidence'), khong phai
// hash IPFS. Tai ve se 404 nen phai nhan ra truoc de bao cho nguoi xem biet.
const looksLikeIpfs = (h) => typeof h === 'string' && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,})/.test(h);

const short = (a) => (a ? `${a.slice(0, 10)}...${a.slice(-8)}` : '-');

function whenFrom(seconds) {
  if (!seconds || seconds === 0n) return null;
  return new Date(Number(seconds) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

async function loadOrder(orderId) {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
  if (!rpcUrl || !factoryAddress) {
    return { error: 'Thieu NEXT_PUBLIC_RPC_URL hoac NEXT_PUBLIC_FACTORY_ADDRESS' };
  }

  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

  const total = await client.readContract({ address: factoryAddress, abi: FACTORY_ABI, functionName: 'getTotalEscrows' });
  if (orderId < 0 || orderId >= Number(total)) return { notFound: true };

  const address = await client.readContract({
    address: factoryAddress, abi: FACTORY_ABI, functionName: 'allEscrows', args: [BigInt(orderId)],
  });

  const read = (functionName) => client.readContract({ address, abi: ESCROW_ABI, functionName });
  const [
    state, buyer, seller, description, itemPrice, deposit, balance,
    orderedHash, shippedHash, receivedHash, createdAt, activeAt, requestedAt,
  ] = await Promise.all([
    read('getState'), read('buyer'), read('seller'), read('itemDescription'),
    read('itemPrice'), read('deposit'), read('getBalance'),
    read('itemImageHash'), read('deliveryProofHash'), read('returnEvidenceHash'),
    read('createdAt'), read('activeAt'), read('requestedAt'),
  ]);

  return {
    address, state: Number(state), buyer, seller, description,
    itemPrice, deposit, balance, orderedHash, shippedHash, receivedHash,
    createdAt, activeAt, requestedAt,
  };
}

// Phan quyet cua agent nam o Firestore, loc theo DIA CHI escrow chu khong phai
// orderId: orderId la chi so trong allEscrows nen ve 0 moi lan deploy lai
// factory, va chain local dung chung Firebase voi Sepolia - hai escrow khac han
// nhau van co the trung orderId, dan toi gan nham phan quyet.
// Khong dung orderBy de khoi phai tao composite index tren Firestore.
async function loadVerdict(escrowAddress) {
  try {
    const app = getApps().length === 0
      ? initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        })
      : getApps()[0];

    const snap = await getDocs(
      query(
        collection(getFirestore(app), 'disputeResolutions'),
        where('escrowAddress', '==', escrowAddress.toLowerCase()),
      ),
    );
    const rows = snap.docs
      .map((d) => {
        const v = d.data();
        return { ...v, resolvedAt: v.resolvedAt?.toDate?.() ? v.resolvedAt.toDate() : null };
      })
      .sort((a, b) => (b.resolvedAt?.getTime() || 0) - (a.resolvedAt?.getTime() || 0));
    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: err.message };
  }
}

function Field({ label, children, mono = false }) {
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      <span className={mono ? 'detail-value mono' : 'detail-value'}>{children}</span>
    </div>
  );
}

function Photo({ label, caption, hash }) {
  return (
    <figure className="detail-photo">
      <figcaption>
        <span className="detail-photo-label">{label}</span>
        <span className="detail-photo-caption">{caption}</span>
      </figcaption>
      {!hash ? (
        <div className="detail-photo-empty">not provided</div>
      ) : !looksLikeIpfs(hash) ? (
        // Khong render <img> voi hash rac - trinh duyet se bao 400 va hien anh vo.
        <div className="detail-photo-empty">
          not a valid IPFS hash
          <code className="detail-photo-raw">{hash}</code>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={`${IPFS_GATEWAY}${hash}`} alt={label} />
      )}
      {hash && looksLikeIpfs(hash) && <code className="detail-photo-hash">{hash}</code>}
    </figure>
  );
}

export default async function DisputeDetailPage({ params }) {
  const cookieStore = await cookies();
  if (!(await isSessionValid(cookieStore.get(ADMIN_COOKIE)?.value))) redirect('/admin/login');

  const { orderId: raw } = await params;
  if (!/^\d+$/.test(raw)) notFound();
  const orderId = Number(raw);

  const order = await loadOrder(orderId);
  if (order.notFound) notFound();

  const verdict = order.error ? { rows: [], error: null } : await loadVerdict(order.address);
  const pool = order.error ? 0n : order.itemPrice + order.deposit * 2n;

  return (
    <ThemeShell>
      <main className="shell admin-page">
        <Link href="/admin/disputes" className="detail-back mono">back to disputes</Link>

        {order.error ? (
          <div className="card admin-error"><p>Could not read the chain: {order.error}</p></div>
        ) : (
          <>
            <header className="admin-head detail-head">
              <div>
                <h1>Order {orderId}</h1>
                <p>Everything recorded about this dispute, on-chain and off.</p>
              </div>
              <span className="state-badge">{STATE_LABELS[order.state]}</span>
            </header>

            <section className="admin-section">
              <div className="card detail-card">
                <div className="detail-grid">
                  <Field label="Escrow contract" mono>
                    <a href={`https://sepolia.etherscan.io/address/${order.address}`} target="_blank" rel="noreferrer">
                      {short(order.address)}
                    </a>
                  </Field>
                  <Field label="Seller" mono>{short(order.seller)}</Field>
                  <Field label="Buyer" mono>{short(order.buyer)}</Field>
                  <Field label="Item price" mono>{formatEther(order.itemPrice)} ETH</Field>
                  <Field label="Deposit each side" mono>{formatEther(order.deposit)} ETH</Field>
                  <Field label="Pool at stake" mono>{formatEther(pool)} ETH</Field>
                  <Field label="Held right now" mono>{formatEther(order.balance)} ETH</Field>
                  <Field label="Created" mono>{whenFrom(order.createdAt) || '-'}</Field>
                  <Field label="Buyer joined" mono>{whenFrom(order.activeAt) || '-'}</Field>
                  <Field label="Request opened" mono>{whenFrom(order.requestedAt) || '-'}</Field>
                </div>

                <div className="detail-desc">
                  <span className="detail-label">What the seller advertised</span>
                  <p>{order.description}</p>
                </div>
              </div>
            </section>

            <section className="admin-section">
              <div className="admin-section-title"><h2>Evidence the agent sees</h2></div>
              <div className="detail-photos">
                <Photo label="Listed" caption="what the seller advertised" hash={order.orderedHash} />
                <Photo label="Dispatched" caption="photographed as it shipped" hash={order.shippedHash} />
                <Photo label="Arrived" caption="photographed by the buyer" hash={order.receivedHash} />
              </div>
            </section>

            <section className="admin-section">
              <div className="admin-section-title"><h2>Verdict</h2></div>

              {verdict.error && (
                <div className="card admin-error"><p>Could not read Firestore: {verdict.error}</p></div>
              )}

              {!verdict.error && verdict.rows.length === 0 && (
                <p className="admin-empty">No verdict recorded. The agent has not settled this one yet.</p>
              )}

              {verdict.rows.map((row, i) => (
                <div className="card detail-card" key={row.txHash || i}>
                  <div className="admin-row-head">
                    <span className={`admin-verdict ${row.decision === 'release' ? 'release' : 'refund'}`}>
                      {row.decision === 'release' ? 'released to seller' : 'refunded to buyer'}
                    </span>
                    {row.resolvedAt && (
                      <span className="mono detail-when">{row.resolvedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
                    )}
                  </div>
                  <p className="detail-reason">{row.reason}</p>
                  <div className="detail-grid">
                    <Field label="Model" mono>{row.model || 'unknown'}</Field>
                    <Field label="Transaction" mono>
                      {row.txHash ? (
                        <a href={`https://sepolia.etherscan.io/tx/${row.txHash}`} target="_blank" rel="noreferrer">
                          {short(row.txHash)}
                        </a>
                      ) : '-'}
                    </Field>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </ThemeShell>
  );
}
