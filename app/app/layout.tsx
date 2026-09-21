'use client';
import { Suspense } from 'react';
import { AppShell } from '../../src/app/AppShell';
import { Authenticated } from '../../src/app/Authenticated';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Authenticated>
      <Suspense fallback={null}>
        <AppShell>{children}</AppShell>
      </Suspense>
    </Authenticated>
  );
}
