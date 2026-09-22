'use client';
import { Suspense } from 'react';
import { Lessons } from '../../../src/app/pages/Lessons';

export default function Page() {
  return <Suspense fallback={null}><Lessons /></Suspense>;
}
