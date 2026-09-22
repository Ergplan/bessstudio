'use client';
import { useState } from 'react';
import { brand, defaultBranding } from '../../brand/brand';
import { describeAuthError, useSession } from '../../platform/auth';
import { firebaseEnabled } from '../../platform/firebase';
import { publicOrgId } from '../../platform/joining';
import Link from 'next/link';

export function Login() {
  const { signIn, signUp, signInWithGoogle, signInAsDemo, resetPassword } = useSession();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [name, setName] = useState(''), [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [note, setNote] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(describeAuthError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,480px)' }}>
      <div style={{ background: 'linear-gradient(160deg,#0B0E12 0%,#08090B 58%,#0C1108 100%)', borderRight: '1px solid rgba(255,255,255,.07)', color: '#F2F5F7', padding: '56px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={defaultBranding.logo ?? ''} alt="" style={{ height: 46, background: '#fff', padding: 5 }} />
          <div><b style={{ fontSize: 17 }}>{defaultBranding.displayName}</b><br /><small style={{ color: '#5E6C79', letterSpacing: '.16em', fontSize: 10, fontFamily: 'var(--mono)' }}>{brand.platform.toUpperCase()}</small></div>
        </div>
        <div style={{ maxWidth: 520 }}>
          <h2 style={{ color: '#F2F5F7', fontSize: 34, lineHeight: 1.18, letterSpacing: '-.02em' }}>Size, engineer and quote a storage project in one session.</h2>
          <p style={{ opacity: .82, fontSize: 14.5, lineHeight: 1.7, marginTop: 16 }}>
            Application-led sizing with degradation and augmentation modelling, a parametric 3D container
            assembly for the engineering conversation, lifetime economics, and a priced proposal — all against
            one customer record.
          </p>
          <ul style={{ opacity: .8, fontSize: 13.5, lineHeight: 2, paddingLeft: 18, marginTop: 18 }}>
            <li>Eight application presets from peak shaving to grid forming</li>
            <li>Cohort ageing, augmentation schedules, LCOS, NPV and IRR</li>
            <li>Versioned quotations with scope, terms and a printable proposal</li>
          </ul>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: .8, fontSize: 12 }}>
          <img src={brand.wordmarkLight} alt={brand.vendor} style={{ height: 21 }} />
          <span>{brand.credit} · <a href={brand.vendorUrl} style={{ color: brand.goldLight }} target="_blank" rel="noreferrer">{brand.vendorDomain}</a></span>
        </div>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', padding: 32, background: 'var(--surface)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 380 }}>
          <div className="body">
            <h2 style={{ fontSize: 20 }}>{mode === 'in' ? 'Sign in' : 'Create a workspace'}</h2>
            <p className="muted" style={{ marginTop: 6, marginBottom: 20 }}>
              {firebaseEnabled ? 'Your workspace, customers and quotes are stored in Firestore.' : 'No Firebase project is configured, so this session runs as a local demo workspace in this browser.'}
            </p>
            <form onSubmit={e => { e.preventDefault(); void run(() => (mode === 'in' ? signIn(email, password) : signUp(email, password, name, orgName))); }}>
              {mode === 'up' && <>
                <label className="field"><span>Your name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></label>
                <label className="field"><span>Organization</span><input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Solarworld" required /></label>
              </>}
              <label className="field"><span>Work email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
              <label className="field"><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required /></label>
              {error && <div className="notice error"><p>{error}</p></div>}
              <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} type="submit">
                {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create workspace'}
              </button>
            </form>
            {firebaseEnabled && <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 9 }} disabled={busy} onClick={() => void run(signInWithGoogle)}>Continue with Google</button>}
            <button className="btn accent" style={{ width: '100%', justifyContent: 'center', marginTop: 9 }} disabled={busy} onClick={() => void run(signInAsDemo)}>
              Open the demo workspace
            </button>
            <p className="muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 12 }}>
              {mode === 'in' ? 'Setting up a new supplier workspace?' : 'Already have one?'}{' '}
              <button className="btn ghost sm" style={{ padding: 0, color: 'var(--blue)' }} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); }}>
                {mode === 'in' ? 'Create one' : 'Sign in'}
              </button>
            </p>
            {/* Two different arrivals. This form opens a new supplier workspace; a customer coming
                from the website joins an existing one, and an invited colleague follows their link. */}
            {publicOrgId() && (
              <p className="muted" style={{ textAlign: 'center', marginTop: 4, fontSize: 12 }}>
                Here as a customer?{' '}
                <Link href="/register/" style={{ color: 'var(--blue)' }}>Create an account</Link>
              </p>
            )}
            <p className="muted" style={{ textAlign: 'center', marginTop: 4, fontSize: 12 }}>
              Invited by a colleague? Follow the link in your invitation.
            </p>
            {mode === 'in' && firebaseEnabled && (
              <p className="muted" style={{ textAlign: 'center', marginTop: 4, fontSize: 12 }}>
                <button className="btn ghost sm" style={{ padding: 0, color: 'var(--blue)' }} disabled={busy}
                  onClick={() => void run(async () => { setNote(await resetPassword(email)); })}>
                  Forgotten your password?
                </button>
              </p>
            )}
            {note && <div className="notice info" style={{ marginTop: 12 }}><p>{note}</p></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
