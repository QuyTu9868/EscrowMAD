'use client';

import dynamic from 'next/dynamic';
import { Space_Mono, Syne } from 'next/font/google';
import './globals.css';

const Providers = dynamic(() => import('./providers').then(mod => mod.Providers), { ssr: false });

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
});

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-syne',
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${spaceMono.variable} ${syne.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}