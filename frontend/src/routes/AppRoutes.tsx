import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout/AppLayout';
import { ChangePasswordPage } from '@/modules/auth/pages/ChangePasswordPage';
import { ForgotPasswordPage } from '@/modules/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { ProfilePage } from '@/modules/auth/pages/ProfilePage';
import { ResetPasswordPage } from '@/modules/auth/pages/ResetPasswordPage';
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage';
import { DiskLogisticsPage } from '@/modules/disk-logistics/pages/DiskLogisticsPage';
import {lazy,Suspense} from 'react';
const AllocationsPage=lazy(()=>import('@/modules/operations/OperationsPages').then(m=>({default:m.AllocationsPage})));
const OperationsDispatchPage=lazy(()=>import('@/modules/operations/OperationsPages').then(m=>({default:m.OperationsDispatchPage})));
import { FleetOverviewPage } from '@/modules/fleet/pages/FleetOverviewPage';
import { VehicleListPage } from '@/modules/fleet/pages/VehicleListPage';
import { VehicleFormPage } from '@/modules/fleet/pages/VehicleFormPage';
import { VehicleDetailsPage } from '@/modules/fleet/pages/VehicleDetailsPage';
import { MasterDataDashboardPage } from '@/modules/masterdata/pages/MasterDataDashboardPage';
import { MakesModelsPage } from '@/modules/masterdata/pages/MakesModelsPage';
import { TypesCategoriesPage } from '@/modules/masterdata/pages/TypesCategoriesPage';
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
import { NotFoundPage } from '@/pages/NotFound/NotFoundPage';
import { ProtectedRoute, RequirePermission } from './guards';

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
          <Route
            path="/fleet"
            element={
              <RequirePermission anyOf={['fleet:read']}>
                <FleetOverviewPage />
              </RequirePermission>
            }
          />
          <Route
            path="/fleet/vehicles"
            element={
              <RequirePermission anyOf={['fleet:read']}>
                <VehicleListPage />
              </RequirePermission>
            }
          />
          <Route
            path="/fleet/vehicles/new"
            element={
              <RequirePermission anyOf={['fleet:manage']}>
                <VehicleFormPage />
              </RequirePermission>
            }
          />
          <Route
            path="/fleet/vehicles/:id"
            element={
              <RequirePermission anyOf={['fleet:read']}>
                <VehicleDetailsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/fleet/vehicles/:id/edit"
            element={
              <RequirePermission anyOf={['fleet:manage']}>
                <VehicleFormPage />
              </RequirePermission>
            }
          />

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
            path="/master-data/types-categories"
            element={
              <RequirePermission anyOf={['masterdata:read']}>
                <TypesCategoriesPage />
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
          <Route path="/allocations/*" element={<RequirePermission anyOf={['allocation:manage','dispatch:read']}><Suspense fallback={<p role="status">Loading operations?</p>}><AllocationsPage /></Suspense></RequirePermission>} />
          <Route
            path="/dispatch/*"
            element={
              <RequirePermission anyOf={['dispatch:read']}>
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

