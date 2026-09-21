'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

/**
 * The studio used to live here, outside the workspace shell, which meant opening it dropped the
 * sidebar and the browser's back button became the only way out. It now sits under /app with the
 * rest of the workbench; this route stays so existing links and bookmarks still land, and carries
 * the query across so a link to a specific project keeps working.
 */
function Redirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const q = params.toString();
    router.replace(`/app/studio/${q ? `?${q}` : ''}`);
  }, [router, params]);
  return null;
}

export default function Page() {
  return <Suspense fallback={null}><Redirect /></Suspense>;
}
