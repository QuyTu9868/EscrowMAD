import { NextResponse } from 'next/server';

// KHÔNG CÒN DÙNG — route này thuộc kiến trúc review cũ (server verify chữ ký
// ví + đọc on-chain + ghi bằng Firebase Admin key). Đã đơn giản hoá lại thành
// ghi thẳng từ client (giống chat), xem app/components/ReviewPanel.jsx.
// Giữ file rỗng này lại vì môi trường hiện tại không xoá được file; không có
// request nào trong app gọi tới route này nữa.
export async function POST() {
  return NextResponse.json(
    { error: 'Route này không còn dùng — review giờ ghi thẳng từ client.' },
    { status: 410 }
  );
}
