import { NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ESCROW_ABI, FACTORY_ABI, STATE } from '../../../../lib/escrowAbi';

// Firestore riêng cho route này (không import app/firebase.js vì file đó có
// 'use client' — tránh để boundary client/server mập mờ trong route handler).
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(firebaseApp);

export async function POST(req) {
  // 1. Header secret token — kiểm tra trước tiên, sai thì dừng ngay, không đọc body.
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || token !== process.env.ESCROWMAD_GATEWAY_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate body — không tin riêng policy của Latch.
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orderId, decision, reason } = body;

  if (!Number.isInteger(orderId) || orderId < 0) {
    return NextResponse.json({ error: 'orderId must be a non-negative integer' }, { status: 400 });
  }
  if (decision !== 'release' && decision !== 'refund') {
    return NextResponse.json({ error: 'decision must be "release" or "refund"' }, { status: 400 });
  }
  if (typeof reason !== 'string' || reason.length === 0 || reason.length > 500) {
    return NextResponse.json({ error: 'reason must be a non-empty string (max 500 chars)' }, { status: 400 });
  }

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  // orderId = index trong EscrowFactory.allEscrows (xem implementation-notes.md)
  let escrowAddress;
  try {
    escrowAddress = await publicClient.readContract({
      address: process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'allEscrows',
      args: [BigInt(orderId)],
    });
  } catch {
    return NextResponse.json({ error: 'orderId not found' }, { status: 404 });
  }

  // 3. Xác nhận đang Disputed — không phải thì không gửi tx.
  const state = await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'getState',
  });

  if (state !== STATE.DISPUTED) {
    return NextResponse.json({ error: 'Order is not in Disputed state' }, { status: 409 });
  }

  // 4. Ký và gửi tx bằng ví agent.
  const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  const releaseToSeller = decision === 'release';

  let txHash;
  try {
    txHash = await walletClient.writeContract({
      address: escrowAddress,
      abi: ESCROW_ABI,
      functionName: 'resolveDispute',
      args: [releaseToSeller],
    });
  } catch (err) {
    return NextResponse.json({ error: err.shortMessage || err.message }, { status: 500 });
  }

  // 5. Trả về ngay — KHÔNG chờ tx confirm (tránh bị cắt giữa chừng bởi timeout
  // của Vercel serverless / Latch).
  const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;

  // 6. Ghi record vào Firebase — chỉ để log/audit, KHÔNG được làm hỏng response
  // thành công vì tx đã lên chain rồi (tiền đã chuyển xong ở bước 4-5).
  try {
    await addDoc(collection(db, 'disputeResolutions'), {
      orderId,
      decision,
      reason,
      txHash,
      resolvedAt: serverTimestamp(),
      model: process.env.AGENT_MODEL_NAME || 'unknown',
    });
  } catch (err) {
    console.error('[resolve-dispute] Failed to log to Firebase (tx already sent):', err.message);
  }

  return NextResponse.json({
    ok: true,
    orderId,
    decision,
    txHash,
    explorerUrl,
  });
}
