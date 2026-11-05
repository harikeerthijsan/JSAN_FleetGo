import { apiClient } from "./apiClient";
import type { ApiSuccess } from "@/types/api";
import type { PublicSettings, SystemSetting, UserPreferences } from "@/types/settings";

/**
 * Phase 12 — Settings client. System settings require `settings:manage`;
 * preferences are per-user and available to any authenticated user.
 */
export const settingsApi = {
  async listSystem(): Promise<SystemSetting[]> {
    const r = await apiClient.get<ApiSuccess<SystemSetting[]>>("/settings");
    return r.data.data;
  },
  async updateSystem(key: string, value: string | number | boolean): Promise<SystemSetting> {
    const r = await apiClient.put<ApiSuccess<SystemSetting>>(`/settings/${encodeURIComponent(key)}`, { value });
    return r.data.data;
  },
  async resetSystem(key: string): Promise<SystemSetting> {
    const r = await apiClient.post<ApiSuccess<SystemSetting>>(`/settings/${encodeURIComponent(key)}/reset`, {});
    return r.data.data;
  },
  async getPublic(): Promise<PublicSettings> {
    const r = await apiClient.get<ApiSuccess<PublicSettings>>("/settings/public");
    return r.data.data;
  },
  async getPreferences(): Promise<UserPreferences> {
    const r = await apiClient.get<ApiSuccess<UserPreferences>>("/settings/preferences");
    return r.data.data;
  },
  async updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    const r = await apiClient.put<ApiSuccess<UserPreferences>>("/settings/preferences", patch);
    return r.data.data;
  },
};
