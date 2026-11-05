import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, FormInput, PageTitle, Select, Spinner } from "@/components";
import { useAuth } from "@/context/AuthContext";
import { useAppConfig } from "@/context/AppConfigContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { settingsApi } from "@/services/settingsService";
import type { SystemSetting, UserPreferences } from "@/types/settings";
import "../Settings.css";

const errText = (e: unknown) => (e as { message?: string })?.message ?? "Request failed.";

// ---------------------------------------------------------------------------
// System settings
// ---------------------------------------------------------------------------
function SettingRow({ setting, canManage, onChanged }: { setting: SystemSetting; canManage: boolean; onChanged: () => void }) {
  const [value, setValue] = useState(setting.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  useEffect(() => { setValue(setting.value); }, [setting.value]);

  const dirty = value !== setting.value;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(""); setOk("");
    try { await fn(); setOk(done); onChanged(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="fg-set__row">
      <div>
        <div className="fg-set__label">{setting.label}</div>
        {setting.description ? <div className="fg-set__desc">{setting.description}</div> : null}
        {error ? <div className="fg-set__error" role="alert">{error}</div> : ok ? <div className="fg-set__ok">{ok}</div> : null}
      </div>
      <div className="fg-set__control">
        {!setting.isEditable ? (
          <>
            <span className="fg-set__readonly">{setting.value}</span>
            <span className="fg-set__tag">read-only</span>
          </>
        ) : setting.valueType === "BOOLEAN" ? (
          <Select
            label="Value"
            value={value}
            options={[{ label: "Enabled", value: "true" }, { label: "Disabled", value: "false" }]}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canManage}
          />
        ) : (
          <FormInput
            label="Value"
            type={setting.valueType === "NUMBER" ? "number" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canManage}
          />
        )}
        {canManage && setting.isEditable ? (
          <>
            <Button variant="primary" size="sm" loading={busy} disabled={!dirty} onClick={() => run(() => settingsApi.updateSystem(setting.key, value), "Saved")}>Save</Button>
            {setting.value !== setting.defaultValue ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => settingsApi.resetSystem(setting.key), "Reset")}>Reset</Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function SystemSettings({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    settingsApi.listSystem().then(setRows).catch((e) => setError(errText(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, SystemSetting[]>();
    for (const s of rows) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return [...map.entries()];
  }, [rows]);

  if (loading) return <Spinner block label="Loading settings…" />;
  if (error) return <Card title="System settings"><p className="fg-set__error" role="alert">{error}</p></Card>;
  return (
    <>
      {!canManage ? <Card><p className="fg-set__desc">You have read-only access to system settings.</p></Card> : null}
      {grouped.map(([category, items]) => (
        <Card key={category} title={category}>
          {items.map((s) => (
            <SettingRow key={s.key} setting={s} canManage={canManage} onChanged={load} />
          ))}
        </Card>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------
function Preferences() {
  const { applyPreferences } = useAppConfig();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsApi.getPreferences().then(setPrefs).catch((e) => setError(errText(e)));
  }, []);

  if (error && !prefs) return <Card title="My preferences"><p className="fg-set__error" role="alert">{error}</p></Card>;
  if (!prefs) return <Spinner block label="Loading preferences…" />;

  const set = (patch: Partial<UserPreferences>) => setPrefs((p) => (p ? { ...p, ...patch } : p));
  const save = async () => {
    setBusy(true); setError(""); setOk("");
    try {
      const saved = await settingsApi.updatePreferences(prefs);
      setPrefs(saved);
      applyPreferences(saved);
      setOk("Preferences saved.");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="My preferences" subtitle="Personal preferences for your account.">
      {error ? <p className="fg-set__error" role="alert">{error}</p> : ok ? <p className="fg-set__ok">{ok}</p> : null}
      <div className="fg-set__prefs">
        <Select label="Theme" value={prefs.theme} options={[{ label: "System", value: "system" }, { label: "Light", value: "light" }, { label: "Dark", value: "dark" }]} onChange={(e) => set({ theme: e.target.value as UserPreferences["theme"] })} />
        <Select label="Density" value={prefs.density} options={[{ label: "Comfortable", value: "comfortable" }, { label: "Compact", value: "compact" }]} onChange={(e) => set({ density: e.target.value as UserPreferences["density"] })} />
        <FormInput label="Default landing page" hint="e.g. /dashboard" value={prefs.defaultLanding ?? ""} onChange={(e) => set({ defaultLanding: e.target.value || null })} />
      </div>
      <div style={{ display: "flex", gap: "1.25rem", margin: "1rem 0" }}>
        <label className="fg-set__check"><input type="checkbox" checked={prefs.notifyEmail} onChange={(e) => set({ notifyEmail: e.target.checked })} /> Email notifications</label>
        <label className="fg-set__check"><input type="checkbox" checked={prefs.notifyInApp} onChange={(e) => set({ notifyInApp: e.target.checked })} /> In-app notifications</label>
      </div>
      <Button variant="primary" loading={busy} onClick={save}>Save preferences</Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function SettingsPage() {
  useDocumentTitle("Settings");
  const { hasPermission } = useAuth();
  const canManage = hasPermission("settings:manage");
  const [tab, setTab] = useState<"system" | "preferences">("system");

  return (
    <div className="fg-set">
      <PageTitle title="Settings" description="System configuration and personal preferences." />
      <nav className="fg-set__tabs" aria-label="Settings sections">
        <button className={`fg-set__tab ${tab === "system" ? "fg-set__tab--active" : ""}`} onClick={() => setTab("system")}>System settings</button>
        <button className={`fg-set__tab ${tab === "preferences" ? "fg-set__tab--active" : ""}`} onClick={() => setTab("preferences")}>My preferences</button>
      </nav>
      {tab === "system" ? <SystemSettings canManage={canManage} /> : <Preferences />}
    </div>
  );
}
