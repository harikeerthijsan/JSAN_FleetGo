import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Fence, GPSPoint } from "@/types/tracking";
import "leaflet/dist/leaflet.css";
import "./TrackingMap.css";
export interface VehicleMarker {
  id: string;
  latitude: number;
  longitude: number;
  registration: string;
  vehicleCode: string;
  tripStatus: string;
  gpsAt: string;
  speedKph: number | null;
  heading: number | null;
  mode: "REAL" | "SIMULATED";
  style: string;
}
export interface TrackingMapProps {
  markers: VehicleMarker[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  points?: GPSPoint[];
  fences?: Fence[];
  plannedRoute?: [number, number][] | null;
  gapSeconds?: number;
}
function popup(marker: VehicleMarker) {
  const node = document.createElement("div");
  node.className = "fg-track-popup";
  const title = document.createElement("strong");
  title.textContent = marker.registration;
  node.append(title);
  for (const value of [
    marker.mode === "SIMULATED"
      ? "SIMULATED · NOT REAL GPS"
      : "Real provider data",
    marker.vehicleCode,
    marker.tripStatus,
    `GPS: ${new Date(marker.gpsAt).toLocaleString()}`,
    marker.speedKph === null ? "Speed unavailable" : `${marker.speedKph} km/h`,
  ]) {
    const p = document.createElement("p");
    p.textContent = value;
    node.append(p);
  }
  return node;
}
export function TrackingMap({
  markers,
  selectedId,
  onSelect,
  points = [],
  fences = [],
  plannedRoute,
  gapSeconds = 300,
}: TrackingMapProps) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    markersRef = useRef(new Map<string, L.Marker>()),
    overlays = useRef<L.LayerGroup | null>(null),
    lastSelect = useRef(onSelect),
    initialFit = useRef(false);
  const [tileError, setTileError] = useState(false);
  lastSelect.current = onSelect;
  useEffect(() => {
    if (!container.current) return;
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const instance = L.map(container.current, {
      zoomControl: true,
      zoomAnimation: !reduced,
      fadeAnimation: !reduced,
    }).setView([0, 0], 2);
    map.current = instance;
    const tiles =
      import.meta.env.VITE_MAP_TILE_URL ??
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    if (tiles !== "none")
      L.tileLayer(tiles, {
        maxZoom: 19,
        attribution:
          import.meta.env.VITE_MAP_ATTRIBUTION ??
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        referrerPolicy: "strict-origin-when-cross-origin",
      })
        .on("tileerror", () => setTileError(true))
        .addTo(instance);
    overlays.current = L.layerGroup().addTo(instance);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
      markersRef.current.clear();
      initialFit.current = false;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const ids = new Set(markers.map((m) => m.id));
    for (const [id, marker] of markersRef.current)
      if (!ids.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    for (const data of markers) {
      const node = document.createElement("div");
      node.className = `fg-gps-dot fg-gps-dot--${data.style.toLowerCase()} ${data.mode === "SIMULATED" ? "fg-gps-dot--simulated" : ""}`;
      node.textContent =
        data.style === "OFFLINE"
          ? "×"
          : data.style === "MOVING"
            ? "➤"
            : data.style === "DELAYED"
              ? "!"
              : "•";
      node.setAttribute("aria-label", `${data.mode} ${data.registration}`);
      const icon = L.divIcon({
        html: node,
        className: "fg-gps-icon",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      let marker = markersRef.current.get(data.id);
      if (!marker) {
        marker = L.marker([data.latitude, data.longitude], {
          icon,
          title: `${data.mode} · ${data.registration}`,
          keyboard: true,
        }).addTo(instance);
        marker.on("click", () => lastSelect.current?.(data.id));
        markersRef.current.set(data.id, marker);
      } else {
        marker.setLatLng([data.latitude, data.longitude]);
        marker.setIcon(icon);
      }
      marker.bindPopup(popup(data));
      const element = marker.getElement();
      if (element) {
        element.dataset.sessionId = data.id;
        element.dataset.latitude = String(data.latitude);
        element.dataset.longitude = String(data.longitude);
        element.dataset.mode = data.mode;
      }
    }
    if (!initialFit.current && markers.length) {
      instance.fitBounds(
        L.latLngBounds(
          markers.map((m) => [m.latitude, m.longitude] as L.LatLngTuple),
        ).pad(0.25),
        { maxZoom: 15, animate: false },
      );
      initialFit.current = true;
    }
  }, [markers]);
  useEffect(() => {
    const marker = selectedId ? markersRef.current.get(selectedId) : undefined;
    if (marker && map.current) {
      map.current.panTo(marker.getLatLng(), { animate: false });
      marker.openPopup();
    }
  }, [selectedId]);
  useEffect(() => {
    const group = overlays.current;
    if (!group) return;
    group.clearLayers();
    const valid = points.filter(
      (p) =>
        p.quality !== "NO_FIX" && p.latitude !== null && p.longitude !== null,
    );
    let segment: L.LatLngTuple[] = [];
    let previous: GPSPoint | undefined;
    const flush = () => {
      if (segment.length > 1)
        L.polyline(segment, {
          color: "#3a9276",
          weight: 4,
          opacity: 0.85,
        }).addTo(group);
      segment = [];
    };
    for (const p of points) {
      if (
        p.quality === "NO_FIX" ||
        p.latitude === null ||
        p.longitude === null
      ) {
        flush();
        previous = undefined;
        continue;
      }
      if (
        previous &&
        (new Date(p.gpsAt).getTime() - new Date(previous.gpsAt).getTime() >
          gapSeconds * 1000 ||
          p.mode !== previous.mode)
      )
        flush();
      segment.push([p.latitude!, p.longitude!]);
      previous = p;
    }
    flush();
    if (plannedRoute?.length)
      L.polyline(plannedRoute, {
        color: "#8872a5",
        weight: 3,
        dashArray: "7 8",
      }).addTo(group);
    for (const f of fences.filter((f) => f.isActive)) {
      const label = document.createElement("span");
      label.textContent = `${f.name} · ${f.kind}`;
      if (
        f.shape === "CIRCLE" &&
        f.centerLat !== null &&
        f.centerLon !== null
      ) {
        L.circle([f.centerLat, f.centerLon], {
          radius: f.radiusMeters!,
          color: f.kind === "DESTINATION" ? "#bf8f3c" : "#427a87",
          weight: 2,
          fillOpacity: 0.08,
        })
          .bindTooltip(label)
          .addTo(group);
        const node = document.createElement("span");
        node.className = "fg-map-site";
        node.textContent = f.kind === "DESTINATION" ? "⚑" : "D";
        L.marker([f.centerLat, f.centerLon], {
          icon: L.divIcon({
            html: node,
            className: "fg-site-icon",
            iconSize: [24, 24],
          }),
        })
          .bindTooltip(label.cloneNode(true) as HTMLElement)
          .addTo(group);
      } else if (f.polygon)
        L.polygon(f.polygon, { color: "#427a87", fillOpacity: 0.08 })
          .bindTooltip(label)
          .addTo(group);
    }
    if (!initialFit.current && valid.length && map.current) {
      map.current.fitBounds(
        L.latLngBounds(
          valid.map((p) => [p.latitude!, p.longitude!] as L.LatLngTuple),
        ).pad(0.2),
        { maxZoom: 15, animate: false },
      );
      initialFit.current = true;
    }
  }, [points, fences, plannedRoute, gapSeconds]);
  const fit = () => {
    const positions = markers.map(
      (m) => [m.latitude, m.longitude] as L.LatLngTuple,
    );
    for (const p of points)
      if (p.latitude !== null && p.longitude !== null && p.quality !== "NO_FIX")
        positions.push([p.latitude, p.longitude]);
    if (positions.length)
      map.current?.fitBounds(L.latLngBounds(positions).pad(0.2), {
        maxZoom: 16,
        animate: false,
      });
  };
  return (
    <div className="fg-map">
      <div className="fg-map__tools">
        <button
          type="button"
          onClick={fit}
          disabled={!markers.length && !points.length}
        >
          Fit recorded positions
        </button>
        <span>
          Green: moving · Blue: stationary · Amber: delayed · Grey: offline
        </span>
      </div>
      <div
        ref={container}
        className="fg-map__canvas"
        role="region"
        aria-label="Vehicle tracking map"
      />
      {!markers.length && !points.length ? (
        <p className="fg-map__empty">
          No GPS coordinates available. No vehicle location is assumed.
        </p>
      ) : null}
      {tileError ? (
        <p role="status" className="fg-map__notice">
          Basemap unavailable. Recorded coordinates and route samples remain
          available.
        </p>
      ) : null}
      <p className="fg-map__caption">
        Solid lines connect recorded samples only; gaps are not filled. Dashed
        purple lines show an explicitly approved planned route. Dashed marker
        borders identify simulated data.
      </p>
    </div>
  );
}
