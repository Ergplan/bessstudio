import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { SessionProvider } from './platform/auth';
import { router } from './app/routes';
import './app/platform.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionProvider><RouterProvider router={router} /></SessionProvider>
  </React.StrictMode>
);
