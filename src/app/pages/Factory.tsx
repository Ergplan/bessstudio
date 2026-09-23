'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Check, Play, RotateCcw } from 'lucide-react';
import { Card, Slider, Badge, Tabs } from '../components/ui';
import { FactoryDay } from '../components/FactoryDay';
import { Instrument, Row, type Reading } from '../components/instruments';
import {
  teachingFactory, playFactory, noBess, rounds, unlockedBy, dieselInrPerKWh,
  backupNeedKWh, solarSurplusKWh, factoryDay, usableKWh, TEACHING_LABEL, CHAIN,
  type Moves, type FactoryYear,
} from '../../sim/factory';
import { inr } from '../../sim/lifecycle';

/**
 * The factory, played.
 *
 * The lessons teach a plant and the studio sizes one, and between them sat the thing a buyer in
 * India is actually deciding: a works that burns diesel through the daily outage, replaces a
 * lead-acid bank every four years, exports a third of its solar at a third of what it buys it back
 * for, and pays a demand charge set by four hours in the evening. Four separate arguments, one
 * battery, and — the part that makes it a game rather than a brochure — not enough of it to serve
 * all four at once.
 *
 * Six rounds, each handing over one control and putting one line of the bill in front of the
 * player. Nothing is scored. The win condition of each round is a state on a real played year, and
 * the last round's is the only interesting one: get the site to pay for itself with nothing left
 * short. Reaching it means taking energy away from a duty that was winning a moment ago, which is
 * exactly the argument the reserve and depth-of-discharge settings have on a real design.
 */
const s = teachingFactory;

/** The three questions the game answers, one at a time. */
type View = 'day' | 'bill' | 'battery';

export function Factory() {
  const [round, setRound] = useState(1);
  const [view, setView] = useState<View>('day');
  const [moves, setMoves] = useState<Moves>(noBess());
  const year = useMemo(() => playFactory(s, moves), [moves]);
  const day = useMemo(() => factoryDay(s, moves), [moves]);
  const current = rounds[round - 1];
  const unlocked = new Set(unlockedBy(round));
  const won = current.won(year);
  const set = (over: Partial<Moves>) => setMoves(m => ({ ...m, ...over }));

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Card title={s.label} subtitle={s.setting}>
        <div className="row" style={{ marginBottom: 12 }}>
          {rounds.map(r => (
            <button key={r.id} className={`btn sm${r.n === round ? ' accent' : ''}`}
              aria-pressed={r.n === round} onClick={() => setRound(r.n)}>
              {r.n}. {r.title}
            </button>
          ))}
          <div className="spacer" />
          <button className="btn sm" onClick={() => { setMoves(noBess()); setRound(1); }}>
            <RotateCcw size={13} /> Start again
          </button>
        </div>

        <div className="round">
          <div className="round-head">
            <span className="round-n">{current.n}</span>
            <div>
              <h3>{current.title}</h3>
              <p>{current.scene}</p>
            </div>
          </div>
          <p className="round-task"><b>Your move</b> {current.task}</p>
          {won && (
            <div className="notice alt">
              <b><Check size={13} /> Done — and here is what it was about</b>
              <p>{current.lesson}</p>
              {round < rounds.length && (
                <button className="btn sm accent" style={{ marginTop: 8 }} onClick={() => setRound(round + 1)}>
                  Next · {rounds[round].title} <ArrowRight size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        <Controls moves={moves} unlocked={unlocked} set={set} />
      </Card>

      <Tabs<View> active={view} onChange={setView} tabs={[
        { id: 'day', label: 'The day' },
        { id: 'bill', label: 'The bill' },
        { id: 'battery', label: 'The battery' },
      ]} />

      {view === 'day' && (
        <Card title="One working day" subtitle="The same year, arranged in hours — which is where the battery's decisions actually happen">
          <FactoryDay day={day} site={s} />
        </Card>
      )}
      {view === 'bill' && <Bill year={year} moves={moves} />}
      {view === 'battery' && (
        <>
          <Plant moves={moves} year={year} />
          <Allocation year={year} moves={moves} />
        </>
      )}
    </div>
  );
}

/**
 * The battery as specified, read like a nameplate rather than like telemetry.
 *
 * The lessons' instruments show a running plant, which this one is not: nothing here is dispatching
 * at this instant, and dressing a year's arithmetic as live signals would be a lie in the shape of a
 * dashboard. What a panel can honestly show is what was ordered and whether it is enough — the
 * power against the load it has to carry, the energy against the duties asked of it, the rate it
 * will be worked at. The checks beside each are the same ones the game wins and loses on.
 */
function Plant({ moves, year }: { moves: Moves; year: FactoryYear }) {
  const usable = usableKWh(moves.bessEnergyKWh);
  const cRate = moves.bessEnergyKWh > 0 ? moves.bessPowerKW / moves.bessEnergyKWh : 0;
  const shaveKW = year.allocation.peakShavedKVA * s.powerFactor;
  const rows: Reading[] = [
    { label: 'Rated power', value: moves.bessPowerKW.toLocaleString('en'), unit: 'kW',
      from: `${s.criticalLoadKW} kW of protected load to carry`,
      bar: { value: moves.bessPowerKW, min: 0, max: Math.max(s.criticalLoadKW * 2, 1),
        derateFrom: 0, derateTo: s.criticalLoadKW },
      tone: moves.bessPowerKW > 0 && moves.bessPowerKW < s.criticalLoadKW ? 'warn' : undefined },
    { label: 'Nameplate energy', value: moves.bessEnergyKWh.toLocaleString('en'), unit: 'kWh',
      from: `${Math.round(usable).toLocaleString('en')} kWh of it usable in a cycle` },
    { label: 'Held in reserve', value: Math.round(year.allocation.reserveKWh).toLocaleString('en'), unit: 'kWh',
      from: `${Math.round(year.allocation.backupNeedKWh)} kWh of outage to cover`,
      tone: moves.bessEnergyKWh > 0 && year.allocation.reserveKWh < year.allocation.backupNeedKWh ? 'warn' : undefined },
    { label: 'Left for the daily cycle', value: Math.round(year.allocation.cyclingKWh).toLocaleString('en'), unit: 'kWh',
      from: 'after the reserve and the stored surplus' },
    { label: 'Rate it is worked at', value: cRate.toFixed(2), unit: 'C',
      from: cRate > 0 ? `${(1 / cRate).toFixed(1)} h from full at rated power` : 'nothing installed',
      bar: { value: cRate, min: 0, max: 1, derateFrom: 0.5, derateTo: 1 },
      tone: cRate > 0.5 ? 'warn' : undefined },
    { label: 'Evening it can hold', value: Math.round(shaveKW).toLocaleString('en'), unit: 'kW',
      from: `for ${s.peakWindowHours} h, every working day of the month` },
  ];
  return (
    <Card title="The battery, as ordered" subtitle="What was bought, and whether it is enough for what is being asked of it">
      <Instrument tag="BESS-01" name="Battery energy storage system" state={moves.bessEnergyKWh > 0 ? 'SPECIFIED' : 'NONE'}
        lamp={moves.bessEnergyKWh <= 0 ? 'idle' : year.shortfalls.length ? 'warn' : 'ok'}
        absent="A specification, not telemetry. Nothing here is dispatching — these are the figures the year's arithmetic was done on.">
        {rows.map(r => <Row key={r.label} r={r} />)}
      </Instrument>
    </Card>
  );
}

/** Only the controls the story has handed over, so a round is a decision and not a dashboard. */
function Controls({ moves, unlocked, set }: {
  moves: Moves; unlocked: Set<keyof Moves>; set: (over: Partial<Moves>) => void;
}) {
  if (unlocked.size === 0) {
    return <p className="muted" style={{ marginTop: 12 }}>Nothing to install in this round — read the bill below first.</p>;
  }
  return (
    <div className="grid cols-2" style={{ gap: 16, marginTop: 14 }}>
      {unlocked.has('bessPowerKW') && (
        <>
          <Slider label="Battery power" value={moves.bessPowerKW} min={0} max={2000} step={50} unit="kW"
            onChange={n => set({ bessPowerKW: n })}
            hint="What it can deliver at once. This has to reach the critical load to carry an outage, and the shaved kilowatts to hold the evening." />
          <Slider label="Battery energy" value={moves.bessEnergyKWh} min={0} max={6000} step={100} unit="kWh"
            onChange={n => set({ bessEnergyKWh: n })}
            hint={`Nameplate. About ${(CHAIN.usableWindow * CHAIN.depthOfDischarge * 100).toFixed(0)}% of it is usable in a cycle, at ₹${(CHAIN.bessInrPerKWh / 1000).toFixed(0)}k a kWh installed — a teaching value.`} />
          <Slider label="Held in reserve" value={moves.reservePortion * 100} min={0} max={100} step={5} unit="%"
            onChange={n => set({ reservePortion: n / 100 })}
            hint="The share kept back for the outage. Every point of it is energy the evening peak and the solar shift do not get." />
        </>
      )}
      {unlocked.has('peakTargetKVA') && (
        <Slider label="Hold the meter at" value={moves.peakTargetKVA ?? s.recordedDemandKVA}
          min={1200} max={s.recordedDemandKVA} step={50} unit="kVA"
          onChange={n => set({ peakTargetKVA: n >= s.recordedDemandKVA ? null : n })}
          hint={`Recorded maximum demand today is ${s.recordedDemandKVA} kVA at ₹${s.demandChargeInrPerKVAMonth} a kVA a month. Holding it is a duty every working day.`} />
      )}
      <div className="toggles">
        {unlocked.has('shiftSolar') && (
          <label className="toggle">
            <input type="checkbox" checked={moves.shiftSolar} onChange={e => set({ shiftSolar: e.target.checked })} />
            <span><b>Store the midday surplus</b>
              {Math.round(solarSurplusKWh(s)).toLocaleString('en')} kWh a day leaves at ₹{s.exportInrPerKWh} and comes back at ₹{s.tariffInrPerKWh.peak}.</span>
          </label>
        )}
        {unlocked.has('retireLeadAcid') && (
          <label className="toggle">
            <input type="checkbox" checked={moves.retireLeadAcid} onChange={e => set({ retireLeadAcid: e.target.checked })} />
            <span><b>Retire the lead-acid bank</b>
              Only if the battery carries what the bank actually delivers — {Math.round(s.leadAcidKWh * s.leadAcidUsablePortion)} kWh of a {s.leadAcidKWh} kWh nameplate.</span>
          </label>
        )}
      </div>
    </div>
  );
}

/** The bill, line by line, before and after — which is the only scoreboard this game has. */
function Bill({ year, moves }: { year: FactoryYear; moves: Moves }) {
  return (
    <Card title="The year" subtitle="Four lines of a works&rsquo; bill, before the battery and after it">
      <table className="data bill">
        <thead>
          <tr><th>Line</th><th className="num">Today</th><th className="num">With the battery</th><th className="num">Change</th></tr>
        </thead>
        <tbody>
          {year.lines.map(l => {
            const delta = l.withBessInr - l.baselineInr;
            return (
              <tr key={l.id}>
                <td><b>{l.label}</b><div className="muted">{l.note}</div></td>
                <td className="num">{inr(l.baselineInr)}</td>
                <td className="num">{inr(l.withBessInr)}</td>
                <td className={`num ${delta < -1 ? 'good' : delta > 1 ? 'bad' : ''}`}>
                  {Math.abs(delta) < 1 ? '—' : `${delta < 0 ? '−' : '+'}${inr(Math.abs(delta))}`}
                </td>
              </tr>
            );
          })}
          <tr className="total">
            <td><b>Total for the year</b></td>
            <td className="num">{inr(year.baselineTotalInr)}</td>
            <td className="num">{inr(year.withBessTotalInr)}</td>
            <td className={`num ${year.grossSavingInr > 1 ? 'good' : ''}`}>
              {year.grossSavingInr > 1 ? `−${inr(year.grossSavingInr)}` : '—'}
            </td>
          </tr>
        </tbody>
      </table>

      {moves.bessEnergyKWh > 0 && (
        <div className="bill-foot">
          <div><span>The battery, installed</span><b>{inr(year.bessCapexInr)}</b></div>
          <div><span>Its own upkeep, a year</span><b>{inr(year.bessUpkeepInr)}</b></div>
          <div><span>Saved, after that</span><b className={year.netSavingInr > 0 ? 'good' : 'bad'}>{inr(year.netSavingInr)}</b></div>
          <div><span>Simple payback</span><b>{year.simplePaybackYears === null ? 'never, at this play' : `${year.simplePaybackYears.toFixed(1)} years`}</b></div>
        </div>
      )}

      {year.shortfalls.length > 0 && (
        <div className="notice warning" style={{ marginTop: 12 }}>
          <b>Asked for more than it has</b>
          <ul className="shortfalls">{year.shortfalls.map(t => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      {/* True, and not a failure. Storing every unit an array makes was never a commitment, and
          reporting best-effort as a shortfall made the last round unwinnable on any real battery. */}
      {year.notes.length > 0 && (
        <div className="notice info" style={{ marginTop: 12 }}>
          <b>It could do more of this if it were larger</b>
          <ul className="shortfalls">{year.notes.map(t => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      <p className="muted" style={{ marginTop: 12, maxWidth: '84ch' }}>{TEACHING_LABEL}</p>
    </Card>
  );
}

/** Where the one pool of energy went, which is the argument the last round is about. */
function Allocation({ year, moves }: { year: FactoryYear; moves: Moves }) {
  const a = year.allocation;
  if (moves.bessEnergyKWh <= 0) {
    return (
      <Card title="What the site pays for a kilowatt-hour" subtitle="Four prices on one site, which is why a battery has anything to do here">
        <div className="price-strip">
          <span><b>₹{dieselInrPerKWh(s).toFixed(1)}</b><i>from the generator</i></span>
          <span><b>₹{s.tariffInrPerKWh.peak}</b><i>grid, evening peak</i></span>
          <span><b>₹{s.tariffInrPerKWh.normal}</b><i>grid, normal hours</i></span>
          <span><b>₹{s.tariffInrPerKWh.offPeak}</b><i>grid, off-peak</i></span>
          <span><b>₹{s.exportInrPerKWh}</b><i>what its own solar earns exported</i></span>
        </div>
        <p className="muted" style={{ maxWidth: '84ch' }}>
          A battery makes no energy. Everything it earns on this site is the gap between two of these
          five numbers — and the gaps are wide enough that moving a kilowatt-hour from one to another
          is worth more than the kilowatt-hour itself.
        </p>
      </Card>
    );
  }
  const bar = (kWh: number) => `${Math.max(0, (kWh / Math.max(a.usableKWh, 1)) * 100)}%`;
  return (
    <Card title="Where the energy went" subtitle={`${Math.round(a.usableKWh).toLocaleString('en')} kWh usable out of a ${moves.bessEnergyKWh.toLocaleString('en')} kWh nameplate, divided between three duties`}>
      <div className="alloc">
        <div className="alloc-bar">
          <i className="backup" style={{ width: bar(a.backupCoveredKWh) }} title="Carried the outage" />
          <i className="solar" style={{ width: bar(a.solarShiftedKWh) }} title="Stored surplus solar" />
          <i className="peak" style={{ width: bar(Math.max(0, a.peakShavedKWh - a.solarShiftedKWh)) }} title="Held the evening peak" />
          <i className="idle" style={{ width: bar(Math.max(0, a.usableKWh - a.backupCoveredKWh - a.peakShavedKWh)) }} title="Not used" />
        </div>
        <ul className="alloc-key">
          <li><span className="backup" /> Outage carried<b>{Math.round(a.backupCoveredKWh)} of {Math.round(a.backupNeedKWh)} kWh</b></li>
          <li><span className="solar" /> Surplus solar stored<b>{Math.round(a.solarShiftedKWh)} kWh</b></li>
          <li><span className="peak" /> Into the evening<b>{Math.round(a.peakShavedKWh)} kWh · {Math.round(a.peakShavedKVA)} kVA held</b></li>
          <li><span className="idle" /> Left standing<b>{Math.round(Math.max(0, a.usableKWh - a.backupCoveredKWh - a.peakShavedKWh))} kWh</b></li>
        </ul>
      </div>
      <p className="muted" style={{ maxWidth: '84ch' }}>
        Every kilowatt-hour here is spent once. Raise the reserve and the bar for the evening
        shortens; store the surplus and the night tariff has less to buy. This is the same decision
        the <b>reserve</b> and <b>depth of discharge</b> settings make on a real design — and the
        reason a quotation is an argument about duty rather than a price per kilowatt-hour.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn accent sm" href="/app/projects"><Play size={13} /> Size this for real</Link>
        <Badge tone="neutral">Teaching model</Badge>
      </div>
    </Card>
  );
}
