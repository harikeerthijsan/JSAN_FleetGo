import type { ApiSuccess, PaginatedMeta } from '@/types/api';
import type { EntityStatus, Organization, OrganizationType } from '@/types/auth';
import { apiClient } from './apiClient';

export interface ListOrganizationsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: OrganizationType;
  status?: EntityStatus;
}

export interface OrganizationPayload {
  name: string;
  type: OrganizationType;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  status?: EntityStatus;
}

export const organizationService = {
  async list(
    params: ListOrganizationsParams,
  ): Promise<{ data: Organization[]; meta: PaginatedMeta }> {
    const res = await apiClient.get<ApiSuccess<Organization[]>>(
      '/organizations',
      { params },
    );
    return {
      data: res.data.data,
      meta: res.data.meta as unknown as PaginatedMeta,
    };
  },

  async getById(id: string): Promise<Organization> {
    const res = await apiClient.get<ApiSuccess<Organization>>(
      `/organizations/${id}`,
    );
    return res.data.data;
  },

  async create(payload: OrganizationPayload): Promise<Organization> {
    const res = await apiClient.post<ApiSuccess<Organization>>(
      '/organizations',
      payload,
    );
    return res.data.data;
  },

  async update(
    id: string,
    payload: Partial<OrganizationPayload>,
  ): Promise<Organization> {
    const res = await apiClient.put<ApiSuccess<Organization>>(
      `/organizations/${id}`,
      payload,
    );
    return res.data.data;
  },
};
