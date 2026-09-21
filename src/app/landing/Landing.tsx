'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, FileText, Gauge, LineChart, Layers3, ShieldCheck } from 'lucide-react';
import { brand, defaultBranding } from '../../brand/brand';
import { applications } from '../../sizing/applications';
import { enclosures, enclosureEnergyKWh, enclosureCellCount, byId } from '../../catalog/products';
import { suppliedRetention } from '../../sizing/engine';
import { BessWireframe } from './BessWireframe';
import { BuildQuestion } from './BuildQuestion';
import './landing.css';

const reference = byId(enclosures, 'enc-5mwh-20ft');

const capabilities = [
  { n: '01', icon: Gauge, title: 'Application-led sizing', body: `${applications.length} duty-cycle presets from peak shaving to grid forming. Power, duration, cycles, depth of discharge and site conditions are sliders, and the fleet resizes as you move them.` },
  { n: '02', icon: LineChart, title: 'Degradation you can edit', body: 'A year-by-year retention schedule, seeded from the supplied curve and editable per year, with cohort ageing so augmented capacity ages from its own installation year.' },
  { n: '03', icon: Layers3, title: 'The assembly, not a render', body: `A parametric ${reference.model} down to all ${enclosureCellCount(reference).toLocaleString()} cells — busbars, HV runs, coolant loops and BMS routing, with clearance and collision checks.` },
  { n: '04', icon: Boxes, title: 'Landed cost, not a guess', body: 'FOB, ocean freight, CIF, exchange, customs duty and inland clearance, or a direct rate card. Supply-only or turnkey, in six currencies.' },
  { n: '05', icon: FileText, title: 'An offer in one click', body: 'A four-page technical and commercial proposal generated from the project, with the cut-away, the energy schedule and the price build-up that reconciles with its own order value.' },
  { n: '06', icon: ShieldCheck, title: 'Every customer, one record', body: 'Multi-tenant workspace with roles, an append-only audit trail and white-label branding, so what leaves the building carries your name.' },
];

const steps = [
  { label: 'Step 01', title: 'Capture the customer', body: 'Account, contacts, segment and pipeline stage. Everything that follows hangs off this record.' },
  { label: 'Step 02', title: 'Size the plant', body: 'Pick the duty cycle, move the sliders, and read the fleet, the losses and the ageing straight back.' },
  { label: 'Step 03', title: 'Open the assembly', body: 'Carry the configuration into the 3D studio, check the build, and capture the view for the offer.' },
  { label: 'Step 04', title: 'Issue the offer', body: 'Raise the quotation, edit the narrative, and print or export the four-page proposal.' },
];

export function Landing() {
  const energyMWh = enclosureEnergyKWh(reference) / 1000;
  const [asking, setAsking] = useState(false);
  // `?build=1` opens the question straight away, so "New design" in the workbench lands on it
  // rather than on the marketing page with the question still closed.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('build')) setAsking(true);
  }, []);
  return (
    <div className="landing">
      <nav className="l-nav">
        <span className="mark"><img src={brand.wordmarkLight} alt={brand.vendor} /></span>
        <div className="spacer" />
        <div className="links">
          <a href="#capabilities">Capabilities</a>
          <a href="#workflow">Workflow</a>
          <a href={brand.vendorUrl} target="_blank" rel="noreferrer">jouleWise</a>
        </div>
        <Link className="l-btn" href="/sign-in/">Sign in</Link>
      </nav>

      <header className="l-hero">
        <BessWireframe className="l-canvas" />
        <div className="l-scrim" aria-hidden="true" />
        <div className={`l-hero-inner${asking ? ' asking' : ''}`}>
          <div className="l-eyebrow l-label">{defaultBranding.displayName} · Battery Energy Storage</div>
          <h1 className="l-title">BESS <span className="thin">Studio</span></h1>
          <p className="l-tagline">Your BESS design studio is here.</p>
          <div className="l-cta">
            <button className="l-btn primary" onClick={() => setAsking(true)}>Start building <ArrowRight size={14} /></button>
            <a className="l-btn" href="#capabilities">See what it does</a>
          </div>
          {asking && <BuildQuestion onClose={() => setAsking(false)} />}
        </div>
        <div className="l-readout">
          {[
            [`${energyMWh.toFixed(3)} MWh`, 'Reference enclosure'],
            [`${enclosureCellCount(reference).toLocaleString()}`, 'Cells modelled per unit'],
            [`${suppliedRetention.length - 1} years`, 'Degradation schedule'],
            ['4 pages', 'Offer, print ready'],
          ].map(([value, label]) => (
            <div key={label}><b>{value}</b><span className="l-label">{label}</span></div>
          ))}
        </div>
      </header>

      <section className="l-section" id="capabilities">
        <div className="l-label">Capabilities</div>
        <h2>Sizing, engineering and quotation against one customer record.</h2>
        <p className="lede">
          Storage deals are lost in the gap between the spreadsheet that sized the plant, the drawing that
          proved it fits and the document that priced it. The studio closes that gap: one configuration
          drives the ageing model, the assembly and the offer, so the numbers on the proposal are the
          numbers the engineer signed off.
        </p>
        <div className="l-grid">
          {capabilities.map(c => (
            <article key={c.n}>
              <span className="num">{c.n}</span>
              <c.icon size={20} strokeWidth={1.5} style={{ display: 'block', marginTop: 16, color: 'var(--l-muted)' }} />
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="l-section" id="workflow">
        <div className="l-label">Workflow</div>
        <h2>From a first meeting to a priced proposal, without leaving the tab.</h2>
        <div className="l-steps">
          {steps.map(s => (
            <article key={s.label}>
              <span className="l-label">{s.label}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
        <div className="l-cta" style={{ justifyContent: 'flex-start', marginTop: 44, animation: 'none', opacity: 1, transform: 'none' }}>
          <Link className="l-btn primary" href="/sign-in/">Open the demo workspace <ArrowRight size={14} /></Link>
        </div>
        <p className="lede" style={{ marginTop: 18, fontSize: 13 }}>
          The demonstration workspace runs entirely in your browser, seeded with a reference pipeline.
          Nothing leaves the machine and no account is needed.
        </p>
      </section>

      <footer className="l-foot">
        <img src={brand.wordmarkLight} alt={brand.vendor} />
        <span className="l-label">{brand.credit} · <a className="accent" href={brand.vendorUrl} target="_blank" rel="noreferrer">{brand.vendorDomain}</a></span>
        <div className="spacer" />
        <span className="l-label">{brand.copyright()}</span>
      </footer>
    </div>
  );
}
