// Agent script - doc dispute tu contract, hoi Groq vision, gui de nghi qua Latch.
//
// Script nay KHONG cam private key va KHONG ky giao dich. No chi doc on-chain
// (read-only) va "de nghi" qua Latch. Viec ky nam o API route tren server.
// Neu thay minh can private key o day la da lam sai thiet ke.
//
// Chay:
//   node --env-file=scripts/agent/.env scripts/agent/resolve-disputes.mjs

import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { ESCROW_ABI, FACTORY_ABI, STATE } from '../../lib/escrowAbi.mjs';

const MAX_REASON_LENGTH = 500; // khop policy payload cua Latch
const GROQ_URL = process.env.GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Thieu bien moi truong ${name}. Xem scripts/agent/.env.example`);
    process.exit(1);
  }
  return value;
}

// Tai anh tu IPFS roi doi sang base64 data URL de gui cho Groq.
async function fetchImageAsDataUrl(ipfsHash) {
  const res = await fetch(`${IPFS_GATEWAY}${ipfsHash}`);
  if (!res.ok) {
    throw new Error(`Khong tai duoc anh ${ipfsHash}: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') || 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// Groq hay boc JSON trong ```json ... ```, phai boc ra truoc khi parse.
function stripCodeFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : trimmed;
}

async function askGroq({ apiKey, description, orderedImage, receivedImage }) {
  const prompt = [
    'You are resolving an escrow dispute between a seller and a buyer.',
    `The seller advertised this item: "${description}".`,
    'The FIRST image is what the seller advertised (ordered).',
    'The SECOND image is what the buyer says they actually received.',
    '',
    'Decide who is right:',
    '- "release" means the seller was honest, pay the seller.',
    '- "refund" means the item does not match, refund the buyer.',
    '',
    `Reply with raw JSON only. No markdown, no code fence, no extra text.`,
    `Format: {"decision": "release" | "refund", "reason": "<short explanation, max ${MAX_REASON_LENGTH} characters>"}`,
  ].join('\n');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: orderedImage } },
            { type: 'image_url', image_url: { url: receivedImage } },
          ],
        },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Groq tra ve HTTP ${res.status}: ${raw}`);
  }

  let content;
  try {
    content = JSON.parse(raw).choices[0].message.content;
  } catch {
    throw new Error(`Khong doc duoc response cua Groq: ${raw}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error(`Groq tra ve JSON hong. Noi dung nguyen van:\n${content}`);
  }

  // Khong tu doan, khong tu sua - sai format la dung han.
  if (parsed.decision !== 'release' && parsed.decision !== 'refund') {
    throw new Error(`Groq tra ve decision khong hop le: ${JSON.stringify(parsed.decision)}`);
  }
  if (typeof parsed.reason !== 'string' || parsed.reason.trim().length === 0) {
    throw new Error(`Groq khong dua ra ly do. Noi dung nguyen van:\n${content}`);
  }

  return {
    decision: parsed.decision,
    reason: parsed.reason.trim().slice(0, MAX_REASON_LENGTH),
  };
}

async function sendToLatch({ proxyUrl, apiKey, orderId, decision, reason }) {
  const url = `${proxyUrl.replace(/\/$/, '')}/api/agent/resolve-dispute`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ orderId, decision, reason }),
  });

  const raw = await res.text();
  if (!res.ok) {
    // Bi Latch chan la TINH NANG, khong phai bug. In nguyen van roi dung.
    throw new Error(`Latch tu choi (HTTP ${res.status}). Nguyen van:\n${raw}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Latch tra ve response khong phai JSON:\n${raw}`);
  }
}

async function main() {
  const groqApiKey = requireEnv('GROQ_API_KEY');
  const latchProxyUrl = requireEnv('LATCH_PROXY_URL');
  const latchApiKey = requireEnv('LATCH_API_KEY');
  const rpcUrl = requireEnv('RPC_URL');
  const factoryAddress = requireEnv('FACTORY_ADDRESS');

  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

  const total = await client.readContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: 'getTotalEscrows',
  });

  console.log(`Tong so escrow: ${total}`);
  if (total === 0n) {
    console.log('Chua co escrow nao.');
    return;
  }

  // orderId = index trong allEscrows (xem contracts/implementation-notes.md)
  const orderIds = Array.from({ length: Number(total) }, (_, i) => i);
  const addresses = await Promise.all(
    orderIds.map((id) =>
      client.readContract({ address: factoryAddress, abi: FACTORY_ABI, functionName: 'allEscrows', args: [BigInt(id)] }),
    ),
  );
  const states = await Promise.all(
    addresses.map((address) => client.readContract({ address, abi: ESCROW_ABI, functionName: 'getState' })),
  );

  const disputed = orderIds.filter((id) => states[id] === STATE.DISPUTED);
  if (disputed.length === 0) {
    console.log('Khong co dispute nao dang cho xu ly.');
    return;
  }
  console.log(`Co ${disputed.length} dispute dang cho: ${disputed.join(', ')}\n`);

  for (const orderId of disputed) {
    const address = addresses[orderId];
    console.log(`--- Order ${orderId} (${address}) ---`);

    const [description, orderedHash, receivedHash] = await Promise.all([
      client.readContract({ address, abi: ESCROW_ABI, functionName: 'itemDescription' }),
      client.readContract({ address, abi: ESCROW_ABI, functionName: 'itemImageHash' }),
      client.readContract({ address, abi: ESCROW_ABI, functionName: 'returnEvidenceHash' }),
    ]);

    // Khong du bang chung thi khong phan xu - bo qua, khong doan.
    if (!orderedHash || !receivedHash) {
      console.log(`  BO QUA: thieu anh (ordered=${orderedHash || 'trong'}, received=${receivedHash || 'trong'})\n`);
      continue;
    }

    const [orderedImage, receivedImage] = await Promise.all([
      fetchImageAsDataUrl(orderedHash),
      fetchImageAsDataUrl(receivedHash),
    ]);

    const { decision, reason } = await askGroq({ apiKey: groqApiKey, description, orderedImage, receivedImage });
    console.log(`  Groq: ${decision} - ${reason}`);

    const result = await sendToLatch({
      proxyUrl: latchProxyUrl,
      apiKey: latchApiKey,
      orderId,
      decision,
      reason,
    });
    console.log(`  Da gui. Tx: ${result.explorerUrl || result.txHash}\n`);
  }
}

main().catch((err) => {
  console.error(`\nDUNG: ${err.message}`);
  process.exit(1);
});
