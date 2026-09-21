import type { NextConfig } from 'next';

/**
 * Static export: the whole studio runs in the browser against Firebase, so there is nothing to
 * render on a server. `out/` is what Firebase Hosting publishes.
 *
 * Record pages therefore carry their identifier in the query string rather than the path — a
 * static export cannot pre-render a route for an identifier that will not exist until a customer
 * is created.
 */
const nextConfig: NextConfig = {
  output: 'export',
  // Directory-style URLs export as index.html files, which any static host serves without rules.
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // The repository keeps its own agent guidance; no generated rules files.
  agentRules: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
