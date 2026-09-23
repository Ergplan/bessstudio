'use client';
import type { ReactNode } from 'react';

/**
 * The two panels an engineer standing in front of the plant would actually be reading.
 *
 * The first version of this drew the battery management system and the converter as two more line
 * charts. Line charts are what an analyst opens afterwards; they are not what either device shows
 * you. A management system shows a wall of live values with the limit each one is being judged
 * against, and it tells you which cell is the worst one — because "the pack is at 3.29 V" is an
 * average and the thing that trips a plant is always a single cell. A converter shows its state,
 * what it was asked for, what it managed, and where the difference went.
 *
 * So these are instruments: a header with a tag and a lamp, values in a fixed-width column with
 * their units, and a bar for every signal that has a limit, drawn against the limit rather than
 * against its own maximum. A bar that always looks half full teaches nothing; a bar with the
 * derate band and the trip point marked on it teaches what the device is for.
 *
 * **Nothing here is invented.** A real management system also reports insulation resistance,
 * contactor cycles, balancing current per module and a dozen other things this model does not
 * carry, and a real converter reports grid voltage, frequency and reactive power. Those are named
 * as absent rather than filled with plausible numbers.
 */

export type Lamp = 'ok' | 'warn' | 'alarm' | 'idle';

export type Reading = {
  label: string;
  value: string;
  unit?: string;
  /** Where the value sits against the limits it is judged by, when it has any. */
  bar?: { value: number; min: number; max: number; derateFrom?: number; derateTo?: number };
  /** Which physical part the reading came off, where that matters — "cell 41 of 104". */
  from?: string;
  tone?: Lamp;
};

export function Instrument({ tag, name, lamp, state, children, absent }: {
  tag: string; name: string; lamp: Lamp; state: string; children: ReactNode; absent?: string;
}) {
  return (
    <section className={`instr ${lamp}`}>
      <header>
        <span className="instr-lamp" aria-hidden />
        <b>{name}</b>
        <code>{tag}</code>
        <span className="instr-state">{state}</span>
      </header>
      <div className="instr-body">{children}</div>
      {absent && <footer className="instr-absent">{absent}</footer>}
    </section>
  );
}

/** One row of the wall: name on the left, value and unit right-aligned, limits under it. */
export function Row({ r }: { r: Reading }) {
  return (
    <div className={`instr-row${r.tone ? ` ${r.tone}` : ''}`}>
      <span className="instr-label">{r.label}{r.from && <i>{r.from}</i>}</span>
      <span className="instr-value">{r.value}{r.unit && <em>{r.unit}</em>}</span>
      {r.bar && <LimitBar {...r.bar} />}
    </div>
  );
}

/**
 * A signal against the band it is allowed to be in.
 *
 * The derate band is drawn where the protection starts pulling the request back, and the far edge
 * is where it trips. A reader can see at a glance whether a value is comfortable, close, or the
 * reason the plant just stopped doing what it was asked.
 */
function LimitBar({ value, min, max, derateFrom, derateTo }: {
  value: number; min: number; max: number; derateFrom?: number; derateTo?: number;
}) {
  const span = Math.max(max - min, 1e-9);
  const at = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const band = derateFrom !== undefined && derateTo !== undefined
    ? { left: ((Math.min(derateFrom, derateTo) - min) / span) * 100,
      width: (Math.abs(derateTo - derateFrom) / span) * 100 }
    : null;
  return (
    <div className="instr-bar" role="presentation">
      {band && <i className="derate" style={{ left: `${band.left}%`, width: `${Math.max(band.width, 1)}%` }} />}
      <i className="fill" style={{ width: `${at}%` }} />
      <i className="needle" style={{ left: `${at}%` }} />
      <small>{min}</small><small className="hi">{max}</small>
    </div>
  );
}

export const lampFor = (state: string): Lamp => {
  const s = state.toLowerCase();
  if (/fault|trip|open|alarm|isolat/.test(s)) return 'alarm';
  if (/derate|limit|warn|taper|balanc/.test(s)) return 'warn';
  if (/standby|idle|off/.test(s)) return 'idle';
  return 'ok';
};
