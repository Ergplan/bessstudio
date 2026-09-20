import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from './AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Customers, CustomerDetail } from './pages/Customers';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { Quotes } from './pages/Quotes';
import { QuoteDetail } from './pages/QuoteDetail';
import { Catalog } from './pages/Catalog';
import { Settings } from './pages/Settings';
import { Studio } from './pages/Studio';
import { useSession } from '../platform/auth';
import { WorkspaceProvider } from '../platform/workspace';
import { brand } from '../brand/brand';

function Authenticated() {
  const { ready, user } = useSession();
  if (!ready) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#61738D', fontSize: 13 }}>Opening {brand.platform}…</div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  return <WorkspaceProvider><Outlet /></WorkspaceProvider>;
}

function SignIn() {
  const { ready, user } = useSession();
  if (!ready) return null;
  return user ? <Navigate to="/" replace /> : <Login />;
}

export const router = createBrowserRouter([
  { path: '/sign-in', element: <SignIn /> },
  {
    element: <Authenticated />,
    children: [
      { path: '/studio', element: <Studio /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/customers', element: <Customers /> },
          { path: '/customers/:customerId', element: <CustomerDetail /> },
          { path: '/projects', element: <Projects /> },
          { path: '/projects/:projectId', element: <ProjectDetail /> },
          { path: '/quotes', element: <Quotes /> },
          { path: '/quotes/:quoteId', element: <QuoteDetail /> },
          { path: '/catalog', element: <Catalog /> },
          { path: '/settings', element: <Settings /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
