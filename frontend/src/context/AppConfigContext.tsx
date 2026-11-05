import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { settingsApi } from "@/services/settingsService";
import type { PublicSettings, UserPreferences } from "@/types/settings";

/**
 * Phase 12 — application config for authenticated sessions. Loads the current
 * user's preferences and the public settings (organization name, default page
 * size) and applies the preferences to the document so theme and density take
 * effect immediately and app-wide.
 */
interface AppConfigValue {
  publicSettings: PublicSettings | null;
  preferences: UserPreferences | null;
  /** Default page size for tables, from settings (falls back to 25). */
  defaultPageSize: number;
  /** Replace preferences (e.g. after saving on the Settings page) and re-apply. */
  applyPreferences: (prefs: UserPreferences) => void;
}

const AppConfigContext = createContext<AppConfigValue | null>(null);

const prefersDark = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

function applyToDocument(prefs: UserPreferences | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = prefs?.theme ?? "system";
  const resolved = theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
  root.dataset.theme = resolved;
  root.dataset.density = prefs?.density ?? "comfortable";
}

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  useEffect(() => {
    let active = true;
    settingsApi.getPublic().then((p) => active && setPublicSettings(p)).catch(() => {});
    settingsApi
      .getPreferences()
      .then((p) => {
        if (!active) return;
        setPreferences(p);
        applyToDocument(p);
      })
      .catch(() => {});
    // Reset document attributes when leaving the authenticated shell (e.g. logout)
    // so the login screen is not left in a dark/compact state.
    return () => {
      active = false;
      if (typeof document !== "undefined") {
        delete document.documentElement.dataset.theme;
        delete document.documentElement.dataset.density;
      }
    };
  }, []);

  // Re-resolve "system" theme if the OS preference changes while signed in.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => preferences?.theme === "system" && applyToDocument(preferences);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [preferences]);

  const applyPreferences = useCallback((prefs: UserPreferences) => {
    setPreferences(prefs);
    applyToDocument(prefs);
  }, []);

  const value: AppConfigValue = {
    publicSettings,
    preferences,
    defaultPageSize: publicSettings?.defaultPageSize ?? 25,
    applyPreferences,
  };
  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigValue {
  const ctx = useContext(AppConfigContext);
  if (!ctx) {
    // Safe fallback outside the provider (e.g. during tests / unauth screens).
    return { publicSettings: null, preferences: null, defaultPageSize: 25, applyPreferences: () => {} };
  }
  return ctx;
}
