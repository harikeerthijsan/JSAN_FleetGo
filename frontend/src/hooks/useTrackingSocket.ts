import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/services/apiClient";
import { tokenStore } from "@/services/tokenStore";
import type { GPSMode, TrackingSnapshot } from "@/types/tracking";
/** Reconnect with current in-memory credentials, then receive a fresh authorized snapshot. */
export function useTrackingSocket(
  mode: GPSMode,
  tripId?: string,
  depotId?: string,
) {
  const scope = mode + "|" + (tripId ?? "") + "|" + (depotId ?? "");
  const [stored, setStored] = useState<{
      scope: string;
      data: TrackingSnapshot;
    } | null>(null),
    [status, setStatus] = useState("CONNECTING");
  const [reconnect, setReconnect] = useState(0);
  const attempt = useRef(0);
  useEffect(() => {
    let closed = false,
      ws: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      if (closed) return;
      setStatus("CONNECTING");
      const endpoint = new URL(
        import.meta.env.VITE_TRACKING_WS_URL || "/api/v1/tracking/ws",
        window.location.href,
      );
      if (endpoint.protocol === "http:" || endpoint.protocol === "https:")
        endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(endpoint);
      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            type: "auth",
            token: tokenStore.get(),
            mode,
            tripId,
            depotId,
          }),
        );
      };
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "tracking.connected") {
            attempt.current = 0;
            setStatus("LIVE");
          } else if (
            event.type.startsWith("tracking.") &&
            event.data?.summary
          ) {
            setStored({ scope, data: event.data });
            setStatus("LIVE");
          }
        } catch {
          setStatus("ERROR");
        }
      };
      ws.onerror = () => setStatus("DISCONNECTED");
      ws.onclose = async (e) => {
        if (closed) return;
        setStatus("DISCONNECTED");
        if (e.code === 4403) {
          setStored(null);
          setStatus("ACCESS_REVOKED");
          return;
        }
        if (e.code === 4401) {
          try {
            await apiClient.get("/auth/me");
          } catch {
            setStored(null);
            setStatus("SIGN_IN_REQUIRED");
            return;
          }
        }
        const delay = Math.min(
          30000,
          1000 * 2 ** Math.min(attempt.current++, 5),
        );
        timer = setTimeout(connect, delay);
      };
    };
    setStored(null);
    attempt.current = 0;
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [mode, tripId, depotId, reconnect]);
  return {
    snapshot: stored?.scope === scope ? stored.data : null,
    status,
    reconnect: () => setReconnect((v) => v + 1),
  };
}
