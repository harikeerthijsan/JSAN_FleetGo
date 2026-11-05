import type { ApiSuccess, PaginatedMeta } from '@/types/api';
import type { MasterRecord } from '@/types/vehicle';
import { apiClient } from './apiClient';

/** Master-data resource route segments. */
export type MasterResource =
  | 'makes'
  | 'models'
  | 'categories'
  | 'types'
  | 'fuel-types'
  | 'ownership-types'
  | 'document-types'
  | 'depots';

export interface ListMasterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: 'true' | 'false';
}

export const masterDataService = {
  async list(
    resource: MasterResource,
    params: ListMasterParams = {},
  ): Promise<{ data: MasterRecord[]; meta: PaginatedMeta }> {
    const res = await apiClient.get<ApiSuccess<MasterRecord[]>>(
      `/master-data/${resource}`,
      { params },
    );
    return { data: res.data.data, meta: res.data.meta as unknown as PaginatedMeta };
  },

  async create(
    resource: MasterResource,
    payload: Record<string, unknown>,
  ): Promise<MasterRecord> {
    const res = await apiClient.post<ApiSuccess<MasterRecord>>(
      `/master-data/${resource}`,
      payload,
    );
    return res.data.data;
  },

  async update(
    resource: MasterResource,
    id: string,
    payload: Record<string, unknown>,
  ): Promise<MasterRecord> {
    const res = await apiClient.put<ApiSuccess<MasterRecord>>(
      `/master-data/${resource}/${id}`,
      payload,
    );
    return res.data.data;
  },

  async setStatus(
    resource: MasterResource,
    id: string,
    active: boolean,
  ): Promise<MasterRecord> {
    const res = await apiClient.patch<ApiSuccess<MasterRecord>>(
      `/master-data/${resource}/${id}/status`,
      { active },
    );
    return res.data.data;
  },

  async remove(resource: MasterResource, id: string): Promise<void> {
    await apiClient.delete(`/master-data/${resource}/${id}`);
  },
};
