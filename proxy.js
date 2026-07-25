// Next.js 16 doi ten "middleware" thanh "proxy". Dat ten file la middleware.js
// thi no KHONG chay, va trang admin se mo toang ma nhin ben ngoai van tuong la
// da khoa. Xem node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from './lib/adminSession';

// Chi kiem tra so bo (co cookie hay khong) theo dung khuyen nghi cua Next:
// proxy chay tren moi request ke ca prefetch nen khong lam viec nang o day.
// Xac minh chu ky that nam trong app/admin/disputes/page.jsx.
export function proxy(request) {
  if (!request.cookies.has(ADMIN_COOKIE)) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/admin/disputes/:path*',
};
