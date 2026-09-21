'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Login } from '../../src/app/pages/Login';
import { useSession } from '../../src/platform/auth';

function Route() {
  const { ready, user } = useSession();
  const router = useRouter();
  const next = useSearchParams().get('next');
  useEffect(() => {
    if (ready && user) router.replace(next && next.startsWith('/') ? next : '/app/');
  }, [ready, user, router, next]);
  if (!ready || user) return null;
  return <Login />;
}

export default function Page() {
  return <Suspense fallback={null}><Route /></Suspense>;
}
