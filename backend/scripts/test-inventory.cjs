const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const ExcelJS = require("exceljs");
const base = "http://localhost:4000/api/v1";
let assertions = 0;
function check(value, description) {
  assert.ok(value, description);
  assertions++;
  console.log("PASS", description);
}
async function request(path, token, body, options = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body && !(body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(options.key ? { "Idempotency-Key": options.key } : {}),
  };
  const res = await fetch(base + path, {
    method: options.method || (body ? "POST" : "GET"),
    headers,
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (options.status !== undefined)
    check(
      res.status === options.status,
      `${options.method || (body ? "POST" : "GET")} ${path} -> ${options.status} (actual ${res.status}; ${json.error?.message ?? ""})`,
    );
  else if (!res.ok)
    throw new Error(`${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}
async function login(email) {
  const out = await request("/auth/login", null, {
    email,
    password: "FleetGo123",
  });
  return out.data.accessToken;
}
async function mutate(
  path,
  token,
  body = {},
  status = 200,
  key = randomUUID(),
  method = "POST",
) {
  return request("/inventory" + path, token, body, { status, key, method });
}
async function main() {
  const admin = await login("superadmin@fleetgo.dev"),
    reviewer = await login("jsanadmin@fleetgo.dev"),
    ops = await login("opsmanager@fleetgo.dev"),
    vendor = await login("vendor1@fleetgo.dev"),
    driver = await login("driver@fleetgo.dev"),
    cts = await login("ctsuser@fleetgo.dev");
  const refs = (await request("/inventory/lookups", admin)).data;
  const north = refs.depots.find((d) => d.code === "DEP-N"),
    south = refs.depots.find((d) => d.code === "DEP-S"),
    jsan = refs.organizations.find((o) => o.type === "JSAN"),
    ctsOrg = refs.organizations.find((o) => o.type === "CTS"),
    vendorOrg = refs.organizations.find(
      (o) => o.name === "Vendor Alpha Motors",
    );
  const tag = "P4-" + Date.now();
  const receipt = {
    registrationNumber: tag,
    organizationId: jsan.id,
    receivedAt: new Date(Date.now() - 5000).toISOString(),
    receivedFromOrgId: ctsOrg.id,
    receivingDepotId: north.id,
    custodianType: "DEPOT",
    custodianId: north.id,
    initialCondition: "GOOD",
    odometer: 120,
    accessories: "Synthetic test toolkit",
    remarks: "Synthetic Phase 4 integration test",
  };
  const receiptKey = randomUUID();
  const first = await mutate("/receipts", admin, receipt, 201, receiptKey);
  const id = first.data.vehicleId;
  const replay = await mutate("/receipts", admin, receipt, 201, receiptKey);
  check(replay.data.vehicleId === id, "Receipt retry is idempotent");
  await mutate(
    "/receipts",
    admin,
    { ...receipt, registrationNumber: tag + "-changed" },
    409,
    receiptKey,
  );
  await mutate("/receipts", admin, receipt, 409);
  const details = (await request(`/inventory/vehicles/${id}`, admin)).data;
  check(
    details.vehicle.status === "AVAILABLE" && details.movements.length === 1,
    "Receipt creates available inventory and one immutable movement",
  );
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3YQAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = new FormData();
  upload.append(
    "file",
    new Blob([bytes], { type: "image/png" }),
    "synthetic-initial.png",
  );
  const evidence = await mutate(`/vehicles/${id}/evidence`, admin, upload, 201);
  await request(
    `/inventory/evidence/${evidence.data.id}/download`,
    admin,
    undefined,
    { status: 200 },
  );
  const pdf = new FormData();
  pdf.append(
    "file",
    new Blob(["%PDF-1.4\n% synthetic supporting document\n%%EOF"], {
      type: "application/pdf",
    }),
    "synthetic-support.pdf",
  );
  await mutate(`/vehicles/${id}/evidence`, admin, pdf, 201);
  const available = (
    await request(`/inventory/vehicles/${id}/availability`, admin)
  ).data;
  check(available.available, "New good receipt is available");
  const reservation = {
    vehicleId: id,
    requestingOrgId: jsan.id,
    depotId: north.id,
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 86400000).toISOString(),
    purpose: "Synthetic concurrency test",
  };
  const parallel = await Promise.all(
    [1, 2, 3].map(() =>
      request("/inventory/reservations", admin, reservation, {
        key: randomUUID(),
      })
        .then((r) => ({ ok: true, data: r.data }))
        .catch((e) => ({ ok: false, error: e.message })),
    ),
  );
  check(
    parallel.filter((r) => r.ok).length === 1,
    "Exactly one of three simultaneous reservation attempts succeeds",
  );
  const active = parallel.find((r) => r.ok).data;
  check(
    !(await request(`/inventory/vehicles/${id}/availability`, admin)).data
      .available,
    "Reserved vehicle is unavailable",
  );
  await mutate(
    `/vehicles/${id}/status`,
    admin,
    { status: "ALLOCATED", reason: "Must be blocked" },
    400,
  );
  await mutate(
    "/transfers",
    admin,
    {
      vehicleId: id,
      toDepotId: south.id,
      custodianType: "DEPOT",
      custodianId: south.id,
      type: "DEPOT_TRANSFER",
      occurredAt: new Date().toISOString(),
      reason: "Blocked reservation transfer",
    },
    409,
  );
  await mutate(`/reservations/${active.id}/cancel`, admin, {
    reason: "Synthetic cancellation",
  });
  check(
    (await request(`/inventory/vehicles/${id}/availability`, admin)).data
      .available,
    "Cancellation restores availability",
  );
  const transfer = {
    vehicleId: id,
    toDepotId: south.id,
    custodianType: "DEPOT",
    custodianId: south.id,
    type: "DEPOT_TRANSFER",
    occurredAt: new Date().toISOString(),
    reason: "Synthetic south transfer",
  };
  await mutate("/transfers", ops, transfer, 403);
  await mutate("/transfers", admin, transfer);
  let moved = (await request(`/inventory/vehicles/${id}`, admin)).data;
  check(
    moved.currentDepotId === south.id &&
      moved.movements.length === 2 &&
      moved.custody.length === 2,
    "Transfer updates location and preserves movement/custody history",
  );
  await request(`/inventory/vehicles/${id}`, vendor, undefined, {
    status: 404,
  });
  await request("/inventory/dashboard", driver, undefined, { status: 403 });
  await mutate(
    "/receipts",
    cts,
    { ...receipt, registrationNumber: tag + "-cts" },
    403,
  );
  await request(`/inventory/vehicles/${id}`, ops, undefined, { status: 404 });
  await request("/inventory/dashboard", null, undefined, { status: 401 });
  await request(
    `/inventory/evidence/${evidence.data.id}/download`,
    vendor,
    undefined,
    { status: 404 },
  );
  await mutate(
    `/vehicles/${id}/status`,
    admin,
    { status: "DISPATCHED", reason: "Invalid dispatch" },
    400,
  );
  const rec = (
    await mutate(
      "/reconciliations",
      admin,
      {
        scope: "DEPOT",
        scopeId: south.id,
        notes: "Synthetic discrepancy review",
      },
      201,
    )
  ).data;
  for (const item of rec.items)
    await mutate(
      `/reconciliations/${rec.id}/items/${item.id}`,
      admin,
      {
        result: item.vehicleId === id ? "DAMAGED" : "VERIFIED",
        ...(item.vehicleId === id
          ? { discrepancy: "Synthetic damage observation" }
          : {}),
      },
      200,
      randomUUID(),
      "PUT",
    );
  await mutate(`/reconciliations/${rec.id}/items`, admin, {
    vehicleRef: "SYNTHETIC-UNEXPECTED",
    result: "UNEXPECTED",
    discrepancy: "Unknown vehicle physically present",
  });
  const recPhoto = new FormData();
  recPhoto.append(
    "file",
    new Blob([bytes], { type: "image/png" }),
    "synthetic-reconciliation.png",
  );
  await mutate(`/reconciliations/${rec.id}/evidence`, admin, recPhoto, 201);
  await mutate(`/reconciliations/${rec.id}/submit`, admin);
  check(
    (await request(`/inventory/vehicles/${id}`, admin)).data.vehicle.status ===
      "AVAILABLE",
    "Submitting reconciliation does not alter inventory",
  );
  await mutate(
    `/reconciliations/${rec.id}/review`,
    admin,
    { decision: "APPROVED", comment: "Self review must fail" },
    403,
  );
  await mutate(`/reconciliations/${rec.id}/review`, reviewer, {
    decision: "APPROVED",
    comment: "Synthetic damage correction approved",
  });
  moved = (await request(`/inventory/vehicles/${id}`, admin)).data;
  check(
    moved.vehicle.status === "DAMAGED" && moved.adjustments.length === 1,
    "Independent approval creates damage correction and audit adjustment",
  );
  await mutate(
    "/reservations",
    admin,
    { ...reservation, startDate: new Date().toISOString() },
    409,
  );
  const recReport = (
    await request(`/inventory/reconciliations/${rec.id}`, admin)
  ).data.report;
  check(
    recReport.damaged === 1 && recReport.unexpected === 1,
    "Reconciliation report counts damaged and unexpected vehicles",
  );
  const importRow = { ...receipt, registrationNumber: tag + "-IMPORT" };
  const preview = (
    await mutate("/import/validate", admin, {
      rows: [importRow, importRow, { registrationNumber: "" }],
    })
  ).data;
  check(
    preview.map((r) => r.status).join(",") === "READY,SKIPPED,FAILED",
    "Import preview reports ready, duplicate and invalid rows",
  );
  const importKey = randomUUID();
  const imported = (
    await mutate(
      "/import/commit",
      admin,
      { rows: [importRow, importRow, { registrationNumber: "" }] },
      200,
      importKey,
    )
  ).data;
  check(
    imported.successful === 1 &&
      imported.skipped === 1 &&
      imported.failed === 1,
    "Import summary counts success, skipped and failed rows",
  );
  const retried = (
    await mutate(
      "/import/commit",
      admin,
      { rows: [importRow, importRow, { registrationNumber: "" }] },
      200,
      importKey,
    )
  ).data;
  check(retried.successful === 1, "Import retry reuses its successful receipt");
  const excel = new ExcelJS.Workbook();
  const sheet = excel.addWorksheet("Data");
  sheet.columns = [
    { header: "registrationNumber", key: "registrationNumber" },
    { header: "receivedAt", key: "receivedAt" },
  ];
  sheet.addRow({
    registrationNumber: "SYNTHETIC-XLSX",
    receivedAt: new Date(),
  });
  const excelForm = new FormData();
  excelForm.append(
    "file",
    new Blob([await excel.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "synthetic.xlsx",
  );
  const parsed = (await mutate("/import/file", admin, excelForm)).data;
  check(
    parsed.rows[0].registrationNumber === "SYNTHETIC-XLSX",
    "Excel file is parsed for column mapping",
  );
  const csv = new FormData();
  csv.append(
    "file",
    new Blob(['Registration,Notes\n"TEST,1","quoted, value"'], {
      type: "text/csv",
    }),
    "synthetic.csv",
  );
  const csvParsed = (await mutate("/import/file", admin, csv)).data;
  check(
    csvParsed.rows[0].Registration === "TEST,1",
    "CSV parser handles quoted values",
  );
  await request("/inventory/import/template", admin, undefined, {
    status: 200,
  });
  const list = await request(
    "/inventory/vehicles?status=DAMAGED&pageSize=1&sortBy=vehicleCode",
    admin,
  );
  check(
    list.data.length <= 1 && list.meta.total >= 1,
    "Inventory filters, sort and pagination work",
  );
  for (const path of [
    "/inventory/dashboard",
    "/inventory/reservations",
    `/inventory/vehicles/${id}/movements`,
    `/inventory/vehicles/${id}/custody`,
    "/inventory/reconciliations",
    "/inventory/adjustments",
    "/inventory/reports",
    "/inventory/import/columns",
    "/fleet/stats",
    "/fleet/vehicles?pageSize=1",
    "/master-data/depots?pageSize=1",
    "/auth/me",
    "/health",
  ])
    await request(path, admin, undefined, { status: 200 });
  check(
    (await request("/inventory/dashboard", cts)).data.total >= 1,
    "CTS sees scoped receipts received from CTS",
  );
  await mutate("/transfers", admin, {
    vehicleId: imported.rows[0].vehicleId,
    toDepotId: north.id,
    custodianType: "VENDOR",
    custodianId: vendorOrg.id,
    type: "DEPOT_TO_VENDOR",
    occurredAt: new Date().toISOString(),
    reason: "Synthetic vendor custody",
  });
  const vendorData = (await request("/inventory/vehicles", vendor)).data;
  check(
    vendorData.some((r) => r.vehicleId === imported.rows[0].vehicleId),
    "Vendor sees vehicles only after custody transfer",
  );
  await request(`/inventory/vehicles/${id}`, vendor, undefined, {
    status: 404,
  });

  // Reservation expiry and status controls.
  const expId = (
    await mutate(
      "/receipts",
      admin,
      { ...receipt, registrationNumber: tag + "-EXPIRY" },
      201,
    )
  ).data.vehicleId;
  const exp = (
    await mutate(
      "/reservations",
      admin,
      {
        ...reservation,
        vehicleId: expId,
        startDate: new Date(Date.now() - 60000).toISOString(),
        endDate: new Date(Date.now() + 1300).toISOString(),
      },
      201,
    )
  ).data;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  check(
    (await request(`/inventory/vehicles/${expId}/availability`, admin)).data
      .available,
    "Expired reservation releases availability on the next inventory read",
  );
  check(
    (await request("/inventory/reservations", admin)).data.find(
      (r) => r.id === exp.id,
    ).status === "EXPIRED",
    "Expired reservation remains in history",
  );
  await mutate(`/vehicles/${expId}/status`, admin, {
    status: "UNDER_MAINTENANCE",
    reason: "Synthetic maintenance",
  });
  await mutate(
    "/reservations",
    admin,
    { ...reservation, vehicleId: expId, startDate: new Date().toISOString() },
    409,
  );
  await mutate(`/vehicles/${expId}/status`, admin, {
    status: "AVAILABLE",
    reason: "Synthetic maintenance completed",
  });
  await request(
    `/fleet/vehicles/${expId}`,
    admin,
    { depotId: south.id },
    { status: 409, method: "PUT" },
  );
  await request(
    `/fleet/vehicles/${expId}`,
    admin,
    {
      remarks: "Synthetic harmless fleet edit",
      depotId: north.id,
      organizationId: jsan.id,
    },
    { status: 200, method: "PUT" },
  );
  // Approved location correction produces both movement and adjustment.
  const locationRec = (
    await mutate(
      "/reconciliations",
      admin,
      {
        scope: "DEPOT",
        scopeId: north.id,
        notes: "Synthetic location correction",
      },
      201,
    )
  ).data;
  for (const item of locationRec.items)
    await mutate(
      `/reconciliations/${locationRec.id}/items/${item.id}`,
      admin,
      {
        result: item.vehicleId === expId ? "MISPLACED" : "VERIFIED",
        ...(item.vehicleId === expId
          ? {
              observedDepotId: south.id,
              discrepancy: "Physically verified at South",
            }
          : {}),
      },
      200,
      randomUUID(),
      "PUT",
    );
  await mutate(`/reconciliations/${locationRec.id}/submit`, admin);
  await mutate(`/reconciliations/${locationRec.id}/review`, reviewer, {
    decision: "APPROVED",
    comment: "Approve physical depot correction",
  });
  const corrected = (await request(`/inventory/vehicles/${expId}`, admin)).data;
  check(
    corrected.currentDepotId === south.id &&
      corrected.movements.some((m) => m.type === "ADJUSTMENT"),
    "Location approval preserves an adjustment movement",
  );
  // Stale snapshots cannot overwrite a newer transfer.
  const stale = (
    await mutate(
      "/reconciliations",
      admin,
      { scope: "DEPOT", scopeId: south.id, notes: "Synthetic stale snapshot" },
      201,
    )
  ).data;
  for (const item of stale.items)
    await mutate(
      `/reconciliations/${stale.id}/items/${item.id}`,
      admin,
      {
        result: item.vehicleId === expId ? "DAMAGED" : "VERIFIED",
        ...(item.vehicleId === expId
          ? { discrepancy: "Synthetic stale damage" }
          : {}),
      },
      200,
      randomUUID(),
      "PUT",
    );
  await mutate(`/reconciliations/${stale.id}/submit`, admin);
  await mutate("/transfers", admin, {
    ...transfer,
    vehicleId: expId,
    toDepotId: north.id,
    custodianId: north.id,
    occurredAt: new Date().toISOString(),
  });
  await mutate(
    `/reconciliations/${stale.id}/review`,
    reviewer,
    { decision: "APPROVED", comment: "Must reject stale correction" },
    409,
  );
  await mutate(`/reconciliations/${stale.id}/review`, reviewer, {
    decision: "REJECTED",
    comment: "Rejected because inventory changed",
  });
  await mutate(
    "/receipts",
    admin,
    {
      ...receipt,
      registrationNumber: tag + "-INVALID",
      receivingDepotId: randomUUID(),
    },
    400,
  );
  await mutate(
    "/import/commit",
    admin,
    { rows: [{ ...importRow, registrationNumber: "CHANGED" }] },
    409,
    importKey,
  );
  check(
    (
      await request(`/inventory/vehicles?organizationId=${jsan.id}`, vendor)
    ).data.every((v) => v.currentCustodianId === vendorOrg.id),
    "Organization filters cannot expand vendor scope",
  );
  // PostgreSQL enforces immutable movements independently of HTTP handlers.
  require("dotenv").config();
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    let blocked = false;
    try {
      await db.vehicleMovement.update({
        where: { id: corrected.movements[0].id },
        data: { reason: "attempted rewrite" },
      });
    } catch {
      blocked = true;
    }
    check(blocked, "PostgreSQL rejects movement history rewrites");
    let constrained = false;
    try {
      await db.$transaction(async (tx) => {
        await tx.vehicleReservation.create({
          data: {
            vehicleId: expId,
            requestingOrgId: jsan.id,
            depotId: north.id,
            startDate: new Date(),
            endDate: new Date(Date.now() + 60000),
          },
        });
        await tx.vehicleReservation.create({
          data: {
            vehicleId: expId,
            requestingOrgId: jsan.id,
            depotId: north.id,
            startDate: new Date(),
            endDate: new Date(Date.now() + 60000),
          },
        });
      });
    } catch {
      constrained = true;
    }
    check(
      constrained,
      "Database constraint independently prevents duplicate active reservations",
    );
  } finally {
    await db.$disconnect();
  }
  console.log(
    JSON.stringify(
      {
        assertions,
        vehicleId: id,
        reconciliationId: rec.id,
        syntheticPrefix: tag,
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
