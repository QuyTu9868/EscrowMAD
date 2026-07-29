import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { ADMIN_COOKIE, isSessionValid } from '../../../lib/adminSession';
import { ESCROW_ABI, FACTORY_ABI, STATE } from '../../../lib/escrowAbi';
import RevealOnScroll from '../../components/RevealOnScroll';
import ThemeShell from '../../components/ThemeShell';

// Trang doc du lieu song nen khong duoc cache.
export const dynamic = 'force-dynamic';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

// Doc mot lan danh sach escrow cua factory hien tai. Ca hai muc tren trang deu
// can no: muc dang cho de biet don nao DISPUTED, muc da xu de biet ban ghi
// Firestore nao thuoc ve factory nay.
async function loadChain() {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
  if (!rpcUrl || !factoryAddress) {
    return { ids: [], addresses: [], states: [], error: 'Thieu NEXT_PUBLIC_RPC_URL hoac NEXT_PUBLIC_FACTORY_ADDRESS' };
  }

  try {
    const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
    const total = await client.readContract({ address: factoryAddress, abi: FACTORY_ABI, functionName: 'getTotalEscrows' });

    const ids = Array.from({ length: Number(total) }, (_, i) => i);
    const addresses = await Promise.all(
      ids.map((id) => client.readContract({ address: factoryAddress, abi: FACTORY_ABI, functionName: 'allEscrows', args: [BigInt(id)] })),
    );
    const states = await Promise.all(
      addresses.map((address) => client.readContract({ address, abi: ESCROW_ABI, functionName: 'getState' })),
    );
    return { client, ids, addresses, states, error: null };
  } catch (err) {
    return { ids: [], addresses: [], states: [], error: err.shortMessage || err.message };
  }
}

// Dispute dang cho: khong nam trong Firestore ma nam tren chain (state == DISPUTED).
async function loadPending(chain) {
  if (chain.error) return { items: [], error: chain.error };

  try {
    const { client, ids, addresses, states } = chain;
    const disputedIds = ids.filter((id) => states[id] === STATE.DISPUTED);
    const items = await Promise.all(
      disputedIds.map(async (id) => {
        const address = addresses[id];
        const [description, orderedHash, receivedHash] = await Promise.all([
          client.readContract({ address, abi: ESCROW_ABI, functionName: 'itemDescription' }),
          client.readContract({ address, abi: ESCROW_ABI, functionName: 'itemImageHash' }),
          client.readContract({ address, abi: ESCROW_ABI, functionName: 'returnEvidenceHash' }),
        ]);
        return { orderId: id, address, description, orderedHash, receivedHash };
      }),
    );

    return { items, error: null };
  } catch (err) {
    return { items: [], error: err.shortMessage || err.message };
  }
}

// Dispute da xu ly: agent ghi vao Firestore sau khi gui tx.
//
// Chi giu ban ghi co escrowAddress thuoc factory dang dung. orderId khong dinh
// danh duoc gi: no la chi so trong allEscrows nen ve 0 moi lan deploy lai
// factory, va chain local dung chung Firebase voi Sepolia. Truoc khi loc, trang
// nay hien ca phan quyet cua nhung escrow da khong con ton tai.
async function loadResolved(chain) {
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

    const snapshot = await getDocs(query(collection(getFirestore(app), 'disputeResolutions'), orderBy('resolvedAt', 'desc')));

    // Dia chi cua factory hien tai, chu thuong de so khoi phu thuoc checksum.
    const known = new Map(chain.addresses.map((a, id) => [a.toLowerCase(), id]));

    const items = snapshot.docs
      .map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          escrowAddress: data.escrowAddress || null,
          orderId: data.orderId,
          decision: data.decision,
          reason: data.reason,
          txHash: data.txHash,
          model: data.model,
          resolvedAt: data.resolvedAt?.toDate?.() ? data.resolvedAt.toDate().toISOString() : null,
        };
      })
      // Ban ghi cu khong co escrowAddress thi khong the biet thuoc escrow nao,
      // bo qua thay vi doan theo orderId roi gan nham.
      .filter((item) => item.escrowAddress && known.has(item.escrowAddress))
      // orderId trong ban ghi co the la cua factory cu, lay lai theo dia chi.
      .map((item) => ({ ...item, orderId: known.get(item.escrowAddress) }));

    return { items, error: null };
  } catch (err) {
    return { items: [], error: err.message };
  }
}

// Don cu tu truoc khi co EvidenceModal luu thang chuoi 'evidence' vao contract
// thay vi hash IPFS. Render <img> voi no thi gateway tra 400 va trang hien anh vo.
const looksLikeIpfs = (h) => typeof h === 'string' && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{20,})/.test(h);

function Evidence({ orderedHash, receivedHash }) {
  if (!orderedHash && !receivedHash) return null;
  return (
    <div className="evidence-pair">
      {[
        { label: 'Ordered', hash: orderedHash },
        { label: 'Received', hash: receivedHash },
      ].map(({ label, hash }) => (
        <figure className="evidence-item" key={label}>
          <figcaption>{label}</figcaption>
          {!hash ? (
            <div className="evidence-missing">no image</div>
          ) : looksLikeIpfs(hash) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`${IPFS_GATEWAY}${hash}`} alt={label} />
          ) : (
            <div className="evidence-missing">not an IPFS hash</div>
          )}
        </figure>
      ))}
    </div>
  );
}

function SectionTitle({ children, count }) {
  return (
    <div className="admin-section-title">
      <h2>{children}</h2>
      <span className="admin-count">{count}</span>
    </div>
  );
}

export default async function AdminDisputesPage() {
  // proxy.js chi kiem tra cookie co ton tai. Cho ky that duoc xac minh o day.
  const cookieStore = await cookies();
  const valid = await isSessionValid(cookieStore.get(ADMIN_COOKIE)?.value);
  if (!valid) redirect('/admin/login');

  const chain = await loadChain();
  const [pending, resolved] = await Promise.all([loadPending(chain), loadResolved(chain)]);

  return (
    <ThemeShell>
      <main className="shell admin-page">
        <RevealOnScroll />

      <header className="admin-head">
        <h1>Disputes</h1>
        <p>
          Read only. The agent reviews the evidence and settles on-chain by itself.
          Nothing on this page can change an outcome.
        </p>
      </header>

      <section className="admin-section">
        <SectionTitle count={pending.items.length}>Awaiting the agent</SectionTitle>

        {pending.error && (
          <div className="card admin-error">
            <p>Could not read the chain: {pending.error}</p>
          </div>
        )}

        {!pending.error && pending.items.length === 0 && (
          <p className="admin-empty">Nothing waiting.</p>
        )}

        <div className="bento">
          {pending.items.map((item, index) => (
            <article className="card bento-wide reveal" key={item.address} style={{ '--index': index }}>
              <div className="admin-row-head">
                <span className="admin-order-id">Order {item.orderId}</span>
                <a
                  className="etherscan-link mono"
                  href={`https://sepolia.etherscan.io/address/${item.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.address.slice(0, 10)}...{item.address.slice(-8)}
                </a>
              </div>
              <p className="admin-desc">{item.description}</p>
              <Evidence orderedHash={item.orderedHash} receivedHash={item.receivedHash} />
              <Link href={`/admin/disputes/${item.orderId}`} className="admin-open">
                Open full record <span aria-hidden="true">&rarr;</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <SectionTitle count={resolved.items.length}>Settled</SectionTitle>

        {resolved.error && (
          <div className="card admin-error">
            <p>Could not read Firestore: {resolved.error}</p>
          </div>
        )}

        {!resolved.error && resolved.items.length === 0 && (
          <p className="admin-empty">No dispute has been settled yet.</p>
        )}

        <div className="bento">
          {resolved.items.map((item, index) => (
            <article className="card reveal" key={item.id} style={{ '--index': index }}>
              <div className="admin-row-head">
                <span className="admin-order-id">Order {item.orderId}</span>
                <span className={`admin-verdict ${item.decision === 'release' ? 'release' : 'refund'}`}>
                  {item.decision === 'release' ? 'Released to seller' : 'Refunded to buyer'}
                </span>
              </div>

              <p className="admin-reason">{item.reason}</p>

              <div className="admin-meta">
                {item.resolvedAt && <span>{new Date(item.resolvedAt).toLocaleString('en-GB')}</span>}
                {item.model && <span>{item.model}</span>}
                {item.txHash && (
                  <a
                    className="etherscan-link"
                    href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view transaction
                  </a>
                )}
              </div>
              <Link href={`/admin/disputes/${item.orderId}`} className="admin-open">
                Open full record <span aria-hidden="true">&rarr;</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
      </main>
    </ThemeShell>
  );
}
