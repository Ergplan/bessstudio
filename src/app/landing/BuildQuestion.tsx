'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { applications, type ApplicationId } from '../../sizing/applications';
import { defaultSizingInput, sizeSystem } from '../../sizing/engine';

export type BuildIntent = { powerMW: number; dischargeH: number; chargeH: number; applicationId: ApplicationId };
export const intentToQuery = (i: BuildIntent) =>
  `power=${i.powerMW}&discharge=${i.dischargeH}&charge=${i.chargeH}&application=${i.applicationId}`;

type Unit = 'MW' | 'kW';
const HOURS = [0.5, 1, 2, 3, 4, 6, 8, 12];

/**
 * The opening question. Power, how long it discharges for and how long it has to charge back up
 * are the three numbers that decide everything downstream, so they are asked before anything else
 * and answered against a live reading of what they imply.
 */
export function BuildQuestion({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [unit, setUnit] = useState<Unit>('MW');
  const [power, setPower] = useState('5');
  const [dischargeH, setDischargeH] = useState(4);
  const [chargeH, setChargeH] = useState(4);
  const [applicationId, setApplicationId] = useState<ApplicationId>('solar-shifting');
  const [busy, setBusy] = useState(false);

  const powerMW = useMemo(() => {
    const n = Number(power);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return unit === 'MW' ? n : n / 1000;
  }, [power, unit]);

  // Everything on the card is read back from the real engine, not a formula written twice.
  const preview = useMemo(() => {
    if (powerMW <= 0) return null;
    try {
      return sizeSystem({
        ...defaultSizingInput(applicationId),
        mode: 'power-duration', powerMW, durationH: dischargeH, chargeDurationH: chargeH,
      });
    } catch { return null; }
  }, [powerMW, dischargeH, chargeH, applicationId]);

  const valid = powerMW > 0 && powerMW <= 2000;
  const blocking = preview?.warnings.filter(w => w.level === 'error') ?? [];

  const start = () => {
    if (!valid || busy) return;
    setBusy(true);
    router.push(`/start/?${intentToQuery({ powerMW, dischargeH, chargeH, applicationId })}`);
  };

  return (
    <div className="l-question" role="dialog" aria-label="What are we building today?">
      <button className="l-question-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
      <div className="l-label">Step 01 · Define the plant</div>
      <h2 className="l-question-title">What are we building today?</h2>

      <div className="l-field">
        <label className="l-label" htmlFor="q-power">Power</label>
        <div className="l-power">
          <input id="q-power" type="number" inputMode="decimal" min={0} step="any" value={power}
            onChange={e => setPower(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') start(); }} autoFocus />
          <div className="l-unit" role="group" aria-label="Power unit">
            {(['MW', 'kW'] as Unit[]).map(u => (
              <button key={u} className={unit === u ? 'on' : ''} aria-pressed={unit === u}
                onClick={() => {
                  // Keep the physical size the same when the unit changes.
                  const n = Number(power);
                  if (Number.isFinite(n) && n > 0) setPower(String(u === 'kW' ? n * 1000 : n / 1000));
                  setUnit(u);
                }}>{u}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="l-field-row">
        {([['Hours of discharge', dischargeH, setDischargeH], ['Hours of charge', chargeH, setChargeH]] as const).map(([label, value, set]) => (
          <div className="l-field" key={label}>
            <span className="l-label">{label}</span>
            <div className="l-hours" role="group" aria-label={label}>
              {HOURS.map(h => (
                <button key={h} className={value === h ? 'on' : ''} aria-pressed={value === h} onClick={() => set(h)}>
                  {h < 1 ? `${h * 60}m` : `${h}h`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="l-field">
        <label className="l-label" htmlFor="q-app">What is it for?</label>
        <select id="q-app" value={applicationId} onChange={e => setApplicationId(e.target.value as ApplicationId)}>
          {applications.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="l-preview">
        {preview ? (
          <>
            {[
              [`${preview.requiredUsableMWh.toFixed(preview.requiredUsableMWh < 10 ? 2 : 1)} MWh`, 'Usable energy'],
              [`${preview.units} units`, `× ${(preview.installedDcMWh / preview.units).toFixed(2)} MWh enclosure`],
              [`${preview.systemCRate.toFixed(2)} / ${preview.chargeCRate.toFixed(2)} C`, 'Discharge / charge rate'],
              [`${preview.pcsCount} × ${(preview.pcs.ratedKW / 1000).toFixed(2)} MW`, 'Power conversion'],
            ].map(([v, k]) => <div key={k}><b>{v}</b><span className="l-label">{k}</span></div>)}
          </>
        ) : <div><b>—</b><span className="l-label">Enter a power rating</span></div>}
      </div>

      {blocking.length > 0 && <p className="l-warn">{blocking[0].text}</p>}

      <button className="l-btn primary l-question-go" onClick={start} disabled={!valid || busy}>
        {busy ? 'Opening the studio…' : 'Build it'} <ArrowRight size={14} />
      </button>
      <p className="l-question-note">
        Everything here stays editable in the studio. Nothing is committed until you save.
      </p>
    </div>
  );
}
