'use client';
import { Suspense } from 'react';
import { Factory } from '../../../src/app/pages/Factory';

export default function Page() {
  return <Suspense fallback={null}><Factory /></Suspense>;
}
