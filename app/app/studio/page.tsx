'use client';
import { Suspense } from 'react';
import { Studio } from '../../../src/app/pages/Studio';

export default function Page() {
  return <Suspense fallback={null}><Studio /></Suspense>;
}
