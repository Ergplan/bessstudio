import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
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

/**
 * Typefaces are fetched at build time and served from the export itself.
 *
 * Loading them from a third party at run time made the first paint of every page a flash of
 * Segoe UI or Helvetica before the real face arrived, and put the look of the product behind a
 * request that a corporate proxy, an offline laptop or a customer sitting in a substation can all
 * refuse. The fallback stacks stay in the CSS for the case where a face somehow fails to load.
 */
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const viewport: Viewport = { themeColor: '#0B0E11' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
