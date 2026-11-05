/**
 * Phase 12 — Settings client types. The backend remains the source of truth and
 * validates every change against the setting's declared value type.
 */

export type SettingValueType = "STRING" | "NUMBER" | "BOOLEAN" | "JSON";

export interface SystemSetting {
  key: string;
  category: string;
  label: string;
  description: string | null;
  valueType: SettingValueType;
  value: string;
  defaultValue: string;
  isEditable: boolean;
  updatedAt: string;
}

export type ThemePreference = "system" | "light" | "dark";
export type DensityPreference = "comfortable" | "compact";

export interface UserPreferences {
  theme: ThemePreference;
  density: DensityPreference;
  defaultLanding: string | null;
  notifyEmail: boolean;
  notifyInApp: boolean;
}

/** Non-sensitive settings any authenticated user may read. */
export interface PublicSettings {
  organizationName: string;
  defaultPageSize: number;
  supportEmail: string | null;
}
