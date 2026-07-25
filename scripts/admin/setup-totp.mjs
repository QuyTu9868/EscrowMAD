// Chay 1 lan de tao secret cho Google Authenticator.
//
//   node scripts/admin/setup-totp.mjs
//
// Script KHONG in secret ra man hinh (tranh de secret lot vao log/transcript).
// Thay vao do no ghi thang vao .env.local va xuat ma QR ra file PNG de ban mo
// bang trinh xem anh roi quet.
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const ENV_PATH = '.env.local';
const QR_PATH = 'scripts/admin/admin-totp-qr.png';

const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
if (existing.includes('ADMIN_TOTP_SECRET=') && !process.argv.includes('--force')) {
  console.error('\n.env.local da co ADMIN_TOTP_SECRET.');
  console.error('Tao lai se lam ma trong Google Authenticator hien tai vo dung.');
  console.error('Van muon tao lai thi chay: node scripts/admin/setup-totp.mjs --force\n');
  process.exit(1);
}

const secret = generateSecret();
const sessionSecret = randomBytes(32).toString('hex');
const uri = generateURI({ issuer: 'EscrowMAD', label: 'admin', secret });

await QRCode.toFile(QR_PATH, uri, { width: 320, margin: 2 });

const block = [
  '',
  '# Admin login (TOTP). Sinh boi scripts/admin/setup-totp.mjs',
  `ADMIN_TOTP_SECRET=${secret}`,
  `ADMIN_SESSION_SECRET=${sessionSecret}`,
  '',
].join('\n');

if (existing && !existing.endsWith('\n')) appendFileSync(ENV_PATH, '\n');
appendFileSync(ENV_PATH, block);

console.log('\nXong. Khong co gia tri nhay cam nao duoc in ra man hinh.\n');
console.log(`1. Mo file ${QR_PATH} roi quet bang Google Authenticator.`);
console.log(`2. Hai bien ADMIN_TOTP_SECRET va ADMIN_SESSION_SECRET da duoc ghi vao ${ENV_PATH}.`);
console.log('3. Mo .env.local, copy 2 dong do sang Vercel > Settings > Environment Variables, roi redeploy.');
console.log(`4. Quet xong thi XOA file ${QR_PATH} (no chua secret duoi dang ma QR).\n`);
console.log('Luu y: doi ADMIN_SESSION_SECRET se dang xuat moi phien hien co.\n');
