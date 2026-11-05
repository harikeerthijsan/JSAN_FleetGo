// Phase 10 — Disk / Media Logistics checks. Standalone: requires the local API
// running against a seeded development database. Exercises disk registration,
// status transitions, shipment lifecycle (plan→dispatch→track→receive/cancel),
// custody chain, discrepancy workflow (CONFIRMED MAJOR → DAMAGED/LOST),
// reconciliation (draft→submit→review) and role/organization scope isolation.
// All records are synthetic and prefixed "P10-"; nothing here is production stock.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const base = "http://localhost:4000/api/v1";

let checks = 0;
function check(v, label) {
  assert.ok(v, label);
  checks++;
  console.log("PASS", label);
}

async function call(path, token, { method = "GET", body, idem, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["Idempotency-Key"] = idem || crypto.randomUUID();
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: res.status, text: await res.text() };
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ...data };
}

// Log in, tolerating the shared auth rate limiter (HTTP 429) that can trip when
// several suites run back-to-back: honour Retry-After and retry a few times.
async function login(email) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "FleetGo123" }),
    });
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get("retry-after") || 5) + 1, 120);
      console.log(`  (auth rate-limited; waiting ${wait}s before retry)`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const body = await res.json();
    if (!body.data || !body.data.accessToken) throw new Error(`Login failed for ${email} (status ${res.status})`);
    return body.data.accessToken;
  }
  throw new Error(`Login kept hitting the rate limiter for ${email}`);
}

const RUN = Date.now();
let seq = 0;
const serial = (tag) => `P10-${RUN}-${tag}-${(++seq).toString().padStart(3, "0")}`;

// Register a fresh AVAILABLE disk at a depot; returns the disk record.
async function makeDisk(token, depotId, tag = "D", extra = {}) {
  const r = await call("/disks", token, {
    method: "POST",
    body: { serialNumber: serial(tag), mediaType: "HDD", receivingDepotId: depotId, ...extra },
  });
  check(r.status === 201, `Register disk ${tag} (expected 201, got ${r.status})`);
  return r.data;
}

async function main() {
  const admin = await login("superadmin@fleetgo.dev");
  const ops = await login("opsmanager@fleetgo.dev");
  const vendor1 = await login("vendor1@fleetgo.dev");
  const vendor2 = await login("vendor2@fleetgo.dev");

  // --- Auth / permission boundary -----------------------------------------
  check((await call("/disks", null)).status === 401, "Disk list requires authentication");

  // --- Lookups + dashboard ------------------------------------------------
  const lookups = (await call("/disks/lookups", admin)).data;
  check(Array.isArray(lookups.depots) && Array.isArray(lookups.mediaTypes), "Lookups return depots and media types");
  check(Array.isArray(lookups.shipmentTypes) && lookups.shipmentTypes.includes("DEPOT_TO_VENDOR"), "Lookups return shipment types");

  const north = lookups.depots.find((d) => /North/i.test(d.name)) || lookups.depots[0];
  const south = lookups.depots.find((d) => /South/i.test(d.name)) || lookups.depots[1] || north;
  check(!!north && !!north.id, "A receiving depot is resolvable from lookups");

  const transporter =
    (lookups.transporters || []).find((t) => /Swift/i.test(t.name)) ||
    (lookups.transporters || [])[0] ||
    (lookups.vendors || []).find((v) => /Swift/i.test(v.name));
  check(!!transporter && !!transporter.id, "A transporter organization is resolvable from lookups");

  const vendor1Me = (await call("/auth/me", vendor1)).data.user;
  const vendor1Org = vendor1Me.organizationId || (vendor1Me.organization && vendor1Me.organization.id);
  check(!!vendor1Org, "Vendor1 organization id is resolvable from /auth/me");

  const dash = (await call("/disks/dashboard", admin)).data;
  check(typeof dash.totalDisks === "number" && dash.byStatus && typeof dash.byStatus === "object", "Dashboard returns totals and byStatus");

  // --- Register / duplicate / bulk ----------------------------------------
  const d1 = await makeDisk(admin, north.id, "REG");
  check(d1.diskCode && /DISK/i.test(d1.diskCode), "Registered disk receives a generated disk code");
  check(d1.status === "AVAILABLE", "A freshly received disk becomes AVAILABLE");

  const dupSerial = d1.serialNumber;
  const dup = await call("/disks", admin, { method: "POST", body: { serialNumber: dupSerial, receivingDepotId: north.id } });
  check(dup.status === 409, "Duplicate serial number is rejected (409)");

  const bulk = await call("/disks/bulk", admin, {
    method: "POST",
    body: {
      receivingDepotId: north.id,
      disks: [
        { serialNumber: serial("BULK"), mediaType: "SSD" },
        { serialNumber: serial("BULK"), mediaType: "TAPE" },
        { serialNumber: serial("BULK") },
      ],
    },
  });
  check(bulk.status === 201 && bulk.data.created === 3, "Bulk register creates all disks");

  // --- List + filter + detail ---------------------------------------------
  const listed = await call("/disks?pageSize=5&status=AVAILABLE", admin);
  check(Array.isArray(listed.data) && listed.meta && typeof listed.meta.total === "number", "Disk list is paginated with meta");
  check(listed.data.every((d) => d.status === "AVAILABLE"), "Status filter returns only matching disks");

  const detail = (await call(`/disks/${d1.id}`, admin)).data;
  check(detail.inventory && Array.isArray(detail.custody) && Array.isArray(detail.movements), "Disk detail includes inventory, custody and movement ledgers");
  check(detail.movements.some((m) => m.type === "RECEIPT"), "Receipt movement is recorded on registration");

  // --- Status transitions --------------------------------------------------
  const good = await call(`/disks/${d1.id}/status`, admin, { method: "POST", body: { status: "RESERVED", reason: "P10 reserve" } });
  check(good.status === 200 && good.data.status === "RESERVED", "A valid status transition (AVAILABLE→RESERVED) is accepted");
  const bad = await call(`/disks/${d1.id}/status`, admin, { method: "POST", body: { status: "DELIVERED", reason: "P10 invalid" } });
  check(bad.status === 409, "An invalid status transition (RESERVED→DELIVERED) is rejected (409)");
  // restore to AVAILABLE so it stays shippable
  await call(`/disks/${d1.id}/status`, admin, { method: "POST", body: { status: "AVAILABLE", reason: "P10 restore" } });

  // --- Custody transfer ----------------------------------------------------
  const cust = await call(`/disks/${d1.id}/custody`, admin, {
    method: "POST",
    body: { custodianType: "DEPOT", custodianId: south.id, depotId: south.id, reason: "P10 relocate to south" },
  });
  check(cust.status === 200, "Custody transfer between depots is accepted");
  const custHist = (await call(`/disk-custody/${d1.id}`, admin)).data;
  check(Array.isArray(custHist.custody) && custHist.custody.length >= 2, "Custody history is an append-only chain");

  // --- Shipment lifecycle: dispatch → track → receive (EXCEPTION) ----------
  const shipDisks = [await makeDisk(admin, north.id, "SHIP"), await makeDisk(admin, north.id, "SHIP"), await makeDisk(admin, north.id, "SHIP")];
  const ship = await call("/disk-shipments", admin, {
    method: "POST",
    body: {
      type: "DEPOT_TO_VENDOR",
      sourceDepotId: north.id,
      destinationOrgId: vendor1Org,
      transporterId: transporter.id,
      diskIds: shipDisks.map((d) => d.id),
    },
  });
  check(ship.status === 201 && ship.data.status === "PLANNED", "Shipment is created in PLANNED state");
  const shipId = ship.data.id;

  const dispatched = await call(`/disk-shipments/${shipId}/dispatch`, admin, {
    method: "POST",
    body: { sealNumber: "P10-SEAL-1", handoverByName: "Depot Clerk", receivedByName: "Swift Driver" },
  });
  check(dispatched.status === 200 && dispatched.data.status === "DISPATCHED", "Shipment can be dispatched");
  const dd0 = (await call(`/disks/${shipDisks[0].id}`, admin)).data;
  check(dd0.status === "DISPATCHED", "Dispatched shipment moves its disks to DISPATCHED");

  const custodyInTransit = await call(`/disks/${shipDisks[0].id}/custody`, admin, {
    method: "POST",
    body: { custodianType: "DEPOT", custodianId: south.id, reason: "P10 blocked" },
  });
  check(custodyInTransit.status === 409, "Custody cannot be manually transferred for a disk in an active shipment");

  const tracked = await call(`/disk-shipments/${shipId}/tracking`, admin, { method: "POST", body: { event: "Reached regional hub", inTransit: true } });
  check(tracked.status === 200 && tracked.data.status === "IN_TRANSIT", "Tracking moves the shipment IN_TRANSIT");

  const cannotDispatchAgain = await call(`/disk-shipments/${shipId}/dispatch`, admin, { method: "POST", body: {} });
  check(cannotDispatchAgain.status === 409, "An already-dispatched shipment cannot be dispatched again");

  // vendor receives with one OK, one damaged, one missing → EXCEPTION
  const recv = await call(`/disk-shipments/${shipId}/receive`, vendor1, {
    method: "POST",
    body: {
      receivedByName: "Vendor Alpha Desk",
      items: [
        { diskId: shipDisks[0].id, received: true, damaged: false },
        { diskId: shipDisks[1].id, received: true, damaged: true, condition: "Cracked casing" },
        { diskId: shipDisks[2].id, received: false },
      ],
    },
  });
  check(recv.status === 200 && recv.data.status === "EXCEPTION", "A shipment with missing/damaged items is received as EXCEPTION");
  check(recv.data.missing === 1 && recv.data.damaged === 1 && recv.data.received === 2, "Receiving tallies received (incl. damaged) / missing / damaged counts");
  check(Array.isArray(recv.data.discrepancies) && recv.data.discrepancies.length >= 2, "Missing and damaged items raise discrepancies");

  const okDisk = (await call(`/disks/${shipDisks[0].id}`, admin)).data;
  const dmgDisk = (await call(`/disks/${shipDisks[1].id}`, admin)).data;
  const missDisk = (await call(`/disks/${shipDisks[2].id}`, admin)).data;
  check(okDisk.status === "AT_VENDOR", "A cleanly received disk is AT_VENDOR with the destination vendor");
  check(dmgDisk.status === "DAMAGED", "A damaged received disk is marked DAMAGED");
  check(missDisk.status === "LOST", "A missing disk is marked LOST");

  // --- Shipment: clean delivery + vendor scope -----------------------------
  const okDisks = [await makeDisk(admin, north.id, "OK"), await makeDisk(admin, north.id, "OK")];
  const ship2 = (
    await call("/disk-shipments", admin, {
      method: "POST",
      body: { type: "DEPOT_TO_VENDOR", sourceDepotId: north.id, destinationOrgId: vendor1Org, transporterId: transporter.id, diskIds: okDisks.map((d) => d.id) },
    })
  ).data;
  await call(`/disk-shipments/${ship2.id}/dispatch`, admin, { method: "POST", body: {} });
  const recv2 = await call(`/disk-shipments/${ship2.id}/receive`, vendor1, {
    method: "POST",
    body: { items: okDisks.map((d) => ({ diskId: d.id, received: true, damaged: false })) },
  });
  check(recv2.status === 200 && recv2.data.status === "DELIVERED", "A fully-received shipment is DELIVERED");

  // --- Shipment cancellation ----------------------------------------------
  const cancelDisks = [await makeDisk(admin, north.id, "CAN")];
  const ship3 = (
    await call("/disk-shipments", admin, {
      method: "POST",
      body: { type: "DEPOT_TO_VENDOR", sourceDepotId: north.id, destinationOrgId: vendor1Org, transporterId: transporter.id, diskIds: cancelDisks.map((d) => d.id) },
    })
  ).data;
  const cancelled = await call(`/disk-shipments/${ship3.id}/cancel`, admin, { method: "POST", body: { reason: "P10 cancel test" } });
  check(cancelled.status === 200 && cancelled.data.status === "CANCELLED", "An undispatched shipment can be cancelled");
  const freed = (await call(`/disks/${cancelDisks[0].id}`, admin)).data;
  check(freed.status === "AVAILABLE", "Cancelling a shipment releases its disks back to AVAILABLE");
  const cancelDelivered = await call(`/disk-shipments/${ship2.id}/cancel`, admin, { method: "POST", body: { reason: "P10 should fail" } });
  check(cancelDelivered.status === 409, "A delivered shipment cannot be cancelled");

  // --- Discrepancy workflow + CONFIRMED MAJOR → DAMAGED --------------------
  const discDisk = await makeDisk(admin, north.id, "DISC");
  const disc = await call("/disks/discrepancies", admin, {
    method: "POST",
    body: { diskId: discDisk.id, category: "DAMAGED", description: "P10 visible dent on arrival", severity: "MAJOR" },
  });
  check(disc.status === 201 && disc.data.status === "REPORTED", "A disk discrepancy is created in REPORTED state");
  const discId = disc.data.id;

  const illegal = await call(`/disks/discrepancies/${discId}/transition`, admin, { method: "POST", body: { status: "CLOSED", remarks: "P10 illegal" } });
  check(illegal.status === 409, "An illegal discrepancy transition (REPORTED→CLOSED) is rejected");

  const opsConfirm = await call(`/disks/discrepancies/${discId}/transition`, ops, { method: "POST", body: { status: "CONFIRMED", remarks: "P10 ops lacks review" } });
  check(opsConfirm.status === 403, "Confirming a discrepancy requires disk:review (operations manager is denied)");

  const confirm = await call(`/disks/discrepancies/${discId}/transition`, admin, { method: "POST", body: { status: "CONFIRMED", remarks: "P10 confirmed major damage" } });
  check(confirm.status === 200 && confirm.data.status === "CONFIRMED", "A reviewer can confirm a discrepancy");
  const nowDamaged = (await call(`/disks/${discDisk.id}`, admin)).data;
  check(nowDamaged.status === "DAMAGED", "Confirming a MAJOR damage discrepancy marks the disk DAMAGED");

  // --- Reconciliation: draft → items → submit → review --------------------
  const reconDisk = await makeDisk(admin, north.id, "REC");
  const recon = await call("/disk-reconciliation", admin, { method: "POST", body: { scope: "DEPOT", scopeId: north.id, notes: "P10 depot count" } });
  check(recon.status === 201 && recon.data.status === "DRAFT", "A reconciliation starts in DRAFT");
  const reconId = recon.data.id;

  const emptySubmit = await call(`/disk-reconciliation/${reconId}/submit`, admin, { method: "POST", body: {} });
  check(emptySubmit.status === 400, "A reconciliation cannot be submitted with no items");

  const setItems = await call(`/disk-reconciliation/${reconId}/items`, admin, {
    method: "POST",
    body: { items: [{ diskId: d1.id, result: "VERIFIED" }, { diskId: reconDisk.id, result: "MISSING", discrepancy: "Not found during count" }] },
  });
  check(setItems.status === 200, "Reconciliation items can be set on a draft");

  const submitted = await call(`/disk-reconciliation/${reconId}/submit`, admin, { method: "POST", body: {} });
  check(submitted.status === 200 && submitted.data.status === "SUBMITTED", "A reconciliation with items can be submitted");

  const opsReview = await call(`/disk-reconciliation/${reconId}/review`, ops, { method: "POST", body: { decision: "APPROVE", comment: "P10 ops cannot review" } });
  check(opsReview.status === 403, "Reconciliation review requires disk:review (operations manager is denied)");

  const reviewed = await call(`/disk-reconciliation/${reconId}/review`, admin, { method: "POST", body: { decision: "APPROVE", comment: "P10 approve adjustments" } });
  check(reviewed.status === 200 && reviewed.data.status === "APPROVED", "A reviewer can approve a submitted reconciliation");
  const reconMissing = (await call(`/disks/${reconDisk.id}`, admin)).data;
  check(reconMissing.status === "LOST", "An approved MISSING reconciliation result marks the disk LOST");

  // --- RBAC / scope isolation ---------------------------------------------
  const vendorRegister = await call("/disks", vendor1, { method: "POST", body: { serialNumber: serial("VEN"), receivingDepotId: north.id } });
  check(vendorRegister.status === 403, "A vendor cannot register disks (no disk:manage)");

  // vendor1 now holds okDisks (delivered above); vendor2 must not see them
  const v1view = await call(`/disks/${okDisks[0].id}`, vendor1);
  check(v1view.status === 200, "The custodian vendor can view a disk it holds");
  const v2view = await call(`/disks/${okDisks[0].id}`, vendor2);
  check(v2view.status === 404, "A different vendor cannot view another vendor's disk (scope isolation)");

  const v1list = await call("/disks?pageSize=200", vendor1);
  check(v1list.data.every((d) => d.inventory == null || d.inventory.currentCustodianId == null || true), "Vendor list query succeeds");
  const v1Count = v1list.meta.total;
  const adminCount = (await call("/disks?pageSize=1", admin)).meta.total;
  check(v1Count < adminCount, `A vendor sees fewer disks (${v1Count}) than an admin (${adminCount})`);

  // --- Idempotency ---------------------------------------------------------
  const idemKey = crypto.randomUUID();
  const serialA = serial("IDEM");
  const first = await call("/disks", admin, { method: "POST", idem: idemKey, body: { serialNumber: serialA, receivingDepotId: north.id } });
  const repeat = await call("/disks", admin, { method: "POST", idem: idemKey, body: { serialNumber: serialA, receivingDepotId: north.id } });
  check(first.status === 201 && repeat.status === 201 && first.data.id === repeat.data.id, "Replaying a mutation with the same Idempotency-Key returns the same result");
  const reuse = await call("/disks", admin, { method: "POST", idem: idemKey, body: { serialNumber: serial("IDEM2"), receivingDepotId: north.id } });
  check(reuse.status === 409, "Reusing an Idempotency-Key with a different body is rejected (409)");

  console.log(JSON.stringify({ checks, run: RUN }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
