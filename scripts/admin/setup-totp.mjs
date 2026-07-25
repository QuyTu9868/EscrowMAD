// Chay 1 lan de tao secret cho Google Authenticator.
//
//   node scripts/admin/setup-totp.mjs
//
// Script chi IN ra man hinh, khong ghi vao file nao, khong gui di dau.
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';

const secret = generateSecret();
const uri = generateURI({ issuer: 'EscrowMAD', label: 'admin', secret });
const sessionSecret = randomBytes(32).toString('hex');

console.log('\nQuet ma QR nay bang Google Authenticator:\n');
console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));

console.log('Neu khong quet duoc, nhap tay ma nay vao app:');
console.log(`  ${secret}\n`);

console.log('Roi them 2 dong sau vao .env.local (va ca Environment Variables tren Vercel):\n');
console.log(`ADMIN_TOTP_SECRET=${secret}`);
console.log(`ADMIN_SESSION_SECRET=${sessionSecret}\n`);

console.log('Luu y:');
console.log('- Doi ADMIN_SESSION_SECRET se dang xuat moi phien dang nhap hien co.');
console.log('- Mat ADMIN_TOTP_SECRET thi phai chay lai script nay va quet lai QR.');
console.log('- Khong commit 2 gia tri nay len git.\n');
