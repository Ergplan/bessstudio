'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Save } from 'lucide-react';
import { brand } from '../../brand/brand';
import { useSession } from '../../platform/auth';
import { useWorkspace } from '../../platform/workspace';
import { useStudio } from '../../state/store';
import { configSchema } from '../../config/schema';
import { sizeSystem } from '../../sizing/engine';
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
  const { org } = useSession();
  const { projects, saveProject } = useWorkspace();
  const project = projects.find(p => p.id === params.get('project'));
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const canvasHost = useRef<HTMLDivElement>(null);

  // Carry the project into the assembly: a saved studio configuration wins, otherwise the
  // enclosure's topology preset is applied so the viewer matches what was sized.
  useEffect(() => {
    if (!project) return;
    const { config, import: importConfig, update } = useStudio.getState();
    if (project.studioConfig) {
      const parsed = configSchema.safeParse(project.studioConfig);
      if (parsed.success) { importConfig(parsed.data); setNote(''); return; }
    }
    const enclosure = byId(enclosures, project.sizing.enclosureId);
    if (!enclosure.studioPreset) {
      setNote(`${enclosure.model} is not modelled in 3D yet — the reference 5 MWh assembly is shown instead.`);
      return;
    }
    if (config.preset !== enclosure.studioPreset) update(c => { c.preset = enclosure.studioPreset!; });
    setNote('');
  }, [project]);

  let context = '';
  if (project) {
    try {
      const s = sizeSystem(project.sizing);
      context = `${project.customerName} · ${project.name} — ${s.units} × ${s.enclosure.model} (${s.installedDcMWh.toFixed(2)} MWh DC, ${s.ratedPowerMW.toFixed(2)} MW)`;
    } catch { context = `${project.customerName} · ${project.name}`; }
  }

  const saveToProject = () => {
    if (!project) return;
    void saveProject({ ...project, studioConfig: useStudio.getState().config, status: project.status === 'sizing' ? 'engineering' : project.status },
      `Assembly configuration saved to ${project.name}.`);
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 18px', background: '#153956', color: '#fff', fontSize: 12.5 }}>
        <Link href={project ? `/app/projects?id=${project.id}` : '/app'} style={{ color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Back to {project ? 'project' : 'workspace'}
        </Link>
        <span style={{ opacity: .55 }}>|</span>
        <span style={{ flex: 1, opacity: .9 }}>
          {context || 'Parametric enclosure assembly — open a project to carry its configuration into the workbench.'}
          {note && <em style={{ opacity: .75 }}> · {note}</em>}
        </span>
        {status && <em style={{ opacity: .85 }}>{status}</em>}
        {project && (
          <button onClick={() => void captureForOffer()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.28)', borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 600 }}>
            <Camera size={14} /> Capture for offer
          </button>
        )}
        {project && (
          <button onClick={saveToProject}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#93BE49', color: '#1B2D12', border: 0, borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 600 }}>
            <Save size={14} /> Save to project
          </button>
        )}
        <a href={brand.vendorUrl} target="_blank" rel="noreferrer" style={{ color: brand.goldLight, fontSize: 11.5 }}>{brand.credit}</a>
      </div>
      <div style={{ flex: 1, minHeight: 0 }} ref={canvasHost}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#61738D' }}>Loading the 3D assembly…</div>}>
          <Studio3D brandName={(org?.branding.displayName ?? brand.vendorShort).toUpperCase()} brandLogo={org?.branding.logo ?? null} projectName={project?.name} />
        </Suspense>
      </div>
    </div>
  );
}
