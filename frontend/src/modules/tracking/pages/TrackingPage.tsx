import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useParams,
  useLocation,
} from "react-router-dom";
import {
  Button,
  Card,
  DataTable,
  ErrorState,
  FormInput,
  PageTitle,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
} from "@/components";
import { useAuth } from "@/context/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTrackingSocket } from "@/hooks/useTrackingSocket";
import { opsApi as api } from "@/services/operationsService";
import { downloadCsv } from "@/services/inventoryService";
import type {
  GPSMode,
  GPSPoint,
  Session,
  TrackingSnapshot,
  TrackingDetails,
  TrackingSettings,
  GPSDevice,
} from "@/types/tracking";
import { TrackingMap, type VehicleMarker } from "../TrackingMap";
import "./TrackingPage.css";
import {
  Devices,
  Settings,
  Geofences,
  Alerts as AlertList,
  Reports as ReportView,
} from "./TrackingManagement";
function Alerts() {
  const { mode } = useContext(Source);
  return <AlertList mode={mode} />;
}
function Reports() {
  const { mode } = useContext(Source);
  return <ReportView mode={mode} />;
}
const text = (e: unknown) =>
  (e as { message?: string })?.message ?? "Request failed. Please try again.";
const when = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString() : "Not available";
const human = (s: string) =>
  s
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (v) => v.toUpperCase());
const nowLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 23);
};
const Source = createContext<{
  mode: GPSMode;
  settings: TrackingSettings | null;
  reload: () => void;
}>({ mode: "REAL", settings: null, reload: () => {} });
function useLoad<T>(path: string | null) {
  const [result, setResult] = useState<{ path: string | null; data: T } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.get<T>(path);
      if (request === generation.current) setResult({ path, data });
    } catch (e) {
      if (request === generation.current) setError(text(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  return {
    data: result?.path === path ? result.data : null,
    error,
    loading,
    load,
  };
}
function usePage<T>(path: string, page: number) {
  const [result, setResult] = useState<{
      key: string;
      data: T[];
      total: number;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const key = path + "|" + page;
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const out = await api.list<T>(path, { page, pageSize: 25 });
      if (request === generation.current)
        setResult({ key, data: out.data, total: out.meta.total });
    } catch (e) {
      if (request === generation.current) setError(text(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [path, page, key]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  return {
    data: result?.key === key ? result.data : [],
    total: result?.key === key ? result.total : 0,
    error,
    loading,
    load,
  };
}
function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error ? (
        <p role="alert" className="fg-track__error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="fg-feedback">
          {success}
        </p>
      ) : null}
    </>
  );
}
function Boundary({
  data,
  loading,
  error,
  load,
  children,
}: {
  data?: unknown;
  loading: boolean;
  error: string;
  load: () => void;
  children: ReactNode;
}) {
  return loading && !data ? (
    <Spinner block label="Loading tracking…" />
  ) : error && !data ? (
    <ErrorState
      title="Tracking could not be loaded"
      description={error}
      action={<Button onClick={load}>Retry</Button>}
    />
  ) : (
    <>
      <Feedback error={error} />
      {children}
    </>
  );
}
function Badge({ mode }: { mode: GPSMode }) {
  return (
    <StatusBadge tone={mode === "SIMULATED" ? "warning" : "info"}>
      {mode === "SIMULATED" ? "SIMULATED · NOT REAL GPS" : "REAL PROVIDER DATA"}
    </StatusBadge>
  );
}
function Manager({ children }: { children: ReactNode }) {
  const { hasPermission } = useAuth();
  return hasPermission("tracking:manage") ? (
    <>{children}</>
  ) : (
    <ErrorState title="Tracking management permission required" />
  );
}
export function TrackingPage() {
  useDocumentTitle("Live Tracking");
  const settings = useLoad<TrackingSettings>("/tracking/settings");
  const [mode, setMode] = useState<GPSMode>("REAL");
  const initialized = useRef(false);
  const { hasPermission } = useAuth();
  useEffect(() => {
    if (settings.data && !initialized.current) {
      initialized.current = true;
      if (
        !settings.data.providers.some(
          (p) => p.mode === "REAL" && p.isActive && p.credentialsConfigured,
        ) &&
        settings.data.simulationEnabled
      )
        setMode("SIMULATED");
    }
  }, [settings.data]);
  return (
    <Source.Provider
      value={{ mode, settings: settings.data, reload: settings.load }}
    >
      <div className="fg-track">
        <PageTitle
          title="Live GPS tracking"
          description="GPS observations, confirmed trip status and source provenance kept distinct."
        />
        <div
          className={`fg-track__source fg-track__source--${mode.toLowerCase()}`}
        >
          <div>
            <Badge mode={mode} />
            <p>
              {mode === "SIMULATED"
                ? "Development/test coordinates only. These are not real vehicle locations."
                : "Real-source view. No GPS position is assumed when a provider has not supplied a valid fix."}
            </p>
          </div>
          <Select
            label="Dashboard / history source filter"
            value={mode}
            options={[
              { label: "Real provider data", value: "REAL" },
              ...(settings.data?.simulationEnabled
                ? [{ label: "Simulated development data", value: "SIMULATED" }]
                : []),
            ]}
            onChange={(e) => setMode(e.target.value as GPSMode)}
          />
        </div>
        <Feedback error={settings.error} />
        <nav className="fg-track__tabs" aria-label="Tracking sections">
          {[
            ["", "Overview"],
            ["map", "Live map"],
            ["history", "Trip history & replay"],
            ["alerts", "Alerts"],
            ["reports", "Reports"],
            ...(hasPermission("tracking:manage")
              ? [
                  ["devices", "GPS devices"],
                  ["geofences", "Geofences"],
                  ["settings", "Providers & settings"],
                ]
              : []),
          ].map(([p, title]) => (
            <NavLink key={p} end={p === ""} to={`/tracking${p ? "/" + p : ""}`}>
              {title}
            </NavLink>
          ))}
        </nav>
        <Routes>
          <Route index element={<LiveDashboard />} />
          <Route path="map" element={<LiveDashboard />} />
          <Route path="history" element={<History />} />
          <Route path="sessions/:id" element={<VehicleDetails />} />
          <Route path="sessions/:id/replay" element={<VehicleDetails />} />
          <Route path="alerts" element={<Alerts />} />
          <Route
            path="devices"
            element={
              <Manager>
                <Devices />
              </Manager>
            }
          />
          <Route
            path="settings"
            element={
              <Manager>
                <Settings />
              </Manager>
            }
          />
          <Route
            path="geofences"
            element={
              <Manager>
                <Geofences />
              </Manager>
            }
          />
          <Route path="reports" element={<Reports />} />
        </Routes>
      </div>
    </Source.Provider>
  );
}
function toMarker(s: Session, offlineSeconds = 300): VehicleMarker | null {
  const p = s.latestLocation;
  if (
    !p ||
    p.latitude === null ||
    p.longitude === null ||
    p.quality === "NO_FIX"
  )
    return null;
  const offline =
    (Date.now() - new Date(p.gpsAt).getTime()) / 1000 >= offlineSeconds ||
    s.signal === "OFFLINE";
  return {
    id: s.id,
    latitude: p.latitude,
    longitude: p.longitude,
    registration: s.vehicle.registrationNumber,
    vehicleCode: s.vehicle.vehicleCode,
    tripStatus: s.trip.status,
    gpsAt: p.gpsAt,
    speedKph: p.speedKph,
    heading: p.heading,
    mode: s.mode,
    style: offline ? "OFFLINE" : (s.markerStyle ?? "STATIONARY"),
  };
}
function LiveDashboard() {
  const { mode } = useContext(Source);
  const [depotId, setDepotId] = useState(""),
    [tripId, setTripId] = useState(""),
    [selected, setSelected] = useState(""),
    [, tick] = useState(0);
  const lookups = useLoad<{ depots: { id: string; name: string }[] }>(
    "/tracking/lookups",
  );
  const fallback = useLoad<TrackingSnapshot>(
    `/tracking/active?mode=${mode}${depotId ? "&depotId=" + depotId : ""}${tripId ? "&tripId=" + tripId : ""}`,
  );
  const live = useTrackingSocket(
    mode,
    tripId || undefined,
    depotId || undefined,
  );
  const data = live.snapshot ?? fallback.data;
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const markers = (data?.items ?? [])
    .map((s) => toMarker(s, data?.policy.offlineSeconds))
    .filter((p): p is VehicleMarker => Boolean(p));
  const trips = [
    ...new Map(
      [
        ...(data?.items.map((s) => ({
          id: s.tripId,
          reference: s.trip.reference,
        })) ?? []),
        ...(data?.untracked.map((u) => ({
          id: u.tripId,
          reference: u.tripReference,
        })) ?? []),
      ].map((t) => [t.id, t]),
    ).values(),
  ];
  const chosen = data?.items.find((s) => s.id === selected);
  return (
    <>
      <div className="fg-track__heading">
        <h2>Fleet location overview</h2>
        <div className="fg-track__actions">
          <StatusBadge tone={live.status === "LIVE" ? "success" : "warning"}>
            {human(live.status)}
          </StatusBadge>
          <Button
            variant="secondary"
            onClick={() => {
              live.reconnect();
              fallback.load();
            }}
          >
            Reconnect / refresh
          </Button>
        </div>
      </div>
      {live.status !== "LIVE" ? (
        <p className="fg-feedback" role="status">
          Live connection is not active. Displayed positions are cached or last
          known; reconnect to receive updates.
        </p>
      ) : null}
      <Feedback error={fallback.error} />
      {data ? (
        <>
          <div className="fg-track__metrics">
            {Object.entries({
              "Active trips": data.summary.activeTrips,
              "Vehicles in transit": data.summary.inTransit,
              Moving: data.summary.moving,
              Stationary: data.summary.stationary,
              "Delayed trips": data.summary.delayedTrips,
              "GPS offline": data.summary.gpsOffline,
              "Completed trips": data.summary.completedTrips,
            }).map(([title, count]) => (
              <Card key={title} title={title}>
                <strong>{count}</strong>
              </Card>
            ))}
          </div>
          <div className="fg-track__filters">
            <Select
              label="Depot / destination"
              value={depotId}
              options={[
                { label: "All permitted depots", value: "" },
                ...(lookups.data?.depots ?? []).map((d) => ({
                  label: d.name,
                  value: d.id,
                })),
              ]}
              onChange={(e) => {
                setDepotId(e.target.value);
                setTripId("");
              }}
            />
            <Select
              label="Active trip"
              value={tripId}
              options={[
                { label: "All active trips", value: "" },
                ...trips.map((t) => ({ label: t.reference, value: t.id })),
              ]}
              onChange={(e) => setTripId(e.target.value)}
            />
          </div>
          <TrackingMap
            markers={markers}
            selectedId={selected}
            onSelect={setSelected}
          />
          {chosen ? (
            <Card
              title={`${chosen.vehicle.registrationNumber} · ${chosen.vehicle.vehicleCode}`}
            >
              <Badge mode={chosen.mode} />
              <p>
                {chosen.trip.reference} · {human(chosen.trip.status)} ·{" "}
                {chosen.signal} · GPS {when(chosen.lastGPSAt)}
              </p>
              <Link to={`/tracking/sessions/${chosen.id}`}>
                Vehicle tracking details and recorded route
              </Link>
            </Card>
          ) : null}
          <Card title="Tracked vehicles">
            <DataTable
              columns={[
                {
                  key: "vehicle",
                  header: "Vehicle",
                  render: (s) => (
                    <Link to={`/tracking/sessions/${s.id}`}>
                      {s.vehicle.registrationNumber} · {s.vehicle.vehicleCode}
                    </Link>
                  ),
                },
                {
                  key: "source",
                  header: "Source",
                  render: (s) => <Badge mode={s.mode} />,
                },
                {
                  key: "trip",
                  header: "Trip",
                  render: (s) =>
                    `${s.trip.reference} · ${human(s.trip.status)}`,
                },
                {
                  key: "signal",
                  header: "GPS signal",
                  render: (s) => s.signal ?? "Unknown",
                },
                {
                  key: "speed",
                  header: "Speed",
                  render: (s) =>
                    s.latestLocation?.speedKph == null
                      ? "Not supplied"
                      : `${s.latestLocation.speedKph} km/h`,
                },
                {
                  key: "time",
                  header: "Last GPS update",
                  render: (s) => when(s.lastGPSAt),
                },
                {
                  key: "map",
                  header: "Map",
                  render: (s) => (
                    <Button variant="ghost" onClick={() => setSelected(s.id)}>
                      Locate
                    </Button>
                  ),
                },
              ]}
              rows={data.items}
              rowKey={(s) => s.id}
              emptyTitle="No tracking sessions for this source"
              emptyDescription="Map a device and explicitly start tracking an active dispatched trip. No coordinates are generated automatically."
            />
          </Card>
          {data.untracked.length ? (
            <Card title="Active vehicles without tracking for this source">
              <ul>
                {data.untracked.map((u) => (
                  <li key={u.tripId + u.vehicle.id}>
                    {u.vehicle.registrationNumber} · {u.tripReference} · No GPS
                    coordinates
                    {<Link to="/tracking/devices"> · Device setup</Link>}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : fallback.loading ? (
        <Spinner label="Loading last known positions…" />
      ) : null}
    </>
  );
}
function History() {
  const location = useLocation();
  const tripId = new URLSearchParams(location.search).get("tripId");
  const { mode } = useContext(Source);
  const [page, setPage] = useState(1),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const state = usePage<Session>(
    `/tracking/sessions?mode=${mode}${tripId ? "&tripId=" + encodeURIComponent(tripId) : ""}`,
    page,
  );
  return (
    <>
      <div className="fg-track__filters">
        <FormInput
          label="Replay date from (local)"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <FormInput
          label="Replay date to (local)"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <Feedback error={state.error} />
      <Card title="Active and completed trip tracking">
        <DataTable
          columns={[
            {
              key: "vehicle",
              header: "Vehicle",
              render: (s) =>
                `${s.vehicle.registrationNumber} · ${s.vehicle.vehicleCode}`,
            },
            { key: "trip", header: "Trip", render: (s) => s.trip.reference },
            {
              key: "source",
              header: "Source",
              render: (s) => <Badge mode={s.mode} />,
            },
            {
              key: "state",
              header: "Tracking / trip status",
              render: (s) => `${s.state} · ${human(s.trip.status)}`,
            },
            {
              key: "date",
              header: "Started",
              render: (s) => when(s.createdAt),
            },
            {
              key: "replay",
              header: "History",
              render: (s) => (
                <Link
                  to={`/tracking/sessions/${s.id}/replay${from || to ? "?" + new URLSearchParams({ ...(from ? { from: new Date(from + "T00:00:00").toISOString() } : {}), ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}) }) : ""}`}
                >
                  Replay recorded points
                </Link>
              ),
            },
          ]}
          rows={state.data}
          rowKey={(s) => s.id}
          loading={state.loading}
          emptyTitle="No sessions for this source"
        />
        <Pagination
          page={page}
          pageSize={25}
          total={state.total}
          onPageChange={setPage}
        />
      </Card>
    </>
  );
}
function VehicleDetails() {
  const { id } = useParams(),
    location = useLocation();
  const replay = location.pathname.endsWith("/replay");
  const detail = useLoad<TrackingDetails>(`/tracking/sessions/${id}`);
  const mode = detail.data?.mode ?? "REAL";
  const live = useTrackingSocket(mode, detail.data?.tripId);
  const [points, setPoints] = useState<GPSPoint[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [routeText, setRouteText] = useState(""),
    [routeReason, setRouteReason] = useState("");
  const { settings } = useContext(Source);
  const { hasPermission } = useAuth();
  const historyRequest=useRef(0);
  const history = useCallback(async () => {
    const request=++historyRequest.current;
    try {
      const query = new URLSearchParams(location.search);
      const filters = Object.fromEntries(
        [...query.entries()].filter(([k]) => ["from", "to"].includes(k)),
      );
      const out: GPSPoint[] = [];
      let page = 1,
        maximum = 0;
      do {
        const r = await api.list<GPSPoint>(`/tracking/sessions/${id}/replay`, {
          page: page++,
          pageSize: 1000,
          ...filters,
        });
        maximum = r.meta.total;
        out.push(...r.data);
        if (!r.data.length) break;
      } while (out.length < maximum && out.length < 10000);
      if(request!==historyRequest.current)return;
      setError('');
      setPoints(out);
      setTotal(maximum);
      setIndex(out.length ? out.length - 1 : 0);
    } catch (e) {
      setError(text(e));
    }
  }, [id, location.search]);
  useEffect(() => {
    setPoints([]);setPlaying(false);
    void history();
    return()=>{historyRequest.current++;};
  }, [history]);
  const newest = live.snapshot?.items.find((s) => s.id === id)?.latestLocation
    ?.id;
  const currentId = detail.data?.latestLocation?.id;
  useEffect(() => {
    if (!replay && newest && newest !== currentId) {
      detail.load();
      void history();
    }
  }, [newest, replay, currentId, detail.load, history]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setIndex((v) => Math.min(points.length - 1, v + 1)),
      600,
    );
    return () => clearInterval(timer);
  }, [playing, points.length]);
  useEffect(() => {
    if (index >= points.length - 1) setPlaying(false);
  }, [index, points.length]);
  const sample = points[index];
  const fixes=points.filter(p=>p.quality!=='NO_FIX'&&p.latitude!==null&&p.longitude!==null);
  const stops:{start:GPSPoint;end:GPSPoint}[]=[];
  let stop: {start:GPSPoint;end:GPSPoint}|undefined;
  for(const p of points){
    const stationary=p.quality!=='NO_FIX'&&p.latitude!==null&&p.speedKph!==null&&p.speedKph<=(settings?.policy.movingSpeedKph??3);
    if(!stationary||stop&&(new Date(p.gpsAt).getTime()-new Date(stop.end.gpsAt).getTime())>(settings?.policy.offlineSeconds??300)*1000){if(stop&&stop.end.gpsAt!==stop.start.gpsAt)stops.push(stop);stop=undefined;}
    if(stationary){if(stop)stop.end=p;else stop={start:p,end:p};}
  }
  if(stop&&stop.end.gpsAt!==stop.start.gpsAt)stops.push(stop);
  const marker =
    sample &&
    sample.quality !== "NO_FIX" &&
    sample.latitude !== null &&
    sample.longitude !== null &&
    detail.data
      ? ({
          id: detail.data.id,
          latitude: sample.latitude,
          longitude: sample.longitude,
          registration: detail.data.vehicle.registrationNumber,
          vehicleCode: detail.data.vehicle.vehicleCode,
          tripStatus: detail.data.trip.status,
          gpsAt: sample.gpsAt,
          speedKph: sample.speedKph,
          heading: sample.heading,
          mode: sample.mode,
          style:
            !replay &&
            (Date.now() - new Date(sample.gpsAt).getTime()) / 1000 >=
              (settings?.policy.offlineSeconds ?? 300)
              ? "OFFLINE"
              : sample.speedKph !== null &&
                  sample.speedKph > (settings?.policy.movingSpeedKph ?? 3)
                ? "MOVING"
                : "STATIONARY",
        } as VehicleMarker)
      : null;
  const route = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const coords = JSON.parse(routeText);
      await api.mutate(
        `/tracking/sessions/${id}/route`,
        { points: coords, reason: routeReason },
        "put",
      );
      detail.load();
    } catch (e) {
      setError(text(e));
    }
  };
  return (
    <Boundary {...detail}>
      {detail.data ? (
        <>
          <div className="fg-track__heading">
            <div>
              <h2>
                {detail.data.vehicle.registrationNumber} ·{" "}
                {detail.data.vehicle.vehicleCode}
              </h2>
              <Badge mode={detail.data.mode} />
            </div>
            <Link to={`/dispatch/trips/${detail.data.tripId}`}>
              Confirmed operational trip
            </Link>
          </div>
          <Feedback error={error} />
          <Card
            title={
              replay ? "Historical trip replay" : "Vehicle tracking details"
            }
          >
            <dl className="fg-track__facts">
              {Object.entries({
                Trip: `${detail.data.trip.reference} · ${human(detail.data.trip.status)}`,
                "GPS coordinates":
                  detail.data.latestLocation?.latitude == null
                    ? "No valid location"
                    : `${detail.data.latestLocation.latitude}, ${detail.data.latestLocation.longitude}`,
                "Address / nearest location":
                  detail.data.latestLocation?.address ??
                  "Not supplied by provider",
                Speed:
                  detail.data.latestLocation?.speedKph == null
                    ? "Not supplied"
                    : `${detail.data.latestLocation.speedKph} km/h`,
                Heading:
                  detail.data.latestLocation?.heading == null
                    ? "Not supplied"
                    : `${detail.data.latestLocation.heading}°`,
                "Last GPS fix": when(detail.data.lastGPSAt),
                "GPS quality": detail.data.latestLocation?.quality ?? "No fix",
                "GPS signal status": detail.data.signalLost?'No fix reported':!detail.data.lastGPSAt?'Waiting for first fix':(Date.now()-new Date(detail.data.lastGPSAt).getTime())/1000 >= (settings?.policy.offlineSeconds??300)?'Offline — last known location':(Date.now()-new Date(detail.data.lastGPSAt).getTime())/1000 >= (settings?.policy.staleSeconds??120)?'Stale':'Online',
                "Provider ETA": detail.data.latestLocation?.eta
                  ? when(detail.data.latestLocation.eta)
                  : "Not supported / not supplied",
                "Origin depot":
                  detail.data.depots.find(
                    (d) => d.id === detail.data!.trip.dispatch.sourceDepotId,
                  )?.name ?? detail.data.trip.dispatch.sourceDepotId,
                Destination:
                  detail.data.depots.find(
                    (d) =>
                      d.id === detail.data!.trip.dispatch.destinationDepotId,
                  )?.name ?? detail.data.trip.dispatch.destinationDepotId,
                "Actual departure": when(detail.data.trip.actualStartAt),
                "Planned delivery": when(
                  detail.data.trip.dispatch.expectedDeliveryAt,
                ),
                "Operational arrival": when(detail.data.trip.actualArrivalAt),
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p>
              Geofence proximity and GPS observations do not confirm delivery or
              custody changes.
            </p>
          </Card>
          <TrackingMap
            markers={marker ? [marker] : []}
            points={points.slice(0, index + 1)}
            fences={detail.data.fences}
            plannedRoute={detail.data.plannedRoute}
            gapSeconds={settings?.policy.offlineSeconds ?? 300}
          />
          <Card title="Recorded movement playback">
            <div className="fg-track__actions">
              <Button
                onClick={() => {
                  if (index >= points.length - 1) setIndex(0);
                  setPlaying((v) => !v);
                }}
                disabled={points.length < 2}
              >
                {playing ? "Pause" : "Play recorded movement"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPlaying(false);
                  setIndex(Math.max(0, points.length - 1));
                }}
              >
                Latest recorded sample
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  detail.load();
                  void history();
                }}
              >
                Refresh history
              </Button>
              <Button
                variant="secondary"
                disabled={!points.length}
                onClick={() =>
                  downloadCsv(
                    points.map((p) => ({
                      mode: p.mode,
                      gpsAt: p.gpsAt,
                      receivedAt: p.receivedAt,
                      latitude: p.latitude,
                      longitude: p.longitude,
                      speedKph: p.speedKph,
                      heading: p.heading,
                      quality: p.quality,
                      isLate: p.isLate,
                    })),
                    "tracking-recorded-history.csv",
                  )
                }
              >
                Export loaded samples
              </Button>
            </div>
            <label className="fg-track__slider">
              Replay sample {points.length ? index + 1 : 0} of {points.length}
              <input
                aria-label="Recorded movement replay position"
                type="range"
                min={0}
                max={Math.max(0, points.length - 1)}
                value={index}
                disabled={!points.length}
                onChange={(e) => {
                  setPlaying(false);
                  setIndex(Number(e.target.value));
                }}
              />
            </label>
            <p>
              {sample
                ? `${when(sample.gpsAt)} · ${sample.mode} · ${sample.quality}${sample.isLate ? " · Out-of-order arrival retained in history" : ""}`
                : "No GPS samples recorded. A route is not invented."}
            </p>
            {total > points.length ? (
              <p role="status">
                Loaded the first {points.length} of {total} samples. Narrow the
                historical date range to replay a larger trip precisely.
              </p>
            ) : null}
          </Card>
          {hasPermission("tracking:manage") &&
          detail.data.mode === "SIMULATED" &&
          detail.data.state === "ACTIVE" ? (
            <ManualLocation
              detail={detail.data}
              saved={() => {
                detail.load();
                void history();
              }}
            />
          ) : null}
          {hasPermission("tracking:manage") ? (
            <details className="fg-track__config">
              <summary>Approve an explicitly supplied planned route</summary>
              <form onSubmit={route}>
                <FormInput
                  label="Route coordinate pairs JSON: [[latitude,longitude],…]"
                  required
                  value={routeText}
                  onChange={(e) => setRouteText(e.target.value)}
                />
                <FormInput
                  label="Approval reference / reason"
                  required
                  value={routeReason}
                  onChange={(e) => setRouteReason(e.target.value)}
                />
                <Button type="submit">
                  Approve route for deviation monitoring
                </Button>
              </form>
              <p>
                No route is generated automatically. Supply an approved
                polyline; GPS history remains separate.
              </p>
            </details>
          ) : null}
          <Card title="Chronological GPS samples">
            <DataTable
              columns={[
                {
                  key: "time",
                  header: "GPS / received time",
                  render: (p) => (
                    <>
                      {when(p.gpsAt)}
                      <p>{when(p.receivedAt)}</p>
                    </>
                  ),
                },
                {
                  key: "location",
                  header: "Coordinates",
                  render: (p) =>
                    p.latitude === null
                      ? "No GPS fix"
                      : `${p.latitude}, ${p.longitude}`,
                },
                {
                  key: "speed",
                  header: "Speed",
                  render: (p) =>
                    p.speedKph == null ? "Unknown" : `${p.speedKph} km/h`,
                },
                {
                  key: "source",
                  header: "Provenance",
                  render: (p) => <Badge mode={p.mode} />,
                },
                {
                  key: "quality",
                  header: "Quality / arrival",
                  render: (p) =>
                    `${p.quality}${p.isLate ? " · Late arrival" : ""}`,
                },
              ]}
              rows={points.slice(Math.max(0, index - 20), index + 1)}
              rowKey={(p) => p.id}
              emptyTitle="No recorded GPS points"
            />
            <p>
              The table shows the selected sample and up to 20 preceding
              samples. Stop observations are based on reported speed, not
              inferred from missing GPS updates.
            </p>
          </Card>
          <Card title="Observed route endpoints and stationary periods" subtitle="Recorded fixes support the operational timeline. They do not establish an exact departure or delivery location when a fix was missing.">
            <p>First recorded fix: {fixes[0]?`${fixes[0].latitude}, ${fixes[0].longitude} · ${when(fixes[0].gpsAt)}`:'Unavailable'}</p>
            <p>Last recorded fix: {fixes.length?`${fixes[fixes.length-1].latitude}, ${fixes[fixes.length-1].longitude} · ${when(fixes[fixes.length-1].gpsAt)}`:'Unavailable'}</p>
            {stops.map((s,i)=><p key={i}>Stationary observations: {when(s.start.gpsAt)} to {when(s.end.gpsAt)} · {Math.round((new Date(s.end.gpsAt).getTime()-new Date(s.start.gpsAt).getTime())/1000)} seconds between recorded samples · {s.start.latitude}, {s.start.longitude}</p>)}
            {!stops.length?<p>No continuous stationary period is established by these samples.</p>:null}
          </Card>
          <Card title="Geofence event history">
            {detail.data.geofenceEvents.map((e) => (
              <p key={e.id}>
                {when(e.gpsAt)} · {e.geofence.name} · {e.type}
              </p>
            ))}
            {!detail.data.geofenceEvents.length ? (
              <p>No configured geofence entry or exit events.</p>
            ) : null}
          </Card>
        </>
      ) : null}
    </Boundary>
  );
}
function ManualLocation({
  detail,
  saved,
}: {
  detail: TrackingDetails;
  saved: () => void;
}) {
  const devices = useLoad<GPSDevice[]>("/tracking/devices");
  const [deviceId, setDeviceId] = useState(""),
    [lat, setLat] = useState(""),
    [lon, setLon] = useState(""),
    [speed, setSpeed] = useState(""),
    [heading, setHeading] = useState(""),
    [gpsAt, setGpsAt] = useState(nowLocal()),
    [quality, setQuality] = useState("VALID"),
    [address, setAddress] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const device = devices.data?.find((d) => d.id === deviceId);
      const out = await api.mutate<{ success: boolean; error?: string }[]>(
        "/tracking/manual",
        {
          deviceId,
          observation: {
            eventId: key.current,
            deviceExternalId: device?.externalId,
            tripId: detail.tripId,
            gpsAt: new Date(gpsAt).toISOString(),
            quality,
            ...(quality === "NO_FIX"
              ? {}
              : { latitude: Number(lat), longitude: Number(lon) }),
            ...(speed !== "" ? { speedKph: Number(speed) } : {}),
            ...(heading !== "" ? { heading: Number(heading) } : {}),
            ...(address ? { address } : {}),
          },
        },
      );
      if (!out[0]?.success)
        throw new Error(out[0]?.error ?? "Location was rejected");
      key.current = crypto.randomUUID();
      setGpsAt(nowLocal());
      saved();
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy(false);
    }
  };
  const eligible =
    devices.data?.filter(
      (d) =>
        d.status === "ACTIVE" &&
        d.provider.mode === "SIMULATED" &&
        d.mappings.some((m) => !m.endedAt && m.vehicleId === detail.vehicleId),
    ) ?? [];
  return (
    <Card
      title="Development simulation controls"
      subtitle="Every update here is labelled SIMULATED. Enter test coordinates deliberately; none are generated automatically."
    >
      <Feedback error={error || devices.error} />
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="fg-track__form">
            <Select
              label="Mapped simulation device"
              required
              value={deviceId}
              options={[
                { label: "Select…", value: "" },
                ...eligible.map((d) => ({ label: d.name, value: d.id })),
              ]}
              onChange={(e) => {
                setDeviceId(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
            <Select
              label="GPS quality"
              value={quality}
              options={["VALID", "LOW", "NO_FIX"].map((q) => ({
                label: human(q),
                value: q,
              }))}
              onChange={(e) => {
                setQuality(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
            <FormInput
              label="Latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              required={quality !== "NO_FIX"}
              value={lat}
              onChange={(e) => {
                setLat(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
            <FormInput
              label="Longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              required={quality !== "NO_FIX"}
              value={lon}
              onChange={(e) => {
                setLon(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
            <FormInput
              label="Speed (km/h, optional)"
              type="number"
              min={0}
              max={500}
              value={speed}
              onChange={(e) => {
                setSpeed(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
            <FormInput
              label="Heading (0–359°, optional)"
              type="number"
              min={0}
              max={359.99}
              step="any"
              value={heading}
              onChange={(e) => {
                setHeading(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
            <FormInput
              label="GPS timestamp"
              type="datetime-local"
              step={0.001}
              required
              value={gpsAt}
              onChange={(e) => {
                setGpsAt(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
            <FormInput
              label="Test location description"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                key.current = crypto.randomUUID();
              }}
            />
          </div>
          <Button type="submit" loading={busy}>
            Submit simulated observation
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}
