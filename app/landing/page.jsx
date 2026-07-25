'use client';

// Route /landing đã gộp thẳng vào homepage ('/') — nội dung landing giờ
// chính là trang chủ khi chưa kết nối ví (xem LandingCards trong app/page.jsx).
// Giữ route này lại chỉ để redirect, tránh link cũ nào đó bị chết.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LandingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
