import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button, Card, FormInput, Select } from "@/components";
import { opsApi as api } from "@/services/operationsService";
import type {
  GPSDevice,
  TrackingSnapshot,
  TrackingSettings,
  TrackingAlert,
  Fence,
  Session,
} from "@/types/tracking";

function useData<T>(path: string) {
  const [stored, setStored] = useState<{ path: string; data: T } | null>(null),
    [error, setError] = useState("");
  const generation = useRef(0);
  async function load() {
    const request = ++generation.current;
    try {
      const data = await api.get<T>(path);
      if (request === generation.current) {
        setStored({ path, data });
        setError("");
      }
    } catch (e) {
      if (request === generation.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [path]);
  return { data: stored?.path === path ? stored.data : null, error, load };
}
function Notice({ error }: { error: string }) {
  return error ? <p role="alert">{error}</p> : null;
}
export function Devices() {
  const navigate = useNavigate();
  const devices = useData<GPSDevice[]>("/tracking/devices"),
    settings = useData<TrackingSettings>("/tracking/settings"),
    active = useData<TrackingSnapshot>("/tracking/active?mode=ALL");
  const [providerId, setProvider] = useState(""),
    [name, setName] = useState(""),
    [externalId, setExternal] = useState(""),
    [vehicleId, setVehicle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const vehicles = [
    ...new Map(
      [
        ...(active.data?.items.map((s) => ({
          vehicle: s.vehicle,
          tripId: s.tripId,
          tripReference: s.trip.reference,
        })) ?? []),
        ...(active.data?.untracked ?? []),
      ].map((v) => [v.vehicle.id, v]),
    ).values(),
  ];
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await devices.load();
      await active.load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Notice
        error={error || devices.error || settings.error || active.error}
      />
      <Card
        title="Register GPS device"
        subtitle="Use an actual provider identifier. Mapping and starting tracking never generate coordinates."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              api.mutate("/tracking/devices", {
                providerId,
                name,
                externalId,
                status: "ACTIVE",
              }),
            );
          }}
        >
          <div className="fg-track__form">
            <Select
              required
              label="Provider"
              value={providerId}
              options={[
                { value: "", label: "Select provider" },
                ...(
                  settings.data?.providers.filter((p) => p.isActive) ?? []
                ).map((p) => ({ value: p.id, label: p.name + " · " + p.mode })),
              ]}
              onChange={(e) => setProvider(e.target.value)}
            />
            <FormInput
              required
              label="Device name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <FormInput
              required
              label="Provider device identifier"
              value={externalId}
              onChange={(e) => setExternal(e.target.value)}
            />
          </div>
          <Button type="submit" loading={busy}>
            Register device
          </Button>
        </form>
      </Card>
      <Card title="Vehicle mappings">
        <Select
          label="Vehicle on an authorized active trip"
          value={vehicleId}
          options={[
            { value: "", label: "Choose vehicle" },
            ...vehicles.map((v) => ({
              value: v.vehicle.id,
              label: v.vehicle.registrationNumber + " · " + v.tripReference,
            })),
          ]}
          onChange={(e) => setVehicle(e.target.value)}
        />
        {devices.data?.map((d) => {
          const m = d.mappings.find((m) => !m.endedAt),
            trip = vehicles.find((v) => v.vehicle.id === m?.vehicleId);
          return (
            <section className="fg-track__device" key={d.id}>
              <h3>
                {d.name} · {d.provider.mode}
              </h3>
              <p>
                {d.externalId} · {d.provider.name} · {d.status}
              </p>
              <p>
                {m
                  ? "Mapped to " +
                    (trip?.vehicle.registrationNumber ?? m.vehicleId)
                  : "Unmapped"}
              </p>
              <div className="fg-track__actions">
                {m ? (
                  <>
                    <Button
                      disabled={busy || !trip}
                      onClick={() =>
                        run(async () => {
                          const session = await api.mutate<Session>(
                            "/tracking/sessions",
                            {
                              vehicleId: m.vehicleId,
                              tripId: trip!.tripId,
                              mode: d.provider.mode,
                            },
                          );
                          navigate("/tracking/sessions/" + session.id);
                        })
                      }
                    >
                      Start / open tracking
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          api.mutate(
                            "/tracking/devices/" + d.id + "/unmap",
                            {},
                          ),
                        )
                      }
                    >
                      Unmap device
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={busy || !vehicleId || d.status !== "ACTIVE"}
                    onClick={() =>
                      run(() =>
                        api.mutate("/tracking/devices/" + d.id + "/mapping", {
                          vehicleId,
                        }),
                      )
                    }
                  >
                    Map selected vehicle
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api.mutate(
                        "/tracking/devices/" + d.id,
                        {
                          providerId: d.providerId,
                          externalId: d.externalId,
                          name: d.name,
                          status: d.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        },
                        "put",
                      ),
                    )
                  }
                >
                  {d.status === "ACTIVE" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </section>
          );
        })}
        {devices.data?.length === 0 ? <p>No devices registered.</p> : null}
      </Card>
    </>
  );
}
export function Alerts({ mode }: { mode: string }) {
  const { hasPermission } = useAuth();
  const [page, setPage] = useState(1),
    [rows, setRows] = useState<TrackingAlert[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [remarks, setRemarks] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const visible = rows.filter((a) => a.session?.mode === mode);
  async function load() {
    const request = ++generation.current;
    try {
      const r = await api.list<TrackingAlert>("/tracking/alerts?mode=" + mode, {
        page,
        pageSize: 25,
      });
      if (request === generation.current) {
        setRows(r.data);
        setTotal(r.meta.total);
        setError("");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [mode, page]);
  async function act(id: string, action: string) {
    setBusy(true);
    try {
      await api.mutate("/tracking/alerts/" + id + "/" + action, { remarks });
      setError("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title="Tracking alerts"
      subtitle="GPS recovery does not automatically acknowledge or resolve an alert."
    >
      <Notice error={error} />
      <FormInput
        label="Operator remarks for acknowledgement / resolution"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
      />
      {visible.map((a) => (
        <section className="fg-track__device" key={a.id}>
          <h3>
            <Link to={"/tracking/sessions/" + a.sessionId}>
              {a.type.replaceAll("_", " ")}
            </Link>{" "}
            · {a.session?.mode}
          </h3>
          <p>{a.description}</p>
          <p>Vehicle {a.session?.vehicleId} · Trip {a.session?.tripId}</p>
          <p>
            {a.severity} · {a.status} · {new Date(a.createdAt).toLocaleString()}
            {a.recoveredAt ? " · Condition recovered" : ""}
          </p>
          {a.status !== "RESOLVED" && hasPermission("tracking:manage") ? (
            <div className="fg-track__actions">
              {["acknowledge", "resolve"].map((action) => (
                <Button
                  key={action}
                  disabled={busy || !remarks.trim()}
                  onClick={() => act(a.id, action)}
                >
                  {action}
                </Button>
              ))}
            </div>
          ) : (
            <p>{a.resolutionRemarks}</p>
          )}
        </section>
      ))}
      {!visible.length ? <p>No alerts for this source.</p> : null}
      <div className="fg-track__actions">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>
          Page {page} · {total} alerts
        </span>
        <Button disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
    </Card>
  );
}

type Field = {
  key: string;
  label: string;
  type?: string;
  options?: (string | { value: string; label: string })[];
};
function ConfigForm({
  title,
  path,
  initial,
  fields,
  onSaved,
}: {
  title: string;
  path: string;
  initial: Record<string, unknown>;
  fields: Field[];
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { ...value };
      for (const f of fields) {
        if (f.type === "number")
          body[f.key] = body[f.key] === "" ? null : Number(body[f.key]);
        if (f.type === "json")
          body[f.key] =
            typeof body[f.key] === "string"
              ? JSON.parse(body[f.key] as string)
              : body[f.key];
        if (f.type === "nullable" && body[f.key] === "") body[f.key] = null;
      }
      await api.mutate(
        path,
        body,
        path.match(/\/[0-9a-f-]{36}$/) || path === "/tracking/settings"
          ? "put"
          : "post",
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={title}>
      <Notice error={error} />
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="fg-track__form">
            {fields.map((f) =>
              f.type === "boolean" ? (
                <label key={f.key}>
                  <input
                    type="checkbox"
                    checked={Boolean(value[f.key])}
                    onChange={(e) =>
                      setValue({ ...value, [f.key]: e.target.checked })
                    }
                  />{" "}
                  {f.label}
                </label>
              ) : f.options ? (
                <Select
                  key={f.key}
                  label={f.label}
                  value={String(value[f.key] ?? "")}
                  options={f.options.map((v) =>
                    typeof v === "string" ? { value: v, label: v } : v,
                  )}
                  onChange={(e) =>
                    setValue({ ...value, [f.key]: e.target.value })
                  }
                />
              ) : f.type === "json" ? (
                <label key={f.key}>
                  {f.label}
                  <textarea
                    rows={5}
                    value={
                      typeof value[f.key] === "string"
                        ? (value[f.key] as string)
                        : JSON.stringify(value[f.key])
                    }
                    onChange={(e) =>
                      setValue({ ...value, [f.key]: e.target.value })
                    }
                  />
                </label>
              ) : (
                <FormInput
                  key={f.key}
                  label={f.label}
                  type={f.type === "number" ? "number" : "text"}
                  step="any"
                  value={String(value[f.key] ?? "")}
                  onChange={(e) =>
                    setValue({ ...value, [f.key]: e.target.value })
                  }
                />
              ),
            )}
          </div>
          <Button type="submit" loading={busy}>
            Save configuration
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}
const providerFields: Field[] = [
  { key: "name", label: "Provider name" },
  { key: "slug", label: "Provider URL slug" },
  { key: "mode", label: "Source provenance", options: ["REAL", "SIMULATED"] },
  {
    key: "adapter",
    label: "Adapter (SIMULATION requires SIMULATED mode)",
    options: ["GENERIC_WEBHOOK", "GENERIC_API", "SIMULATION"],
  },
  {
    key: "webhookSecretEnv",
    label: "Webhook secret ENVIRONMENT VARIABLE NAME (GPS_...)",
    type: "nullable",
  },
  {
    key: "apiUrlEnv",
    label: "API URL environment variable name",
    type: "nullable",
  },
  {
    key: "apiTokenEnv",
    label: "API token environment variable name",
    type: "nullable",
  },
  { key: "isActive", label: "Enabled", type: "boolean" },
];
const newProvider = {
  name: "",
  slug: "",
  mode: "REAL",
  adapter: "GENERIC_WEBHOOK",
  webhookSecretEnv: null,
  apiUrlEnv: null,
  apiTokenEnv: null,
  isActive: true,
};
export function Settings() {
  const state = useData<TrackingSettings>("/tracking/settings"),
    lookups = useData<{ canConfigure: boolean }>("/tracking/lookups");
  const [provider, setProvider] =
      useState<Record<string, unknown>>(newProvider),
    [id, setId] = useState(""),
    [error, setError] = useState("");
  const policy = state.data?.policy;
  return (
    <>
      <Notice error={error || state.error} />
      <Card
        title="Provider readiness"
        subtitle="Credentials stay in backend environment variables. Forms accept variable names only, never secret values."
      >
        {state.data?.providers.map((p) => (
          <section className="fg-track__device" key={p.id}>
            <h3>
              {p.name} · {p.mode}
            </h3>
            <p>
              {p.adapter} · {p.isActive ? "Enabled" : "Disabled"} ·{" "}
              {p.credentialsConfigured
                ? "Environment configured"
                : "Configuration missing"}{" "}
              · {p.lastErrorCode ?? "No provider error recorded"}
            </p>
            {lookups.data?.canConfigure ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setId(p.id);
                    setProvider({
                      name: p.name,
                      slug: p.slug,
                      mode: p.mode,
                      adapter: p.adapter,
                      isActive: p.isActive,
                      webhookSecretEnv: p.webhookSecretEnv ?? null,
                      apiUrlEnv: p.apiUrlEnv ?? null,
                      apiTokenEnv: p.apiTokenEnv ?? null,
                    });
                  }}
                >
                  Edit
                </Button>
                {p.adapter === "GENERIC_API" ? (
                  <Button
                    onClick={async () => {
                      try {
                        await api.mutate(
                          "/tracking/providers/" + p.id + "/pull",
                          {},
                        );
                        await state.load();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Pull observations
                  </Button>
                ) : null}
              </>
            ) : null}
          </section>
        ))}
      </Card>
      {lookups.data?.canConfigure ? (
        <>
          <Button
            variant="secondary"
            onClick={() => {
              setId("");
              setProvider(newProvider);
            }}
          >
            New provider
          </Button>
          <ConfigForm
            title={id ? "Edit provider" : "Add provider"}
            path={"/tracking/providers" + (id ? "/" + id : "")}
            initial={provider}
            fields={providerFields}
            onSaved={state.load}
          />
          {policy ? (
            <ConfigForm
              title="Alert thresholds and retention"
              path="/tracking/settings"
              initial={policy as unknown as Record<string, unknown>}
              fields={Object.keys(policy)
                .filter((k) => !["id", "updatedAt"].includes(k))
                .map((key) => ({
                  key,
                  label: key.replace(/([A-Z])/g, " $1"),
                  type: key === "alertsEnabled" ? "boolean" : "number",
                }))}
              onSaved={state.load}
            />
          ) : null}
        </>
      ) : (
        <p>Platform administrators configure providers and global policy.</p>
      )}
    </>
  );
}
const newFence = {
  name: "",
  kind: "DEPOT",
  shape: "CIRCLE",
  centerLat: "",
  centerLon: "",
  radiusMeters: 500,
  polygon: null,
  depotId: "",
  organizationId: "",
  tripId: "",
  alertOnEntry: true,
  alertOnExit: true,
  isActive: true,
};
export function Geofences() {
  const state = useData<Fence[]>("/tracking/geofences"),
    lookups = useData<{
      depots: { id: string; name: string }[];
      organizations: { id: string; name: string }[];
    }>("/tracking/lookups");
  const active = useData<TrackingSnapshot>("/tracking/active?mode=ALL");
  const trips = [
    ...new Map(
      [
        ...(active.data?.items.map((s) => ({
          id: s.tripId,
          name: s.trip.reference,
        })) ?? []),
        ...(active.data?.untracked.map((s) => ({
          id: s.tripId,
          name: s.tripReference,
        })) ?? []),
      ].map((t) => [t.id, t]),
    ).values(),
  ];
  const [form, setForm] = useState<Record<string, unknown>>(newFence),
    [id, setId] = useState("");
  return (
    <>
      <Notice error={state.error || lookups.error} />
      <p>
        Bind a boundary to an existing depot, organization or trip. GPS entry
        and exit never confirm delivery or custody.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          setId("");
          setForm(newFence);
        }}
      >
        New boundary
      </Button>
      <ConfigForm
        title={id ? "Edit / deactivate geofence" : "Create geofence"}
        path={"/tracking/geofences" + (id ? "/" + id : "")}
        initial={form}
        onSaved={state.load}
        fields={[
          { key: "name", label: "Name" },
          {
            key: "kind",
            label: "Purpose",
            options: ["DEPOT", "VENDOR", "DESTINATION", "PICKUP"],
          },
          { key: "shape", label: "Shape", options: ["CIRCLE", "POLYGON"] },
          { key: "centerLat", label: "Circle latitude", type: "number" },
          { key: "centerLon", label: "Circle longitude", type: "number" },
          {
            key: "radiusMeters",
            label: "Circle radius (meters)",
            type: "number",
          },
          {
            key: "polygon",
            label:
              "Polygon: closed JSON ring [[latitude,longitude],…] (null for circle)",
            type: "json",
          },
          {
            key: "depotId",
            label: "Existing depot (optional)",
            type: "nullable",
            options: [
              { value: "", label: "None" },
              ...(lookups.data?.depots ?? []).map((d) => ({
                value: d.id,
                label: d.name,
              })),
            ],
          },
          {
            key: "organizationId",
            label: "Existing organization (optional)",
            type: "nullable",
            options: [
              { value: "", label: "None" },
              ...(lookups.data?.organizations ?? []).map((d) => ({
                value: d.id,
                label: d.name,
              })),
            ],
          },
          {
            key: "tripId",
            label: "Specific active trip (optional)",
            type: "nullable",
            options: [
              { value: "", label: "None" },
              ...trips.map((d) => ({ value: d.id, label: d.name })),
            ],
          },
          ...["alertOnEntry", "alertOnExit", "isActive"].map((key) => ({
            key,
            label: key,
            type: "boolean",
          })),
        ]}
      />
      <Card title="Configured geofences">
        {state.data?.map((f) => (
          <section className="fg-track__device" key={f.id}>
            <h3>{f.name}</h3>
            <p>
              {f.kind} · {f.shape} · {f.isActive ? "Active" : "Inactive"}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setId(f.id);
                const { id: _, ...data } = f;
                setForm(data);
              }}
            >
              Edit / deactivate
            </Button>
          </section>
        ))}
      </Card>
    </>
  );
}
export function Reports({ mode }: { mode: string }) {
  const state = useData<{
    summary: Record<string, number>;
    alertTotal: number;
  }>("/tracking/reports?mode=" + mode);
  return (
    <Card title="Tracking report" subtitle={"Source: " + mode}>
      <Notice error={state.error} />
      <Button variant="secondary" onClick={state.load}>
        Refresh report
      </Button>
      <dl className="fg-track__facts">
        {Object.entries(state.data?.summary ?? {}).map(([key, value]) => (
          <div key={key}>
            <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>{state.data?.alertTotal ?? 0} alerts</p>
      <Link to="/tracking/history">
        Recorded trip history, replay and GPS CSV export
      </Link>
    </Card>
  );
}
