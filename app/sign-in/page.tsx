'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Login } from '../../src/app/pages/Login';
import { useSession } from '../../src/platform/auth';

export default function Page() {
  const { ready, user } = useSession();
  const router = useRouter();
  useEffect(() => { if (ready && user) router.replace('/app'); }, [ready, user, router]);
  if (!ready || user) return null;
  return <Login />;
}
