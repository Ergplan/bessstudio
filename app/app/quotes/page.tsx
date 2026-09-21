'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Quotes } from '../../../src/app/pages/Quotes';
import { QuoteDetail } from '../../../src/app/pages/QuoteDetail';

function Route() {
  const id = useSearchParams().get('id');
  return id ? <QuoteDetail id={id} /> : <Quotes />;
}

export default function Page() {
  return <Suspense fallback={null}><Route /></Suspense>;
}
