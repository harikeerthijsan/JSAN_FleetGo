// Phase 12 — Settings checks. Standalone: requires the local API running against
// a seeded development database (run `npm run settings:enable` once to seed the
// catalogue). Exercises the system-settings registry (list, validated update,
// read-only + unknown-key guards, reset) and per-user preferences, plus the
// settings:manage RBAC boundary.

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

async function main() {
  const admin = await login("superadmin@fleetgo.dev");
  const ops = await login("opsmanager@fleetgo.dev");
  const vendor1 = await login("vendor1@fleetgo.dev");

  // --- Auth / RBAC ---------------------------------------------------------
  check((await call("/settings", null)).status === 401, "System settings require authentication");
  const list = await call("/settings", admin);
  check(Array.isArray(list.data) && list.data.length >= 8, "An administrator can list the system settings catalogue");
  const byKey = Object.fromEntries(list.data.map((s) => [s.key, s]));
  check(
    byKey["general.defaultPageSize"] && byKey["general.defaultPageSize"].valueType === "NUMBER" && "category" in byKey["general.defaultPageSize"],
    "Settings carry key, value, valueType and category",
  );
  check((await call("/settings", ops)).status === 403, "A non-admin (operations manager) cannot read system settings");
  check((await call("/settings", vendor1)).status === 403, "A vendor user cannot read system settings");

  // --- Update + validation -------------------------------------------------
  const upd = await call("/settings/general.defaultPageSize", admin, { method: "PUT", body: { value: 50 } });
  check(upd.status === 200 && upd.data.value === "50", "A numeric setting can be updated");
  check((await call("/settings/general.defaultPageSize", admin, { method: "PUT", body: { value: "not-a-number" } })).status === 400, "A non-numeric value for a NUMBER setting is rejected");

  const boolOn = await call("/settings/inspections.preDispatchRequired", admin, { method: "PUT", body: { value: true } });
  check(boolOn.status === 200 && boolOn.data.value === "true", "A boolean setting can be toggled");
  check((await call("/settings/inspections.preDispatchRequired", admin, { method: "PUT", body: { value: "maybe" } })).status === 400, "A non-boolean value for a BOOLEAN setting is rejected");

  check((await call("/settings/fleet.commercialBaseline", admin, { method: "PUT", body: { value: 999 } })).status === 400, "A read-only setting cannot be changed");
  check((await call("/settings/does.not.exist", admin, { method: "PUT", body: { value: "x" } })).status === 404, "Updating an unknown setting key returns 404");

  check((await call("/settings/general.defaultPageSize", vendor1, { method: "PUT", body: { value: 10 } })).status === 403, "A non-admin cannot update settings");

  // --- Reset ---------------------------------------------------------------
  const reset = await call("/settings/general.defaultPageSize/reset", admin, { method: "POST" });
  check(reset.status === 200 && reset.data.value === "25", "A setting can be reset to its default");

  // --- Preferences (any authenticated user) --------------------------------
  const prefs = await call("/settings/preferences", vendor1);
  check(prefs.status === 200 && prefs.data.theme === "system" && prefs.data.density === "comfortable", "A user's preferences are created lazily with defaults");
  const pupd = await call("/settings/preferences", vendor1, { method: "PUT", body: { theme: "dark", density: "compact" } });
  check(pupd.status === 200 && pupd.data.theme === "dark" && pupd.data.density === "compact", "A user can update their own preferences");
  check((await call("/settings/preferences", vendor1, { method: "PUT", body: { theme: "rainbow" } })).status === 422, "An invalid preference value is rejected (422)");
  check((await call("/settings/preferences", ops)).status === 200, "A non-admin can access their own preferences");

  // --- Restore synthetic changes ------------------------------------------
  await call("/settings/inspections.preDispatchRequired/reset", admin, { method: "POST" });
  await call("/settings/preferences", vendor1, { method: "PUT", body: { theme: "system", density: "comfortable" } });

  console.log(JSON.stringify({ checks }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
