import { useState, type ReactNode } from 'react';

/**
 * Chart primitives. The categorical palette is stepped from the Solarworld deck hues and
 * validated for lightness band, chroma floor, colour-vision separation and surface contrast;
 * hues are assigned in fixed order and never cycled. A sequential ramp carries magnitude,
 * status colours carry state, and both are kept out of the categorical order.
 */
export const series = ['#0F78C0', '#6E9E2B', '#9B6FD0', '#B08718', '#12907A', '#C4614C'] as const;
export const ramp = ['#BBD9EE', '#8DBDE0', '#5C9FCE', '#2F80B5', '#1A6FA6', '#0B5183'] as const;
export const status = { good: '#3F6B1F', warning: '#B08718', serious: '#C4614C', critical: '#96412E' } as const;
const ink = { primary: '#1D293B', secondary: '#465469', muted: '#61738D' };

type Tip = { x: number; y: number; content: ReactNode } | null;
const useTip = () => {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (content: ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 240), top: tip.y - 12 }}>{tip.content}</div> : null;
  return { bind, node };
};

const niceTicks = (min: number, max: number, count = 4) => {
  if (max === min) return [min];
  const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
};

/** Drop ticks that render to the same label, so an axis never repeats a value. */
const dedupe = (ticks: number[], format: (n: number) => string) => {
  const seen = new Set<string>();
  return ticks.filter(t => { const label = format(t); if (seen.has(label)) return false; seen.add(label); return true; });
};

export type LineSeries = { name: string; color: string; points: { x: number; y: number }[]; dashed?: boolean };

/** Multi-series line chart with a shared crosshair and a single value axis. */
export function LineChart({ data, height = 210, width: w = 720, yLabel, format, xLabel, rule, yMin }: {
  data: LineSeries[]; height?: number; width?: number; yLabel?: string; xLabel?: string;
  format: (n: number) => string; rule?: { y: number; label: string }; yMin?: number;
}) {
  const { bind, node } = useTip();
  const all = data.flatMap(s => s.points);
  if (!all.length) return <p className="muted">No data.</p>;
  const pad = { t: 12, r: 16, b: 30, l: 58 };
  const xs = all.map(p => p.x), ys = all.map(p => p.y).concat(rule ? [rule.y] : []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = yMin ?? Math.min(0, ...ys), y1 = Math.max(...ys) * 1.06 || 1;
  const px = (x: number) => pad.l + (x - x0) / Math.max(x1 - x0, 1e-9) * (w - pad.l - pad.r);
  const py = (y: number) => height - pad.b - (y - y0) / Math.max(y1 - y0, 1e-9) * (height - pad.t - pad.b);
  const ticks = dedupe(niceTicks(y0, y1), format), xticks = niceTicks(x0, x1, 6).filter(t => Number.isInteger(t));
  const slots = data[0]?.points ?? [];
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={yLabel ?? 'Line chart'}>
        {ticks.map(t => <g key={t}><line className="grid-line" x1={pad.l} x2={w - pad.r} y1={py(t)} y2={py(t)} /><text x={pad.l - 8} y={py(t) + 3.5} textAnchor="end">{format(t)}</text></g>)}
        {xticks.map(t => <text key={t} x={px(t)} y={height - 10} textAnchor="middle">{t}</text>)}
        {rule && <g><line x1={pad.l} x2={w - pad.r} y1={py(rule.y)} y2={py(rule.y)} stroke={status.serious} strokeWidth="1.5" strokeDasharray="5 4" /><text x={w - pad.r} y={py(rule.y) - 6} textAnchor="end" fill={status.serious} fontWeight="600">{rule.label}</text></g>}
        <line className="axis" x1={pad.l} x2={w - pad.r} y1={py(y0)} y2={py(y0)} />
        {data.map(s => <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray={s.dashed ? '6 4' : undefined} points={s.points.map(p => `${px(p.x)},${py(p.y)}`).join(' ')} />)}
        {slots.map((p, i) => (
          <rect key={p.x} className="mark-hit" x={px(p.x) - (w - pad.l - pad.r) / Math.max(slots.length, 1) / 2} y={pad.t}
            width={(w - pad.l - pad.r) / Math.max(slots.length, 1)} height={height - pad.t - pad.b}
            {...bind(<><b>{xLabel ?? 'x'} {p.x}</b>{data.map(s => <div key={s.name} className="num">{s.name}: {format(s.points[i]?.y ?? 0)}</div>)}</>)} />
        ))}
      </svg>
      {data.length > 1 && <div className="legend">{data.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>}
      {node}
    </>
  );
}

/** Vertical bars on one value axis, with rounded data-ends anchored to the baseline. */
export function BarChart({ bars, height = 200, width: w = 720, format, colorFor }: { bars: { label: string; value: number; note?: string }[]; height?: number; width?: number; format: (n: number) => string; colorFor?: (b: { label: string; value: number }, i: number) => string }) {
  const { bind, node } = useTip();
  if (!bars.length) return <p className="muted">No data.</p>;
  const pad = { t: 14, r: 14, b: 32, l: 62 };
  const y1 = Math.max(...bars.map(b => b.value), 0) * 1.08 || 1, y0 = Math.min(0, ...bars.map(b => b.value)) * 1.08;
  const py = (y: number) => height - pad.b - (y - y0) / Math.max(y1 - y0, 1e-9) * (height - pad.t - pad.b);
  const slot = (w - pad.l - pad.r) / bars.length, bw = Math.max(4, Math.min(38, slot - 6));
  const ticks = dedupe(niceTicks(y0, y1), format);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Bar chart">
        {ticks.map(t => <g key={t}><line className="grid-line" x1={pad.l} x2={w - pad.r} y1={py(t)} y2={py(t)} /><text x={pad.l - 8} y={py(t) + 3.5} textAnchor="end">{format(t)}</text></g>)}
        <line className="axis" x1={pad.l} x2={w - pad.r} y1={py(0)} y2={py(0)} />
        {bars.map((b, i) => {
          const x = pad.l + slot * i + (slot - bw) / 2, top = py(Math.max(b.value, 0)), bottom = py(Math.min(b.value, 0));
          return (
            <g key={b.label + i} {...bind(<><b>{b.label}</b><div className="num">{format(b.value)}</div>{b.note && <div>{b.note}</div>}</>)}>
              <rect x={x} y={top} width={bw} height={Math.max(2, bottom - top)} rx="4" fill={colorFor?.(b, i) ?? series[0]} />
              {bars.length <= 24 && <text x={x + bw / 2} y={height - 10} textAnchor="middle">{b.label}</text>}
            </g>
          );
        })}
      </svg>
      {node}
    </>
  );
}

/** Horizontal composition bar: one row, segments separated by a 2px surface gap. */
export function CompositionBar({ parts, format }: { parts: { label: string; value: number; color: string }[]; format: (n: number) => string }) {
  const { bind, node } = useTip();
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let offset = 0;
  return (
    <>
      <svg className="chart" viewBox="0 0 720 34" role="img" aria-label="Composition" style={{ height: 34 }}>
        {parts.map(p => {
          const wdt = p.value / total * 720, x = offset; offset += wdt;
          return <rect key={p.label} x={x} y={4} width={Math.max(0, wdt - 2)} height={24} rx="4" fill={p.color}
            {...bind(<><b>{p.label}</b><div className="num">{format(p.value)} · {(p.value / total * 100).toFixed(1)}%</div></>)} />;
        })}
      </svg>
      <div className="legend">{parts.map(p => <span key={p.label}><i style={{ background: p.color }} />{p.label} <b style={{ color: ink.secondary, fontWeight: 600 }}>{format(p.value)}</b></span>)}</div>
      {node}
    </>
  );
}

/** Ordered funnel for the sales pipeline: one hue, light to dark, because the stages are a magnitude, not identities. */
export function Funnel({ rows, format }: { rows: { label: string; count: number; value: number }[]; format: (n: number) => string }) {
  const { bind, node } = useTip();
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <>
      <div>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '112px 1fr 96px', alignItems: 'center', gap: 10, padding: '5px 0' }}
            {...bind(<><b>{r.label}</b><div className="num">{r.count} opportunit{r.count === 1 ? 'y' : 'ies'} · {format(r.value)}</div></>)}>
            <span style={{ fontSize: 12.5, color: ink.secondary, textTransform: 'capitalize' }}>{r.label} <b style={{ color: ink.muted, fontWeight: 500 }}>({r.count})</b></span>
            <div style={{ height: 22, background: '#F1F5F7', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(2, r.value / max * 100)}%`, height: '100%', background: ramp[Math.min(i, ramp.length - 1)], borderRadius: 5 }} />
            </div>
            <span style={{ fontSize: 12, textAlign: 'right', color: ink.primary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{format(r.value)}</span>
          </div>
        ))}
      </div>
      {node}
    </>
  );
}
