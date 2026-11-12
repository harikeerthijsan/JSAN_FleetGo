import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout/AppLayout';
import { ChangePasswordPage } from '@/modules/auth/pages/ChangePasswordPage';
import { ForgotPasswordPage } from '@/modules/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { ProfilePage } from '@/modules/auth/pages/ProfilePage';
import { ResetPasswordPage } from '@/modules/auth/pages/ResetPasswordPage';
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage';
import { DiskLogisticsPage } from '@/modules/disk-logistics/pages/DiskLogisticsPage';
import {lazy,Suspense} from 'react';
const OperationsDispatchPage=lazy(()=>import('@/modules/operations/OperationsPages').then(m=>({default:m.OperationsDispatchPage})));
import { MasterDataDashboardPage } from '@/modules/masterdata/pages/MasterDataDashboardPage';
import { MakesModelsPage } from '@/modules/masterdata/pages/MakesModelsPage';
import { DepotsPage } from '@/modules/masterdata/pages/DepotsPage';
import { VendorsMasterPage } from '@/modules/masterdata/pages/VendorsMasterPage';
import { LookupsPage } from '@/modules/masterdata/pages/LookupsPage';
const InspectionsPage=lazy(()=>import('@/modules/inspections/pages/InspectionsPage').then(m=>({default:m.InspectionsPage})));
import { InventoryPage } from '@/modules/inventory/pages/InventoryPage';
const ReportsPage=lazy(()=>import('@/modules/reports/pages/ReportsPage').then(m=>({default:m.ReportsPage})));
import { TicketsPage } from '@/modules/tickets/pages/TicketsPage';
const TrackingPage=lazy(()=>import('@/modules/tracking/pages/TrackingPage').then(m=>({default:m.TrackingPage})));
import { VendorsPage } from '@/modules/vendors/pages/VendorsPage';
import { OrganizationsPage } from '@/modules/users/pages/OrganizationsPage';
import { RolesPage } from '@/modules/users/pages/RolesPage';
import { UserManagementPage } from '@/modules/users/pages/UserManagementPage';
import { SettingsPage } from '@/modules/settings/pages/SettingsPage';
import { ClaimsPage } from '@/modules/claims/pages/ClaimsPage';
import { NotFoundPage } from '@/pages/NotFound/NotFoundPage';
import { ProtectedRoute, RequirePermission } from './guards';

function LegacyVehicleRedirect({ edit = false }: { edit?: boolean }) {
  const { id } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/inventory/vehicles${id ? `/${id}${edit ? '/edit' : ''}` : ''}${search}`} replace />;
}

function LegacyAllocationRedirect() {
  const { pathname, search } = useLocation();
  const suffix = pathname.replace(/^\/allocations\/?/, '');
  const target = !suffix ? '/dispatch' : suffix === 'queue' ? '/dispatch/requests' : suffix === 'list' ? '/dispatch/allocations' : suffix === 'reports' ? '/dispatch/reports' : `/dispatch/allocations/${suffix}`;
  return <Navigate to={`${target}${search}`} replace />;
}

/**
 * Application routes.
 *  - Public: /login, /forgot-password, /reset-password.
 *  - Everything else is behind ProtectedRoute (requires an authenticated
 *    session) and rendered inside the shared AppLayout.
 *  - Module/admin routes are additionally wrapped with RequirePermission so a
 *    direct URL visit without the permission shows an access-denied page.
 *    (The backend independently authorizes every API call.)
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Authenticated */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/dashboard"
            element={
              <RequirePermission anyOf={['dashboard:view']}>
                <DashboardPage />
              </RequirePermission>
            }
          />
          {/* Keep saved vehicle links working after consolidating navigation. */}
          <Route path="/fleet" element={<Navigate to="/inventory" replace />} />
          <Route path="/fleet/vehicles" element={<LegacyVehicleRedirect />} />
          <Route path="/fleet/vehicles/new" element={<Navigate to="/inventory/vehicles/new" replace />} />
          <Route path="/fleet/vehicles/:id" element={<LegacyVehicleRedirect />} />
          <Route path="/fleet/vehicles/:id/edit" element={<LegacyVehicleRedirect edit />} />

          {/* Master Data */}
          <Route
            path="/master-data"
            element={
              <RequirePermission anyOf={['masterdata:read']}>
                <MasterDataDashboardPage />
              </RequirePermission>
            }
          />
          <Route
            path="/master-data/makes-models"
            element={
              <RequirePermission anyOf={['masterdata:read']}>
                <MakesModelsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/master-data/depots"
            element={
              <RequirePermission anyOf={['masterdata:read']}>
                <DepotsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/master-data/vendors"
            element={
              <RequirePermission anyOf={['masterdata:read']}>
                <VendorsMasterPage />
              </RequirePermission>
            }
          />
          <Route
            path="/master-data/lookups"
            element={
              <RequirePermission anyOf={['masterdata:read']}>
                <LookupsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/inventory/*"
            element={
              <RequirePermission anyOf={['inventory:read']}>
                <InventoryPage />
              </RequirePermission>
            }
          />
          <Route
            path="/tickets/*"
            element={
              <RequirePermission anyOf={['tickets:read']}>
                <TicketsPage />
              </RequirePermission>
            }
          />
          <Route path="/allocations/*" element={<LegacyAllocationRedirect />} />
          <Route
            path="/dispatch/*"
            element={
              <RequirePermission anyOf={['allocation:manage', 'dispatch:read']}>
                <Suspense fallback={<p role="status">Loading operations?</p>}><OperationsDispatchPage /></Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="/tracking/*"
            element={
              <RequirePermission anyOf={['tracking:read']}>
                <Suspense fallback={<div role="status">Loading tracking?</div>}><TrackingPage /></Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="/inspections/*"
            element={
              <RequirePermission anyOf={['inspections:read', 'inspections:confirm', 'inspections:manage']}>
                <Suspense fallback={<div role="status">Loading inspections…</div>}><InspectionsPage /></Suspense>
              </RequirePermission>
            }
          />
          <Route
            path="/vendors/*"
            element={
              <RequirePermission anyOf={['vendors:read']}>
                <VendorsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/disk-logistics/*"
            element={
              <RequirePermission anyOf={['disk:read']}>
                <DiskLogisticsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/reports/*"
            element={
              <RequirePermission anyOf={['reports:read']}>
                <Suspense fallback={<div role="status">Loading reports…</div>}><ReportsPage /></Suspense>
              </RequirePermission>
            }
          />

          {/* Administration */}
          <Route
            path="/users"
            element={
              <RequirePermission anyOf={['users:read']}>
                <UserManagementPage />
              </RequirePermission>
            }
          />
          <Route
            path="/roles"
            element={
              <RequirePermission anyOf={['roles:read']}>
                <RolesPage />
              </RequirePermission>
            }
          />
          <Route
            path="/organizations"
            element={
              <RequirePermission anyOf={['organizations:read']}>
                <OrganizationsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/claims/*"
            element={
              <RequirePermission anyOf={['claims:read', 'claims:report', 'claims:manage']}>
                <ClaimsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/settings"
            element={
              <RequirePermission anyOf={['settings:manage']}>
                <SettingsPage />
              </RequirePermission>
            }
          />

          {/* Account (any authenticated user) */}
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

