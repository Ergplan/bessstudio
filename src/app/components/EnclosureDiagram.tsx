import type { SizingResult } from '../../sizing/engine';
import { packOf } from '../../catalog/products';

/**
 * Isometric cut-away of one enclosure, drawn from the sizing result so the rack and pack counts on
 * the page are the ones being quoted. Vector, so it stays sharp in print.
 *
 * Projection: screen x = (X − Z)·cos30, screen y = (X + Z)·sin30 − Y. Depth therefore increases
 * with X + Z, which is the order everything is painted in. The two near walls are the cut, so they
 * are simply never drawn.
 */
export function EnclosureDiagram({ sizing, accent = '#93BE49', navy = '#22415B' }: { sizing: SizingResult; accent?: string; navy?: string }) {
  const enc = sizing.enclosure, pack = packOf(enc);
  const columns = Math.min(enc.racks, 9), levels = Math.min(enc.packsPerRack, 6);

  // Model space in millimetres, scaled to the drawing by the enclosure's own proportions.
  const L = 300, W = L * (enc.widthMm / enc.lengthMm), H = L * (enc.heightMm / enc.lengthMm);
  const cos = Math.cos(Math.PI / 6), sin = Math.sin(Math.PI / 6);
  const px = (x: number, z: number) => (x - z) * cos;
  const py = (x: number, y: number, z: number) => (x + z) * sin - y;
  const pt = (x: number, y: number, z: number): [number, number] => [px(x, z), py(x, y, z)];
  const poly = (pts: [number, number, number][]) => pts.map(p => pt(...p).join(',')).join(' ');

  const bay = L * 0.26, rackStart = bay + L * 0.03, rackSpan = L - rackStart - L * 0.03;
  const pitch = rackSpan / columns, rackW = pitch * 0.66;
  const packH = (H - H * 0.18) / levels, zFront = W * 0.12, zBack = W * 0.88;

  // Fitted view box: the model's own extents plus gutters for the callout labels.
  const xs = [px(0, W), px(L, 0)], ys = [py(0, H, 0), py(L, 0, W)];
  const gutterL = 150, gutterR = 210, padY = 18;
  const vb = { x: Math.min(...xs) - gutterL, y: Math.min(...ys) - padY, w: (Math.max(...xs) - Math.min(...xs)) + gutterL + gutterR, h: (Math.max(...ys) - Math.min(...ys)) + padY * 2 };
  const leftX = Math.min(...xs) - 12, rightX = Math.max(...xs) + 12;

  const Callout = ({ at, to, side, title, note }: { at: [number, number]; to: number; side: 'left' | 'right'; title: string; note: string }) => {
    const endX = side === 'right' ? rightX : leftX;
    return (
      <g>
        <polyline points={`${at[0]},${at[1]} ${(at[0] + endX) / 2},${to} ${endX},${to}`} fill="none" stroke="#B3C2CD" strokeWidth="0.7" />
        <circle cx={at[0]} cy={at[1]} r="1.8" fill="#fff" stroke="#B3C2CD" strokeWidth="0.7" />
        <text x={side === 'right' ? endX + 6 : endX - 6} y={to - 1} textAnchor={side === 'right' ? 'start' : 'end'} fontSize="6.4" fontWeight="700" fill={navy}>{title}</text>
        <text x={side === 'right' ? endX + 6 : endX - 6} y={to + 6.5} textAnchor={side === 'right' ? 'start' : 'end'} fontSize="5.4" fill="#8395A4">{note}</text>
      </g>
    );
  };

  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" className="offer-diagram"
      aria-label={`Cut-away of one ${(sizing.installedDcMWh / sizing.units).toFixed(3)} MWh enclosure showing ${enc.racks} racks of ${enc.packsPerRack} packs`}>

      {/* Far shell: end wall at x = 0, side wall at z = 0, floor, then the roof plane. */}
      <polygon points={poly([[0, 0, 0], [0, 0, W], [0, H, W], [0, H, 0]])} fill="#DCE4E9" />
      <polygon points={poly([[0, 0, 0], [L, 0, 0], [L, H, 0], [0, H, 0]])} fill="#EDF1F4" />
      <polygon points={poly([[0, 0, 0], [L, 0, 0], [L, 0, W], [0, 0, W]])} fill="#E3E9ED" />

      {/* Service bay, left uncut at the far end. */}
      <polygon points={poly([[bay, 0, 0], [bay, 0, W], [bay, H, W], [bay, H, 0]])} fill="#CFD9E0" stroke="#B6C3CC" strokeWidth="0.6" />
      {Array.from({ length: 3 }, (_, i) => {
        const z0 = W * 0.12 + i * W * 0.26;
        return <polygon key={i} points={poly([[bay + 0.4, H * 0.12, z0], [bay + 0.4, H * 0.12, z0 + W * 0.2], [bay + 0.4, H * 0.86, z0 + W * 0.2], [bay + 0.4, H * 0.86, z0]])}
          fill="#E6ECF0" stroke="#B6C3CC" strokeWidth="0.5" />;
      })}
      <polygon points={poly([[0, 0, 0], [bay, 0, 0], [bay, H * 0.07, 0], [0, H * 0.07, 0]])} fill={accent} />

      {/* Racks, painted far to near so the nearer columns overlap correctly. */}
      {Array.from({ length: columns }, (_, c) => {
        const x0 = rackStart + c * pitch, x1 = x0 + rackW;
        return (
          <g key={c}>
            {Array.from({ length: levels }, (_, l) => {
              const y0 = H * 0.09 + l * packH, y1 = y0 + packH * 0.82;
              return (
                <g key={l}>
                  <polygon points={poly([[x0, y0, zBack], [x1, y0, zBack], [x1, y1, zBack], [x0, y1, zBack]])} fill="#2F5A78" />
                  <polygon points={poly([[x0, y0, zFront], [x0, y0, zBack], [x0, y1, zBack], [x0, y1, zFront]])} fill="#3E6E96" stroke="#2C526F" strokeWidth="0.4" />
                  <polygon points={poly([[x0, y1, zFront], [x1, y1, zFront], [x1, y1, zBack], [x0, y1, zBack]])} fill="#5389AF" stroke="#2C526F" strokeWidth="0.4" />
                  {(() => { const [ax, ay] = pt(x0 + rackW * 0.5, y1 + 0.6, zFront + (zBack - zFront) * 0.25); return <rect x={ax - 2} y={ay - 1.2} width="4" height="2.4" rx="0.6" fill={accent} />; })()}
                </g>
              );
            })}
            {/* Rack uprights. */}
            <polyline points={poly([[x0, 0, zFront], [x0, H * 0.94, zFront]])} fill="none" stroke="#6C7C89" strokeWidth="1" />
          </g>
        );
      })}

      {/* Coolant headers and the DC busway, above the racks and nearer than them. */}
      <polyline points={poly([[bay, H * 0.95, zFront], [L - 4, H * 0.95, zFront]])} fill="none" stroke="#2D96D5" strokeWidth="2.2" strokeLinecap="round" />
      <polyline points={poly([[bay, H * 0.88, zFront], [L - 4, H * 0.88, zFront]])} fill="none" stroke="#E7665C" strokeWidth="2.2" strokeLinecap="round" />

      {/* Roof edge and the cut lines, over everything. */}
      <polyline points={poly([[0, H, 0], [L, H, 0], [L, H, W], [0, H, W], [0, H, 0]])} fill="none" stroke={navy} strokeWidth="1.1" />
      <polyline points={poly([[0, 0, 0], [0, H, 0]])} fill="none" stroke={navy} strokeWidth="1.1" />
      <polyline points={poly([[0, 0, W], [0, H, W]])} fill="none" stroke={navy} strokeWidth="0.8" />
      <polyline points={poly([[L, 0, 0], [L, H, 0]])} fill="none" stroke={navy} strokeWidth="0.8" strokeDasharray="3 2" />
      <polyline points={poly([[0, 0, 0], [L, 0, 0], [L, 0, W], [0, 0, W], [0, 0, 0]])} fill="none" stroke="#9FB0BC" strokeWidth="0.7" />

      {/* Overall dimensions along the two visible base edges. */}
      {(() => {
        const a = pt(0, 0, W), c = pt(L, 0, W), d = pt(0, H, W);
        return (
          <g stroke="#B3C2CD" strokeWidth="0.6" fill="none">
            <polyline points={`${a[0]},${a[1] + 9} ${c[0]},${c[1] + 9}`} />
            <text x={(a[0] + c[0]) / 2} y={(a[1] + c[1]) / 2 + 16} textAnchor="middle" fontSize="5.8" fill="#8395A4" stroke="none">{enc.lengthMm.toLocaleString()} mm</text>
            <polyline points={`${a[0] - 8},${a[1]} ${d[0] - 8},${d[1]}`} />
            <text x={a[0] - 11} y={(a[1] + d[1]) / 2} textAnchor="end" fontSize="5.8" fill="#8395A4" stroke="none">{enc.heightMm.toLocaleString()} mm</text>
          </g>
        );
      })()}

      <Callout at={pt(rackStart + rackSpan * 0.6, H * 0.55, zFront)} to={vb.y + vb.h * 0.16} side="right"
        title={`${enc.racks * enc.packsPerRack} BATTERY PACKS`} note={`${pack.model} · ${pack.labelKWh} kWh each`} />
      <Callout at={pt(L - 6, H * 0.88, zFront)} to={vb.y + vb.h * 0.30} side="right"
        title="THERMAL MANAGEMENT" note={enc.cooling === 'liquid' ? 'Liquid chiller · pump set' : 'Forced-air cooling'} />
      <Callout at={pt(rackStart + rackSpan * 0.35, H * 0.95, zFront)} to={vb.y + vb.h * 0.44} side="right"
        title="COOLANT HEADERS" note="Supply / return to every rack" />
      <Callout at={pt(rackStart + rackSpan * 0.85, H * 0.3, zFront)} to={vb.y + vb.h * 0.58} side="right"
        title="BATTERY MANAGEMENT" note={enc.communications} />
      <Callout at={pt(bay, H * 0.5, W * 0.4)} to={vb.y + vb.h * 0.62} side="left"
        title="EXTERNAL DOOR ACCESS" note={`${enc.doorBaysPerSide} door bays per side`} />
      <Callout at={pt(bay * 0.4, H * 0.2, 0)} to={vb.y + vb.h * 0.78} side="left"
        title={`${enc.ipRating} ENCLOSURE`} note={`${enc.batteryIpRating} at battery level`} />
    </svg>
  );
}
