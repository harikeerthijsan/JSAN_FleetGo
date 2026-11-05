import type { ApiSuccess, PaginatedMeta } from '@/types/api';
import type { ManagedUser, UserStatus } from '@/types/auth';
import { apiClient } from './apiClient';

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  roleId?: string;
  organizationId?: string;
  status?: UserStatus;
}

export interface UserProfilePayload {
  licenseNumber?: string;
  licenseExpiry?: string;
  licenseClass?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dateOfBirth?: string;
  notes?: string;
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  phone?: string;
  password?: string;
  roleId: string;
  organizationId?: string;
  depotIds?: string[];
  status?: UserStatus;
  profile?: UserProfilePayload;
}

export type UpdateUserPayload = Partial<
  Omit<CreateUserPayload, 'password' | 'status'>
>;

export const userService = {
  async list(
    params: ListUsersParams,
  ): Promise<{ data: ManagedUser[]; meta: PaginatedMeta }> {
    const res = await apiClient.get<ApiSuccess<ManagedUser[]>>('/users', {
      params,
    });
    return {
      data: res.data.data,
      meta: res.data.meta as unknown as PaginatedMeta,
    };
  },

  async getById(id: string): Promise<ManagedUser> {
    const res = await apiClient.get<ApiSuccess<ManagedUser>>(`/users/${id}`);
    return res.data.data;
  },

  async create(
    payload: CreateUserPayload,
  ): Promise<{ user: ManagedUser; tempPassword?: string }> {
    const res = await apiClient.post<
      ApiSuccess<{ user: ManagedUser; tempPassword?: string }>
    >('/users', payload);
    return res.data.data;
  },

  async update(id: string, payload: UpdateUserPayload): Promise<ManagedUser> {
    const res = await apiClient.put<ApiSuccess<ManagedUser>>(
      `/users/${id}`,
      payload,
    );
    return res.data.data;
  },

  async setStatus(id: string, status: UserStatus): Promise<ManagedUser> {
    const res = await apiClient.patch<ApiSuccess<ManagedUser>>(
      `/users/${id}/status`,
      { status },
    );
    return res.data.data;
  },

  async resetPassword(id: string): Promise<{ devToken?: string }> {
    const res = await apiClient.post<ApiSuccess<{ devToken?: string }>>(
      `/users/${id}/reset-password`,
    );
    return res.data.data;
  },
};
