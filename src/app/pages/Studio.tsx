import { Suspense, lazy } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { brand } from '../../brand/brand';
import { useWorkspace } from '../../platform/workspace';
import { sizeSystem } from '../../sizing/engine';
import { enclosures } from '../../catalog/products';

// The 3D studio pulls in three.js and its own stylesheet, so it is loaded only when opened.
const Studio3D = lazy(() => import('../../App').then(m => ({ default: m.default })));

export function Studio() {
  const [params] = useSearchParams();
  const { projects } = useWorkspace();
  const project = projects.find(p => p.id === params.get('project'));
  let context = '';
  if (project) {
    try {
      const s = sizeSystem(project.sizing);
      const enclosure = enclosures.find(e => e.id === project.sizing.enclosureId);
      context = `${project.customerName} · ${project.name} — ${s.units} × ${enclosure?.model ?? ''} (${s.installedDcMWh.toFixed(2)} MWh DC)`;
    } catch { context = `${project.customerName} · ${project.name}`; }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 18px', background: '#153956', color: '#fff', fontSize: 12.5 }}>
        <Link to={project ? `/projects/${project.id}` : '/'} style={{ color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Back to {project ? 'project' : 'workspace'}
        </Link>
        <span style={{ opacity: .55 }}>|</span>
        <span style={{ flex: 1, opacity: .9 }}>
          {context || 'Parametric enclosure assembly — open a project to carry its configuration into the workbench.'}
        </span>
        <a href={brand.vendorUrl} target="_blank" rel="noreferrer" style={{ color: brand.goldLight, fontSize: 11.5 }}>{brand.credit}</a>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#61738D' }}>Loading the 3D assembly…</div>}>
          <Studio3D />
        </Suspense>
      </div>
    </div>
  );
}
