// KHÔNG CÒN DÙNG — kiến trúc review đã đơn giản hoá lại thành ghi thẳng từ
// client (giống chat), không cần Firebase Admin key / service account nữa.
// Giữ file rỗng này lại chỉ vì môi trường hiện tại không xoá được file,
// không có chỗ nào trong code còn import file này.
// LƯU Ý: không import package 'firebase-admin' ở đây nữa — package đó chưa
// từng được `npm install` thật trên máy bạn, import nó sẽ làm cả app crash
// (đã xảy ra và được sửa ngày 2026-07-12).
export function getAdminDb() {
  throw new Error('firebaseAdmin.js không còn được dùng — xem app/components/ReviewPanel.jsx (ghi thẳng từ client).');
}
