import type { SettingValueType } from "@prisma/client";
import { prisma } from "../../database/prisma";
import type { AuthenticatedUser } from "../../types/auth";
import { ApiError } from "../../utils/ApiError";
import type { PreferencesInput } from "./settings.validators";

/**
 * Phase 12 — Settings service.
 *
 * Two concerns:
 *  - System settings: a persisted, admin-managed registry of application
 *    configuration (seeded from a fixed catalogue of sensible defaults). Values
 *    are validated against their declared type and every change records the
 *    editor. This is the canonical store other modules can read from.
 *  - User preferences: a per-user 1:1 row (theme, density, landing page,
 *    notification toggles) created lazily with defaults.
 */

interface SettingDef {
  key: string;
  category: string;
  label: string;
  description: string;
  valueType: SettingValueType;
  defaultValue: string;
  isEditable?: boolean;
}

// The default catalogue. Seeding only ever adds missing keys / refreshes
// metadata; it never overwrites an administrator's saved value.
export const SETTING_DEFS: SettingDef[] = [
  { key: "general.organizationName", category: "General", label: "Organization name", description: "Display name shown across the workspace.", valueType: "STRING", defaultValue: "FleetGo" },
  { key: "general.supportEmail", category: "General", label: "Support email", description: "Address shown to users needing help.", valueType: "STRING", defaultValue: "support@fleetgo.dev" },
  { key: "general.defaultPageSize", category: "General", label: "Default page size", description: "Default number of rows per table page.", valueType: "NUMBER", defaultValue: "25" },
  { key: "fleet.commercialBaseline", category: "Fleet", label: "Commercial fleet baseline", description: "Documented commercial planning baseline (vehicles).", valueType: "NUMBER", defaultValue: "802", isEditable: false },
  { key: "inspections.preDispatchRequired", category: "Inspections", label: "Require pre-dispatch inspection", description: "Require a completed pre-dispatch inspection before confirming dispatch.", valueType: "BOOLEAN", defaultValue: "false" },
  { key: "tracking.offlineThresholdSeconds", category: "Tracking", label: "GPS offline threshold (seconds)", description: "Seconds without a fix before a device is treated as offline.", valueType: "NUMBER", defaultValue: "300" },
  { key: "tickets.defaultSlaHours", category: "Ticketing", label: "Default approval SLA (hours)", description: "Default approval SLA applied when a ticket type has none.", valueType: "NUMBER", defaultValue: "48" },
  { key: "notifications.digestEnabled", category: "Notifications", label: "Daily digest enabled", description: "Whether the daily operational digest is enabled.", valueType: "BOOLEAN", defaultValue: "false" },
];

function validateValue(type: SettingValueType, raw: string) {
  if (type === "NUMBER") {
    if (raw.trim() === "" || !Number.isFinite(Number(raw))) throw ApiError.badRequest("Value must be a number");
  } else if (type === "BOOLEAN") {
    if (raw !== "true" && raw !== "false") throw ApiError.badRequest("Value must be 'true' or 'false'");
  } else if (type === "JSON") {
    try {
      JSON.parse(raw);
    } catch {
      throw ApiError.badRequest("Value must be valid JSON");
    }
  }
}

async function ensureSeeded() {
  const existing = new Set((await prisma.systemSetting.findMany({ select: { key: true } })).map((s) => s.key));
  const missing = SETTING_DEFS.filter((d) => !existing.has(d.key));
  if (missing.length === 0) return;
  await prisma.$transaction(
    missing.map((d) =>
      prisma.systemSetting.create({
        data: {
          key: d.key,
          category: d.category,
          label: d.label,
          description: d.description,
          valueType: d.valueType,
          value: d.defaultValue,
          defaultValue: d.defaultValue,
          isEditable: d.isEditable ?? true,
        },
      }),
    ),
  );
}

// Light by default (not "system") so a new user is never shown dark mode based
// on their OS setting; dark is opt-in via Settings.
const DEFAULT_PREFS = { theme: "light", density: "comfortable", defaultLanding: null as string | null, notifyEmail: true, notifyInApp: true };

export const settingsService = {
  SETTING_DEFS,

  /** Idempotently ensure the default settings catalogue exists. */
  async seedDefaults() {
    await ensureSeeded();
    return { seeded: SETTING_DEFS.length };
  },

  async listSystem() {
    await ensureSeeded();
    return prisma.systemSetting.findMany({ orderBy: [{ category: "asc" }, { label: "asc" }] });
  },

  async updateSystem(key: string, rawValue: string | number | boolean, actor: AuthenticatedUser) {
    await ensureSeeded();
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) throw ApiError.notFound("Setting not found");
    if (!setting.isEditable) throw ApiError.badRequest("This setting is read-only");
    const value = typeof rawValue === "string" ? rawValue : String(rawValue);
    validateValue(setting.valueType, value);
    return prisma.systemSetting.update({ where: { key }, data: { value, updatedById: actor.id } });
  },

  async resetSystem(key: string, actor: AuthenticatedUser) {
    await ensureSeeded();
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) throw ApiError.notFound("Setting not found");
    if (!setting.isEditable) throw ApiError.badRequest("This setting is read-only");
    return prisma.systemSetting.update({ where: { key }, data: { value: setting.defaultValue, updatedById: actor.id } });
  },

  /** Raw stored value for a key, or null if unset. For other modules to consume. */
  async getValue(key: string): Promise<string | null> {
    await ensureSeeded();
    const s = await prisma.systemSetting.findUnique({ where: { key } });
    return s?.value ?? null;
  },

  /** Boolean setting value, falling back to the supplied default if unset. */
  async getBool(key: string, fallback: boolean): Promise<boolean> {
    const v = await this.getValue(key);
    if (v === null) return fallback;
    return v === "true";
  },

  /** Whitelisted, non-sensitive settings any authenticated user may read. */
  async getPublic() {
    await ensureSeeded();
    const keys = ["general.organizationName", "general.defaultPageSize", "general.supportEmail"];
    const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const pageSize = Number(m["general.defaultPageSize"]);
    return {
      organizationName: m["general.organizationName"] ?? "FleetGo",
      defaultPageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 25,
      supportEmail: m["general.supportEmail"] ?? null,
    };
  },

  async getPreferences(userId: string) {
    const existing = await prisma.userPreference.findUnique({ where: { userId } });
    if (existing) return existing;
    return prisma.userPreference.create({ data: { userId, ...DEFAULT_PREFS } });
  },

  async updatePreferences(userId: string, patch: PreferencesInput) {
    await this.getPreferences(userId); // ensure a row exists
    return prisma.userPreference.update({ where: { userId }, data: patch });
  },
};
