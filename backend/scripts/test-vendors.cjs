// Phase 11 — Vendor Management checks. Standalone: requires the local API running
// against a seeded development database (and the Phase 10 disk suite's delivered
// disks, which put media into Vendor Alpha's custody — used to prove the
// integration + deactivation guard). Exercises vendor registration, profile,
// contacts, locations, assigned users, status management, vendor-wise
// vehicle/disk inventory, and role/organization scope isolation. All created
// vendors are synthetic and prefixed "P11-".

const assert = require("node:assert/strict");
const base = "http://localhost:4000/api/v1";

let checks = 0;
function check(v, label) {
  assert.ok(v, label);
  checks++;
  console.log("PASS", label);
}

async function call(path, token, { method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ...data };
}

// Tolerate the shared auth rate limiter (HTTP 429) when suites run back-to-back.
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

async function main() {
  const admin = await login("superadmin@fleetgo.dev");
  const ops = await login("opsmanager@fleetgo.dev");
  const vendor1 = await login("vendor1@fleetgo.dev");
  const vendor2 = await login("vendor2@fleetgo.dev");

  const v1me = (await call("/auth/me", vendor1)).data.user;
  const alphaId = v1me.organizationId; // Vendor Alpha Motors
  const v1Id = v1me.id;

  // --- Auth / lookups ------------------------------------------------------
  check((await call("/vendors", null)).status === 401, "Vendor list requires authentication");
  const lookups = (await call("/vendors/lookups", admin)).data;
  check(Array.isArray(lookups.types) && lookups.types.includes("VEHICLE_VENDOR") && lookups.canManage === true, "Lookups return vendor types and a manage flag");

  // --- List is vendor-typed only ------------------------------------------
  const list = await call("/vendors?pageSize=50", admin);
  check(Array.isArray(list.data) && list.data.every((o) => ["VEHICLE_VENDOR", "TRANSPORT_PARTNER"].includes(o.type)), "Vendor list contains only vendor/transport organizations");
  const betaId = list.data.find((o) => /Vendor Beta/i.test(o.name))?.id;
  check(!!alphaId && !!betaId, "Seeded vendor organizations are resolvable");

  // --- Register + duplicate ------------------------------------------------
  const name = `P11-Vendor ${RUN}`;
  const reg = await call("/vendors", admin, { method: "POST", body: { name, type: "VEHICLE_VENDOR", contactEmail: "p11@example.com", category: "Fleet operator", city: "Testville" } });
  check(reg.status === 201 && /FG-VEND-/.test(reg.data.vendorProfile.code), "Registering a vendor creates an Organization with a generated vendor code");
  const newId = reg.data.id;
  const dup = await call("/vendors", admin, { method: "POST", body: { name, type: "VEHICLE_VENDOR" } });
  check(dup.status === 409, "A duplicate vendor (same name + type) is rejected");

  // --- Detail (profile + summary) -----------------------------------------
  const detail = (await call(`/vendors/${newId}`, admin)).data;
  check(detail.vendorProfile && Array.isArray(detail.vendorContacts) && Array.isArray(detail.vendorLocations) && Array.isArray(detail.users), "Vendor detail includes profile, contacts, locations and users");
  check(detail.summary && typeof detail.summary.disksInCustody === "number" && typeof detail.summary.custodyVehicles === "number", "Vendor detail includes an operational summary");

  // --- Update --------------------------------------------------------------
  const upd = await call(`/vendors/${newId}`, admin, { method: "PUT", body: { notes: "P11 updated", category: "Maintenance partner" } });
  check(upd.status === 200 && upd.data.vendorProfile.category === "Maintenance partner", "A vendor profile can be updated");

  // --- Contacts ------------------------------------------------------------
  const c1 = await call(`/vendors/${newId}/contacts`, admin, { method: "POST", body: { name: "Primary Contact", email: "pc@example.com", isPrimary: true } });
  check(c1.status === 201 && c1.data.isPrimary === true, "A primary contact can be added");
  const c2 = await call(`/vendors/${newId}/contacts`, admin, { method: "POST", body: { name: "Second Contact", isPrimary: true } });
  check(c2.status === 201, "A second contact can be added");
  const afterContacts = (await call(`/vendors/${newId}`, admin)).data.vendorContacts;
  check(afterContacts.filter((c) => c.isPrimary).length === 1, "Only one contact remains primary after a new primary is set");
  const delC = await call(`/vendors/${newId}/contacts/${c1.data.id}`, admin, { method: "DELETE" });
  check(delC.status === 200, "A contact can be deleted");

  // --- Locations -----------------------------------------------------------
  const l1 = await call(`/vendors/${newId}/locations`, admin, { method: "POST", body: { label: "HQ", city: "Testville", isPrimary: true } });
  check(l1.status === 201, "A location can be added");
  const lu = await call(`/vendors/${newId}/locations/${l1.data.id}`, admin, { method: "PUT", body: { label: "Head Office", isPrimary: true } });
  check(lu.status === 200 && lu.data.label === "Head Office", "A location can be updated");
  check((await call(`/vendors/${newId}/locations/${l1.data.id}`, admin, { method: "DELETE" })).status === 200, "A location can be deleted");

  // --- Assigned users (positive via an existing member, state restored) ----
  const userList = await call(`/vendors/${alphaId}/users`, admin);
  check(Array.isArray(userList.data) && userList.data.some((u) => u.id === v1Id), "A vendor's assigned users are listed");
  const foreign = await call(`/vendors/${newId}/users`, admin, { method: "POST", body: { userId: v1Id } });
  check(foreign.status === 409, "Assigning a user who already belongs to another organization is rejected");
  const unassign = await call(`/vendors/${alphaId}/users/${v1Id}`, admin, { method: "DELETE" });
  check(unassign.status === 200, "A user can be unassigned from a vendor");
  const reassign = await call(`/vendors/${alphaId}/users`, admin, { method: "POST", body: { userId: v1Id } });
  check(reassign.status === 201 && reassign.data.organizationId === alphaId, "A user can be (re)assigned to a vendor");

  // --- Status management + deactivation guard ------------------------------
  const deact = await call(`/vendors/${newId}/status`, admin, { method: "POST", body: { status: "INACTIVE", reason: "P11 pause" } });
  check(deact.status === 200 && deact.data.status === "INACTIVE", "A vendor with no custody can be deactivated");
  const react = await call(`/vendors/${newId}/status`, admin, { method: "POST", body: { status: "ACTIVE", reason: "P11 resume" } });
  check(react.status === 200 && react.data.status === "ACTIVE", "A vendor can be reactivated");

  // --- Vendor-wise inventory (integration with disk logistics) ------------
  const alphaDisks = await call(`/vendors/${alphaId}/disks?pageSize=100`, admin);
  check(Array.isArray(alphaDisks.data) && alphaDisks.meta.total >= 1, "Disks delivered into a vendor's custody appear under that vendor");
  const guard = await call(`/vendors/${alphaId}/status`, admin, { method: "POST", body: { status: "INACTIVE", reason: "P11 should fail" } });
  check(guard.status === 409, "A vendor holding media in custody cannot be deactivated");
  const alphaVehicles = await call(`/vendors/${alphaId}/vehicles?pageSize=5`, admin);
  check(Array.isArray(alphaVehicles.data) && alphaVehicles.meta, "Vendor-wise vehicle inventory is returned");

  // --- Documents (agreements / consent forms) -----------------------------
  async function uploadDoc(token, vid, category, name, type) {
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("%PDF-1.4 P11 synthetic document")], { type }), name);
    fd.append("category", category);
    const res = await fetch(`${base}/vendors/${vid}/documents`, {
      method: "POST",
      headers: token ? { Authorization: "Bearer " + token } : {},
      body: fd,
    });
    let body = {};
    try { body = await res.json(); } catch {}
    return { status: res.status, body };
  }
  const up = await uploadDoc(admin, newId, "CONSENT", "consent.pdf", "application/pdf");
  check(up.status === 201 && up.body.data && up.body.data.category === "CONSENT", "A consent document can be uploaded to a vendor");
  const docId = up.body.data.id;
  const docs = (await call(`/vendors/${newId}/documents`, admin)).data;
  check(Array.isArray(docs) && docs.some((d) => d.id === docId), "Uploaded vendor documents are listed");
  const detailDocs = (await call(`/vendors/${newId}`, admin)).data.vendorDocuments;
  check(Array.isArray(detailDocs) && detailDocs.length >= 1, "Vendor detail includes its documents");
  const dl = await fetch(`${base}/vendors/${newId}/documents/${docId}/download`, { headers: { Authorization: "Bearer " + admin } });
  check(dl.status === 200, "A vendor document can be downloaded");
  const badType = await uploadDoc(admin, newId, "OTHER", "evil.exe", "application/x-msdownload");
  check(badType.status === 415, "An unsupported document type is rejected (415)");
  const vendorUpload = await uploadDoc(vendor1, alphaId, "OTHER", "x.pdf", "application/pdf");
  check(vendorUpload.status === 403, "A vendor user cannot upload vendor documents (no vendors:manage)");
  const delDoc = await call(`/vendors/${newId}/documents/${docId}`, admin, { method: "DELETE" });
  check(delDoc.status === 200, "A vendor document can be deleted");

  // --- RBAC / scope isolation ---------------------------------------------
  const v1List = await call("/vendors?pageSize=50", vendor1);
  check(v1List.data.length === 1 && v1List.data[0].id === alphaId, "A vendor user sees only their own vendor in the list");
  check((await call(`/vendors/${alphaId}`, vendor1)).status === 200, "A vendor user can view their own vendor");
  check((await call(`/vendors/${betaId}`, vendor1)).status === 404, "A vendor user cannot view another vendor (scope isolation)");
  check((await call("/vendors", vendor1, { method: "POST", body: { name: `P11-x ${RUN}`, type: "VEHICLE_VENDOR" } })).status === 403, "A vendor user cannot register vendors (no vendors:manage)");
  check((await call(`/vendors/${alphaId}/contacts`, vendor1, { method: "POST", body: { name: "nope", isPrimary: false } })).status === 403, "A vendor user cannot modify vendor contacts (read-only)");
  const v2SeesBetaOnly = await call("/vendors?pageSize=50", vendor2);
  check(v2SeesBetaOnly.data.length === 1 && v2SeesBetaOnly.data[0].id === betaId, "A second vendor user sees only their own vendor");

  // Operations manager: read-all but no manage.
  const opsList = await call("/vendors?pageSize=50", ops);
  check(opsList.data.length >= 3, "An operations manager can read all vendors");
  check((await call("/vendors", ops, { method: "POST", body: { name: `P11-ops ${RUN}`, type: "VEHICLE_VENDOR" } })).status === 403, "An operations manager cannot register vendors (read-only)");

  console.log(JSON.stringify({ checks, run: RUN }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
