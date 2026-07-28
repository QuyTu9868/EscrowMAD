'use client';

import { useEffect, useState } from 'react';
import { SunIcon, MoonIcon } from './Icons';

const STORAGE_KEY = 'escrowmad_theme';

/**
 * Boc noi dung trong class theme-light / theme-dark.
 *
 * Bang mau nam trong 2 class do, khong co thi --surface, --border... deu
 * undefined va card mat nen lan vien. Server Component khong doc duoc
 * localStorage nen phai tach ra client component nhu the nay.
 */
export default function ThemeShell({ children, showToggle = true }) {
  const [light, setLight] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setLight(saved === 'light');
  }, []);

  function toggle() {
    setLight((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? 'light' : 'dark');
      return next;
    });
  }

  return (
    <div className={light ? 'theme-light' : 'theme-dark'} style={{ minHeight: '100vh' }}>
      {showToggle && (
        <button
          className="theme-toggle theme-toggle-floating"
          onClick={toggle}
          aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {light ? <MoonIcon size={15} /> : <SunIcon size={15} />}
        </button>
      )}
      {children}
    </div>
  );
}
