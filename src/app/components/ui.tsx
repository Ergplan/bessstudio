'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export const Card = ({ title, subtitle, actions, children, tight }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; tight?: boolean }) => (
  <section className="card">
    {title && <header><div style={{ flex: 1 }}><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{actions}</header>}
    <div className={`body${tight ? ' tight' : ''}`}>{children}</div>
  </section>
);

export const Stat = ({ label, value, unit, foot }: { label: string; value: string; unit?: string; foot?: string }) => (
  <div className="stat"><div className="label">{label}</div><p className="value">{value}{unit && <small>{unit}</small>}</p>{foot && <div className="foot">{foot}</div>}</div>
);

export type Tone = 'good' | 'info' | 'warn' | 'bad' | 'neutral';
export const Badge = ({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) => <span className={`badge ${tone}`}>{children}</span>;

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{error ? <div className="err">{error}</div> : hint ? <div className="hint">{hint}</div> : null}</label>;
}

/**
 * Text editing that types locally and persists occasionally.
 *
 * A record field wired straight to `onChange` writes on every keystroke, which is one database
 * write per character — enough to burn a day's free-tier write quota on a single paragraph. The
 * draft lives here and is committed once the typing stops, on blur, and on unmount so navigating
 * away never drops the last few characters.
 */
export function useDeferredCommit(value: string, onChange: (v: string) => void, delay = 700) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value), committedRef = useRef(value), onChangeRef = useRef(onChange);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  onChangeRef.current = onChange;

  // Adopt a change made elsewhere — a reset button, a record reloading — but never clobber typing.
  useEffect(() => {
    if (value === committedRef.current) return;
    committedRef.current = value; draftRef.current = value; setDraft(value);
  }, [value]);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (draftRef.current === committedRef.current) return;
    committedRef.current = draftRef.current;
    onChangeRef.current(draftRef.current);
  }, []);

  const edit = useCallback((next: string) => {
    draftRef.current = next; setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [delay, flush]);

  useEffect(() => flush, [flush]);   // commit whatever is outstanding when the field goes away
  return { draft, edit, flush };
}

export function TextInput({ label, value, onChange, placeholder, hint, error, type = 'text', disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; error?: string; type?: string; disabled?: boolean }) {
  const { draft, edit, flush } = useDeferredCommit(value, onChange);
  return (
    <Field label={label} hint={hint} error={error}>
      <input type={type} value={draft} placeholder={placeholder} disabled={disabled}
        onChange={e => edit(e.target.value)} onBlur={flush} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, rows = 3, hint, disabled }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; disabled?: boolean }) {
  const { draft, edit, flush } = useDeferredCommit(value, onChange);
  return (
    <Field label={label} hint={hint}>
      <textarea rows={rows} value={draft} disabled={disabled} onChange={e => edit(e.target.value)} onBlur={flush} />
    </Field>
  );
}

export function SelectInput<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: string }) {
  return <Field label={label} hint={hint}><select value={value} onChange={e => onChange(e.target.value as T)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>;
}

/** Numeric input that only commits a value inside the allowed range, so a half-typed number never reaches the model. */
export function NumberInput({ label, value, onChange, min = 0, max = 1e9, step = 1, unit, hint }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string; hint?: string }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft === '' || !Number.isFinite(n) || n < min || n > max) { setError(`Use ${min}–${max}${unit ? ` ${unit}` : ''}`); return; }
    setError(''); onChange(n);
  };
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="suffix">
        <input type="number" value={draft} min={min} max={max} step={step} aria-label={label} aria-invalid={!!error}
          onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        {unit && <i>{unit}</i>}
      </div>
    </Field>
  );
}

/**
 * Slider for a continuous design input. Dragging updates the readout locally and commits on
 * release, so a drag does not write to the database on every animation frame. The number beside
 * it stays editable for anyone who knows the value they want.
 */
export function Slider({ label, value, min, max, step = 1, unit, hint, decimals = 0, scale = 1, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  hint?: string; decimals?: number; scale?: number; disabled?: boolean; onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(value * scale);
  const [typing, setTyping] = useState('');
  useEffect(() => setDraft(value * scale), [value, scale]);
  const commit = (next: number) => { const clamped = Math.min(max, Math.max(min, next)); setDraft(clamped); onChange(clamped / scale); };
  const shown = draft.toFixed(decimals);
  return (
    <div className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <span className="slider-value">
          <input type="number" value={typing === '' ? shown : typing} min={min} max={max} step={step} disabled={disabled} aria-label={label}
            onChange={e => setTyping(e.target.value)}
            onBlur={e => { const n = Number(e.target.value); setTyping(''); if (Number.isFinite(n)) commit(n); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          {unit && <i>{unit}</i>}
        </span>
      </div>
      <input type="range" value={draft} min={min} max={max} step={step} disabled={disabled} aria-label={`${label} slider`}
        onInput={e => setDraft(Number(e.currentTarget.value))}
        onChange={e => commit(Number(e.currentTarget.value))} />
      {hint && <small className="slider-hint">{hint}</small>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <header><h3>{title}</h3><button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export const Empty = ({ title, message, action }: { title: string; message: string; action?: ReactNode }) => (
  <div className="empty"><h3>{title}</h3><p>{message}</p>{action}</div>
);

export const KV = ({ label, children }: { label: string; children: ReactNode }) => <div className="kv"><span>{label}</span><b>{children}</b></div>;

export const Tabs = <T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) => (
  <div className="tabs" role="tablist">{tabs.map(t => <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>
);

export const stageTone: Record<string, Tone> = { lead: 'neutral', qualified: 'info', proposal: 'info', negotiation: 'warn', won: 'good', lost: 'bad' };
export const quoteTone: Record<string, Tone> = { draft: 'neutral', 'internal-review': 'warn', sent: 'info', won: 'good', lost: 'bad', expired: 'bad' };
export const levelTone: Record<string, Tone> = { error: 'bad', warning: 'warn', info: 'info' };
export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
