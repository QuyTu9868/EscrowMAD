'use client';

import { useEffect } from 'react';

/**
 * Cho moi phan tu co class .reveal hien dan khi cuon toi.
 *
 * Dung IntersectionObserver chu khong nghe su kien scroll: nghe scroll chay
 * tren moi khung hinh va lam giat trang.
 *
 * Ai bat "giam chuyen dong" trong he dieu hanh thi hien luon, khong animate.
 */
export function useReveal(deps = []) {
  useEffect(() => {
    const nodes = document.querySelectorAll('.reveal:not(.is-visible)');
    if (!nodes.length) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
