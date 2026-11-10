// Insurance Claims checks. Standalone: requires the local API running against a
// seeded dev database (run `npm run claims:enable` once). Exercises vendor
// reporting (incident/city/car/level + police complaint), photo/video evidence,
// receiver processing (insurance status, acknowledge, approved % + payable),
// Open/WIP/Closed lifecycle, and role/organization scope isolation.

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
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ...data };
}

async function login(email) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "FleetGo123" }),
    });
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers.get("retry-after") || 5) + 1, 120);
      console.log(`  (auth rate-limited; waiting ${wait}s)`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const body = await res.json();
    if (!body.data || !body.data.accessToken) throw new Error(`Login failed for ${email} (status ${res.status})`);
    return body.data.accessToken;
  }
  throw new Error(`Login kept hitting the rate limiter for ${email}`);
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
async function uploadEvidence(token, claimId, name, type, bytes) {
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type }), name);
  const res = await fetch(`${base}/claims/${claimId}/attachments`, { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
  let body = {};
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

async function reportIncident(token, body) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(body)) fd.append(key, String(value));
  fd.append('files', new Blob([PNG], { type: 'image/png' }), 'initial-damage.png');
  fd.append('files', new Blob([Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70])], { type: 'video/mp4' }), 'initial-damage.mp4');
  const res = await fetch(base + '/claims', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  return { status: res.status, ...(await res.json()) };
}

async function main() {
  const admin = await login("superadmin@fleetgo.dev");
  const ops = await login("opsmanager@fleetgo.dev");
  const vendor1 = await login("vendor1@fleetgo.dev");
  const vendor2 = await login("vendor2@fleetgo.dev");

  // --- Auth / lookups ------------------------------------------------------
  check((await call("/claims", null)).status === 401, "Claims list requires authentication");
  const lookups = (await call("/claims/lookups", vendor1)).data;
  check(Array.isArray(lookups.incidentTypes) && lookups.incidentTypes.includes("ACCIDENT"), "Lookups return incident types");
  check(Array.isArray(lookups.damageLevels) && lookups.damageLevels.join() === "LOW,MEDIUM,HIGH", "Lookups return damage levels");
  check(lookups.canReport === true && lookups.canManage === false, "A vendor can report but not manage");

  const vehicle = (await call("/fleet/vehicles?pageSize=1", vendor1)).data[0];
  check(!!vehicle, "A vehicle is resolvable for the claim");

  // --- Vendor reports an incident -----------------------------------------
  const reported = await reportIncident(vendor1, {
      vehicleId: vehicle.id,
      incidentType: "ACCIDENT",
      category: "Collision",
      city: "Bengaluru",
      location: "Outer Ring Road",
      incidentDate: "2026-11-10",
      damageLevel: "HIGH",
      description: "Rear-ended at a signal; bumper and tail-light damaged",
      policeComplaint: true,
      policeComplaintNumber: "FIR-9001",
      policeStation: "Marathahalli PS",
  });
  check(reported.status === 201 && /FG-CLM-/.test(reported.data.reference), "Vendor reports a claim with a generated reference");
  check(reported.data.status === "OPEN" && reported.data.insuranceStatus === "NOT_SUBMITTED", "A new claim starts OPEN / NOT_SUBMITTED");
  check(reported.data.damageLevel === "HIGH" && reported.data.city === "Bengaluru" && reported.data.policeComplaint === true, "The reported incident details are stored");
  const claimId = reported.data.id;

  // --- Required evidence on submit: both a photo AND a video ---------------
  async function reportWith(token, body, files) {
    const fd = new FormData();
    for (const [k, val] of Object.entries(body)) fd.append(k, String(val));
    for (const f of files) fd.append("files", new Blob([f.bytes], { type: f.type }), f.name);
    const res = await fetch(base + "/claims", { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
    return res.status;
  }
  const baseBody = { vehicleId: vehicle.id, incidentType: "ACCIDENT", category: "Collision", city: "Pune", location: "MG Road", incidentDate: "2026-11-10", damageLevel: "LOW", description: "Minor scratch on the door" };
  const vid = { name: "v.mp4", type: "video/mp4", bytes: Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]) };
  const pic = { name: "p.png", type: "image/png", bytes: PNG };
  check((await reportWith(vendor1, baseBody, [pic])) === 400, "A claim with a photo but no video is rejected");
  check((await reportWith(vendor1, baseBody, [vid])) === 400, "A claim with a video but no photo is rejected");
  check((await reportWith(vendor1, { ...baseBody, city: "" }, [pic, vid])) === 422, "A claim missing a required field (city) is rejected");

  // --- Evidence (photo + video) -------------------------------------------
  const photo = await uploadEvidence(vendor1, claimId, "damage.png", "image/png", PNG);
  check(photo.status === 201 && photo.body.data.kind === "PHOTO", "A damage photo can be uploaded as evidence");
  const video = await uploadEvidence(vendor1, claimId, "damage.mp4", "video/mp4", Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]));
  check(video.status === 201 && video.body.data.kind === "VIDEO", "A damage video can be uploaded as evidence");
  const withEvidence = (await call(`/claims/${claimId}`, vendor1)).data;
  check(Array.isArray(withEvidence.attachments) && withEvidence.attachments.length === 4, "Claim detail includes required initial evidence and additional uploads");
  check(Array.isArray(withEvidence.events) && withEvidence.events.length >= 1, "Claim has an append-only event timeline");

  // --- Vendor cannot process (no claims:manage) ---------------------------
  check((await call(`/claims/${claimId}/process`, vendor1, { method: "POST", body: { status: "WIP" } })).status === 403, "A vendor cannot process a claim (no claims:manage)");
  check((await call(`/claims/${claimId}/acknowledge`, vendor1, { method: "POST" })).status === 403, "A vendor cannot acknowledge a claim");

  // --- Receiver acknowledges + processes ----------------------------------
  const ack = await call(`/claims/${claimId}/acknowledge`, ops, { method: "POST" });
  check(ack.status === 200 && ack.data.acknowledged === true && ack.data.status === "WIP", "A receiver acknowledges the claim (Open → WIP)");

  const processed = await call(`/claims/${claimId}/process`, ops, {
    method: "POST",
    body: { insuranceStatus: "PARTIALLY_APPROVED", insurerName: "ICICI Lombard", policyNumber: "POL-555", estimatedAmount: 120000, approvedPercentage: 70, payableAmount: 84000 },
  });
  check(processed.status === 200 && processed.data.insuranceStatus === "PARTIALLY_APPROVED", "A receiver sets the insurance status");
  check(processed.data.approvedPercentage === 70 && processed.data.payableAmount === 84000, "A receiver records approved % and payable amount");

  // --- Validation ----------------------------------------------------------
  check((await call(`/claims/${claimId}/process`, ops, { method: "POST", body: { approvedPercentage: 150 } })).status === 422, "An approved percentage over 100 is rejected");
  check((await call("/claims", vendor1, { method: "POST", body: { vehicleId: vehicle.id, description: "x" } })).status === 422, "A too-short description is rejected");

  // --- Close ---------------------------------------------------------------
  const closed = await call(`/claims/${claimId}/process`, ops, { method: "POST", body: { status: "CLOSED", insuranceStatus: "SETTLED", note: "Settled and closed" } });
  check(closed.status === 200 && closed.data.status === "CLOSED", "A receiver can close the claim");

  // --- RBAC / scope isolation ---------------------------------------------
  check((await call(`/claims/${claimId}`, vendor1)).status === 200, "The reporting vendor can view their claim");
  check((await call(`/claims/${claimId}`, vendor2)).status === 404, "A different vendor cannot view another vendor's claim (scope isolation)");
  const v2list = await call("/claims?pageSize=50", vendor2);
  check(!v2list.data.some((c) => c.id === claimId), "A different vendor does not see the claim in their list");
  const adminList = await call("/claims?pageSize=50", admin);
  check(adminList.data.some((c) => c.id === claimId), "An administrator sees all claims");

  // --- Dashboard -----------------------------------------------------------
  const dash = (await call("/claims/dashboard", admin)).data;
  check(typeof dash.total === "number" && typeof dash.totalPayable === "number" && dash.byDamageLevel, "Dashboard returns totals, payable sum and breakdowns");

  console.log(JSON.stringify({ checks }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
