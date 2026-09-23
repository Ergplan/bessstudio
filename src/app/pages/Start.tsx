'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { brand } from '../../brand/brand';
import { useSession } from '../../platform/auth';
import { repository } from '../../platform/repo';
import { nowIso, uid, type Customer, type Project } from '../../platform/types';
import { connectionKV, defaultSizingInput, sizeSystem } from '../../sizing/engine';
import { newProject as makeProject, HOLDING_ACCOUNT } from '../../platform/projects';
import { application, applications, type ApplicationId } from '../../sizing/applications';
import { BuildSequence } from '../landing/BuildSequence';
import '../landing/landing.css';
import * as units from '../../domain/units';

const number = (value: string | null, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Turns the answer from the opening question into a real project and opens the workbench on it.
 *
 * It sits outside the workspace gate so the intent survives signing in: anyone already in a
 * workspace goes straight through, and anyone who is not is offered the demonstration workspace or
 * a sign-in without losing what they typed.
 *
 * The build sequence plays while the project is being sized and written. The workbench opens when
 * both have finished, so the sequence never cuts a save short and never leaves a finished save
 * waiting on the animation.
 */
export function Start() {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, user, org, signInAsDemo, authReachable } = useSession();
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [played, setPlayed] = useState(false);
  const started = useRef(false);

  const powerMW = number(params.get('power'), 5);
  const dischargeH = number(params.get('discharge'), 4);
  const chargeH = number(params.get('charge'), 4);
  const applicationId = (applications.some(a => a.id === params.get('application'))
    ? params.get('application') : 'solar-shifting') as ApplicationId;

  const sizingInput = useMemo(() => ({
    ...defaultSizingInput(applicationId),
    mode: 'power-duration' as const, powerMW, durationH: dischargeH, chargeDurationH: chargeH,
  }), [applicationId, powerMW, dischargeH, chargeH]);

  // Sized once, up front: the sequence narrates this result and the project is saved against it.
  const sizing = useMemo(() => {
    try { return sizeSystem(sizingInput); } catch { return null; }
  }, [sizingInput]);

  const build = useCallback(async () => {
    if (!org || !user || !sizing || started.current) return;
    started.current = true;
    try {
      const label = `${units.powerText(powerMW)} / ${units.energyText(sizing.requiredUsableMWh)}`;

      const repo = repository();
      // New opportunities land against a holding account until the real customer is known.
      const existing = (await repo.list(org.id, 'customers')).find(c => c.name === HOLDING_ACCOUNT);
      const customer: Customer = existing ?? {
        id: uid('cus'), orgId: org.id, name: HOLDING_ACCOUNT, segment: 'developer', stage: 'lead',
        country: '', city: '', website: '', notes: 'Created from the opening question. Rename once the customer is known.',
        contacts: [], ownerUid: user.uid, ownerName: user.displayName, createdAt: nowIso(), updatedAt: nowIso(),
      };
      if (!existing) await repo.save(org.id, 'customers', customer);

      const already = (await repo.list(org.id, 'projects')).filter(p => p.customerId === customer.id).length;
      const project: Project = makeProject({
        // The opening question asks for power and hours, not for a connection voltage, so the
        // design opens at the one it actually makes: a five-kilowatt supply with a 230 V inverter
        // and no transformer should not open carrying the grid-scale default of 33 kV.
        orgId: org.id, customer, existing: already, sizing: { ...sizingInput, gridKV: connectionKV(sizing) },
        name: `${label} · ${application(applicationId).name}`,
        by: { uid: user.uid, displayName: user.displayName },
      });
      await repo.save(org.id, 'projects', project);
      setProjectId(project.id);
    } catch (e) {
      started.current = false;
      setError(e instanceof Error ? e.message : 'The project could not be created.');
    }
  }, [org, user, sizing, sizingInput, applicationId, powerMW]);

  useEffect(() => { if (ready && user && org) void build(); }, [ready, user, org, build]);

  // Both halves have to land before the workbench opens.
  useEffect(() => {
    if (played && projectId) router.replace(`/app/projects/?id=${projectId}`);
  }, [played, projectId, router]);

  const onDone = useCallback(() => setPlayed(true), []);
  const summary = `${units.powerText(powerMW)} · ${dischargeH} h discharge · ${chargeH} h charge`;

  if (ready && user && org && sizing && !error) {
    return <div className="landing"><BuildSequence sizing={sizing} saving={!projectId} onDone={onDone} /></div>;
  }

  return (
    <div className="landing" style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
      <div className="l-question" style={{ textAlign: 'center' }}>
        <div className="l-label">{summary}</div>
        {ready && !user ? (
          <>
            <h2 className="l-question-title" style={{ marginBottom: 14 }}>Where should this live?</h2>
            <p style={{ color: 'var(--l-muted)', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 22px' }}>
              {authReachable
                ? 'Your answer is kept. Open the demonstration workspace to carry on in this browser, or sign in to save the project to your organization.'
                : 'Your answer is kept. The sign-in service could not be reached from here, so signing in will not work until it can — but the demonstration workspace runs entirely in this browser and needs nothing.'}
            </p>
            <button className="l-btn primary l-question-go" onClick={() => void signInAsDemo()}>
              Continue in the demo workspace
            </button>
            <button className="l-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
              onClick={() => router.push(`/sign-in/?next=${encodeURIComponent(`/start/?${params.toString()}`)}`)}>
              {authReachable ? 'Sign in instead' : 'Try signing in anyway'}
            </button>
          </>
        ) : (
          <>
            <h2 className="l-question-title" style={{ marginBottom: 14 }}>
              {error ? 'That did not work' : !sizing ? 'That plant could not be sized' : 'Opening your workspace…'}
            </h2>
            <p style={{ color: error || !sizing ? '#E5B4AA' : 'var(--l-muted)', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
              {error || (!sizing
                ? 'Go back and try a different power rating or duration.'
                : 'Sizing the fleet, selecting the conversion and opening the workbench.')}
            </p>
            {(error || !sizing) && (
              <button className="l-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
                onClick={() => { if (error) { started.current = false; setError(''); void build(); } else router.push('/'); }}>
                {error ? 'Try again' : 'Back to the question'}
              </button>
            )}
          </>
        )}
        <p className="l-question-note">{brand.credit}</p>
      </div>
    </div>
  );
}
