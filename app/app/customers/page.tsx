'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Customers, CustomerDetail } from '../../../src/app/pages/Customers';

function Route() {
  const id = useSearchParams().get('id');
  return id ? <CustomerDetail id={id} /> : <Customers />;
}

export default function Page() {
  return <Suspense fallback={null}><Route /></Suspense>;
}
