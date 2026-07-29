// Xoa cac ban ghi disputeResolutions khong co escrowAddress.
//
//   node --env-file=.env.local scripts/admin/purge-legacy-verdicts.mjs         (chi xem)
//   node --env-file=.env.local scripts/admin/purge-legacy-verdicts.mjs --delete (xoa that)
//
// Vi sao phai xoa: ban ghi cu chi luu orderId, ma orderId la chi so trong
// allEscrows nen ve 0 moi lan deploy lai factory, va chain local dung chung
// Firebase voi Sepolia. Khong cach nao biet chung thuoc escrow nao, nen trang
// admin da tung gan phan quyet cua escrow nay cho escrow khac.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

const snapshot = await getDocs(collection(db, 'disputeResolutions'));
const legacy = snapshot.docs.filter((d) => !d.data().escrowAddress);

console.log(`Tong so ban ghi   : ${snapshot.size}`);
console.log(`Thieu escrowAddress: ${legacy.length}\n`);

if (legacy.length === 0) {
  console.log('Khong co gi de xoa.');
  process.exit(0);
}

for (const d of legacy) {
  const v = d.data();
  console.log(`  ${d.id}  order ${v.orderId}  ${v.decision}  ${String(v.reason).slice(0, 60)}...`);
}

if (!process.argv.includes('--delete')) {
  console.log('\nDay moi la xem thu. Chay lai kem --delete de xoa that.');
  process.exit(0);
}

console.log('\nDang xoa...');
let done = 0;
for (const d of legacy) {
  try {
    await deleteDoc(doc(db, 'disputeResolutions', d.id));
    done++;
  } catch (err) {
    console.error(`  That bai ${d.id}: ${err.code || err.message}`);
    if (String(err.code).includes('permission-denied')) {
      console.error('\nFirestore Rules chua cho phep delete tren disputeResolutions.');
      console.error('Hoac mo quyen delete tam thoi, hoac xoa tay tren Firebase Console theo cac id o tren.');
      process.exit(1);
    }
  }
}
console.log(`\nDa xoa ${done}/${legacy.length} ban ghi.`);
process.exit(0);
