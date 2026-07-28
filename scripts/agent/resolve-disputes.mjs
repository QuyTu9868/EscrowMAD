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
import sharp from 'sharp';
import { ESCROW_ABI, FACTORY_ABI, STATE } from '../../lib/escrowAbi.mjs';

const MAX_REASON_LENGTH = 500; // khop policy payload cua Latch
const GROQ_URL = process.env.GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

// Cho giua cac don cho khoi cham tran 8000 token/phut cua goi free.
// Do thuc te tren don XAU NHAT (3 anh o ty le dat nhat + prompt that): 5676
// token. Mot don luon lot, hai don lien tiep thi khong bao gio lot.
const GROQ_DELAY_MS = Number(process.env.GROQ_DELAY_MS ?? 62_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Thieu bien moi truong ${name}. Xem scripts/agent/.env.example`);
    process.exit(1);
  }
  return value;
}

// Tai anh tu IPFS, thu nho roi doi sang base64 de gui cho Groq.
//
// THU NHO KHONG GIAM DUOC TOKEN NAO. Token chi phu thuoc TY LE khung hinh,
// khong phu thuoc so pixel lan dung luong file. Do thuc te:
//   256x256 PNG 193KB va 256x256 JPEG 7KB  -> deu 1282 token
//   64x64 va 2048x2048                     -> deu 1282 token
//   3000x4000 va 300x400 (cung ty le 3:4)  -> deu 1794 token
// resize() giu nguyen ty le nen gia khong doi. Ty le dat nhat do duoc la
// 1.25 (1794 token/anh), tuc don 3 anh ton toi da 5676 token - luon duoi
// tran 8000/phut BAT KE anh to nho the nao.
//
// Van thu nho vi hai ly do khac han: Groq chan base64 o 4MB ma anh dien
// thoai that co the 3-5MB (base64 con phinh them ~1.37 lan), va gui 12KB
// thay vi 116KB thi request nhanh hon nhieu.
const MAX_EDGE = Number(process.env.IMAGE_MAX_EDGE ?? 768);

async function fetchImageAsDataUrl(ipfsHash) {
  const res = await fetch(`${IPFS_GATEWAY}${ipfsHash}`);
  if (!res.ok) {
    throw new Error(`Khong tai duoc anh ${ipfsHash}: HTTP ${res.status}`);
  }
  const original = Buffer.from(await res.arrayBuffer());

  const resized = await sharp(original)
    .rotate() // giu dung huong theo EXIF, anh chup dien thoai hay bi xoay
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return `data:image/jpeg;base64,${resized.toString('base64')}`;
}

// Groq hay boc JSON trong ```json ... ```, phai boc ra truoc khi parse.
function stripCodeFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : trimmed;
}

async function askGroq({ apiKey, description, orderedImage, shippedImage, receivedImage }) {
  const prompt = [
    'You are resolving an escrow dispute between a seller and a buyer.',
    `The seller advertised this item: "${description}".`,
    'Images are given in order:',
    '1. What the seller advertised when listing the item.',
    shippedImage ? '2. What the seller photographed as they shipped it.' : null,
    `${shippedImage ? '3' : '2'}. What the buyer photographed when it arrived.`,
    '',
    shippedImage
      ? 'If the item left the seller intact but arrived damaged, that points to shipping, not to the seller misrepresenting it.'
      : null,
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
      // Qwen 3.6 la model CO SUY LUAN: mac dinh no xuat khoi <think> vao
      // content, lam JSON mode loai bo response (json_validate_failed voi
      // failed_generation rong). Suy luan con ngon het 2048 token output
      // truoc khi kip tra loi. Tat han bang reasoning_effort: none.
      reasoning_effort: 'none',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: orderedImage } },
            ...(shippedImage ? [{ type: 'image_url', image_url: { url: shippedImage } }] : []),
            { type: 'image_url', image_url: { url: receivedImage } },
          ],
        },
      ],
    }),
  });

  const raw = await res.text();
  if (res.status === 429) {
    throw new Error(
      `Groq tu choi vi vuot gioi han token moi phut (TPM).\n` +
      `Moi don ton toi da ~5700 token ma goi free chi cho 8000/phut, nen chi\n` +
      `chay duoc dung MOT don moi phut. Doi mot phut roi chay lai, hoac tang\n` +
      `GROQ_DELAY_MS. Thu nho anh KHONG giup gi - xem chu thich o MAX_EDGE.\n` +
      `Nguyen van: ${raw}`,
    );
  }
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

  for (const [index, orderId] of disputed.entries()) {
    if (index > 0 && GROQ_DELAY_MS > 0) {
      console.log(`(cho ${GROQ_DELAY_MS / 1000}s cho han muc token cua Groq reset)\n`);
      await sleep(GROQ_DELAY_MS);
    }

    const address = addresses[orderId];
    console.log(`--- Order ${orderId} (${address}) ---`);

    const [description, orderedHash, shippedHash, receivedHash] = await Promise.all([
      client.readContract({ address, abi: ESCROW_ABI, functionName: 'itemDescription' }),
      client.readContract({ address, abi: ESCROW_ABI, functionName: 'itemImageHash' }),
      client.readContract({ address, abi: ESCROW_ABI, functionName: 'deliveryProofHash' }),
      client.readContract({ address, abi: ESCROW_ABI, functionName: 'returnEvidenceHash' }),
    ]);

    // Khong du bang chung thi khong phan xu - bo qua, khong doan.
    if (!orderedHash || !receivedHash) {
      console.log(`  BO QUA: thieu anh (ordered=${orderedHash || 'trong'}, received=${receivedHash || 'trong'})\n`);
      continue;
    }

    // Anh luc gui hang la tuy chon: don cu chua co, va contract khong bat buoc.
    const [orderedImage, receivedImage, shippedImage] = await Promise.all([
      fetchImageAsDataUrl(orderedHash),
      fetchImageAsDataUrl(receivedHash),
      shippedHash ? fetchImageAsDataUrl(shippedHash).catch(() => null) : null,
    ]);
    if (shippedImage) console.log('  (co ca anh luc gui hang)');

    const { decision, reason } = await askGroq({
      apiKey: groqApiKey, description, orderedImage, shippedImage, receivedImage,
    });
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
