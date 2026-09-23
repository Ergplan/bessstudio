import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
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
 * Typefaces are in this repository, and are served from the export itself.
 *
 * Loading them from a third party at run time made the first paint of every page a flash of
 * Segoe UI or Helvetica before the real face arrived, and put the look of the product behind a
 * request that a corporate proxy, an offline laptop or a customer sitting in a substation can all
 * refuse. `next/font/google` fixed the run-time request by fetching at build time instead — which
 * moved the dependency rather than removing it, and made `npm run dev` fail outright on a machine
 * that cannot reach fonts.googleapis.com, with a resolver error naming a Turbopack internal module
 * rather than the network. A build should not need the internet to render the product's own type.
 *
 * So the faces are vendored: the Latin subsets of Inter and IBM Plex Mono, both under the SIL Open
 * Font License, about 126 kB in total, checked in beside this file. The fallback stacks stay in
 * the CSS for the case where a face somehow fails to load.
 */
const inter = localFont({
  variable: '--font-sans', display: 'swap',
  src: [
    { path: './fonts/Inter-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Inter-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Inter-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Inter-Bold.woff2', weight: '700', style: 'normal' },
  ],
});
const plexMono = localFont({
  variable: '--font-mono', display: 'swap',
  src: [
    { path: './fonts/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
});

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
