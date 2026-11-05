import { VehicleStatus } from '@prisma/client';

/**
 * Controlled vehicle lifecycle. The map defines which target statuses are
 * reachable from each current status. Transitions not listed are rejected so
 * records cannot be driven into inconsistent states.
 *
 * Several targets (RESERVED, ALLOCATED, DISPATCHED, IN_TRANSIT, DELIVERED) are
 * primarily driven by later phases (Inventory/Allocation/Dispatch); they are
 * modeled here for forward compatibility and manual correction by privileged
 * roles, but the allowed edges keep the graph sane.
 */
export const STATUS_TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  REGISTERED: ['RECEIVED', 'AVAILABLE', 'INACTIVE'],
  RECEIVED: ['AVAILABLE', 'UNDER_MAINTENANCE', 'DAMAGED', 'INACTIVE'],
  AVAILABLE: ['RESERVED', 'ALLOCATED', 'UNDER_MAINTENANCE', 'DAMAGED', 'RETURNED', 'INACTIVE'],
  RESERVED: ['AVAILABLE', 'ALLOCATED', 'INACTIVE'],
  ALLOCATED: ['DISPATCHED', 'RESERVED', 'AVAILABLE', 'INACTIVE'],
  DISPATCHED: ['IN_TRANSIT', 'DELIVERED', 'RETURNED'],
  AT_VENDOR: ['AVAILABLE', 'UNDER_MAINTENANCE', 'DAMAGED'],
  IN_TRANSIT: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED', 'AVAILABLE', 'UNDER_MAINTENANCE'],
  UNDER_MAINTENANCE: ['AVAILABLE', 'DAMAGED', 'INACTIVE'],
  DAMAGED: ['UNDER_MAINTENANCE', 'RETURNED', 'INACTIVE'],
  RETURNED: ['AVAILABLE', 'UNDER_MAINTENANCE', 'DAMAGED', 'INACTIVE'],
  INACTIVE: ['REGISTERED', 'AVAILABLE'],
};

export function canTransition(
  from: VehicleStatus,
  to: VehicleStatus,
): boolean {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTargets(from: VehicleStatus): VehicleStatus[] {
  return STATUS_TRANSITIONS[from] ?? [];
}
