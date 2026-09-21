'use client';
import { Suspense } from 'react';
import { Start } from '../../src/app/pages/Start';

export default function Page() {
  return <Suspense fallback={null}><Start /></Suspense>;
}
