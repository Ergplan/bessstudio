'use client';

/**
 * What is happening inside one cell, and why the voltage will not move.
 *
 * The dashboard measures the plateau — forty-odd millivolts while the charge level falls forty
 * points — and states that a voltmeter is therefore a poor fuel gauge. It does not say *why*, and
 * the why is the single most useful thing anybody can know about this chemistry.
 *
 * Lithium iron phosphate does not dissolve lithium gradually into one solid, the way a nickel
 * cobalt cathode does. It converts, particle by particle, between two distinct crystals — a
 * lithiated one, LiFePO₄, and a delithiated one, FePO₄ — with a boundary that moves through each
 * particle as it goes. While both crystals are present the cell potential is fixed by the
 * equilibrium *between* them, and it does not care what proportion is which. That is the flat
 * plateau. It ends at each extreme, where one phase runs out and the voltage finally moves, which
 * is exactly where a management system can get a voltage reading worth trusting.
 *
 * **This is a schematic, not a particle model.** The engine models a cell as an open-circuit curve
 * with a series resistance; it has no phases, no boundary and no particles. What is drawn here is
 * driven by the run's own charge level and current direction and nothing else, and the panel says
 * so. Drawing it as though it were computed would be the sort of thing the rest of this repository
 * spends its time refusing.
 */

const W = 420, H = 212;
const ANODE = { x: 34, w: 96 }, SEP = { x: 150, w: 42 }, CATHODE = { x: 212, w: 96 };
const TOP = 46, BOT = 162;

export function CellChemistry({ soc, currentA, cellV, playing }: {
  soc: number; currentA: number; cellV: number; playing: boolean;
}) {
  // Positive current is discharge: lithium leaves the graphite and goes into the phosphate.
  const discharging = currentA > 1;
  const charging = currentA < -1;
  const moving = discharging || charging;
  // The share of the cathode that has been converted back to the lithiated crystal. At a full
  // charge level the lithium is in the anode and the cathode is mostly iron phosphate.
  const lithiated = Math.min(1, Math.max(0, 1 - soc));
  const plateau = soc > 0.12 && soc < 0.95;

  return (
    <div className="chem">
      <svg viewBox={`0 0 ${W} ${H}`} className="chem-svg" role="img"
        aria-label={`One cell, ${(lithiated * 100).toFixed(0)} percent of the cathode converted to lithium iron phosphate, ${discharging ? 'discharging' : charging ? 'charging' : 'at rest'}`}>
        <defs>
          <marker id="chem-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" className="chem-arrowhead" />
          </marker>
        </defs>

        {/* The external circuit, where the electrons go — never through the separator. Drawn from
            whichever electrode they are leaving, so the arrowhead lands on the one they arrive at
            rather than being mirrored into the wrong place by a transform. */}
        {(() => {
          const left = ANODE.x + 12, right = CATHODE.x + CATHODE.w - 12;
          const from = discharging ? left : right, to = discharging ? right : left;
          return <path d={`M${from},${TOP - 14} L${from},22 L${to},22 L${to},${TOP - 14}`}
            className={`chem-circuit${moving ? ' live' : ''}`}
            markerEnd={moving ? 'url(#chem-arrow)' : undefined} />;
        })()}
        <text x={(ANODE.x + CATHODE.x + CATHODE.w) / 2} y={16} className="chem-note" textAnchor="middle">
          {moving ? `electrons — ${Math.abs(currentA).toFixed(0)} A through the external circuit` : 'no current: nothing is moving'}
        </text>

        {/* Anode: graphite layers with lithium sitting between them. */}
        <rect x={ANODE.x} y={TOP} width={ANODE.w} height={BOT - TOP} className="chem-anode" />
        {Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1={ANODE.x + 4} x2={ANODE.x + ANODE.w - 4}
            y1={TOP + 8 + i * ((BOT - TOP - 16) / 6)} y2={TOP + 8 + i * ((BOT - TOP - 16) / 6)}
            className="chem-layer" />
        ))}
        {Array.from({ length: 18 }, (_, i) => {
          const row = i % 6, col = Math.floor(i / 6);
          return (i / 18) < soc ? (
            <circle key={i} r="3.1" className="chem-li"
              cx={ANODE.x + 20 + col * 28} cy={TOP + 14 + row * ((BOT - TOP - 24) / 5)} />
          ) : null;
        })}

        {/* Separator: the only path lithium takes, and never electrons. */}
        <rect x={SEP.x} y={TOP} width={SEP.w} height={BOT - TOP} className="chem-sep" />
        {moving && Array.from({ length: 5 }, (_, i) => (
          <circle key={i} r="3.1" className={`chem-li ion ${discharging ? 'right' : 'left'}${playing ? '' : ' still'}`}
            cx={SEP.x + SEP.w / 2} cy={TOP + 16 + i * ((BOT - TOP - 32) / 4)}
            style={{ animationDelay: `${i * 0.24}s` }} />
        ))}

        {/* Cathode: particles, each with a boundary between the two crystals. */}
        <rect x={CATHODE.x} y={TOP} width={CATHODE.w} height={BOT - TOP} className="chem-cathode" />
        {Array.from({ length: 6 }, (_, i) => {
          const row = i % 3, col = Math.floor(i / 3);
          const cx = CATHODE.x + 26 + col * 46, cy = TOP + 22 + row * 42, r = 17;
          // The converted shell grows inward from the surface as lithium arrives.
          const inner = r * Math.sqrt(Math.max(0, 1 - lithiated));
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} className="chem-particle lithiated" />
              <circle cx={cx} cy={cy} r={inner} className="chem-particle empty" />
            </g>
          );
        })}

        <text x={ANODE.x + ANODE.w / 2} y={BOT + 15} className="chem-side" textAnchor="middle">Graphite anode</text>
        <text x={SEP.x + SEP.w / 2} y={BOT + 15} className="chem-side" textAnchor="middle">Separator</text>
        <text x={CATHODE.x + CATHODE.w / 2} y={BOT + 15} className="chem-side" textAnchor="middle">Phosphate cathode</text>

        {/* Which colour is which crystal, because the whole picture turns on it. */}
        <circle cx={CATHODE.x + 4} cy={BOT + 30} r="4.4" className="chem-particle lithiated" />
        <text x={CATHODE.x + 12} y={BOT + 33} className="chem-side">LiFePO₄</text>
        <circle cx={CATHODE.x + 56} cy={BOT + 30} r="4.4" className="chem-particle empty" />
        <text x={CATHODE.x + 64} y={BOT + 33} className="chem-side">FePO₄</text>
        <circle cx={ANODE.x + 4} cy={BOT + 30} r="3.1" className="chem-li" />
        <text x={ANODE.x + 12} y={BOT + 33} className="chem-side">lithium</text>
      </svg>

      <div className="chem-read">
        <div className="chem-eq">
          <b>LiFePO<sub>4</sub></b>
          <em aria-hidden>{charging ? '→' : discharging ? '←' : '⇌'}</em>
          <b>FePO<sub>4</sub> + Li<sup>+</sup> + e<sup>−</sup></b>
        </div>
        <p>
          <b>{(lithiated * 100).toFixed(0)}%</b> of the cathode has converted to the lithiated
          crystal. The two crystals sit side by side inside each particle with a boundary between
          them, and it is that boundary — not the proportion — that moves.
        </p>
        <p className={plateau ? 'chem-plateau on' : 'chem-plateau'}>
          {plateau
            ? <>While both crystals are present the potential is fixed by the equilibrium between
              them, so the cell holds near <b>{cellV.toFixed(3)} V</b> whatever the proportion. That
              is the flat plateau, and it is why the charge level above cannot be read off a
              voltmeter.</>
            : <>Near the ends one crystal runs out, the single remaining phase has to change
              composition to keep going, and the voltage finally moves — <b>{cellV.toFixed(3)} V</b>.
              These are the only two places a voltage reading tells you where you are.</>}
        </p>
        <small>
          Schematic. The engine models a cell as an open-circuit curve with a series resistance and
          has no particles, phases or boundary in it; what is drawn is driven by this run&rsquo;s own
          charge level and current direction.
        </small>
      </div>
    </div>
  );
}
