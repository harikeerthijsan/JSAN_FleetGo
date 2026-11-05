const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const base = "http://localhost:4000/api/v1";
let checks = 0;
function check(v, label) {
  assert.ok(v, label);
  checks++;
  console.log("PASS", label);
}
async function call(path, token, body, expected, method, requestKey) {
  const res = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(body ? { "Idempotency-Key": requestKey || randomUUID() } : {}),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  if (expected !== undefined)
    check(
      res.status === expected,
      `${method || (body ? "POST" : "GET")} ${path}: expected ${expected}, actual ${res.status} ${data.error?.message ?? ""}`,
    );
  else if (!res.ok)
    throw Error(path + " " + res.status + " " + JSON.stringify(data));
  return { status: res.status, ...data };
}
async function login(email) {
  return (await call("/auth/login", null, { email, password: "FleetGo123" }))
    .data.accessToken;
}
async function main() {
  const admin = await login("superadmin@fleetgo.dev"),
    ops = await login("opsmanager@fleetgo.dev"),
    jsan = await login("jsanadmin@fleetgo.dev"),
    cts = await login("ctsuser@fleetgo.dev"),
    vendor1 = await login("vendor1@fleetgo.dev"),
    vendor2 = await login("vendor2@fleetgo.dev"),
    driverToken = await login("driver@fleetgo.dev");
  const refs = (await call("/dispatch/lookups", admin)).data;
  const n = refs.depots.find((d) => d.name === "North Depot"),
    south = refs.depots.find((d) => d.name === "South Depot"),
    org = refs.organizations.find((o) => o.type === "JSAN"),
    ctsOrg = refs.organizations.find((o) => o.type === "CTS"),
    vendorOrg = refs.organizations.find(
      (o) => o.name === "Vendor Alpha Motors",
    ),
    partner = refs.organizations.find((o) => o.type === "TRANSPORT_PARTNER"),
    driverUser = (await call("/auth/me", driverToken)).data;
  const userId = driverUser.user?.id ?? driverUser.id;
  const prefix = "P6-" + Date.now(),
    planned = new Date(Date.now() + 3600000).toISOString(),
    expected = new Date(Date.now() + 86400000).toISOString();
  const vehicles = [];
  for (let i = 0; i < 7; i++) {
    const out = await call(
      "/inventory/receipts",
      admin,
      {
        registrationNumber: prefix + "-" + i,
        organizationId: org.id,
        receivedAt: new Date().toISOString(),
        receivedFromOrgId: ctsOrg.id,
        receivingDepotId: n.id,
        custodianType: "DEPOT",
        custodianId: n.id,
        initialCondition: "GOOD",
        typeId: refs.types[0].id,
      },
      201,
    );
    vehicles.push(out.data.vehicleId);
  }
  const existingDriver = (await call("/dispatch/drivers", admin)).data.find(
    (d) => d.userId === userId,
  );
  const d1 = (
    await call(
      "/dispatch/drivers" + (existingDriver ? "/" + existingDriver.id : ""),
      admin,
      {
        name: "Synthetic Phase6 Driver",
        phone: "9000000000",
        licenseNumber: prefix + "-LIC",
        licenseExpiry: new Date(Date.now() + 365 * 86400000).toISOString(),
        transporterId: partner.id,
        userId,
        status: "ACTIVE",
      },
      existingDriver ? 200 : 201,
      existingDriver ? "PUT" : "POST",
    )
  ).data;
  const d2 = (
    await call(
      "/dispatch/drivers",
      admin,
      {
        name: "Synthetic Relief Driver",
        phone: "9000000001",
        licenseNumber: prefix + "-RELIEF",
        licenseExpiry: new Date(Date.now() + 365 * 86400000).toISOString(),
        transporterId: partner.id,
        status: "ACTIVE",
      },
      201,
    )
  ).data;
  const dExpired = (
    await call(
      "/dispatch/drivers",
      admin,
      {
        name: "Synthetic Expired Driver",
        phone: "9000000002",
        licenseNumber: prefix + "-EXPIRED",
        licenseExpiry: new Date(Date.now() - 86400000).toISOString(),
        transporterId: partner.id,
        status: "ACTIVE",
      },
      201,
    )
  ).data;
  const tokens = {
    OPERATIONS_MANAGER: ops,
    JSAN_ADMIN: jsan,
    SUPER_ADMIN: admin,
  };
  async function ticket(quantity, subject) {
    const t = (
      await call(
        "/tickets",
        cts,
        {
          type: "DELIVERY",
          subject: prefix + " " + subject,
          requestedQuantity: quantity,
          requestedTypeId: refs.types[0].id,
          sourceDepotId: n.id,
          destinationDepotId: south.id,
        },
        201,
      )
    ).data;
    return t;
  }
  async function approve(t) {
    await call(`/tickets/${t.id}/submit`, cts, {}, 200);
    for (let i = 0; i < 10; i++) {
      const r = (await call(`/tickets/${t.id}`, admin)).data;
      if (r.approvalStatus === "APPROVED") return r;
      const step = r.approvals.find((s) => s.order === r.currentStep);
      if (!tokens[step.approverRoleName])
        throw Error("Unknown approval role " + step.approverRoleName);
      await call(
        `/tickets/${t.id}/decision`,
        tokens[step.approverRoleName],
        { decision: "APPROVED", comment: "Synthetic Phase6 workflow approval" },
        200,
      );
    }
    throw Error("Approval chain did not finish");
  }
  const t = await ticket(3, "partial delivery");
  const allocationBody = (ticketId, ids) => ({
    ticketId,
    vehicleIds: ids,
    sourceDepotId: n.id,
    destinationDepotId: south.id,
    receivingOrgId: vendorOrg.id,
    transporterId: partner.id,
    plannedDispatchAt: planned,
    expectedDeliveryAt: expected,
  });
  await call("/allocations", ops, allocationBody(t.id, [vehicles[0]]), 409);
  await call(`/tickets/${t.id}/submit`, cts, {}, 200);
  await call(
    `/tickets/${t.id}/reassign-approver`,
    jsan,
    { approverId: driverUser.user?.id ?? driverUser.id },
    403,
  );
  for (let i = 0; i < 10; i++) {
    const r = (await call(`/tickets/${t.id}`, admin)).data;
    if (r.approvalStatus === "APPROVED") break;
    const step = r.approvals.find((s) => s.order === r.currentStep);
    await call(
      `/tickets/${t.id}/decision`,
      tokens[step.approverRoleName],
      { decision: "APPROVED", comment: "Synthetic approval" },
      200,
    );
  }
  await call("/allocations", cts, allocationBody(t.id, [vehicles[0]]), 403);
  await call(
    "/allocations",
    driverToken,
    allocationBody(t.id, [vehicles[0]]),
    403,
  );
  const allocationKey = randomUUID();
  const a = (
    await call(
      "/allocations",
      ops,
      allocationBody(t.id, [vehicles[0], vehicles[1]]),
      201,
      undefined,
      allocationKey,
    )
  ).data;
  const replay = (
    await call(
      "/allocations",
      ops,
      allocationBody(t.id, [vehicles[0], vehicles[1]]),
      201,
      undefined,
      allocationKey,
    )
  ).data;
  check(replay.id === a.id, "Allocation retries are idempotent");
  check(
    (await call("/allocations/queue", ops)).data.find((x) => x.id === t.id)
      .pending === 1,
    "Partial allocation leaves one pending vehicle",
  );
  check(
    (await call(`/inventory/vehicles/${vehicles[0]}`, admin)).data.vehicle
      .status === "ALLOCATED",
    "Allocation updates authoritative inventory status",
  );
  await call("/allocations", ops, allocationBody(t.id, [vehicles[0]]), 409);
  await call(
    "/allocations",
    ops,
    allocationBody(t.id, [vehicles[2], vehicles[3]]),
    409,
  );
  await call(`/allocations/${a.id}`, vendor1, undefined, 200);
  await call(`/allocations/${a.id}`, vendor2, undefined, 404);
  await call(`/allocations/${a.id}`, driverToken, undefined, 404);
  const draftBody = {
    allocationId: a.id,
    allocationItemIds: a.items.map((i) => i.id),
    driverId: d2.id,
    destinationAddress: "Synthetic South Depot gate",
    instructions: "Synthetic test only",
  };
  await call("/dispatch", ops, { ...draftBody, driverId: dExpired.id }, 400);
  const dispatchRace = await Promise.all(
    [1, 2].map(() =>
      call("/dispatch", ops, draftBody)
        .then((r) => ({ ok: true, data: r.data }))
        .catch(() => ({ ok: false })),
    ),
  );
  check(
    dispatchRace.filter((r) => r.ok).length === 1,
    "Concurrent dispatch creation has one winner",
  );
  const dispatch = dispatchRace.find((r) => r.ok).data;
  await call("/dispatch", ops, draftBody, 409);
  await call(
    `/allocations/${a.id}/cancel`,
    ops,
    { reason: "Must cancel dispatch plan first" },
    409,
  );
  await call(`/dispatch/${dispatch.id}/confirm`, ops, {}, 400);
  await call(
    `/dispatch/${dispatch.id}/assignment`,
    ops,
    {
      driverId: d1.id,
      transporterId: partner.id,
      reason: "Synthetic driver reassignment",
    },
    200,
  );
  const reassigned = (await call(`/dispatch/${dispatch.id}`, ops)).data;
  check(
    reassigned.assignments.length === 2 && reassigned.driverId === d1.id,
    "Driver reassignment preserves transport history",
  );
  const checklist = {
    identityVerified: true,
    registrationVerified: true,
    odometer: 1200,
    fuelLevel: 75,
    accessories: "Toolkit and spare tyre",
    keysHandedOver: true,
    documentsHandedOver: true,
    remarks: "Synthetic identity and registration verification",
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3YQAAAAASUVORK5CYII=",
    "base64",
  );
  async function photo(dispatchId, vehicleId, category) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([png], { type: "image/png" }),
      prefix + "-" + category + ".png",
    );
    form.append("vehicleId", vehicleId);
    form.append("category", category);
    form.append("remarks", "Synthetic dispatch photograph");
    return call(`/dispatch/${dispatchId}/evidence`, ops, form, 200);
  }
  for (const v of vehicles.slice(0, 2))
    await call(
      `/dispatch/${dispatch.id}/checklist/${v}`,
      ops,
      checklist,
      200,
      "PUT",
    );
  await call(`/dispatch/${dispatch.id}/confirm`, ops, {}, 400);
  const evidence = [];
  for (const v of vehicles.slice(0, 2)) {
    evidence.push((await photo(dispatch.id, v, "FRONT")).data);
    await photo(dispatch.id, v, "REAR");
  }
  await call(
    `/dispatch/evidence/${evidence[0].id}/download`,
    vendor1,
    undefined,
    200,
  );
  await call(
    `/dispatch/evidence/${evidence[0].id}/download`,
    vendor2,
    undefined,
    404,
  );
  const exc = (
    await call(
      "/dispatch/exceptions",
      ops,
      {
        tripId: dispatch.trip.id,
        type: "MISSING_DOCUMENTS",
        description: "Synthetic missing document check",
        severity: "HIGH",
      },
      201,
    )
  ).data;
  check(
    (await call(`/trips/${dispatch.trip.id}`, ops)).data.status === "PLANNED",
    "Exception creation does not silently change trip status",
  );
  await call(`/dispatch/${dispatch.id}/ready`, ops, {}, 409);
  await call(
    `/dispatch/exceptions/${exc.id}/resolve`,
    ops,
    { resolutionNotes: "Synthetic documents verified" },
    200,
  );
  await call(`/dispatch/${dispatch.id}/ready`, ops, {}, 200);
  const confirmKey = randomUUID();
  await call(
    `/dispatch/${dispatch.id}/confirm`,
    ops,
    {},
    200,
    undefined,
    confirmKey,
  );
  await call(
    `/dispatch/${dispatch.id}/confirm`,
    ops,
    {},
    200,
    undefined,
    confirmKey,
  );
  await call(`/dispatch/${dispatch.id}/confirm`, ops, {}, 409);
  const inv = (await call(`/inventory/vehicles/${vehicles[0]}`, admin)).data;
  check(
    inv.vehicle.status === "DISPATCHED" &&
      inv.currentCustodianId === partner.id &&
      inv.currentDepotId === n.id,
    "Departure records transport custody and last-known source depot",
  );
  check(
    (await call(`/tickets/${t.id}`, admin)).data.status === "IN_PROGRESS",
    "Departure moves linked ticket to In Progress",
  );
  await call(`/trips/${dispatch.trip.id}`, driverToken, undefined, 200);
  await call(`/trips/${dispatch.trip.id}`, vendor2, undefined, 404);
  check(
    (await call("/trips/tracking-ready", ops)).data.some(
      (x) => x.tripId === dispatch.trip.id,
    ),
    "Dispatched trip is available to the future tracking integration",
  );
  let trackingFixture;
  if (process.env.TEST_PHASE7 === 'true') trackingFixture = await require('./tracking-checks.cjs').active({call,check,admin,ops,vendor1,vendor2,driverToken,dispatch,vehicleId:vehicles[0],depotId:n.id,prefix});
  await call(
    `/trips/${dispatch.trip.id}/status`,
    driverToken,
    { status: "IN_TRANSIT", reason: "Synthetic departed source" },
    200,
  );
  await call(
    `/trips/${dispatch.trip.id}/status`,
    driverToken,
    { status: "CANCELLED", reason: "Drivers cannot cancel" },
    403,
  );
  const breakdown = (
    await call(
      "/dispatch/exceptions",
      driverToken,
      {
        tripId: dispatch.trip.id,
        type: "BREAKDOWN",
        description: "Synthetic roadside issue",
        severity: "MEDIUM",
      },
      201,
    )
  ).data;
  const exPhoto = new FormData();
  exPhoto.append(
    "file",
    new Blob([png], { type: "image/png" }),
    "synthetic-exception.png",
  );
  exPhoto.append("category", "EXCEPTION");
  exPhoto.append("exceptionId", breakdown.id);
  await call(`/dispatch/${dispatch.id}/evidence`, driverToken, exPhoto, 200);
  check(
    (await call(`/trips/${dispatch.trip.id}`, ops)).data.status ===
      "IN_TRANSIT",
    "Driver exception preserves explicit trip status",
  );
  await call(
    `/trips/${dispatch.trip.id}/status`,
    driverToken,
    { status: "FAILED_DELIVERY", reason: "Synthetic failed delivery attempt" },
    200,
  );
  await call(
    `/trips/${dispatch.trip.id}/status`,
    ops,
    { status: "IN_TRANSIT", reason: "Synthetic retry delivery" },
    200,
  );
  await call(
    `/trips/${dispatch.trip.id}/status`,
    driverToken,
    { status: "DELAYED", reason: "Synthetic traffic", delayMinutes: 20 },
    200,
  );
  await call(
    `/trips/${dispatch.trip.id}/status`,
    driverToken,
    {
      status: "DELIVERED",
      reason: "Synthetic arrival acknowledged",
      delayMinutes: 20,
    },
    200,
  );
  const arrived = (await call(`/inventory/vehicles/${vehicles[0]}`, admin))
    .data;
  if (trackingFixture) await require('./tracking-checks.cjs').completed({call,check,admin,dispatch,...trackingFixture});
  check(
    arrived.vehicle.status === "DELIVERED" &&
      arrived.currentDepotId === south.id &&
      arrived.currentCustodianId === vendorOrg.id,
    "Delivery records receiving custody without prematurely making inventory available",
  );
  check(
    !(await call(`/inventory/vehicles/${vehicles[0]}/availability`, admin)).data
      .available,
    "Delivered vehicle awaits later receiving verification",
  );
  check(
    !(await call(`/trips/${dispatch.trip.id}`, ops)).data.trackingReady,
    "Delivered trip leaves tracking-ready feed",
  );
  // Cancel a planned dispatch, release its allocation, and reuse the restored vehicle.
  const remaining = (
    await call("/allocations", ops, allocationBody(t.id, [vehicles[2]]), 201)
  ).data;
  const plan = (
    await call(
      "/dispatch",
      ops,
      {
        allocationId: remaining.id,
        allocationItemIds: remaining.items.map((i) => i.id),
        driverId: d1.id,
        destinationAddress: "Synthetic destination",
      },
      201,
    )
  ).data;
  await call(
    `/trips/${plan.trip.id}/status`,
    ops,
    { status: "CANCELLED", reason: "Synthetic plan cancelled" },
    200,
  );
  await call(
    `/allocations/${remaining.id}/cancel`,
    ops,
    { reason: "Synthetic allocation release" },
    200,
  );
  check(
    (await call(`/inventory/vehicles/${vehicles[2]}/availability`, admin)).data
      .available,
    "Pre-departure cancellation and allocation release restore availability",
  );
  // Complete the remaining quantity with a second dispatch; delivery completes the ticket.
  const finalAllocation = (
    await call("/allocations", ops, allocationBody(t.id, [vehicles[2]]), 201)
  ).data;
  const finalDispatch = (
    await call(
      "/dispatch",
      ops,
      {
        allocationId: finalAllocation.id,
        allocationItemIds: finalAllocation.items.map((i) => i.id),
        driverId: d1.id,
        destinationAddress: "Synthetic final partial shipment",
      },
      201,
    )
  ).data;
  await call(
    `/dispatch/${finalDispatch.id}/checklist/${vehicles[2]}`,
    ops,
    checklist,
    200,
    "PUT",
  );
  await photo(finalDispatch.id, vehicles[2], "FRONT");
  await photo(finalDispatch.id, vehicles[2], "REAR");
  if (process.env.TEST_PHASE8 === 'true')
    await require('./inspection-checks.cjs').gate({ call, check, ops, admin, dispatchId: finalDispatch.id, vehicleId: vehicles[2] });
  await call(`/dispatch/${finalDispatch.id}/confirm`, ops, {}, 200);
  await call(
    `/trips/${finalDispatch.trip.id}/status`,
    driverToken,
    { status: "DELIVERED", reason: "Final requested vehicle arrived" },
    200,
  );
  check(
    (await call(`/tickets/${t.id}`, admin)).data.status === "COMPLETED",
    "All partial shipments delivered complete the linked ticket",
  );
  const reserved = (
    await call(
      "/inventory/reservations",
      admin,
      {
        vehicleId: vehicles[3],
        requestingOrgId: org.id,
        depotId: n.id,
        startDate: new Date().toISOString(),
        endDate: expected,
        purpose: "Synthetic reservation restriction",
      },
      201,
    )
  ).data;
  const one = await approve(await ticket(1, "reservation restriction"));
  await call("/allocations", ops, allocationBody(one.id, [vehicles[3]]), 409);
  await call(
    `/inventory/reservations/${reserved.id}/cancel`,
    admin,
    { reason: "Synthetic test complete" },
    200,
  );
  // Separate approved tickets compete for the same physical vehicle.
  const c1 = await approve(await ticket(1, "race one")),
    c2 = await approve(await ticket(1, "race two"));
  const race = await Promise.all(
    [c1, c2].map((x) =>
      call("/allocations", ops, allocationBody(x.id, [vehicles[4]]))
        .then((r) => ({ ok: true, data: r.data }))
        .catch((e) => ({ ok: false, message: e.message })),
    ),
  );
  check(
    race.filter((r) => r.ok).length === 1,
    "Concurrent allocation attempts for the same vehicle have exactly one winner",
  );
  const won = race.find((r) => r.ok).data;
  const cancelPlan = (
    await call(
      "/dispatch",
      ops,
      {
        allocationId: won.id,
        allocationItemIds: won.items.map((i) => i.id),
        driverId: d1.id,
        destinationAddress: "Synthetic cancelled trip",
      },
      201,
    )
  ).data;
  await call(
    `/dispatch/${cancelPlan.id}/checklist/${vehicles[4]}`,
    ops,
    checklist,
    200,
    "PUT",
  );
  await photo(cancelPlan.id, vehicles[4], "FRONT");
  await photo(cancelPlan.id, vehicles[4], "REAR");
  await call(`/dispatch/${cancelPlan.id}/confirm`, ops, {}, 200);
  await call(
    `/trips/${cancelPlan.trip.id}/status`,
    ops,
    { status: "CANCELLED", reason: "Synthetic cancellation after departure" },
    200,
  );
  check(
    (await call(`/inventory/vehicles/${vehicles[4]}`, admin)).data.vehicle
      .status === "DISPATCHED",
    "Post-departure cancellation does not silently release physical inventory",
  );
  check(
    (await call(`/trips/${cancelPlan.trip.id}`, ops)).data.exceptions.some(
      (e) => e.type === "TRIP_CANCELLATION",
    ),
    "Post-departure cancellation creates recovery exception",
  );
  // Scope and API coverage.
  for (const p of [
    "/allocations/dashboard",
    "/allocations/available?pageSize=1",
    "/allocations?pageSize=1",
    "/dispatch/dashboard",
    "/dispatch/reports",
    "/dispatch?pageSize=1",
    "/dispatch/drivers",
    "/dispatch/transporters",
    "/dispatch/exceptions",
    "/trips?pageSize=1",
    `/trips/${dispatch.trip.id}/events`,
    "/fleet/stats",
    "/inventory/dashboard",
    "/tickets/dashboard",
    "/master-data/depots?pageSize=1",
    "/auth/me",
    "/health",
  ])
    await call(p, admin, undefined, 200);
  await call("/dispatch/drivers", vendor1, undefined, 403);
  await call("/allocations", null, undefined, 401);
  const myTrips = (await call("/trips?pageSize=200", driverToken)).data;
  check(
    myTrips.every((t) => t.dispatch.driver.userId === userId),
    "Driver list contains only assigned trips",
  );
  const otherTrips = (await call("/trips?pageSize=200", vendor2)).data;
  check(
    !otherTrips.some((t) => t.id === dispatch.trip.id),
    "Unrelated vendor cannot list another organization’s trip",
  );
  await call(
    `/inventory/vehicles/${vehicles[5]}/status`,
    admin,
    { status: "DAMAGED", reason: "Synthetic allocation restriction" },
    200,
  );
  await call("/allocations", ops, allocationBody(one.id, [vehicles[5]]), 409);
  await call(
    `/inventory/vehicles/${vehicles[5]}/status`,
    admin,
    {
      status: "UNDER_MAINTENANCE",
      reason: "Synthetic maintenance restriction",
    },
    200,
  );
  await call("/allocations", ops, allocationBody(one.id, [vehicles[5]]), 409);
  await call(
    `/inventory/vehicles/${vehicles[5]}/status`,
    admin,
    { status: "INACTIVE", reason: "Synthetic inactive restriction" },
    200,
  );
  await call("/allocations", ops, allocationBody(one.id, [vehicles[5]]), 409);
  const badSource = {
    ...allocationBody(one.id, [vehicles[5]]),
    sourceDepotId: south.id,
  };
  await call("/allocations", ops, badSource, 403);
  if (process.env.TEST_PHASE8 === 'true')
    await require('./inspection-checks.cjs').workflow({
      call,
      check,
      admin,
      ops,
      jsan,
      cts,
      vendor1,
      vendor2,
      driverToken,
      dispatch,
      vehicleId: vehicles[0],
      spareVehicleId: vehicles[6],
      depotId: n.id,
      prefix,
    });
  console.log(
    JSON.stringify(
      {
        checks,
        prefix,
        allocationId: a.id,
        dispatchId: dispatch.id,
        tripId: dispatch.trip.id,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
