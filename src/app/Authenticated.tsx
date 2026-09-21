'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { brand } from '../brand/brand';
import { useSession } from '../platform/auth';
import { WorkspaceProvider } from '../platform/workspace';

/** Gate for every route under /app: waits for the session, then sends anyone signed out to sign in. */
export function Authenticated({ children }: { children: React.ReactNode }) {
  const { ready, user } = useSession();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace('/sign-in'); }, [ready, user, router]);

  if (!ready || !user) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#61738D', fontSize: 13 }}>Opening {brand.platform}…</div>;
  }
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
