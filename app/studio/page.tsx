'use client';
import { Suspense } from 'react';
import { Authenticated } from '../../src/app/Authenticated';
import { Studio } from '../../src/app/pages/Studio';

export default function Page() {
  return (
    <Authenticated>
      <Suspense fallback={null}><Studio /></Suspense>
    </Authenticated>
  );
}
