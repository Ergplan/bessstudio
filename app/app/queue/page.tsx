'use client';
import { Suspense } from 'react';
import { Queue } from '../../../src/app/pages/Queue';

export default function Page() {
  return <Suspense fallback={null}><Queue /></Suspense>;
}
