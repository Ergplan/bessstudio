'use client';
import { useState, type ReactNode } from 'react';
import { MailCheck, Lock, RefreshCw } from 'lucide-react';
import { useSession } from '../../platform/auth';
import { canSeeFinancials } from '../../platform/types';

/**
 * The financial gate.
 *
 * A price is the one thing in the studio a stranger could act on, so it is shown only to an
 * address somebody has proved they control. Sizing, engineering and the 3D assembly stay open —
 * what is withheld is money, and the person is told plainly why and how to clear it.
 *
 * This is presentation only. The same rule is enforced in the Firestore rules, which is what
 * actually stops an unverified account reading a quotation.
 */
export function useFinancialAccess() {
  const { role, emailVerified } = useSession();
  return { allowed: canSeeFinancials(role, emailVerified), emailVerified };
}

/** Wraps a figure or a block that only a verified account may read. */
export function Financial({ children, inline, label = 'Verify your email to see pricing' }: { children: ReactNode; inline?: boolean; label?: string }) {
  const { allowed } = useFinancialAccess();
  if (allowed) return <>{children}</>;
  if (inline) return <span className="locked" title={label}><Lock size={11} /> Locked</span>;
  return (
    <div className="locked-block">
      <Lock size={15} />
      <div><b>Pricing is hidden</b><p className="muted">{label}</p></div>
    </div>
  );
}

/** The banner that explains the gate and offers the way through it. */
export function VerifyBanner() {
  const { user, emailVerified, sendVerification, refreshVerification, mode } = useSession();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user || emailVerified || mode !== 'firestore') return null;

  const run = async (fn: () => Promise<string>) => { setBusy(true); try { setNote(await fn()); } finally { setBusy(false); } };

  return (
    <div className="verify-banner no-print" role="status">
      <MailCheck size={16} />
      <div className="verify-copy">
        <b>Confirm {user.email} to see pricing</b>
        <p>{note || 'Designing, sizing and the 3D assembly are open. Quotations and prices appear once the address is verified.'}</p>
      </div>
      <button className="btn sm" disabled={busy} onClick={() => void run(sendVerification)}>Resend email</button>
      <button className="btn sm accent" disabled={busy}
        onClick={() => void run(async () => (await refreshVerification()) ? 'Verified — pricing is now available.' : 'Not verified yet. Open the link in the email, then try again.')}>
        <RefreshCw size={13} /> I have verified
      </button>
    </div>
  );
}
