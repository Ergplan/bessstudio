'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Projects } from '../../../src/app/pages/Projects';
import { ProjectDetail } from '../../../src/app/pages/ProjectDetail';

function Route() {
  const id = useSearchParams().get('id');
  return id ? <ProjectDetail id={id} /> : <Projects />;
}

export default function Page() {
  return <Suspense fallback={null}><Route /></Suspense>;
}
