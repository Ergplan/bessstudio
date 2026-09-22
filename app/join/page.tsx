'use client';
import { Suspense } from 'react';
import { Join } from '../../src/app/pages/Join';

export default function Page() {
  return <Suspense fallback={null}><Join mode="invite" /></Suspense>;
}
