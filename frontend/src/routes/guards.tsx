import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@/components';
import { useAuth } from '@/context/AuthContext';
import { NotAuthorizedPage } from '@/pages/NotAuthorized/NotAuthorizedPage';

/**
 * Gate for all authenticated routes. While the session is bootstrapping we show
 * a loader; unauthenticated users are redirected to /login (remembering where
 * they were headed).
 */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spinner size={32} block label="Loading FleetGo…" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/**
 * Wraps a route element and requires the user to hold at least one of the
 * given permissions. This is a UX guard only — the backend independently
 * authorizes every protected API call.
 */
export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: ReactNode;
}) {
  const { hasAnyPermission } = useAuth();
  if (!hasAnyPermission(anyOf)) return <NotAuthorizedPage />;
  return <>{children}</>;
}
