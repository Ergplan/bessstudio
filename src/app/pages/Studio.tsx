import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { brand } from '../../brand/brand';
import { useSession } from '../../platform/auth';
import { useWorkspace } from '../../platform/workspace';
import { useStudio } from '../../state/store';
import { configSchema } from '../../config/schema';
import { sizeSystem } from '../../sizing/engine';
import { byId, enclosures } from '../../catalog/products';

// The 3D studio pulls in three.js and its own stylesheet, so it is loaded only when opened.
const Studio3D = lazy(() => import('../../App'));

export function Studio() {
  const [params] = useSearchParams();
  const { org } = useSession();
  const { projects, saveProject } = useWorkspace();
  const project = projects.find(p => p.id === params.get('project'));
  const [note, setNote] = useState('');

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 18px', background: '#153956', color: '#fff', fontSize: 12.5 }}>
        <Link to={project ? `/projects/${project.id}` : '/'} style={{ color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Back to {project ? 'project' : 'workspace'}
        </Link>
        <span style={{ opacity: .55 }}>|</span>
        <span style={{ flex: 1, opacity: .9 }}>
          {context || 'Parametric enclosure assembly — open a project to carry its configuration into the workbench.'}
          {note && <em style={{ opacity: .75 }}> · {note}</em>}
        </span>
        {project && (
          <button onClick={saveToProject}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#93BE49', color: '#1B2D12', border: 0, borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 600 }}>
            <Save size={14} /> Save to project
          </button>
        )}
        <a href={brand.vendorUrl} target="_blank" rel="noreferrer" style={{ color: brand.goldLight, fontSize: 11.5 }}>{brand.credit}</a>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#61738D' }}>Loading the 3D assembly…</div>}>
          <Studio3D brandName={(org?.branding.displayName ?? brand.vendorShort).toUpperCase()} brandLogo={org?.branding.logo ?? null} projectName={project?.name} />
        </Suspense>
      </div>
    </div>
  );
}
