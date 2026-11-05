const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const base = "http://localhost:4000/api/v1";
let checks = 0;
async function req(path, token, body, status = 200, method) {
  const res = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Authorization: "Bearer " + token,
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      "Idempotency-Key": randomUUID(),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const text = await res.text();
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    out = {};
  }
  assert.equal(res.status, status, `${path}: ${out.error?.message ?? text}`);
  checks++;
  console.log("PASS", path, status);
  return out.data;
}
async function login(email) {
  return (
    await (
      await fetch(base + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "FleetGo123" }),
      })
    ).json()
  ).data.accessToken;
}
async function main() {
  const admin = await login("superadmin@fleetgo.dev"),
    ops = await login("opsmanager@fleetgo.dev"),
    jsan = await login("jsanadmin@fleetgo.dev"),
    cts = await login("ctsuser@fleetgo.dev"),
    driver = await login("driver@fleetgo.dev"),
    vendor = await login("vendor2@fleetgo.dev");
  await req("/approvals/workflows", ops, undefined, 403);
  await req("/approvals/workflows", admin, undefined, 200);
  const refs = await req("/dispatch/lookups", admin),
    north = refs.depots.find((d) => d.name === "North Depot"),
    south = refs.depots.find((d) => d.name === "South Depot"),
    partner = refs.organizations.find((o) => o.type === "TRANSPORT_PARTNER"),
    receiver = refs.organizations.find((o) => o.name === "Vendor Alpha Motors"),
    profile = refs.drivers.find((d) => d.userId);
  const stock = await req(
    "/inventory/vehicles?search=P6-&status=AVAILABLE&pageSize=200",
    admin,
  );
  const cars = stock.filter((r) => r.currentDepotId === north.id).slice(0, 2);
  assert.equal(
    cars.length,
    2,
    "Run the Phase6 workflow suite first to create synthetic stock.",
  );
  const t = await req(
    "/tickets",
    cts,
    {
      type: "DELIVERY",
      subject: "P6 driver availability guard " + Date.now(),
      requestedQuantity: 2,
      sourceDepotId: north.id,
      destinationDepotId: south.id,
    },
    201,
  );
  await req(`/tickets/${t.id}/submit`, cts, {});
  for (let i = 0; i < 5; i++) {
    const t2 = await req(`/tickets/${t.id}`, admin);
    if (t2.approvalStatus === "APPROVED") break;
    const step = t2.approvals.find((a) => a.order === t2.currentStep);
    await req(
      `/tickets/${t.id}/decision`,
      step.approverRoleName === "OPERATIONS_MANAGER"
        ? ops
        : step.approverRoleName === "JSAN_ADMIN"
          ? jsan
          : admin,
      { decision: "APPROVED" },
    );
  }
  const a = await req(
    "/allocations",
    ops,
    {
      ticketId: t.id,
      vehicleIds: cars.map((r) => r.vehicleId),
      sourceDepotId: north.id,
      destinationDepotId: south.id,
      receivingOrgId: receiver.id,
      transporterId: partner.id,
      plannedDispatchAt: new Date().toISOString(),
      expectedDeliveryAt: new Date(Date.now() + 86400000).toISOString(),
    },
    201,
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3YQAAAAASUVORK5CYII=",
    "base64",
  );
  const plans = [];
  for (const item of a.items) {
    const d = await req(
      "/dispatch",
      ops,
      {
        allocationId: a.id,
        allocationItemIds: [item.id],
        driverId: profile.id,
        destinationAddress: "Synthetic driver guard destination",
      },
      201,
    );
    plans.push(d);
    await req(
      `/dispatch/${d.id}/checklist/${item.vehicleId}`,
      ops,
      {
        identityVerified: true,
        registrationVerified: true,
        odometer: 50,
        fuelLevel: 90,
        accessories: "None",
        keysHandedOver: true,
        documentsHandedOver: true,
      },
      200,
      "PUT",
    );
    for (const category of ["FRONT", "REAR"]) {
      const data = new FormData();
      data.append(
        "file",
        new Blob([png], { type: "image/png" }),
        "synthetic-guard.png",
      );
      data.append("category", category);
      data.append("vehicleId", item.vehicleId);
      await req(`/dispatch/${d.id}/evidence`, ops, data);
    }
  }
  const invalid = new FormData();
  invalid.append(
    "file",
    new Blob([png], { type: "image/png" }),
    "invalid-meta.png",
  );
  invalid.append("category", "FRONT");
  invalid.append("vehicleId", "not-a-uuid");
  await req(`/dispatch/${plans[0].id}/evidence`, ops, invalid, 422);
  const fake = new FormData();
  fake.append(
    "file",
    new Blob(["not-an-image"], { type: "image/jpeg" }),
    "fake.jpg",
  );
  fake.append("category", "FRONT");
  fake.append("vehicleId", a.items[0].vehicleId);
  await req(`/dispatch/${plans[0].id}/evidence`, ops, fake, 400);
  await req(`/dispatch/${plans[0].id}/confirm`, ops, {});
  await req(`/dispatch/${plans[1].id}/confirm`, ops, {}, 409);
  await req(`/trips/${plans[0].trip.id}/status`, driver, {
    status: "DELIVERED",
    reason: "Synthetic delivery releases driver",
  });
  await req(`/dispatch/${plans[1].id}/confirm`, ops, {});
  await req(`/trips/${plans[1].trip.id}/status`, driver, {
    status: "DELIVERED",
    reason: "Synthetic second delivery",
  });
  await req(
    `/trips/${plans[1].trip.id}/status`,
    ops,
    { status: "IN_TRANSIT", reason: "Terminal transition must fail" },
    400,
  );
  await req(
    "/tickets",
    vendor,
    {
      type: "MAINTENANCE",
      subject: "Synthetic foreign vehicle scope attack",
      vehicleId: cars[0].vehicleId,
    },
    403,
  );
  const scoped = await req("/tickets/availability", vendor);
  assert.equal(scoped.totalAvailable, 0);
  checks++;
  console.log("PASS ticket availability remains vendor-scoped");
  await req(
    `/trips/${plans[0].trip.id}/status`,
    cts,
    { status: "IN_TRANSIT", reason: "Unauthorized" },
    403,
  );
  const partnerBefore = refs.organizations.find((o) => o.id === partner.id);
  await req(
    `/dispatch/transporters/${partner.id}`,
    ops,
    {
      contactName: partnerBefore.contactName ?? "",
      contactPhone: partnerBefore.contactPhone ?? "",
      contactEmail: partnerBefore.contactEmail,
      status: partnerBefore.status,
    },
    200,
    "PUT",
  );
  require("dotenv").config();
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    const e = await db.tripEvent.findFirst({
      where: { tripId: plans[0].trip.id },
    });
    let denied = false;
    try {
      await db.tripEvent.update({
        where: { id: e.id },
        data: { description: "Forbidden rewrite" },
      });
    } catch {
      denied = true;
    }
    assert.ok(denied);
    checks++;
    console.log("PASS immutable trip event trigger");
  } finally {
    await db.$disconnect();
  }
  console.log(
    JSON.stringify({ checks, tripIds: plans.map((p) => p.trip.id) }, null, 2),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
