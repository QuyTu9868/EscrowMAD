import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { ADMIN_COOKIE, isSessionValid } from '../../../lib/adminSession';
import { ESCROW_ABI, FACTORY_ABI, STATE } from '../../../lib/escrowAbi';

// Trang doc du lieu song nen khong duoc cache.
export const dynamic = 'force-dynamic';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

// Dispute dang cho: khong nam trong Firestore ma nam tren chain (state == DISPUTED).
async function loadPending() {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
  if (!rpcUrl || !factoryAddress) return { items: [], error: 'Thieu NEXT_PUBLIC_RPC_URL hoac NEXT_PUBLIC_FACTORY_ADDRESS' };

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
async function loadResolved() {
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
    const items = snapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        id: entry.id,
        orderId: data.orderId,
        decision: data.decision,
        reason: data.reason,
        txHash: data.txHash,
        model: data.model,
        resolvedAt: data.resolvedAt?.toDate?.() ? data.resolvedAt.toDate().toISOString() : null,
      };
    });
    return { items, error: null };
  } catch (err) {
    return { items: [], error: err.message };
  }
}

function Evidence({ orderedHash, receivedHash }) {
  if (!orderedHash && !receivedHash) {
    return <p style={{ color: 'var(--muted)', fontSize: 13 }}>No evidence images on this order yet.</p>;
  }
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
      {[
        { label: 'Ordered', hash: orderedHash },
        { label: 'Received', hash: receivedHash },
      ].map(({ label, hash }) => (
        <figure key={label} style={{ margin: 0, flex: '1 1 180px', minWidth: 160 }}>
          <figcaption style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{label}</figcaption>
          {hash ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`${IPFS_GATEWAY}${hash}`}
              alt={label}
              style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
            />
          ) : (
            <div style={{ padding: 20, border: '1px dashed var(--border)', borderRadius: 'var(--radius)', color: 'var(--muted)', fontSize: 12 }}>
              missing
            </div>
          )}
        </figure>
      ))}
    </div>
  );
}

export default async function AdminDisputesPage() {
  // proxy.js chi kiem tra cookie co ton tai. Cho ky that duoc xac minh o day.
  const cookieStore = await cookies();
  const valid = await isSessionValid(cookieStore.get(ADMIN_COOKIE)?.value);
  if (!valid) redirect('/admin/login');

  const [pending, resolved] = await Promise.all([loadPending(), loadResolved()]);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 20px' }}>
      <h1 className="card-title" style={{ marginBottom: 4 }}>Disputes</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>
        Read-only. The agent decides and settles on-chain; nothing here can be changed by hand.
      </p>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Awaiting the agent ({pending.items.length})</h2>

        {pending.error && (
          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>Could not read the chain: {pending.error}</p>
          </div>
        )}

        {!pending.error && pending.items.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nothing waiting.</p>
        )}

        {pending.items.map((item) => (
          <div className="card" key={item.address} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong>Order #{item.orderId}</strong>
              <a
                className="etherscan-link mono"
                href={`https://sepolia.etherscan.io/address/${item.address}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12 }}
              >
                {item.address.slice(0, 8)}...{item.address.slice(-6)}
              </a>
            </div>
            <p style={{ fontSize: 14, marginTop: 6 }}>{item.description}</p>
            <Evidence orderedHash={item.orderedHash} receivedHash={item.receivedHash} />
          </div>
        ))}
      </section>

      <section>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Settled ({resolved.items.length})</h2>

        {resolved.error && (
          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>Could not read Firestore: {resolved.error}</p>
          </div>
        )}

        {!resolved.error && resolved.items.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>No dispute has been settled yet.</p>
        )}

        {resolved.items.map((item) => (
          <div className="card" key={item.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong>Order #{item.orderId}</strong>
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  color: item.decision === 'release' ? 'var(--success)' : 'var(--warn)',
                }}
              >
                {item.decision === 'release' ? 'RELEASED TO SELLER' : 'REFUNDED TO BUYER'}
              </span>
            </div>

            <p style={{ fontSize: 14, marginTop: 8 }}>{item.reason}</p>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              {item.resolvedAt && <span>{new Date(item.resolvedAt).toLocaleString()}</span>}
              {item.model && <span className="mono">{item.model}</span>}
              {item.txHash && (
                <a
                  className="etherscan-link mono"
                  href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  view transaction
                </a>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
