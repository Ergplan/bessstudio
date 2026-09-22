'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Save } from 'lucide-react';
import { brand } from '../../brand/brand';
import { useSession } from '../../platform/auth';
import { useWorkspace } from '../../platform/workspace';
import { useStudio } from '../../state/store';
import { configSchema } from '../../config/schema';
import { sizeSystem } from '../../sizing/engine';
import { limitsFromSizing } from '../../platform/studioBridge';
import type { SiteSpec } from '../../geometry/site';
import { byId, enclosures } from '../../catalog/products';

// The 3D studio pulls in three.js and its own stylesheet, so it is loaded only when opened.
const Studio3D = lazy(() => import('../../App'));

/** Read the studio's WebGL canvas into a PNG data URL for the offer cover. */
const captureCanvas = (root: HTMLElement | null) => new Promise<string | null>(resolve => {
  const canvas = root?.querySelector('canvas');
  if (!canvas) return resolve(null);
  requestAnimationFrame(() => {
    try { resolve(canvas.toDataURL('image/png')); } catch { resolve(null); }
  });
});

export function Studio() {
  const params = useSearchParams();
  const router = useRouter();
  const { org } = useSession();
  const { projects, saveProject } = useWorkspace();
  const project = projects.find(p => p.id === params.get('project'));
  const [note, setNote] = useState('');
  // Whether what is on screen is the configuration held on the project, or a draft that only
  // exists in this browser. Every edit replaces the configuration object, so holding the one that
  // was loaded or last saved and comparing identity is enough.
  const config = useStudio(s => s.config);
  const settled = useRef<unknown>(null);
  const fromStore = useRef(false);
  const [status, setStatus] = useState('');
  const canvasHost = useRef<HTMLDivElement>(null);

  // Carry the project into the assembly: a saved studio configuration wins, otherwise the
  // enclosure's topology preset is applied so the viewer matches what was sized, and the limits the
  // studio checks against come from the converter the project actually selected.
  useEffect(() => {
    if (!project) return;
    const { config, import: importConfig, update } = useStudio.getState();
    if (project.studioConfig) {
      const parsed = configSchema.safeParse(project.studioConfig);
      if (parsed.success) { importConfig(parsed.data); setNote(''); fromStore.current = true; settled.current = useStudio.getState().config; return; }
    }
    const enclosure = byId(enclosures, project.sizing.enclosureId);
    fromStore.current = false;
    let limitNote = '';
    try {
      const limits = limitsFromSizing(sizeSystem(project.sizing));
      update(c => {
        if (enclosure.studioPreset) c.preset = enclosure.studioPreset;
        c.equipment = limits.equipment;
        c.usable = limits.usable;
      });
      limitNote = `Checked against ${limits.label}.`;
      settled.current = useStudio.getState().config;
    } catch {
      if (enclosure.studioPreset && config.preset !== enclosure.studioPreset) update(c => { c.preset = enclosure.studioPreset!; });
    }
    setNote(enclosure.studioPreset
      ? limitNote
      : `${enclosure.model} is not modelled in 3D yet — the reference 5 MWh assembly is shown instead. ${limitNote}`.trim());
  }, [project]);

  let context = '';
  let units = 0;
  let site: SiteSpec | null = null;
  // The product the project bought, whether or not the studio has an interior for it.
  let product: { model: string; modelled: boolean } | null = null;
  if (project) {
    try {
      const s = sizeSystem(project.sizing);
      units = s.units;
      product = { model: s.enclosure.model, modelled: !!s.enclosure.studioPreset };
      context = `${s.installedDcMWh.toFixed(2)} MWh DC · ${s.ratedPowerMW.toFixed(2)} MW`;
      // Only a fleet is worth laying out; one container is the container view.
      if (s.totalUnits > 1) site = {
        units: s.units, laterUnits: Math.max(0, s.totalUnits - s.units),
        // The plot is laid out from the product the project selected, even where the studio has no
        // interior for it, so a site of cabinets is not drawn as a site of 20-foot containers.
        model: s.enclosure.model, modelled: !!s.enclosure.studioPreset,
        enclosure: [s.enclosure.lengthMm / 1000, s.enclosure.heightMm / 1000, s.enclosure.widthMm / 1000],
        pcsCount: s.pcsCount, pcsModel: s.pcs.model, pcsKW: s.pcs.ratedKW,
        transformerCount: s.transformerCount, transformerMVA: s.transformer ? s.transformer.ratedKVA / 1000 : 0,
        energyMWh: s.installedDcMWh, powerMW: s.ratedPowerMW,
      };
    } catch { context = project.customerName; }
  }

  const saveToProject = () => {
    if (!project) return;
    void saveProject({ ...project, studioConfig: useStudio.getState().config, status: project.status === 'sizing' ? 'engineering' : project.status },
      `Assembly configuration saved to ${project.name}.`);
    fromStore.current = true;
    settled.current = useStudio.getState().config;
  };

  // The captured view goes on the project, where every quotation raised from it picks it up as the
  // offer cover. A data URL of this size is well inside the document limit.
  const captureForOffer = async () => {
    if (!project) return;
    setStatus('Capturing…');
    const image = await captureCanvas(canvasHost.current);
    if (!image) { setStatus('The view could not be captured. Rotate the model and try again.'); return; }
    await saveProject({ ...project, studioImage: image }, `Assembly view captured for the offer of ${project.name}.`);
    setStatus('Captured — it now appears on the offer cover.');
    setTimeout(() => setStatus(''), 4000);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 18px', background: '#0A0C0F', borderBottom: '1px solid rgba(255,255,255,.08)', color: '#F2F5F7', fontSize: 12.5 }}>
        <Link href={project ? `/app/projects?id=${project.id}` : '/app'} style={{ color: '#F2F5F7', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Back to {project ? 'project' : 'workspace'}
        </Link>
        <span style={{ opacity: .55 }}>|</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ opacity: .5, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Project</span>
          <select aria-label="Project" value={project?.id ?? ''}
            onChange={e => router.push(e.target.value ? `/app/studio?project=${e.target.value}` : '/app/studio')}
            style={{ background: 'rgba(255,255,255,.05)', color: '#F2F5F7', border: '1px solid rgba(255,255,255,.18)', padding: '4px 8px', fontSize: 12.5, maxWidth: 260 }}>
            <option value="">Reference assembly</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.customerName} · {p.name}</option>)}
          </select>
        </label>
        <span title={[context, note].filter(Boolean).join(' · ')} style={{ flex: 1, minWidth: 0, opacity: .9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {context || 'Parametric enclosure assembly, not yet tied to a project.'}
          {note && <em style={{ opacity: .75 }}> · {note}</em>}
        </span>
        {status && <em style={{ opacity: .85 }}>{status}</em>}
        {project && (
          <button onClick={() => void captureForOffer()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.06)', color: '#F2F5F7', border: '1px solid rgba(255,255,255,.2)', padding: '6px 12px', fontSize: 11, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
            <Camera size={14} /> Capture for offer
          </button>
        )}
        {project && (
          <button onClick={saveToProject}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#93BE49', color: '#101A08', border: 0, padding: '6px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
            <Save size={14} /> Save to project
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} ref={canvasHost}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#5E6C79' }}>Loading the 3D assembly…</div>}>
          <Studio3D brandName={(org?.branding.displayName ?? brand.vendorShort).toUpperCase()} brandLogo={org?.branding.logo ?? null} projectName={project?.name} projectRef={project?.reference} state={!project?'reference':settled.current!==config?'edited':fromStore.current?'stored':'derived'} unitCount={units} site={site} product={product} />
        </Suspense>
      </div>
    </div>
  );
}
