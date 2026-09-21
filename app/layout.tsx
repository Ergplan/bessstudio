import type { Metadata, Viewport } from 'next';
import { brand } from '../src/brand/brand';
import { SessionProvider } from '../src/platform/auth';
import './globals.css';

export const metadata: Metadata = {
  title: `${brand.platform} · ${brand.vendor}`,
  description: `${brand.tagline}. ${brand.creditLong}.`,
  icons: { icon: brand.mark },
  applicationName: brand.platform,
  authors: [{ name: brand.vendor, url: brand.vendorUrl }],
};

export const viewport: Viewport = { themeColor: '#0B0E11' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
