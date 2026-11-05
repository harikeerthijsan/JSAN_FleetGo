/** Shared auth/domain types mirroring the backend contracts. */

export type OrganizationType =
  | 'CTS'
  | 'JSAN'
  | 'VEHICLE_VENDOR'
  | 'TRANSPORT_PARTNER';

export type EntityStatus = 'ACTIVE' | 'INACTIVE';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

/** The authenticated principal (from /auth/me and /auth/login). */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: { id: string; name: string; displayName: string };
  permissions: string[];
  organizationId: string | null;
  organizationType: OrganizationType | null;
  depotIds: string[];
}

export interface Permission {
  key: string;
  category: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number };
}

export interface UserProfile {
  licenseNumber: string | null;
  licenseExpiry: string | null;
  licenseClass: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  dateOfBirth: string | null;
  notes: string | null;
}

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string; displayName: string };
  organization: { id: string; name: string; type: OrganizationType } | null;
  depots: { depot: { id: string; name: string; code: string } }[];
  profile: UserProfile | null;
}
