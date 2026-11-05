// Optional Phase 7 extension to the real Phase 6 workflow fixture. All coordinates are SIMULATED.
const { randomUUID, createHmac } = require("node:crypto");
const { WebSocket } = require("ws");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function socket(token, mode, tripId) {
  const ws = new WebSocket("ws://localhost:4000/api/v1/tracking/ws", {
    origin: "http://localhost:5173",
  });
  const events = [];
  ws.on("message", (b) => events.push(JSON.parse(b)));
  ws.on("error", () => {});
  ws.on("open", () =>
    ws.send(JSON.stringify({ type: "auth", token, mode, tripId })),
  );
  return { ws, events };
}
async function until(fn, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    if (fn()) return;
    await pause(100);
  }
  throw Error("Timed out: " + label);
}
exports.active = async ({
  call,
  check,
  admin,
  ops,
  vendor1,
  vendor2,
  driverToken,
  dispatch,
  vehicleId,
  depotId,
  prefix,
}) => {
  const tripId = dispatch.trip.id,
    settings = (await call("/tracking/settings", admin)).data,
    oldPolicy = settings.policy;
  const provider = (
    await call(
      "/tracking/providers",
      admin,
      {
        slug: prefix.toLowerCase() + "-gps",
        name: "Synthetic Phase 7 signed webhook",
        mode: "SIMULATED",
        adapter: "GENERIC_WEBHOOK",
        webhookSecretEnv: "GPS_PHASE7_TEST_SECRET",
        isActive: true,
      },
      201,
    )
  ).data;
  const device = (
    await call(
      "/tracking/devices",
      ops,
      {
        providerId: provider.id,
        name: "SIMULATED Phase 7 device",
        externalId: prefix + "-GPS",
        status: "ACTIVE",
      },
      201,
    )
  ).data;
  await call(
    "/tracking/devices/" + device.id + "/mapping",
    ops,
    { vehicleId },
    200,
  );
  const session = (
    await call(
      "/tracking/sessions",
      ops,
      { vehicleId, tripId, mode: "SIMULATED" },
      201,
    )
  ).data;
  check(
    !(await call("/tracking/sessions/" + session.id, admin)).data
      .latestLocation,
    "Session starts without an invented GPS point",
  );
  await call("/tracking/sessions/" + session.id, vendor1, undefined, 200);
  await call("/tracking/sessions/" + session.id, vendor2, undefined, 404);
  await call("/tracking/sessions/" + session.id, driverToken, undefined, 200);
  await call("/tracking/sessions/" + session.id, null, undefined, 401);
  await call(
    "/tracking/providers",
    ops,
    {
      slug: "forbidden-provider",
      name: "Forbidden",
      mode: "REAL",
      adapter: "GENERIC_WEBHOOK",
    },
    403,
  );
  const fence = (
    await call(
      "/tracking/geofences",
      ops,
      {
        name: "Synthetic destination geofence",
        kind: "DESTINATION",
        shape: "CIRCLE",
        centerLat: 12.9,
        centerLon: 77.6,
        radiusMeters: 200,
        depotId,
        tripId,
        alertOnEntry: true,
        alertOnExit: true,
        isActive: true,
      },
      201,
    )
  ).data;
  await call(
    "/tracking/geofences",
    ops,
    {
      name: "Invalid crossed polygon",
      kind: "DEPOT",
      shape: "POLYGON",
      polygon: [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
        [0, 0],
      ],
      depotId,
    },
    400,
  );
  const observation = (extra = {}) => ({
    eventId: randomUUID(),
    deviceExternalId: device.externalId,
    tripId,
    latitude: 12.9,
    longitude: 77.6,
    speedKph: 0,
    heading: 45,
    gpsAt: new Date().toISOString(),
    quality: "VALID",
    ...extra,
  });
  const realProvider=(await call('/tracking/providers',admin,{slug:prefix.toLowerCase()+'-unconfigured-real',name:'Unconfigured real source (no synthetic coordinates)',mode:'REAL',adapter:'GENERIC_WEBHOOK',isActive:true},201)).data;
  const realDevice=(await call('/tracking/devices',admin,{providerId:realProvider.id,name:'Unconfigured real device',externalId:prefix+'-REAL',status:'ACTIVE'},201)).data;
  await call('/tracking/devices/'+realDevice.id+'/mapping',admin,{vehicleId},200);
  const realSession=(await call('/tracking/sessions',admin,{vehicleId,tripId,mode:'REAL'},201)).data;
  await call('/tracking/manual',admin,{deviceId:realDevice.id,observation:observation({deviceExternalId:realDevice.externalId})},400);
  check(!(await call('/tracking/sessions/'+realSession.id,admin)).data.latestLocation,'Unconfigured real source never receives synthetic coordinates');
  await call('/tracking/devices/'+realDevice.id+'/unmap',admin,{},200);
  await call('/tracking/providers/'+realProvider.id,admin,{slug:realProvider.slug,name:realProvider.name,mode:'REAL',adapter:'GENERIC_WEBHOOK',isActive:false},200,'PUT');
  const manual = async (p, expected = 200) =>
    call(
      "/tracking/manual",
      ops,
      { deviceId: device.id, observation: p },
      expected,
    );
  const first = observation(),
    ingested = (await manual(first)).data[0];
  check(
    ingested.success && ingested.mode === "SIMULATED",
    "Manual fixture is explicitly SIMULATED",
  );
  const duplicate = (await manual(first)).data[0];
  check(
    duplicate.duplicate && duplicate.id === ingested.id,
    "Duplicate packet is idempotent",
  );
  check(
    !(await manual({ ...first, latitude: 13 })).data[0].success,
    "Event ID reuse with changed payload is rejected",
  );
  await manual(observation({ latitude: 95 }), 422);
  const live = socket(admin, "SIMULATED", tripId);
  await until(
    () =>
      live.events.some((e) =>
        e.data?.items.some((i) => i.latestLocation?.id === ingested.id),
      ),
    "initial socket position",
  );
  const second = observation({
    latitude: 12.91,
    longitude: 77.61,
    speedKph: 35,
  });
  const moved = (await manual(second)).data[0];
  check(moved.success, "Additional GPS observation ingested");
  await until(
    () =>
      live.events.some((e) =>
        e.data?.items.some((i) => i.latestLocation?.id === moved.id),
      ),
    "socket location movement",
  );
  check(true, "Authenticated WebSocket streams changed coordinates");
  live.ws.close();
  const reconnect = socket(admin, "SIMULATED", tripId);
  await until(
    () =>
      reconnect.events.some((e) =>
        e.data?.items.some((i) => i.latestLocation?.id === moved.id),
      ),
    "reconnect snapshot",
  );
  check(true, "Disconnected WebSocket reconnects with a fresh snapshot");
  reconnect.ws.close();
  const unauthorized = socket("invalid-token", "SIMULATED", tripId);
  await new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(Error("unauthorized socket not closed")),
      7000,
    );
    unauthorized.ws.once("close", (code) => {
      clearTimeout(t);
      check(code === 4401, "Unauthenticated WebSocket is closed");
      resolve();
    });
  });
  const late = observation({
    gpsAt: first.gpsAt,
    eventId: randomUUID(),
    latitude: 12.92,
  });
  check(
    (await manual(late)).data[0].isLate,
    "Out-of-order packet is preserved as late",
  );
  check(
    (await call("/tracking/sessions/" + session.id, admin)).data.latestLocation
      .id === moved.id,
    "Late packet cannot rewind current position",
  );
  const concurrent = observation();
  const race = await Promise.all([manual(concurrent), manual(concurrent)]);
  check(
    race.every((r) => r.data[0].success) &&
      race[0].data[0].id === race[1].data[0].id,
    "Concurrent duplicates persist once",
  );
  let detail = (await call("/tracking/sessions/" + session.id, admin)).data;
  check(
    detail.geofenceEvents.some((e) => e.type === "ENTRY") &&
      detail.geofenceEvents.some((e) => e.type === "EXIT"),
    "Geofence entry and exit are recorded",
  );
  check(
    (await call("/trips/" + tripId, ops)).data.status === "DISPATCHED",
    "GPS never confirms delivery or changes operational trip status",
  );
  check(
    !(await call("/tracking/active?mode=REAL", admin)).data.items.some(
      (s) => s.id === session.id,
    ),
    "REAL dashboard excludes simulated GPS",
  );
  check(
    !(await call("/tracking/active?mode=SIMULATED", vendor2)).data.items.some(
      (s) => s.id === session.id,
    ),
    "Vendor live snapshot isolation",
  );
  const hookPath = "/tracking/webhooks/" + provider.slug,
    body = JSON.stringify(observation()),
    stamp = String(Math.floor(Date.now() / 1000));
  async function webhook(signature, timestamp = stamp) {
    const r = await fetch("http://localhost:4000/api/v1" + hookPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GPS-Timestamp": timestamp,
        "X-GPS-Signature": signature,
      },
      body,
    });
    return { status: r.status, json: await r.json() };
  }
  check(
    (await webhook("0".repeat(64))).status === 401,
    "Unauthorized webhook signature rejected",
  );
  const secret = process.env.GPS_PHASE7_TEST_SECRET;
  if (!secret)
    throw Error(
      "Set GPS_PHASE7_TEST_SECRET on both server and test runner (synthetic testing only)",
    );
  const signed = createHmac("sha256", secret)
      .update(stamp + "." + body)
      .digest("hex"),
    signedResult = await webhook(signed);
  check(
    signedResult.status === 200 &&
      signedResult.json.data[0].success &&
      signedResult.json.data[0].mode === "SIMULATED",
    "Signed webhook ingestion preserves SIMULATED provenance",
  );
  check(
    (await webhook(signed)).json.data[0].duplicate,
    "Signed webhook replay is deduplicated",
  );
  check(
    (await webhook(signed, "1000000000")).status === 401,
    "Expired webhook timestamp rejected",
  );
  check(
    !JSON.stringify((await call("/tracking/settings", vendor1)).data).includes(
      secret,
    ),
    "Provider secret never appears in browser settings",
  );
  await call(
    "/tracking/settings",
    admin,
    { ...oldPolicy, staleSeconds: 5, offlineSeconds: 10, stationarySeconds: 5 },
    200,
    "PUT",
  );
  await manual(observation());
  await pause(6100);
  await call("/tracking/maintenance", ops, {}, 200);
  let alerts = (
    await call("/tracking/alerts?mode=SIMULATED&tripId=" + tripId, ops)
  ).data;
  check(
    alerts.some((a) => a.type === "LONG_STOP"),
    "Stationary threshold raises long-stop alert",
  );
  check(
    alerts.some((a) => a.type === "NO_UPDATE"),
    "Stale GPS raises no-update alert",
  );
  await pause(4500);
  await call("/tracking/maintenance", ops, {}, 200);
  alerts = (await call("/tracking/alerts?mode=SIMULATED&tripId=" + tripId, ops))
    .data;
  const offline = alerts.find(
    (a) => a.type === "GPS_OFFLINE" && a.status === "OPEN",
  );
  check(offline, "Interrupted GPS raises offline alert");
  await call("/tracking/maintenance", ops, {}, 200);
  check(
    (
      await call("/tracking/alerts?mode=SIMULATED&tripId=" + tripId, ops)
    ).data.filter((a) => a.type === "GPS_OFFLINE" && a.status !== "RESOLVED")
      .length === 1,
    "Offline alerts deduplicate while unresolved",
  );
  await manual(
    observation({ quality: "NO_FIX", latitude: null, longitude: null }),
  );
  check(
    (
      await call("/tracking/alerts?mode=SIMULATED&tripId=" + tripId, ops)
    ).data.some((a) => a.type === "GPS_SIGNAL_LOST"),
    "No-fix packet raises signal-lost alert",
  );
  await manual(observation({ speedKph: 20 }));
  await call(
    "/tracking/alerts/" + offline.id + "/acknowledge",
    ops,
    { remarks: "Synthetic interruption reviewed" },
    200,
  );
  await call(
    "/tracking/alerts/" + offline.id + "/resolve",
    ops,
    { remarks: "Synthetic GPS restored" },
    200,
  );
  alerts = (await call("/tracking/alerts?mode=SIMULATED&tripId=" + tripId, ops))
    .data;
  check(
    alerts.find((a) => a.id === offline.id).status === "RESOLVED" &&
      alerts.find((a) => a.id === offline.id).recoveredAt,
    "Restored GPS records recovery and explicit alert resolution",
  );
  await call(
    "/tracking/sessions/" + session.id + "/route",
    ops,
    {
      points: [
        [20, 80],
        [20.1, 80.1],
      ],
      reason: "Synthetic explicit route fixture",
    },
    200,
    "PUT",
  );
  await manual(observation());
  check(
    (
      await call("/tracking/alerts?mode=SIMULATED&tripId=" + tripId, ops)
    ).data.some((a) => a.type === "ROUTE_DEVIATION"),
    "Approved route enables deviation alerts",
  );
  await call("/tracking/settings", admin, oldPolicy, 200, "PUT");
  const history = (
    await call(
      "/tracking/sessions/" + session.id + "/replay?mode=SIMULATED",
      vendor1,
    )
  ).data;
  check(
    history.length >= 7 && history.every((p) => p.mode === "SIMULATED"),
    "Replay contains recorded source-labelled GPS",
  );
  check(
    history.every(
      (p, i) => !i || new Date(p.gpsAt) >= new Date(history[i - 1].gpsAt),
    ),
    "Replay orders late observations chronologically",
  );
  return {
    sessionId: session.id,
    providerId: provider.id,
    deviceId: device.id,
    fenceId: fence.id,
  };
};
exports.completed = async ({ call, check, admin, dispatch, sessionId }) => {
  await call("/tracking/maintenance", admin, {}, 200);
  const detail = (await call("/tracking/sessions/" + sessionId, admin)).data;
  check(
    detail.state === "CLOSED" && detail.trip.status === "DELIVERED",
    "Explicit operational delivery closes the tracking session",
  );
  check(
    detail.alerts.some((a) => a.type === "TRIP_COMPLETED"),
    "Trip-completed alert follows operational confirmation",
  );
  check(
    (await call("/tracking/sessions/" + sessionId + "/replay", admin)).data
      .length > 0,
    "Completed trip retains GPS replay history",
  );
};
