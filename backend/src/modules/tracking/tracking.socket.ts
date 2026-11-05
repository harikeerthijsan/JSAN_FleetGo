import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { accessToken } from "../../utils/jwt";
import { loadAuthenticatedUser } from "../../middlewares/auth";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { trackingService, trackingEvents } from "./tracking.service";
import { querySchema } from "./tracking.validators";
export function attachTrackingSockets(server: Server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8192,
    perMessageDeflate: false,
  });
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.split("?")[0] !== "/api/v1/tracking/ws") {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (
      !origin ||
      !config.cors.origins.includes(origin) ||
      process.env.TRACKING_WS_ENABLED === "false"
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws) => {
    let token = "",
      authenticated = false,
      busy = false,
      alive = true,
      signature = "",
      eventType = "tracking.snapshot";
    let query = querySchema.parse({});
    const authTimeout = setTimeout(() => {
      if (!authenticated) ws.close(4401, "Authentication required");
    }, 5000);
    const send = async () => {
      if (!authenticated || busy || ws.readyState !== WebSocket.OPEN) return;
      busy = true;
      try {
        const payload = accessToken.verify(token);
        const actor = await loadAuthenticatedUser(payload.sub);
        if (!actor || !actor.permissions.includes("tracking:read")) {
          ws.close(4403, "Tracking access revoked");
          return;
        }
        const data = await trackingService.snapshot(query, actor);
        const next = JSON.stringify(data);
        if (next !== signature) {
          if (ws.bufferedAmount > 2 * 1024 * 1024) {
            ws.close(1013, "Client is too slow");
            return;
          }
          ws.send(JSON.stringify({ type: eventType, data }));
          signature = next;
          eventType = "tracking.snapshot";
        }
      } catch {
        ws.close(4401, "Authentication expired; refresh and reconnect");
      } finally {
        busy = false;
      }
    };
    const onChange = (type: string) => {
      eventType = type;
      void send();
    };
    trackingEvents.on("changed", onChange);
    ws.on("message", async (bytes) => {
      if (authenticated) {
        ws.close(4400, "Read-only tracking channel");
        return;
      }
      try {
        const message = JSON.parse(bytes.toString());
        if (message.type !== "auth" || typeof message.token !== "string")
          throw new Error();
        token = message.token;
        const payload = accessToken.verify(token);
        const actor = await loadAuthenticatedUser(payload.sub);
        if (!actor || !actor.permissions.includes("tracking:read"))
          throw new Error();
        query = querySchema.parse({
          mode: message.mode ?? "REAL",
          tripId: message.tripId,
          depotId: message.depotId,
        });
        authenticated = true;
        clearTimeout(authTimeout);
        await prismaAudit(actor.id);
        ws.send(
          JSON.stringify({ type: "tracking.connected", mode: query.mode }),
        );
        await send();
      } catch {
        ws.close(4401, "Tracking authentication failed");
      }
    });
    ws.on("pong", () => {
      alive = true;
    });
    const timer = setInterval(() => {
      void send();
    }, 2000);
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 15000);
    ws.on("error", () => logger.warn("Tracking socket transport error"));
    ws.on("close", () => {
      clearInterval(timer);
      clearInterval(heartbeat);
      clearTimeout(authTimeout);
      trackingEvents.off("changed", onChange);
    });
  });
  return () => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  };
}
async function prismaAudit(actorId: string) {
  const { prisma } = await import("../../database/prisma");
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "tracking.websocket.connected",
      entityType: "Tracking",
    },
  });
}
