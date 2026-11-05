import type { ApiSuccess, PaginatedMeta } from '@/types/api';
import type {
  FleetStats,
  Vehicle,
  VehicleDocument,
  VehicleHistory,
  VehicleStatus,
} from '@/types/vehicle';
import { apiClient } from './apiClient';

export interface ListVehiclesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: VehicleStatus;
  typeId?: string;
  makeId?: string;
  depotId?: string;
  organizationId?: string;
  vendorId?: string;
  includeInactive?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export type VehiclePayload = Record<string, unknown>;

export const fleetService = {
  async stats(): Promise<FleetStats> {
    const res = await apiClient.get<ApiSuccess<FleetStats>>('/fleet/stats');
    return res.data.data;
  },

  async statusTransitions(): Promise<Record<VehicleStatus, VehicleStatus[]>> {
    const res = await apiClient.get<
      ApiSuccess<Record<VehicleStatus, VehicleStatus[]>>
    >('/fleet/status-transitions');
    return res.data.data;
  },

  async list(
    params: ListVehiclesParams,
  ): Promise<{ data: Vehicle[]; meta: PaginatedMeta }> {
    const res = await apiClient.get<ApiSuccess<Vehicle[]>>('/fleet/vehicles', {
      params,
    });
    return { data: res.data.data, meta: res.data.meta as unknown as PaginatedMeta };
  },

  async get(id: string): Promise<Vehicle> {
    const res = await apiClient.get<ApiSuccess<Vehicle>>(`/fleet/vehicles/${id}`);
    return res.data.data;
  },

  async create(payload: VehiclePayload): Promise<Vehicle> {
    const res = await apiClient.post<ApiSuccess<Vehicle>>('/fleet/vehicles', payload);
    return res.data.data;
  },

  async update(id: string, payload: VehiclePayload): Promise<Vehicle> {
    const res = await apiClient.put<ApiSuccess<Vehicle>>(
      `/fleet/vehicles/${id}`,
      payload,
    );
    return res.data.data;
  },

  async changeStatus(
    id: string,
    status: VehicleStatus,
    reason?: string,
  ): Promise<Vehicle> {
    const res = await apiClient.patch<ApiSuccess<Vehicle>>(
      `/fleet/vehicles/${id}/status`,
      { status, reason },
    );
    return res.data.data;
  },

  async deactivate(id: string): Promise<Vehicle> {
    const res = await apiClient.delete<ApiSuccess<Vehicle>>(
      `/fleet/vehicles/${id}`,
    );
    return res.data.data;
  },

  async history(id: string): Promise<VehicleHistory> {
    const res = await apiClient.get<ApiSuccess<VehicleHistory>>(
      `/fleet/vehicles/${id}/history`,
    );
    return res.data.data;
  },

  // --- Documents ------------------------------------------------------------
  async listDocuments(id: string): Promise<VehicleDocument[]> {
    const res = await apiClient.get<ApiSuccess<VehicleDocument[]>>(
      `/fleet/vehicles/${id}/documents`,
    );
    return res.data.data;
  },

  async uploadDocument(id: string, form: FormData): Promise<VehicleDocument> {
    const res = await apiClient.post<ApiSuccess<VehicleDocument>>(
      `/fleet/vehicles/${id}/documents`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data.data;
  },

  /** Fetch a document's bytes as a Blob (auth header attached by interceptor). */
  async downloadDocument(id: string, documentId: string): Promise<Blob> {
    const res = await apiClient.get(
      `/fleet/vehicles/${id}/documents/${documentId}/download`,
      { responseType: 'blob' },
    );
    return res.data as Blob;
  },

  async deleteDocument(id: string, documentId: string): Promise<void> {
    await apiClient.delete(`/fleet/vehicles/${id}/documents/${documentId}`);
  },
};
