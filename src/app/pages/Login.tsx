import { useState } from 'react';
import { brand, defaultBranding } from '../../brand/brand';
import { useSession } from '../../platform/auth';
import { firebaseEnabled } from '../../platform/firebase';

export function Login() {
  const { signIn, signUp, signInWithGoogle, signInAsDemo } = useSession();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [name, setName] = useState(''), [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message.replace('Firebase: ', '') : 'Sign-in failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,480px)' }}>
      <div style={{ background: `linear-gradient(150deg,${defaultBranding.primaryDark},${defaultBranding.primary} 62%,#2F5A78)`, color: '#fff', padding: '56px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={defaultBranding.logo ?? ''} alt="" style={{ height: 46, background: '#fff', borderRadius: 10, padding: 5 }} />
          <div><b style={{ fontSize: 17 }}>{defaultBranding.displayName}</b><br /><small style={{ opacity: .75, letterSpacing: '.09em', fontSize: 11 }}>BESS DESIGN STUDIO</small></div>
        </div>
        <div style={{ maxWidth: 520 }}>
          <h2 style={{ color: '#fff', fontSize: 34, lineHeight: 1.18, letterSpacing: '-.02em' }}>Size, engineer and quote a storage project in one session.</h2>
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
              {mode === 'in' ? 'No workspace yet?' : 'Already have one?'}{' '}
              <button className="btn ghost sm" style={{ padding: 0, color: 'var(--blue)' }} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); }}>
                {mode === 'in' ? 'Create one' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
