'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { Card, Stat, Badge, Empty, Slider, KV, type Tone } from '../components/ui';
import { LineChart, series as chartSeries } from '../components/viz';
import { useWorkspace } from '../../platform/workspace';
import { lessons, lessonById, defaultControls, requestFrom, withControls, type LessonCard } from '../../sim/lessons';
import { manualPolicy, teachingPlant, lfpParameterSet } from '../../sim/presets';
import { accounting, simulate } from '../../sim/engine';
import { badgeLabels, badgeMeanings } from '../../sim/provenance';
import { pcsStateMeaning, pcsStateOwner, type PcsState } from '../../sim/pcs';
import { bmsStateMeaning, type BmsState } from '../../sim/bms';

/**
 * The lesson catalogue, and the player.
 *
 * §15.1 sets the loop: choose, play, change one thing, compare, understand. Everything here serves
 * that and nothing else — no configuration wizard, no quiz, no tutorial gate before interaction,
 * and at most three controls, four headline figures and two charts, which are the limits §15 puts
 * on a beginner card rather than suggestions.
 *
 * The playback is a cursor walking the result the engine produced, not an animation standing in
 * for one. §15.1 is explicit about that distinction, and it is why changing a control recomputes
 * before it redraws: what is on the screen is always a real answer to the question on the screen.
 */

const kW = (w: number) => `${(w / 1000).toLocaleString('en', { maximumFractionDigits: 0 })}`;
const kWh = (wh: number) => `${(wh / 1000).toLocaleString('en', { maximumFractionDigits: 1 })}`;

export function Lessons() {
  const params = useSearchParams();
  const lessonId = params.get('lesson');
  const projectId = params.get('project');
  const card = lessonId ? lessonById(lessonId) : undefined;
  return card && !card.arrivesIn ? <Player card={card} projectId={projectId} /> : <Catalogue projectId={projectId} />;
}

function Catalogue({ projectId }: { projectId: string | null }) {
  const { projects } = useWorkspace();
  const project = projects.find(p => p.id === projectId);
  const href = (id: string) => `/app/lessons?lesson=${id}${projectId ? `&project=${projectId}` : ''}`;
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row">
        {project && <Link className="btn ghost sm" href={`/app/projects?id=${project.id}`}><ArrowLeft size={15} /> {project.name}</Link>}
        <div className="spacer" />
        <span className="muted">Seven cards. Two to five minutes each.</span>
      </div>
      <Card title="Understand the plant" subtitle="Each card asks one question and answers it with a simulation you can steer">
        <div className="lesson-cards">
          {lessons.map((l, i) => (
            <div key={l.template.id} className={`lesson-card${l.arrivesIn ? ' later' : ''}`}>
              <div className="lesson-number">{i + 1}</div>
              <h4>{l.template.label}</h4>
              <p>{l.template.question}</p>
              {l.arrivesIn
                ? <Badge tone="neutral">Not built yet</Badge>
                : <Link className="btn accent sm" href={href(l.template.id)}><Play size={13} /> Start · {l.template.estimatedMinutes} min</Link>}
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 14 }}>
          The lessons run on one illustrative 5 MWh plant, shaped like the reference enclosure in the
          catalogue so what you learn here is recognisable there. It is a teaching model, not a
          product specification.
        </p>
      </Card>
    </div>
  );
}

function Player({ card, projectId }: { card: LessonCard; projectId: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState(() => defaultControls(card));
  // At rest the whole run is on the charts, because a learner should see the shape of the thing
  // before deciding to watch it happen. Play rewinds and reveals it.
  const [cursor, setCursor] = useState(Number.MAX_SAFE_INTEGER);
  const [playing, setPlaying] = useState(false);
  const [previous, setPrevious] = useState<{ label: string; deliveredWh: number; endSoc: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // The result. Recomputed whenever a control moves, because §15.1 requires the comparison to be
  // between two real runs from the same initial state rather than between a run and a redraw.
  const out = useMemo(() => simulate({
    scenario: withControls(card, values), plant: teachingPlant, policy: manualPolicy,
    parameters: lfpParameterSet, manualRequestW: requestFrom(values),
  }), [card, values]);

  const steps = out.series.timeSeconds.length;
  const totals = useMemo(() => accounting(out.series), [out]);

  useEffect(() => { setCursor(Number.MAX_SAFE_INTEGER); setPlaying(false); }, [values]);
  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!playing || steps === 0) return;
    // A two-hour scenario plays in about twelve seconds, which §15 asks to be under a minute.
    timer.current = setInterval(() => setCursor(c => (c + 1 >= steps ? (setPlaying(false), steps - 1) : c + 1)), 100);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, steps]);

  if (out.run.status === 'failed') {
    return <Empty title="That configuration cannot be run" message={out.run.failure ?? 'The model refused it.'} />;
  }

  const at = Math.min(cursor, steps - 1);
  const s = out.series;
  // Two indices, because the samples answer two different questions. `at` is the state the plant is
  // in — a charge level, a temperature — and at rest that is the closing sample, which carries the
  // state the run ended in. `act` is the last interval in which the plant was actually doing
  // something, which is what the states, the explanation and the limiting subsystem describe: the
  // closing sample dispatches nothing, and reading it there would tell every learner who opened a
  // finished run that the converter is in standby for no reason anybody gave.
  const act = Math.min(at, Math.max(0, steps - 2));
  const decision = out.decisions.decisions[Math.min(act, out.decisions.decisions.length - 1)];
  const constraint = s.bindingConstraint[act];
  const movedWh = requestFrom(values) > 0 ? totals.deliveredAcWh : totals.drawnAcWh;
  const lostWh = totals.converterLossWh + totals.batteryLossWh + totals.auxiliaryWh;

  const change = (id: string, n: number) => {
    setPrevious({ label: card.controls.find(c => c.id === id)!.label, deliveredWh: movedWh, endSoc: s.soc[steps - 1] });
    setValues(v => ({ ...v, [id]: n }));
  };
  const reset = () => { setValues(defaultControls(card)); setPrevious(null); setCursor(Number.MAX_SAFE_INTEGER); setPlaying(false); };

  const upTo = <T,>(arr: T[]) => arr.slice(0, at + 1);
  const minutes = (i: number) => s.timeSeconds[i] / 60;

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row">
        <Link className="btn ghost sm" href={`/app/lessons${projectId ? `?project=${projectId}` : ''}`}><ArrowLeft size={15} /> All lessons</Link>
        <div className="spacer" />
        <Badge tone="info">{badgeLabels[out.run.badge]}</Badge>
      </div>

      <Card title={card.template.label} subtitle={card.template.question}>
        <p className="lesson-goal">{card.template.objective}</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn accent" onClick={() => { if (!playing && at >= steps - 1) setCursor(0); setPlaying(p => !p); }} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Play</>}
          </button>
          <button className="btn" onClick={reset}><RotateCcw size={15} /> Reset</button>
          <input aria-label="Position in the run" type="range" min={0} max={Math.max(0, steps - 1)} value={at}
            onChange={e => { setPlaying(false); setCursor(Number(e.target.value)); }} style={{ flex: 1, minWidth: 160 }} />
          <span className="mono">{Math.round(minutes(at))} min of {Math.round(minutes(steps - 1))}</span>
        </div>
      </Card>

      <div className="grid cols-4">
        <Stat label="Charge level" value={`${(s.soc[at] * 100).toFixed(1)}`} unit="%" foot={`Started at ${(s.soc[0] * 100).toFixed(0)}%`} />
        <Stat label="At the connection" value={kW(s.gridPowerW[at])} unit="kW" foot={Math.abs(s.gridPowerW[at]) < 1 ? 'Neither in nor out' : s.gridPowerW[at] > 0 ? 'Exporting to the grid' : 'Drawing from the grid'} />
        <Stat label="Energy moved" value={kWh(movedWh)} unit="kWh" foot="Measured at the converter’s AC terminals" />
        <Stat label="Lost on the way" value={kWh(lostWh)} unit="kWh" foot={`${kWh(totals.converterLossWh)} converter · ${kWh(totals.batteryLossWh)} battery · ${kWh(totals.auxiliaryWh)} auxiliaries`} />
      </div>

      <div className="grid cols-2">
        <Card title="Power at each boundary" subtitle="What was asked, what the converter did, and what reached the connection" tight>
          <LineChart xLabel="Minute" format={n => `${n.toFixed(0)} kW`} rule={{ y: 0, label: 'Neither in nor out' }}
            data={[
              { name: 'Asked for', color: chartSeries[4], dashed: true, points: upTo(s.requestedPowerW).map((p, i) => ({ x: minutes(i), y: p / 1000 })) },
              { name: 'At the converter', color: chartSeries[0], points: upTo(s.achievedPowerW).map((p, i) => ({ x: minutes(i), y: p / 1000 })) },
              { name: 'At the connection', color: chartSeries[1], points: upTo(s.gridPowerW).map((p, i) => ({ x: minutes(i), y: p / 1000 })) },
            ]} />
        </Card>
        <Card title="Charge level" subtitle="And the reserve the policy keeps in hand" tight>
          <LineChart xLabel="Minute" format={n => `${n.toFixed(0)}%`} yMin={0}
            rule={{ y: manualPolicy.reserveSoc * 100, label: 'Reserve' }}
            data={[{ name: 'Charge level', color: chartSeries[0], points: upTo(s.soc).map((v, i) => ({ x: minutes(i), y: v * 100 })) }]} />
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="What the plant is doing, and who decided" tight>
          <Stack constraint={constraint} discharging={s.achievedPowerW[act] > 0} />
          <p className="lesson-explain">{decision?.explanation}</p>
          {constraint && constraint !== 'Request met in full' && (
            <div className="notice warning"><b>{constraint}</b>
              <p>{decision?.appliedLimits.find(l => l.reason.startsWith(constraint))?.reason.split(': ').slice(1).join(': ')}</p></div>
          )}
          <div style={{ marginTop: 10 }}>
            <KV label="Cell voltage">{s.cellVoltageV[act].toFixed(3)} V</KV>
            <KV label="String voltage">{Math.round(s.packVoltageV[act]).toLocaleString()} V</KV>
            <KV label="Battery current">{Math.round(s.packCurrentA[act]).toLocaleString()} A</KV>
            <KV label="Cell temperature">{s.cellTempC[at].toFixed(1)} °C</KV>
          </div>
        </Card>

        <Card title="Change one thing" subtitle="Then play it again from the same starting point" tight>
          {card.controls.map(c => (c.kind === 'slider'
            ? <Slider key={c.id} label={c.label} value={values[c.id]} min={c.min} max={c.max} step={c.step}
                unit={c.unit} scale={c.scale} decimals={c.decimals ?? 0} hint={c.hint} onChange={n => change(c.id, n)} />
            : <div className="field" key={c.id}>
                <span>{c.label}</span>
                <div className="row" style={{ gap: 6 }}>
                  {c.options.map(o => (
                    <button key={o.label} className={`btn sm${values[c.id] === o.value ? ' accent' : ''}`}
                      aria-pressed={values[c.id] === o.value} onClick={() => change(c.id, o.value)}>{o.label}</button>
                  ))}
                </div>
                <p className="hint">{c.hint}</p>
              </div>
          ))}
          {previous && (
            <div className="notice info"><b>What changed, and why</b>
              <p>
                Moving {previous.label.toLowerCase()} took the energy moved from {kWh(previous.deliveredWh)} kWh to {kWh(movedWh)} kWh,
                and the ending charge level from {(previous.endSoc * 100).toFixed(1)}% to {(s.soc[steps - 1] * 100).toFixed(1)}%.
                Both runs started at {(s.soc[0] * 100).toFixed(0)}%, so the difference is the change and nothing else.
              </p></div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={reset}><RotateCcw size={14} /> Reset</button>
            {projectId && <button className="btn sm" onClick={() => router.push(`/app/projects?id=${projectId}`)}>Back to the design</button>}
          </div>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="What each subsystem is in" subtitle="The state the converter and the battery management system are in at this moment" tight>
          <StateRow
            title="Converter"
            state={s.pcsState[act]}
            owner={pcsStateOwner[s.pcsState[act] as PcsState] ?? 'PCS'}
            meaning={pcsStateMeaning[s.pcsState[act] as PcsState] ?? ''}
          />
          <StateRow
            title="Battery management"
            state={s.bmsState[act]}
            owner="BMS"
            meaning={bmsStateMeaning[s.bmsState[at] as BmsState] ?? ''}
          />
          <p className="muted" style={{ margin: '10px 0 0' }}>
            A state names who is deciding. The converter can be dispatching below what was asked; only
            the battery management system can refuse outright, and it is the one that opens the contactors.
          </p>
        </Card>

        <Card title="What happened, and when" subtitle="Every limit, alarm and trip in the order it occurred" tight>
          <EventLog events={out.events.events.filter(e => e.atSeconds <= s.timeSeconds[at] + 0.001)} />
        </Card>
      </div>

      <Card title="What this model is, and is not" tight>
        <p className="muted" style={{ margin: 0 }}>
          <b>{badgeLabels[out.run.badge]}.</b> {badgeMeanings[out.run.badge]} {lfpParameterSet.provenance.source}
        </p>
        <ul className="muted" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          {lfpParameterSet.provenance.assumptions.map(a => <li key={a}>{a}</li>)}
          <li>Solved in {out.run.solver.integrator === 'heun' ? 'two passes' : 'one pass'} per step, with the state advanced no
            more than {out.run.solver.maxSubStepSeconds} s at a time. {out.run.engine} {out.run.engineVersion}.</li>
        </ul>
      </Card>
    </div>
  );
}

/** One subsystem's state, named, attributed and explained. §12.3 and §12.4 both require the owner. */
function StateRow({ title, state, owner, meaning }: { title: string; state: string; owner: string; meaning: string }) {
  const tone: Tone = /faulted|tripped|alarm/.test(state) ? 'bad' : /derated|derating|warning|recovery/.test(state) ? 'warn' : 'info';
  return (
    <div className="sim-state">
      <div className="row" style={{ gap: 8 }}>
        <b>{title}</b>
        <Badge tone={tone}>{state}</Badge>
        <div className="spacer" />
        <span className="muted mono">{owner}</span>
      </div>
      <p className="muted" style={{ margin: '4px 0 0' }}>{meaning}</p>
    </div>
  );
}

/**
 * The event log.
 *
 * §12.4 asks for the transitions themselves rather than a summary of them: what engaged, when, who
 * owns it, and — when it latched — what would clear it. A learner who has just watched the power
 * fall short should be able to read the reason here without inferring it from a chart.
 */
function EventLog({ events }: { events: { atSeconds: number; owner: string; severity: string; code: string; message: string; latched: boolean; clearsWhen: string }[] }) {
  if (events.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>Nothing has engaged yet. Every signal is inside its band and the request is being met in full.</p>;
  }
  const tone = (s: string): Tone => (s === 'trip' || s === 'alarm' ? 'bad' : s === 'limit' ? 'warn' : 'neutral');
  return (
    <ul className="sim-events">
      {events.map(e => (
        <li key={`${e.code}-${e.atSeconds}-${String(e.latched)}`}>
          <span className="mono">{Math.round(e.atSeconds / 60)} min</span>
          <Badge tone={tone(e.severity)}>{e.owner}</Badge>
          <div>
            <b>{e.message}</b>
            {e.latched && <p className="muted">Latched. {e.clearsWhen || 'Clears only on a deliberate reset.'}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The stack: where the request goes and who is allowed to stop it.
 *
 * Four boxes rather than a schematic, because §15.1 asks for something compact and clickable and
 * because a learner on lesson one does not need a single-line diagram — they need to know that the
 * policy asks, the converter converts, the battery management system can refuse, and the cells do
 * what they are left with.
 */
function Stack({ constraint, discharging }: { constraint: string; discharging: boolean }) {
  const owner = /converter|export|import|derated|window/i.test(constraint) ? 'PCS'
    : /reserve|policy/i.test(constraint) ? 'EMS'
    : /bms|cell|state of charge|current/i.test(constraint) ? 'BMS' : null;
  const boxes = [
    { id: 'EMS', name: 'ergOS', role: 'asks' },
    { id: 'PCS', name: 'Converter', role: 'converts' },
    { id: 'BMS', name: 'Battery management', role: 'permits' },
    { id: 'CELLS', name: 'Cells', role: 'store' },
  ];
  return (
    <div className={`sim-stack${discharging ? ' out' : ' in'}`}>
      {boxes.map((b, i) => (
        <div key={b.id}>
          <div className={`sim-box${owner === b.id ? ' limiting' : ''}`}>
            <b>{b.name}</b><span>{b.role}</span>
            {owner === b.id && <i className="sim-limiting"><Zap size={11} /> limiting</i>}
          </div>
          {i < boxes.length - 1 && <div className="sim-flow" aria-hidden />}
        </div>
      ))}
    </div>
  );
}
