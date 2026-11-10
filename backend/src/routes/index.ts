import {trackingRoutes} from '../modules/tracking/tracking.routes';
import {inspectionsRoutes,handoverRoutes,discrepanciesRoutes} from '../modules/inspections/inspections.routes';
import {dashboardRoutes,reportsRoutes} from '../modules/reports/reports.routes';
import {disksRoutes,diskInventoryRoutes,diskShipmentsRoutes,diskCustodyRoutes,diskInspectionsRoutes,diskReconciliationRoutes} from '../modules/disk-logistics/disk.routes';
import {allocationRoutes,dispatchRoutes,tripRoutes} from '../modules/operations/operations.routes';
import { inventoryRoutes } from '../modules/inventory/inventory.routes';
import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes';
import { fleetRoutes } from '../modules/fleet/fleet.routes';
import { healthRoutes } from '../modules/health/health.routes';
import { masterDataRoutes } from '../modules/masterdata/masterdata.routes';
import { organizationsRoutes } from '../modules/organizations/organizations.routes';
import {
  permissionsRoutes,
  rolesRoutes,
} from '../modules/roles/roles.routes';
import { usersRoutes } from '../modules/users/users.routes';
import { ticketsRoutes } from '../modules/tickets/tickets.routes';
import { approvalsRoutes } from '../modules/tickets/approvals.routes';
import { vendorsRoutes } from '../modules/vendors/vendors.routes';
import { settingsRoutes } from '../modules/settings/settings.routes';
import { claimsRoutes } from '../modules/claims/claims.routes';

/**
 * API v1 root router.
 *
 * Phase 1: health.
 * Phase 2: auth, users, roles, permissions, organizations.
 *
 * Future business domains (fleet, inventory, tickets, allocation, dispatch,
 * tracking, inspections, vendors, reports, disk-logistics, notifications,
 * audit) register their routers here as they are implemented.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/organizations', organizationsRoutes);
router.use('/fleet', fleetRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/master-data', masterDataRoutes);
router.use('/allocations',allocationRoutes);
router.use('/dispatch',dispatchRoutes);
router.use('/trips',tripRoutes);
router.use('/tracking',trackingRoutes);
router.use('/inspections',inspectionsRoutes);
router.use('/handover',handoverRoutes);
router.use('/discrepancies',discrepanciesRoutes);
router.use('/dashboard',dashboardRoutes);
router.use('/reports',reportsRoutes);
router.use('/disks',disksRoutes);
router.use('/disk-inventory',diskInventoryRoutes);
router.use('/disk-shipments',diskShipmentsRoutes);
router.use('/disk-custody',diskCustodyRoutes);
router.use('/disk-inspections',diskInspectionsRoutes);
router.use('/disk-reconciliation',diskReconciliationRoutes);
router.use('/tickets', ticketsRoutes);
router.use('/approvals', approvalsRoutes);
router.use('/vendors', vendorsRoutes);
router.use('/settings', settingsRoutes);
router.use('/claims', claimsRoutes);

export const apiV1Router = router;
