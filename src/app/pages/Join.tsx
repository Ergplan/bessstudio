'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Check, MailCheck } from 'lucide-react';
import { brand } from '../../brand/brand';
import { describeAuthError, useSession } from '../../platform/auth';
import { repository } from '../../platform/repo';
import { acceptInvite, registerAsCustomer, registrationProblem, publicOrgId } from '../../platform/joining';
import { invitationProblem, inviteState, roleDescriptions, roleLabels, type Invite, type Organization } from '../../platform/types';
import '../landing/landing.css';

type Mode = 'invite' | 'register';

/**
 * Joining an existing workspace: accepting an invitation, or registering as a customer.
 *
 * One screen serves both because the shape is identical — look up what is being joined, say
 * plainly what it means, then either sign in or create an account and write the membership. The
 * difference is only what authorises the role: a token, or the workspace being open to the public.
 */
export function Join({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, user, signIn, signUpWithoutWorkspace, refreshOrg } = useSession();

  const orgId = params.get('org') ?? (mode === 'register' ? publicOrgId() : null);
  const token = params.get('token');

  const [invite, setInvite] = useState<Invite | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(mode === 'register');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!orgId) { if (live) { setError(mode === 'register' ? 'This link is missing the workspace it belongs to.' : 'That invitation link is incomplete.'); setLoading(false); } return; }
      try {
        const repo = repository();
        const [o, i] = await Promise.all([repo.getOrganization(orgId), token ? repo.getInvite(orgId, token) : Promise.resolve(null)]);
        if (!live) return;
        setOrg(o); setInvite(i);
        if (i && !form.email) setForm(f => ({ ...f, email: i.email }));
      } catch (e) { if (live) setError(e instanceof Error ? e.message : 'That link could not be checked.'); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, token, mode]);

  // What is wrong with the link itself, before anybody signs in.
  const linkProblem = mode === 'invite'
    ? (loading ? null : invite && inviteState(invite) !== 'pending' ? invitationProblem(invite, null) : invite ? null : 'That invitation link is not valid. Ask whoever sent it for a new one.')
    : (loading ? null : registrationProblem(org));

  const join = useCallback(async (account: { uid: string; email: string; displayName: string }) => {
    if (mode === 'invite' && invite) await acceptInvite(invite, account);
    else if (org) await registerAsCustomer(org, account);
    await refreshOrg();
    setDone(true);
    setTimeout(() => router.replace('/app/'), 900);
  }, [mode, invite, org, refreshOrg, router]);

  // Somebody already signed in only has to confirm.
  useEffect(() => {
    if (!ready || !user || done || busy || loading || linkProblem) return;
    if (mode === 'invite' && invitationProblem(invite, user.email)) return;
    setBusy(true);
    join({ uid: user.uid, email: user.email, displayName: user.displayName })
      .catch(e => setError(e instanceof Error ? e.message : 'Joining failed.'))
      .finally(() => setBusy(false));
  }, [ready, user, done, busy, loading, linkProblem, mode, invite, join]);

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      if (creating) {
        const account = await signUpWithoutWorkspace(form.email.trim(), form.password, form.name.trim());
        await join(account);
      } else {
        await signIn(form.email.trim(), form.password);
        // The session effect above completes the join once the account lands.
      }
    } catch (e) { setError(describeAuthError(e)); }
    finally { setBusy(false); }
  };

  const heading = mode === 'invite'
    ? (invite ? `Join ${org?.name ?? 'the workspace'} as ${roleLabels[invite.role].toLowerCase()}` : 'Invitation')
    : `Create an account with ${org?.name ?? 'us'}`;

  return (
    <div className="landing" style={{ display: 'grid', placeItems: 'center', padding: 32, minHeight: '100vh' }}>
      <div className="l-question" style={{ maxWidth: 480 }}>
        <div className="l-label">{mode === 'invite' ? 'Invitation' : 'Registration'}</div>

        {loading ? <h2 className="l-question-title">Checking the link…</h2> : done ? (
          <>
            <h2 className="l-question-title"><Check size={22} /> You’re in</h2>
            <p style={{ color: 'var(--l-muted)', fontSize: 13.5, lineHeight: 1.6 }}>Opening your workspace…</p>
          </>
        ) : linkProblem ? (
          <>
            <h2 className="l-question-title">That link won’t work</h2>
            <p className="l-warn" style={{ marginTop: 0 }}>{linkProblem}</p>
            <button className="l-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => router.push('/sign-in/')}>Go to sign in</button>
          </>
        ) : (
          <>
            <h2 className="l-question-title">{heading}</h2>
            <p style={{ color: 'var(--l-muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 20px' }}>
              {mode === 'invite' && invite
                ? <>{roleDescriptions[invite.role]} Invited by {invite.createdBy}.</>
                : <>Design and size your own storage plant, price it indicatively, and submit it to our team for a formal quotation.</>}
            </p>

            {user ? (
              <p style={{ color: 'var(--l-muted)', fontSize: 13.5 }}>
                {invitationProblem(invite, user.email) ?? 'Joining…'}
              </p>
            ) : (
              <>
                {creating && (
                  <div className="l-field">
                    <span className="l-label">Your name</span>
                    <input className="l-join-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoComplete="name" />
                  </div>
                )}
                <div className="l-field">
                  <span className="l-label">Email</span>
                  <input className="l-join-input" type="email" value={form.email} readOnly={mode === 'invite'}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoComplete="email" />
                  {mode === 'invite' && <span className="l-join-hint">The invitation is tied to this address.</span>}
                </div>
                <div className="l-field">
                  <span className="l-label">Password</span>
                  <input className="l-join-input" type="password" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
                    autoComplete={creating ? 'new-password' : 'current-password'} />
                </div>

                {error && <p className="l-warn">{error}</p>}

                <button className="l-btn primary l-question-go" disabled={busy || !form.email || !form.password} onClick={() => void submit()}>
                  {busy ? 'Working…' : creating ? 'Create account and join' : 'Sign in and join'} <ArrowRight size={14} />
                </button>
                <button className="l-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
                  onClick={() => { setCreating(c => !c); setError(''); }}>
                  {creating ? 'I already have an account' : 'I need to create an account'}
                </button>
                <p className="l-join-note"><MailCheck size={12} /> Pricing appears once your email address is verified.</p>
              </>
            )}
          </>
        )}
        <p className="l-question-note">{brand.credit}</p>
      </div>
    </div>
  );
}
