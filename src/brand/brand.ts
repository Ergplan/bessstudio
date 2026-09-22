// Platform identity. jouleWise Technologies builds and operates the studio; each organization on
// the platform carries its own white-label branding on customer-facing output.
export const brand = Object.freeze({
  platform: 'BESS Studio',
  tagline: 'Sizing, engineering visualisation and quotation for battery energy storage',
  vendor: 'jouleWise Technologies',
  vendorShort: 'jouleWise',
  vendorUrl: 'https://www.joulewise.com',
  vendorDomain: 'www.joulewise.com',
  vendorEmail: 'hello@joulewise.com',
  credit: 'Developed and managed by jouleWise Technologies',
  creditLong: 'Developed and managed by jouleWise Technologies (www.joulewise.com)',
  wordmark: '/brand/joulewise-wordmark.svg',
  wordmarkLight: '/brand/joulewise-wordmark-light.svg',
  mark: '/brand/joulewise-mark.svg',
  // Sampled from the jouleWise wordmark.
  gold: '#C8A415',
  goldLight: '#E3C64A',
  ink: '#4A3A07',
  copyright: (year = new Date().getFullYear()) => `© ${year} jouleWise Technologies. All rights reserved.`,
  qualification: 'Concept engineering output. Equipment ratings, detailed mechanical design, grid compliance and usable AC performance require validation before contract.',
});

export type Branding = {
  displayName: string; legalName: string; logo: string | null;
  primary: string; primaryDark: string; accent: string; surface: string; slate: string;
  website: string; email: string; phone: string; address: string;
};

/**
 * Default tenant branding, taken from the Solarworld corporate deck:
 * navy #25455F and green #93BE49 are the logo colours, with the deck's slate and surface tones.
 */
export const defaultBranding: Branding = {
  displayName: 'Solarworld', legalName: 'Solarworld Energy Infrastructure', logo: '/brand/solarworld-logo.png',
  primary: '#25455F', primaryDark: '#153956', accent: '#93BE49', surface: '#F8FAFB', slate: '#465469',
  website: 'https://www.worldsolar.in', email: 'info@worldsolar.in', phone: '+91 98103 48459',
  address: 'Roorkee, Uttarakhand, India',
};

/** Deck palette, reused for charts and status colours so the app reads as one system. */
export const palette = Object.freeze({
  navy: '#25455F', navyDeep: '#153956', ink: '#1D293B', slate: '#465469', slateLight: '#61738D',
  green: '#93BE49', greenSoft: '#A5C249', teal: '#0FB981', tealDeep: '#054E3B',
  blue: '#5D88CF', surface: '#F8FAFB', gold: '#C8A415',
});
