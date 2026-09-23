'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, Zap } from 'lucide-react';
import { Card, Stat, Badge, Empty, Slider, KV, type Tone } from '../components/ui';
import { LineChart, series as chartSeries } from '../components/viz';
import { PlantDashboard } from '../components/PlantDashboard';
import { useWorkspace } from '../../platform/workspace';
import {
  lessons, lessonById, defaultControls, holdSystem, resizeSystem, acts, actOf, nextLesson,
  type LessonCard, type Metric, type Readout,
} from '../../sim/lessons';
import { lfpParameterSet } from '../../sim/presets';
import { glossary, termById, termsFirstMetIn, firstUseLabel, type Term } from '../../sim/glossary';
import { completedLessons, markLessonComplete, nextUnfinished, progressOf } from '../../sim/progress';
import { accounting, simulate } from '../../sim/engine';
import { comparePolicies } from '../../sim/compare';
import { indiaPresets, teachingTariffs } from '../../sim/india';
import { inr } from '../../sim/lifecycle';
import { conversionCaveat, designFromLesson } from '../../quoting/conversion';
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
  // Read after mount, never during render: the export is prerendered on a machine with no reader
  // and no storage, and a first paint that already claimed progress would be claiming somebody
  // else's.
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => setDone(completedLessons()), []);
  const order = lessons.filter(l => !l.arrivesIn).map(l => l.template.id);
  const progress = progressOf(order, done);
  const next = nextUnfinished(order, done);
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row">
        {project && <Link className="btn ghost sm" href={`/app/projects?id=${project.id}`}><ArrowLeft size={15} /> {project.name}</Link>}
        <div className="spacer" />
        {progress.done > 0 && (
          <span className="lesson-progress" aria-label={`${progress.done} of ${progress.total} lessons finished`}>
            <i style={{ width: `${progress.fraction * 100}%` }} />
            <b>{progress.done} of {progress.total}</b>
          </span>
        )}
        {next && (
          <Link className="btn accent sm" href={href(next)}>
            <Play size={13} /> {progress.done > 0 ? 'Continue' : 'Start at the beginning'}
          </Link>
        )}
      </div>

      <Primer />
      {/* The cards are a sequence, so they are shown as one: three acts, each with the argument it
          makes, and each card saying what the reader is left holding. Seven tiles in a grid gave a
          reader no reason to start at one or to carry on to the next. */}
      <Card title="Understand the plant" subtitle="One argument in seven runs, each steered by you rather than played at you">
        <p className="lesson-thesis">
          A battery plant is three claims stacked on each other: that it moves energy and keeps a
          little of it, that moving energy in time is worth money to somebody, and that it will not
          always do what it is asked. Take them in that order and the rest of the studio reads
          itself. Nothing here is a video — every figure comes from a simulation you can argue with.
        </p>
        {acts.map(act => {
          const inAct = lessons.filter(l => l.story.actId === act.id);
          if (!inAct.length) return null;
          return (
            <section key={act.id} className="lesson-act">
              <h3>{act.title}</h3>
              <p className="lesson-premise">{act.premise}</p>
              <div className="lesson-cards">
                {inAct.map(l => (
                  <div key={l.template.id} className={`lesson-card${l.arrivesIn ? ' later' : ''}${done.includes(l.template.id) ? ' done' : ''}`}>
                    <div className="lesson-number">{lessons.indexOf(l) + 1}</div>
                    <h4>{l.template.label}</h4>
                    <p>{l.template.question}</p>
                    {!l.arrivesIn && <p className="lesson-takeaway"><b>After this</b> {l.story.takeaway}</p>}
                    {/* The words this card is the first to use, named on the tile so a reader can
                        see what they are about to be asked to understand before they commit. */}
                    {l.story.teaches.length > 0 && (
                      <p className="lesson-words">
                        <b>New words</b> {l.story.teaches.map(id => termById(id)?.term).filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {l.arrivesIn
                      ? <Badge tone="neutral">Not built yet</Badge>
                      : <Link className="btn accent sm" href={href(l.template.id)}>
                        <Play size={13} /> {done.includes(l.template.id) ? 'Again' : 'Start'} · {l.template.estimatedMinutes} min
                      </Link>}
                    {done.includes(l.template.id) && <span className="lesson-done">Finished</span>}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <p className="muted" style={{ marginTop: 14 }}>
          The lessons run on one illustrative 5 MWh plant, shaped like the reference enclosure in the
          catalogue so what you learn here is recognisable there. It is a teaching model, not a
          product specification.
        </p>
      </Card>

      <Card title="Then put it on a bill" subtitle="The same battery, on a works that burns diesel, replaces a lead-acid bank and exports its own solar">
        <p className="lesson-thesis">
          The cards above teach the plant. <b>The factory</b> is the argument a buyer in India is
          actually having: forty-five minutes of outage a day carried by a diesel set, a lead-acid
          bank bought again every four years, a third of the roof&rsquo;s generation leaving at a
          third of what it is bought back for, and a demand charge set by four hours in the evening.
          Six rounds, one battery — and not enough of it to serve all four at once, which is where
          the sizing argument starts.
        </p>
        <Link className="btn accent sm" href="/app/factory"><Play size={13} /> Run the factory</Link>
      </Card>

      <Handover projectId={projectId} done={done} total={order.length} />
    </div>
  );
}

/**
 * The words before the first run, and the one distinction the rest of the studio stands on.
 *
 * A reader who cannot separate a megawatt from a megawatt-hour cannot read a single figure this
 * product prints — not the sizing, not the quotation, not the cascade — and nothing taught it. It
 * is not a lesson: §15 fixes the catalogue at seven cards, and this is thirty seconds of reading in
 * front of them rather than an eighth thing to do.
 */
function Primer() {
  const [open, setOpen] = useState(false);
  const terms = termsFirstMetIn('primer');
  return (
    <Card title="Before you start" subtitle="Two numbers, and why a plant is always quoted as both">
      <div className="primer">
        <div className="primer-eq">
          <span><b>1 MW</b><i>power — how hard</i></span>
          <em>×</em>
          <span><b>4 h</b><i>duration — how long</i></span>
          <em>=</em>
          <span><b>4 MWh</b><i>energy — how much</i></span>
        </div>
        <p>
          A megawatt is a rate and a megawatt-hour is an amount, and they are not interchangeable.
          The same 4 MWh is 1 MW for four hours, 4 MW for one, or 0.5 MW for eight — three completely
          different plants, three different prices, three different jobs. This is why the studio asks
          for power and duration separately and will not let you give it one number.
        </p>
        <button className="btn sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? 'Hide the words' : `The ${glossary.length} words this studio uses`}
        </button>
        {open && (
          <>
            <Words terms={terms} heading="Start with these" />
            <Words terms={glossary.filter(t => t.firstMet !== 'primer')} heading="Met later, kept here" muted />
          </>
        )}
      </div>
    </Card>
  );
}

/** A definition list, written so each entry can be read on its own. */
function Words({ terms, heading, muted }: { terms: Term[]; heading: string; muted?: boolean }) {
  return (
    <div className={`words${muted ? ' muted-block' : ''}`}>
      <h4>{heading}</h4>
      <dl>
        {terms.map(t => (
          <div key={t.id}>
            <dt>{firstUseLabel(t)}{t.unit && <span className="words-unit">{t.unit}</span>}</dt>
            <dd>{t.plain}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * What the reader is holding at the end, and where each of those things is waiting for them.
 *
 * Seven cards that end with "Next lesson" and then stop leave the learning in the lessons. The
 * point of the catalogue is that the studio becomes readable, so the last thing it does is name
 * each thing learned beside the screen that uses it.
 */
function Handover({ projectId, done, total }: { projectId: string | null; done: string[]; total: number }) {
  const finished = done.length >= total && total > 0;
  return (
    <Card title={finished ? 'What you now know' : 'Where this is going'}
      subtitle={finished ? 'And the screen each of them turns up on' : `Finish the ${total} cards and each of these becomes readable`}>
      <ul className="handover">
        <li><b>Energy is lost every pass</b><span>The <i>Where the nameplate goes</i> cascade on a design, which takes the same losses off a real container.</span></li>
        <li><b>A peak is billed differently from consumption</b><span>The application preset on a project, which sets the duty the plant is sized for.</span></li>
        <li><b>Surplus has to go somewhere</b><span>Solar shifting, and the cycles-a-day figure that drives ageing.</span></li>
        <li><b>Reserve is energy you agreed not to sell</b><span>Depth of discharge on the design tab — the same decision, written into a contract.</span></li>
        <li><b>A spread has to beat the round trip</b><span>The economics tab: LCOS, and why a cheap plant can lose money.</span></li>
        <li><b>Something always decides what is possible</b><span>The design checks, which refuse a duty the equipment cannot carry.</span></li>
        <li><b>Contract demand is an estimate, not a measurement</b><span>The quotation&rsquo;s assumptions, where that is said out loud.</span></li>
      </ul>
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn accent sm" href={projectId ? `/app/projects?id=${projectId}` : '/app/projects'}>
          {projectId ? 'Back to the design' : 'Open a design'} <ArrowRight size={14} />
        </Link>
        <span className="muted">
          The cascade there is the first lesson&rsquo;s arithmetic, run on a container somebody can buy.
        </span>
      </div>
    </Card>
  );
}

/**
 * The words this card is the first to use, before the run rather than during it.
 *
 * §15.1 asks for jargon to be taught on first use. Teaching it inside the run would mean
 * interrupting the run, which is the one thing the lesson loop is built not to do — so it is taught
 * in front of it, in the half-minute a reader spends deciding to press Play. Open by default the
 * first time, because a reader who does not know they do not know the words will not open a box
 * that says they might.
 */
function NewWords({ ids }: { ids: string[] }) {
  const terms = ids.map(id => termById(id)).filter((t): t is Term => Boolean(t));
  const [open, setOpen] = useState(true);
  if (!terms.length) return null;
  return (
    <div className={`new-words${open ? ' open' : ''}`}>
      <button className="new-words-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <b>New words in this lesson</b>
        <span>{terms.map(t => t.term).join(' · ')}</span>
      </button>
      {open && (
        <dl>
          {terms.map(t => (
            <div key={t.id}>
              <dt>{firstUseLabel(t)}{t.unit && <span className="words-unit">{t.unit}</span>}</dt>
              <dd>{t.plain}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Player({ card, projectId }: { card: LessonCard; projectId: string | null }) {
  const router = useRouter();
  const { keepRun } = useWorkspace();
  const [values, setValues] = useState(() => defaultControls(card));
  // At rest the whole run is on the charts, because a learner should see the shape of the thing
  // before deciding to watch it happen. Play rewinds and reveals it.
  const [cursor, setCursor] = useState(Number.MAX_SAFE_INTEGER);
  const [playing, setPlaying] = useState(false);
  const [previous, setPrevious] = useState<{ label: string; headline: Metric; second: Metric; endSoc: number } | null>(null);
  const [converting, setConverting] = useState(false);
  const [kept, setKept] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // The result. Recomputed whenever a control moves, because §15.1 requires the comparison to be
  // between two real runs from the same initial state rather than between a run and a redraw.
  const setup = useMemo(() => card.runWith(values), [card, values]);
  const out = useMemo(() => simulate({ ...setup, parameters: lfpParameterSet }), [setup]);

  const steps = out.series.timeSeconds.length;
  const totals = useMemo(() => accounting(out.series), [out]);

  useEffect(() => { setCursor(Number.MAX_SAFE_INTEGER); setPlaying(false); setKept(false); }, [values]);
  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!playing || steps === 0) return;
    // A two-hour scenario plays in about twelve seconds, which §15 asks to be under a minute.
    timer.current = setInterval(() => setCursor(c => {
      if (c + 1 < steps) return c + 1;
      setPlaying(false);
      // Finished means played to the end at least once, not opened. Marked here rather than on
      // mount so the count says what a reader has been through rather than what they clicked on.
      markLessonComplete(card.template.id);
      return steps - 1;
    }), 100);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, steps, card.template.id]);

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

  // Everything on the screen below the controls comes from here: the card says which four figures
  // and which two charts, and the player draws whatever it is handed.
  const readout: Readout = { series: s, totals, values, act };
  const next = nextLesson(card.template.id);
  const metrics = card.readout(readout);
  const plots = card.plots(readout);

  const change = (id: string, n: number) => {
    setPrevious({ label: card.controls.find(c => c.id === id)!.label, headline: metrics[0], second: metrics[1], endSoc: s.soc[steps - 1] });
    setValues(v => ({ ...v, [id]: n }));
  };
  const reset = () => { setValues(defaultControls(card)); setPrevious(null); setCursor(Number.MAX_SAFE_INTEGER); setPlaying(false); };

  const upTo = <T,>(arr: T[]) => arr.slice(0, at + 1);
  const minutes = (i: number) => s.timeSeconds[i] / 60;
  // A two-hour run reads in minutes and a whole day reads in hours. Same axis, different unit,
  // decided by the scenario rather than by which lesson happened to be written first.
  const longRun = s.timeSeconds[steps - 1] > 4 * 3600;
  const xLabel = longRun ? 'Hour' : 'Minute';
  const xAt = (i: number) => (longRun ? s.timeSeconds[i] / 3600 : minutes(i));

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row">
        <Link className="btn ghost sm" href={`/app/lessons${projectId ? `?project=${projectId}` : ''}`}><ArrowLeft size={15} /> All lessons</Link>
        <div className="spacer" />
        <Badge tone="info">{badgeLabels[out.run.badge]}</Badge>
      </div>

      <Card title={card.template.label} subtitle={card.template.question}>
        {/* Three beats, in order: the scene, the run, and what it meant. A card that opened on four
            numbers and two charts left the reader to work out what they were looking at and why. */}
        <p className="lesson-scene"><b>{actOf(card).title}</b> · {card.story.situation}</p>
        <p className="lesson-goal">{card.template.objective}</p>
        <NewWords ids={card.story.teaches} />
        <div className="row" style={{ marginTop: 12 }}>
          {/* The accessible name has to be the words on the button. A control labelled "Simulate
              grid failure" that announces itself as "Play" cannot be asked for by name. */}
          <button className="btn accent" onClick={() => { if (!playing && at >= steps - 1) setCursor(0); setPlaying(p => !p); }}
            aria-label={playing ? 'Pause' : card.sizing ? 'Simulate grid failure' : 'Play'}>
            {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> {card.sizing ? 'Simulate grid failure' : 'Play'}</>}
          </button>
          <button className="btn" onClick={reset}><RotateCcw size={15} /> Reset</button>
          <input aria-label="Position in the run" type="range" min={0} max={Math.max(0, steps - 1)} value={at}
            onChange={e => { setPlaying(false); setCursor(Number(e.target.value)); }} style={{ flex: 1, minWidth: 160 }} />
          <span className="mono">{Math.round(minutes(at))} min of {Math.round(minutes(steps - 1))}</span>
        </div>
      </Card>

      <div className={`grid cols-${Math.min(4, Math.max(1, metrics.length))}`}>
        {metrics.map(m => <Stat key={m.label} label={m.label} value={m.value} unit={m.unit} foot={m.foot} />)}
      </div>

      {/* The first card is where a reader meets the machine, so it is drawn rather than tabulated:
          the enclosure with its supply and its offtake, and beside it the two sets of signals an
          engineer would actually open — the management system's and the converter's. The later
          cards are about a site, a tariff or a limit, and a picture of a box does not help them. */}
      {card.template.id === 'lesson-1' && (
        <Card title="The plant, at this moment"
          subtitle="Where the energy is coming from, what it is doing to the cells, and what each subsystem is reading">
          <PlantDashboard readout={readout} occasion={values.direction ?? 1} />
        </Card>
      )}

      <div className={`grid cols-${Math.min(2, Math.max(1, plots.length))}`}>
        {plots.map(plot => (
          <Card key={plot.title} title={plot.title} subtitle={plot.subtitle} tight>
            <LineChart xLabel={xLabel} format={plot.format} rule={plot.rule} yMin={plot.yMin}
              data={plot.lines.map(l => ({
                name: l.name, color: chartSeries[l.colour % chartSeries.length], dashed: l.dashed,
                points: upTo(l.values).map((y, i) => ({ x: xAt(i), y })),
              }))} />
          </Card>
        ))}
      </div>

      <div className="grid cols-2">
        <Card title="What the plant is doing, and who decided" tight>
          <Stack owner={s.bindingOwner[act]} discharging={s.achievedPowerW[act] > 0} />
          {decision && <Ergos decision={decision} achievedW={s.achievedPowerW[act]} constraint={constraint} />}
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
                Moving {previous.label.toLowerCase()} took {previous.headline.label.toLowerCase()} from {previous.headline.value}{previous.headline.unit ? ` ${previous.headline.unit}` : ''} to
                {' '}{metrics[0]?.value}{metrics[0]?.unit ? ` ${metrics[0].unit}` : ''}, and {previous.second.label.toLowerCase()} from {previous.second.value}{previous.second.unit ? ` ${previous.second.unit}` : ''} to
                {' '}{metrics[1]?.value}{metrics[1]?.unit ? ` ${metrics[1].unit}` : ''}. The ending charge level went from {(previous.endSoc * 100).toFixed(1)}% to {(s.soc[steps - 1] * 100).toFixed(1)}%.
              </p></div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" onClick={reset}><RotateCcw size={14} /> Reset</button>
            {projectId && <button className="btn sm" onClick={() => router.push(`/app/projects?id=${projectId}`)}>Back to the design</button>}
            {projectId && <button className="btn sm accent" onClick={() => setConverting(true)}>Take this duty into the design</button>}
            {projectId && out.run.status === 'complete' && (
              <button className="btn sm" disabled={kept} onClick={async () => {
                // Written once and never edited: the rules refuse an update from every role, so a
                // changed configuration becomes a new run rather than a correction to this one.
                await keepRun({
                  run: out.run, series: s, decisions: out.decisions, events: out.events,
                  label: card.template.label, projectId,
                });
                setKept(true);
              }}>{kept ? 'Result kept' : 'Keep this result with the project'}</button>
            )}
          </div>
        </Card>
      </div>

      {card.baseline && (
        <Comparison card={card} setup={setup} />
      )}

      {card.sizing && (
        <Sizing card={card} values={values}
          onHold={() => { setValues(v => holdSystem(v)); setPrevious(null); }}
          onResize={() => { setValues(v => resizeSystem(v)); setPrevious(null); }}
          onSet={(id, value) => { setValues(v => ({ ...v, [id]: value })); setPrevious(null); }} />
      )}

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

      {converting && projectId && (
        <Conversion card={card} values={values} projectId={projectId} onClose={() => setConverting(false)} />
      )}

      {/* The third beat, and the one that was missing: what the run the reader just produced
          actually showed. Written from that run, so moving a control rewrites it — a fixed line of
          text under a variable result is a caption, not a conclusion. §15.1 ends the loop here,
          with the next card named rather than left for the reader to find on a grid of seven. */}
      <Card title="So what" subtitle="Drawn from the run above, not from a script">
        <p className="lesson-sowhat">{card.story.soWhat(readout)}</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={reset}><RotateCcw size={14} /> Run it again</button>
          {next
            ? <Link className="btn sm accent" href={`/app/lessons?lesson=${next.template.id}${projectId ? `&project=${projectId}` : ''}`}>
                Next · {next.template.label} <ArrowRight size={14} />
              </Link>
            : <Link className="btn sm" href={`/app/lessons${projectId ? `?project=${projectId}` : ''}`}>Back to the seven cards</Link>}
          {next && <span className="muted">{next.story.takeaway}</span>}
        </div>
      </Card>

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

/**
 * The sizing panels §15.3 puts beside the run.
 *
 * Three result cards, an assumptions strip, and two actions that are deliberately not the same
 * action: **Test this system** holds the equipment still and asks whether it carries a different
 * duty; **Resize system** sizes the equipment for the duty on the screen. An interface that
 * silently does the second when the learner meant the first answers a question nobody asked.
 */
function Sizing({ card, values, onHold, onResize, onSet }: {
  card: LessonCard; values: Record<string, number>; onHold: () => void; onResize: () => void;
  onSet: (id: string, value: number) => void;
}) {
  const s = card.sizing!(values);
  const titles: Record<string, string> = {
    selected: 'Selected requirement', 'next-power': 'Next supported power size', 'longer-runtime': 'Longer runtime option',
    'under-test': 'The system under test', 'would-need': 'What this duty would need',
  };
  return (
    <div className="grid" style={{ gap: 14 }}>
      <Card title="What this asks of the equipment"
        subtitle={s.held ? 'Testing the system already selected against this duty' : 'Sized for the duty on the screen'} tight>
        <div className="notice warning">
          <b>Indicative sizing from contract demand</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
            {s.requirement.warnings.map(w => <li key={w}>{w}</li>)}
          </ul>
        </div>
        {s.held && s.held.shortfalls.length > 0 && (
          <div className="notice error" style={{ marginTop: 10 }}>
            <b>This system does not carry that duty</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
              {s.held.shortfalls.map(f => <li key={f}>{f}</li>)}
            </ul>
          </div>
        )}
        <div className="notice info" style={{ marginTop: 10 }}>
          <b>{s.readiness.ready ? 'Ready' : 'Insufficient readiness'}</b>
          <p>{s.readiness.reason}</p>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={onHold} disabled={!!s.held}>Test this system</button>
          <button className="btn sm" onClick={onResize} disabled={!s.held}>Resize system</button>
          <div className="spacer" />
          <span className="muted">{s.held ? 'Equipment held; the duty is what changes.' : 'Equipment follows the duty.'}</span>
        </div>
        <details className="ergos-why" style={{ marginTop: 12 }}>
          <summary>Explore deeper — every assumption these figures came from</summary>
          <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
            {s.requirement.basis.map(b => <li key={b}>{b}</li>)}
          </ul>
        </details>
      </Card>

      {s.problems.length > 0 && (
        <Card title="Commercial selection pending" tight>
          {s.problems.map(p => <p key={p} className="muted" style={{ margin: 0 }}>{p}</p>)}
        </Card>
      )}

      <Card title="The conditions it runs in" subtitle="Illustrative Indian site scenarios — not measured averages, and not a claim about any city or state" tight>
        <div className="field">
          <span>Operating conditions</span>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {indiaPresets.map((p, i) => (
              <button key={p.id} className={`btn sm${Math.round(values.conditions ?? 0) === i ? ' accent' : ''}`}
                aria-pressed={Math.round(values.conditions ?? 0) === i} onClick={() => onSet('conditions', i)}>{p.label}</button>
            ))}
          </div>
          <p className="hint">{s.india.preset.teaches}</p>
        </div>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap', marginTop: 6 }}>
          <div className="field" style={{ margin: 0 }}>
            <span>Horizon</span>
            <div className="row" style={{ gap: 6 }}>
              {[5, 10, 15].map((y, i) => (
                <button key={y} className={`btn sm${Math.round(values.horizon ?? 1) === i ? ' accent' : ''}`}
                  aria-pressed={Math.round(values.horizon ?? 1) === i} onClick={() => onSet('horizon', i)}>{y} yr</button>
              ))}
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <span>Tariff</span>
            <div className="row" style={{ gap: 6 }}>
              {teachingTariffs.map((t, i) => (
                <button key={t} className={`btn sm${Math.round(values.tariff ?? 1) === i ? ' accent' : ''}`}
                  aria-pressed={Math.round(values.tariff ?? 1) === i} onClick={() => onSet('tariff', i)}>₹{t}/kWh</button>
              ))}
            </div>
            <p className="hint">Teaching values, not current DISCOM tariffs.</p>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <span>Prices</span>
            <div className="row" style={{ gap: 6 }}>
              <button className={`btn sm${values.priced !== 1 ? ' accent' : ''}`} aria-pressed={values.priced !== 1}
                onClick={() => onSet('priced', 0)}>None entered</button>
              <button className={`btn sm${values.priced === 1 ? ' accent' : ''}`} aria-pressed={values.priced === 1}
                onClick={() => onSet('priced', 1)}>Illustrative quotation</button>
            </div>
            <p className="hint">With nothing entered the ledger carries the gaps rather than filling them.</p>
          </div>
        </div>
        <div className="row" style={{ gap: 18, marginTop: 10 }}>
          <KV label="Room">{s.india.roomC} °C</KV>
          <KV label="Cells">{s.india.batteryC} °C</KV>
        </div>
        <p className="muted" style={{ margin: '6px 0 0' }}>{s.india.preset.batteryRiseBasis}</p>
      </Card>

      <Card title={`What it costs over ${s.india.horizonYears} years`}
        subtitle={`Discounted, in rupees, at ₹${s.india.tariffInrPerKWh}/kWh — with everything that could not be priced listed rather than counted as nothing`} tight>
        <table className="data">
          <thead><tr><th /><th>Lead-acid</th><th>Lithium</th></tr></thead>
          <tbody>
            <tr><td>Undiscounted</td>{s.india.costs.map(c => <td key={c.chemistry} className="mono">{inr(c.totals.undiscountedInr)}</td>)}</tr>
            <tr><td>Discounted</td>{s.india.costs.map(c => <td key={c.chemistry} className="mono">{inr(c.totals.discountedInr)}</td>)}</tr>
            <tr><td>Replacement basis</td>{s.india.costs.map(c => (
              <td key={c.chemistry}>{c.replacement.kind === 'modelled' ? `Modelled: every ${c.replacement.years.toFixed(1)} yr` : `Declared cases: ${c.replacement.cases.join(', ')} yr`}</td>
            ))}</tr>
            <tr><td>Outages carried, on this schedule</td>{s.india.readiness.map(r => (
              <td key={r.chemistry} className="mono">{r.carried} of {r.asked} · ends at {(r.endingSoc * 100).toFixed(0)}%</td>
            ))}</tr>
            <tr><td>Lines with no price</td>{s.india.costs.map(c => <td key={c.chemistry} className="mono">{c.totals.unknown.length}</td>)}</tr>
          </tbody>
        </table>
        <div className="notice warning" style={{ marginTop: 10 }}>
          <b>
            {s.india.costs.some(c => !c.totals.complete)
              ? 'No crossover is stated, because the totals are incomplete'
              : s.india.crossoverYear === null
                ? `No crossover within ${s.india.horizonYears} years`
                : `They cross in year ${s.india.crossoverYear}`}
          </b>
          <p>
            {s.india.costs.some(c => !c.totals.complete)
              ? 'A crossover between two partial sums would be the most confident figure on this screen and the least supported. Enter prices, or read the lines with none.'
              : s.india.crossoverYear === null
                ? 'On these assumptions the running totals do not cross inside the horizon. That is the answer, not a missing one.'
                : 'Before that year one option is ahead on cumulative discounted cost, and after it the other is.'}
          </p>
        </div>
        {s.india.costs.some(c => !c.totals.complete) && (
          <div className="notice error">
            <b>These totals are incomplete</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
              {[...new Set(s.india.costs.flatMap(c => c.totals.unknown.map(u => `${u.label} — ${u.basis}`)))].slice(0, 6).map(u => <li key={u}>{u}</li>)}
            </ul>
          </div>
        )}
        <details className="ergos-why">
          <summary>Every assumption behind these figures</summary>
          <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
            {s.india.disclosures.map(d => <li key={d}>{d}</li>)}
            {s.india.costs.flatMap(c => c.totals.notes.map(n => <li key={`${c.chemistry}-${n}`}><b>{c.chemistry}:</b> {n}</li>))}
          </ul>
        </details>
      </Card>

      <Card title="Lead-acid or lithium, for the same service"
        subtitle="Each sized against its own discharge curves for the same protected load and the same autonomy" tight>
        <table className="data">
          <thead>
            <tr><th /><th>{s.chemistry.options[0].label}</th><th>{s.chemistry.options[1].label}</th></tr>
          </thead>
          <tbody>
            <tr><td>Configuration</td>{s.chemistry.options.map(o => <td key={o.chemistry}>{o.feasible ? o.units : 'Not offered'}</td>)}</tr>
            <tr><td>Installed energy</td>{s.chemistry.options.map(o => <td key={o.chemistry} className="mono">{o.feasible ? `${o.installedEnergyKWh.toFixed(0)} kWh` : '—'}</td>)}</tr>
            <tr><td>Mass</td>{s.chemistry.options.map(o => <td key={o.chemistry} className="mono">{o.feasible ? `${(o.massKg / 1000).toFixed(1)} t` : '—'}</td>)}</tr>
            <tr><td>Floor area, with clearance</td>{s.chemistry.options.map(o => <td key={o.chemistry} className="mono">{o.feasible ? `${o.footprintM2.toFixed(1)} m²` : '—'}</td>)}</tr>
            <tr><td>DC bus</td>{s.chemistry.options.map(o => <td key={o.chemistry} className="mono">{o.feasible ? `${o.dcVolts.toFixed(0)} V` : '—'}</td>)}</tr>
            <tr><td>Recharge to full</td>{s.chemistry.options.map(o => <td key={o.chemistry} className="mono">{o.rechargeMinutesToFull == null ? '—' : `${(o.rechargeMinutesToFull / 60).toFixed(1)} h`}</td>)}</tr>
            <tr><td>Service life at 25 °C</td>{s.chemistry.options.map(o => <td key={o.chemistry} className="mono">{o.serviceLifeYears == null ? 'data required' : `${o.serviceLifeYears.toFixed(1)} yr`}</td>)}</tr>
          </tbody>
        </table>

        <h4 style={{ margin: '14px 0 6px', fontSize: 12.5 }}>Three fifteen-minute outages in one day, an hour apart</h4>
        <table className="data">
          <thead><tr><th /><th>First</th><th>Second</th><th>Third</th></tr></thead>
          <tbody>
            {s.repeated.map(r => (
              <tr key={r.chemistry}>
                <td>{r.chemistry}</td>
                {r.events.map(e => (
                  <td key={e.atMinutes} className="mono">
                    {e.carriedMinutes.toFixed(0)} of {e.askedMinutes} min
                    <span className="muted"> · from {(e.socBefore * 100).toFixed(0)}%</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 8 }}>
          The schedule is independent of the backup duration chosen above. Each outage starts at the
          charge the last one left, on whatever the charger could put back in between.
        </p>

        <div className="notice info" style={{ marginTop: 12 }}>
          <b>What differs between them, which is never nothing</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
            {s.chemistry.differences.map(d => <li key={d}>{d}</li>)}
          </ul>
        </div>
        <details className="ergos-why">
          <summary>What this comparison does and does not claim</summary>
          <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
            {s.chemistry.disclosures.map(d => <li key={d}>{d}</li>)}
            {s.chemistry.options.flatMap(o => o.notes.map(n => <li key={`${o.chemistry}-${n}`}><b>{o.chemistry}:</b> {n}</li>))}
          </ul>
        </details>
      </Card>

      {s.options.length > 0 && (
        <div className={`grid cols-${Math.min(3, s.options.length)}`}>
          {s.options.map(o => (
            <Card key={o.role} title={titles[o.role] ?? o.role} subtitle={`${o.enclosureCount} × ${o.enclosure.model}`} tight>
              <KV label="Energy">{o.energyKWh.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh</KV>
              <KV label="Continuous">{o.continuousKW.toLocaleString(undefined, { maximumFractionDigits: 0 })} kW</KV>
              <KV label="Converters">{o.pcsCount} × {o.pcs.model}</KV>
              <KV label="Limited by">{o.binding === 'power' ? 'discharge rate, not energy' : 'energy'}</KV>
              <KV label="Rate asked of it">{o.requiredCRate.toFixed(2)} C</KV>
              <details className="ergos-why" style={{ marginTop: 8 }}>
                <summary>What is illustrative about this</summary>
                <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                  {o.caveats.map(c => <li key={c}>{c}</li>)}
                </ul>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The baseline comparison.
 *
 * §11.4 allows exactly one kind of baseline: a real alternative, run on the same day with the same
 * equipment and every protection still in force. So the baseline here is either the site without
 * storage or a fixed schedule — both things people actually do — and never an "EMS off" that
 * disables safety or dispatches irrationally to make the candidate look good.
 *
 * The ending charge is disclosed whether or not it helps, because a policy that finishes with a
 * fuller battery has not saved money; it has deferred spending it.
 */
function Comparison({ card, setup }: { card: LessonCard; setup: ReturnType<LessonCard['runWith']> }) {
  const c = useMemo(() => comparePolicies(
    { scenario: setup.scenario, plant: setup.plant, parameters: lfpParameterSet, manualRequestW: setup.manualRequestW },
    card.baseline!.policy, setup.policy,
  ), [card, setup]);

  const rows: { label: string; a: string; b: string; better: 'lower' | 'higher' }[] =
    card.compareOn === 'peak'
      ? [
        { label: 'Highest grid import', a: `${kW(c.baseline.peakGridImportW)} kW`, b: `${kW(c.candidate.peakGridImportW)} kW`, better: 'lower' },
        { label: 'Energy drawn from the grid', a: `${kWh(c.baseline.importedWh)} kWh`, b: `${kWh(c.candidate.importedWh)} kWh`, better: 'lower' },
        { label: 'Charge at the end', a: `${(c.baseline.endingSoc * 100).toFixed(1)}%`, b: `${(c.candidate.endingSoc * 100).toFixed(1)}%`, better: 'higher' },
      ]
      : card.compareOn === 'cost'
        ? [
          { label: 'Illustrative cost for the day', a: `₹${Math.round(c.baseline.illustrativeCost).toLocaleString('en-IN')}`, b: `₹${Math.round(c.candidate.illustrativeCost).toLocaleString('en-IN')}`, better: 'lower' },
          { label: 'Bought', a: `${kWh(c.baseline.importedWh)} kWh`, b: `${kWh(c.candidate.importedWh)} kWh`, better: 'lower' },
          { label: 'Sold', a: `${kWh(c.baseline.exportedWh)} kWh`, b: `${kWh(c.candidate.exportedWh)} kWh`, better: 'higher' },
          { label: 'Charge at the end', a: `${(c.baseline.endingSoc * 100).toFixed(1)}%`, b: `${(c.candidate.endingSoc * 100).toFixed(1)}%`, better: 'higher' },
        ]
        : [
          { label: 'Generation kept on site', a: `${kWh(c.baseline.selfConsumedWh)} kWh`, b: `${kWh(c.candidate.selfConsumedWh)} kWh`, better: 'higher' },
          { label: 'Exported', a: `${kWh(c.baseline.exportedWh)} kWh`, b: `${kWh(c.candidate.exportedWh)} kWh`, better: 'lower' },
          { label: 'Charge at the end', a: `${(c.baseline.endingSoc * 100).toFixed(1)}%`, b: `${(c.candidate.endingSoc * 100).toFixed(1)}%`, better: 'higher' },
        ];

  return (
    <Card title="Against the alternative" subtitle={`${card.baseline!.label}, run on the same day with the same equipment and every protection still in force`} tight>
      <table className="data">
        <thead><tr><th /><th>{card.baseline!.label}</th><th>With ergOS</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}><td>{r.label}</td><td className="mono">{r.a}</td><td className="mono">{r.b}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="notice info" style={{ marginTop: 10 }}>
        <b>Read this before the numbers above</b>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          {c.disclosures.map(d => <li key={d}>{d}</li>)}
        </ul>
      </div>
    </Card>
  );
}

/**
 * The ergOS card.
 *
 * §11.3 fixes what it carries and in what order: the goal, what was observed, the action, the
 * requested and delivered power with any active limit, and one plain sentence of reason — with
 * **Why?** opening the rule underneath it and the values it fired on. Nothing here is written by
 * hand: every figure is read from the decision the engine recorded at this timestamp, which is
 * what §14.1 means by an explanation that resolves to logged values.
 */
function Ergos({ decision, achievedW, constraint }: {
  decision: { goal: string; action: string; rule: string; explanation: string; requestedPowerW: number;
    observed: Record<string, number>; policyVersion: string; telemetryAgeSeconds: number;
    usedFallback: boolean; heldSetpoint: boolean; localControl: boolean;
    appliedLimits: { by: string; limitW: number; reason: string }[] };
  achievedW: number; constraint: string;
}) {
  const tone: Tone = decision.action === 'hold' ? 'neutral' : decision.action === 'reduce' ? 'warn' : 'info';
  const shown = ['soc', 'siteLoadW', 'generationW', 'pricePerMWh', 'floorSoc', 'islandBalanceW'];
  const label: Record<string, string> = {
    soc: 'Charge level', siteLoadW: 'Site load', generationW: 'Generation', pricePerMWh: 'Price',
    floorSoc: 'Floor', islandBalanceW: 'The island needs', manualRequestW: 'Asked for',
    reserveSoc: 'Reserve', telemetryAgeSeconds: 'Telemetry age', telemetryTimeoutSeconds: 'Telemetry timeout',
    hourOfDay: 'Hour of day', windowPricePerMWh: 'Window price', auxiliaryW: 'Auxiliaries', localControl: 'Local control',
    islanded: 'Islanded',
  };
  const value = (k: string, v: number) =>
    k.endsWith('Soc') || k === 'soc' ? `${(v * 100).toFixed(1)}%`
      : k.endsWith('W') ? `${Math.round(v / 1000).toLocaleString()} kW`
        : k.endsWith('Seconds') ? `${Math.round(v)} s`
          : k.includes('rice') ? v.toLocaleString() : String(v);
  return (
    <div className="ergos">
      <div className="row" style={{ gap: 8 }}>
        <b>ergOS is deciding</b>
        <Badge tone={tone}>{decision.action}</Badge>
        <div className="spacer" />
        <span className="muted">educational simulation</span>
      </div>
      <p className="ergos-goal">{decision.goal}</p>
      <div className="ergos-observed">
        {shown.filter(k => decision.observed[k] !== undefined).map(k => (
          <span key={k}><i>{label[k] ?? k}</i> {value(k, decision.observed[k])}</span>
        ))}
      </div>
      <div className="ergos-power">
        <span>{Math.abs(decision.requestedPowerW / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} kW requested</span>
        <span aria-hidden>→</span>
        <span>{Math.abs(achievedW / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} kW delivered</span>
        {constraint && constraint !== 'Request met in full' && <em>{constraint}</em>}
      </div>
      <p className="lesson-explain">{decision.explanation}</p>
      <details className="ergos-why">
        <summary>Why?</summary>
        <KV label="Rule">{decision.rule}</KV>
        <KV label="Policy version">{decision.policyVersion}</KV>
        <KV label="Telemetry age">{Math.round(decision.telemetryAgeSeconds)} s{decision.usedFallback ? ' — past its timeout, so the fallback applied' : ''}</KV>
        <KV label="Setpoint">{decision.heldSetpoint ? 'Held from the last decision' : 'Issued this step'}</KV>
        {decision.localControl && <KV label="Control">Local — the policy is not in command while the plant is islanded</KV>}
        {decision.appliedLimits.slice(0, 3).map(l => (
          <KV key={l.reason} label={l.by}>{Math.round(l.limitW / 1000).toLocaleString()} kW — {l.reason}</KV>
        ))}
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Every figure above was recorded by the run at this moment. Nothing in the sentence is written separately from them.
        </p>
      </details>
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
function Stack({ owner, discharging }: { owner: string; discharging: boolean }) {
  // The owner is read from the run rather than guessed from the wording of the constraint. The two
  // used to be inferred separately, which is how a diagram ends up lighting the converter while
  // the text beside it names the battery management system.
  const lit = owner === 'battery' ? 'BMS' : owner === 'grid' ? 'PCS' : owner;
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
          <div className={`sim-box${lit === b.id ? ' limiting' : ''}`}>
            <b>{b.name}</b><span>{b.role}</span>
            {lit === b.id && <i className="sim-limiting"><Zap size={11} /> limiting</i>}
          </div>
          {i < boxes.length - 1 && <div className="sim-flow" aria-hidden />}
        </div>
      ))}
    </div>
  );
}

/**
 * Taking a lesson's duty into a design.
 *
 * §17.2 asks for the learning-to-design conversion, and the honest version of it is mostly a list
 * of what does not come across. The power and the duration do. The teaching plant, its cell and its
 * converter do not, and neither does any claim that this is now about a site: the panel shows where
 * every figure came from and what the design still needs before anybody proposes it to anyone.
 */
function Conversion({ card, values, projectId, onClose }: {
  card: LessonCard; values: Record<string, number>; projectId: string; onClose: () => void;
}) {
  const router = useRouter();
  const { projects, saveProject } = useWorkspace();
  const project = projects.find(p => p.id === projectId);
  const c = designFromLesson({ lessonId: card.template.id, lessonLabel: card.template.label, values });
  if (!project) return null;
  return (
    <Card title="Take this duty into the design" subtitle={`What ${card.template.label.toLowerCase()} would mean for ${project.name}`} tight>
      <table className="data">
        <thead><tr><th>Figure</th><th>Value</th><th>Where it came from</th></tr></thead>
        <tbody>
          {c.provenance.map(p => (
            <tr key={p.field}><td>{p.field}</td><td className="mono">{p.value}</td><td className="muted">{p.from}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="notice warning" style={{ marginTop: 10 }}>
        <b>What this design still needs</b>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          {c.outstanding.map(o => <li key={o}>{o}</li>)}
        </ul>
      </div>
      <p className="muted">{conversionCaveat}</p>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn accent sm" onClick={async () => {
          await saveProject({ ...project, sizing: c.input }, `Duty taken from ${card.template.label}.`);
          router.push(`/app/projects?id=${projectId}`);
        }}>Apply it to {project.name}</button>
        <button className="btn sm" onClick={onClose}>Not now</button>
      </div>
    </Card>
  );
}
