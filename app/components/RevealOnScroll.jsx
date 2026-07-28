'use client';

import { useReveal } from '../hooks/useReveal';

/**
 * Kich hoat hieu ung hien dan cho moi phan tu .reveal tren trang.
 *
 * Tach thanh component rieng de dat duoc vao Server Component (trang admin la
 * server component nen khong tu goi hook duoc).
 */
export default function RevealOnScroll() {
  useReveal();
  return null;
}
