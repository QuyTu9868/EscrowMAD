// Session cho trang admin. Ky bang HMAC-SHA256 qua Web Crypto de chay duoc
// ca trong proxy.js (Edge runtime, khong co node:crypto) lan trong route handler.
//
// Khong dung JWT hay thu vien session vi chi co dung 1 admin, khong co user list.

export const ADMIN_COOKIE = 'escrowmad_admin';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 tieng

const encoder = new TextEncoder();

async function getKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('Thieu ADMIN_SESSION_SECRET');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(buffer) {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Gia tri cookie co dang "<han dung>.<chu ky>". Han dung nam trong phan duoc ky
// nen khong sua duoc ma khong lam hong chu ky.
export async function createSessionValue(ttlMs = SESSION_TTL_MS) {
  const expiry = Date.now() + ttlMs;
  const key = await getKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(String(expiry)));
  return `${expiry}.${toBase64Url(signature)}`;
}

export async function isSessionValid(value) {
  if (!value) return false;

  const separator = value.lastIndexOf('.');
  if (separator <= 0) return false;

  const expiryText = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;

  try {
    const key = await getKey();
    return await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(expiryText));
  } catch {
    return false;
  }
}
