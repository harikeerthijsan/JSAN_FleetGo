import type { ApiSuccess } from '@/types/api';
import type { Permission, Role } from '@/types/auth';
import { apiClient } from './apiClient';

export interface RolePayload {
  name?: string;
  displayName: string;
  description?: string | null;
  permissionKeys: string[];
}

export const roleService = {
  async list(): Promise<Role[]> {
    const res = await apiClient.get<ApiSuccess<Role[]>>('/roles');
    return res.data.data;
  },

  async create(payload: Required<Pick<RolePayload, 'name'>> & RolePayload): Promise<Role> {
    const res = await apiClient.post<ApiSuccess<Role>>('/roles', payload);
    return res.data.data;
  },

  async update(
    id: string,
    payload: Omit<RolePayload, 'name'>,
  ): Promise<Role> {
    const res = await apiClient.put<ApiSuccess<Role>>(`/roles/${id}`, payload);
    return res.data.data;
  },

  async listPermissions(): Promise<{
    permissions: Permission[];
    grouped: Record<string, Permission[]>;
  }> {
    const res = await apiClient.get<
      ApiSuccess<{ permissions: Permission[]; grouped: Record<string, Permission[]> }>
    >('/permissions');
    return res.data.data;
  },
};
