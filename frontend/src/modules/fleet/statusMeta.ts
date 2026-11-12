import type { BadgeTone } from '@/components';
import type { VehicleStatus } from '@/types/vehicle';

/** Human label + badge tone for each vehicle status. */
export const STATUS_META: Record<VehicleStatus, { label: string; tone: BadgeTone }> = {
  AT_VENDOR: { label: 'At Vendor', tone: 'info' },
  REGISTERED: { label: 'Registered', tone: 'neutral' },
  RECEIVED: { label: 'Received', tone: 'info' },
  AVAILABLE: { label: 'Available', tone: 'success' },
  RESERVED: { label: 'Reserved', tone: 'warning' },
  ALLOCATED: { label: 'Allocated', tone: 'info' },
  DISPATCHED: { label: 'Dispatched', tone: 'info' },
  IN_TRANSIT: { label: 'In Transit', tone: 'info' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  UNDER_MAINTENANCE: { label: 'Under Maintenance', tone: 'warning' },
  DAMAGED: { label: 'Damaged', tone: 'danger' },
  RETURNED: { label: 'Returned', tone: 'neutral' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
};

export function statusLabel(status: VehicleStatus): string {
  return STATUS_META[status]?.label ?? status;
}

/** Stable colors independent of ordering and omitted zero-count statuses. */
export const STATUS_COLORS: Record<VehicleStatus, string> = {
  AT_VENDOR: '#805bd3', REGISTERED: '#738579', RECEIVED: '#62999e', AVAILABLE: '#30835e', RESERVED: '#b68730',
  ALLOCATED: '#087bd5', DISPATCHED: '#557d89', IN_TRANSIT: '#08a8e8', DELIVERED: '#537d44',
  UNDER_MAINTENANCE: '#ae771c', DAMAGED: '#b34444', RETURNED: '#9189af', INACTIVE: '#747b81',
};
