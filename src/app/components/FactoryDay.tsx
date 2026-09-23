'use client';
import type { ReactNode } from 'react';
import { DAY_SHAPE, type DayHour, type FactorySite } from '../../sim/factory';

/**
 * One working day at the works, hour by hour.
 *
 * The bill answers in rupees a year, which is what a finance director asks for and the wrong thing
 * to look at while deciding what the battery should do. Every figure in that arithmetic is really a
 * claim about one day — forty-five minutes of outage at ten, twelve hours of base load, four hours
 * of evening peak, a bell of generation over the middle — and a player who cannot see the day
 * cannot see why the reserve and the evening are competing for the same kilowatt-hours.
 *
 * Every bar is that hour's energy drawn as an average power, so the day adds up by eye. Above the
 * line is supply arriving; below it is energy being put away. The stored line running across the
 * top is the argument: it climbs overnight and through the middle of the day, drops at ten because
 * the grid went away, and empties through the evening.
 */
const W = 760, H = 240, PAD = { t: 16, r: 14, b: 34, l: 46 };

export function FactoryDay({ day, site }: { day: DayHour[]; site: FactorySite }) {
  const top = Math.max(...day.map(h => Math.max(h.loadKW, h.solarKW, h.gridKW + Math.max(0, h.batteryKW))), 1);
  const bottom = Math.min(...day.map(h => Math.min(0, h.gridKW, h.batteryKW)), 0);
  const span = top - bottom;
  const y = (v: number) => PAD.t + ((top - v) / span) * (H - PAD.t - PAD.b);
  const bw = (W - PAD.l - PAD.r) / 24;
  const x = (h: number) => PAD.l + h * bw;
  const storedTop = Math.max(...day.map(h => h.storedKWh), 1);
  const sy = (v: number) => PAD.t + (1 - v / storedTop) * (H - PAD.t - PAD.b) * 0.42;

  /**
   * One hour, stacked from the line in both directions.
   *
   * Above it, what supplied the site — the meter, the array, the generator, the battery. Below it,
   * where energy went instead of into the site: out through the meter, or into the battery. Both
   * sides stack, because two things drawn from the same baseline sit on top of each other and read
   * as one, which is how an hour that both exported and charged came out looking like neither.
   */
  const column = (h: DayHour) => {
    const above: [number, string][] = [
      [Math.max(0, h.gridKW), 'grid'], [h.solarKW, 'solar'],
      [h.dieselKW, 'diesel'], [Math.max(0, h.batteryKW), 'battery'],
    ];
    const below: [number, string][] = [
      [Math.max(0, -h.gridKW), 'grid'], [Math.max(0, -h.batteryKW), 'battery'],
    ];
    const seg = (value: number, cls: string, from: number, sign: 1 | -1, key: string) => {
      if (value < 0.5) return null;
      const a = y(from), b = y(from + sign * value);
      return <rect key={key} className={`day-${cls}${sign < 0 ? ' under' : ''}`}
        x={x(h.hour) + bw * 0.14} width={bw * 0.72}
        y={Math.min(a, b)} height={Math.max(1, Math.abs(a - b))} />;
    };
    const out: ReactNode[] = [];
    let up = 0, down = 0;
    for (const [v, cls] of above) { out.push(seg(v, cls, up, 1, `u${cls}`)); up += v; }
    for (const [v, cls] of below) { out.push(seg(v, cls, down, -1, `d${cls}`)); down -= v; }
    return out;
  };

  return (
    <div className="day">
      <svg viewBox={`0 0 ${W} ${H}`} className="day-svg" role="img"
        aria-label="One working day, hour by hour: site load, generation, what the battery did and what crossed the meter">
        {/* The evening window and the outage, marked before anything is drawn over them. */}
        <rect className="day-window" x={x(DAY_SHAPE.peakFrom)} width={bw * site.peakWindowHours}
          y={PAD.t} height={H - PAD.t - PAD.b} />
        <rect className="day-outage" x={x(DAY_SHAPE.outageAt)} width={bw} y={PAD.t} height={H - PAD.t - PAD.b} />
        <line className="day-axis" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />

        {day.map(h => <g key={h.hour}>{column(h)}</g>)}

        {/* What the site is actually drawing, over the top of what is supplying it. */}
        <polyline className="day-load" fill="none"
          points={day.flatMap(h => [`${x(h.hour)},${y(h.loadKW)}`, `${x(h.hour) + bw},${y(h.loadKW)}`]).join(' ')} />
        {/* And what is in the battery, on its own scale across the top. */}
        <polyline className="day-stored" fill="none"
          points={day.map(h => `${x(h.hour) + bw / 2},${sy(h.storedKWh)}`).join(' ')} />

        {[0, 6, 12, 18, 23].map(h => (
          <text key={h} className="day-tick" x={x(h) + bw / 2} y={H - 14} textAnchor="middle">
            {String(h).padStart(2, '0')}:00
          </text>
        ))}
        <text className="day-tick" x={PAD.l - 6} y={y(0) + 3} textAnchor="end">0</text>
        <text className="day-tick" x={PAD.l - 6} y={y(top) + 8} textAnchor="end">{Math.round(top)} kW</text>
        <text className="day-mark" x={x(DAY_SHAPE.outageAt) + bw / 2} y={PAD.t + 10} textAnchor="middle">outage</text>
        <text className="day-mark" x={x(DAY_SHAPE.peakFrom) + bw * site.peakWindowHours / 2} y={PAD.t + 10} textAnchor="middle">
          evening peak
        </text>
      </svg>

      <ul className="day-key">
        <li><span className="grid" /> From the grid</li>
        <li><span className="solar" /> From the array</li>
        <li><span className="diesel" /> From the generator</li>
        <li><span className="battery" /> Battery — above the line out, below it in</li>
        <li><span className="load" /> What the site is drawing</li>
        <li><span className="stored" /> Energy in the battery</li>
      </ul>
      <p className="muted day-note">
        Each bar is that hour&rsquo;s energy as an average power, so the day adds up by eye. The
        outage is {site.outageMinutesPerDay} minutes of the hour at {String(DAY_SHAPE.outageAt).padStart(2, '0')}:00,
        with {site.criticalLoadKW} kW protected while it lasts — the bar is the hour&rsquo;s average,
        not that instant. The array is off through it: a grid-following inverter needs a grid to
        follow, and there is none. Where the outage sits, when the evening window runs and what shape
        the generation takes are assumptions of this fixture; a site replaces all three with its own
        load data.
      </p>
    </div>
  );
}
