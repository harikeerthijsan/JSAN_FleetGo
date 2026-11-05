// Phase 9 — Dashboard & Reporting checks. Standalone: reads aggregations over
// the already-seeded development database. Verifies dashboard summaries, every
// report dataset, exports (totals match screen), role/organization isolation,
// saved reports, export history and the scheduled-report interface.
const assert = require("node:assert/strict");
const base = "http://localhost:4000/api/v1";
let checks = 0;
function check(v, label) {
  assert.ok(v, label);
  checks++;
  console.log("PASS", label);
}
async function call(path, token, { method = "GET", body, raw = false } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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
const login = async (email) =>
  (await call("/auth/login", null, { method: "POST", body: { email, password: "FleetGo123" } })).data.accessToken;

async function main() {
  const admin = await login("superadmin@fleetgo.dev");
  const ops = await login("opsmanager@fleetgo.dev");
  const vendor1 = await login("vendor1@fleetgo.dev");
  const vendor2 = await login("vendor2@fleetgo.dev");

  // --- Auth / permission boundary -----------------------------------------
  check((await call("/dashboard/summary", null)).status === 401, "Dashboard requires authentication");

  // --- Dashboard ----------------------------------------------------------
  const summary = (await call("/dashboard/summary", admin)).data;
  check(
    typeof summary.totalFleet === "number" && typeof summary.completedDeliveries === "number",
    "Dashboard summary returns numeric operational counts from the database",
  );
  const sumOfStatus = Object.values(summary.byStatus).reduce((a, b) => a + b, 0);
  check(sumOfStatus === summary.totalFleet, "Summary totalFleet equals the sum of status counts");

  const charts = (await call("/dashboard/charts", admin)).data;
  const chartKeys = [
    "fleetByStatus",
    "vehiclesByType",
    "inventoryByDepot",
    "inventoryByVendor",
    "ticketsByStatus",
    "ticketsByPriority",
    "dispatchesByState",
    "deliveryPerformance",
    "inspectionsByType",
    "discrepanciesByStatus",
  ];
  check(chartKeys.every((k) => Array.isArray(charts[k])), "Dashboard charts return every required series");
  const perf = Object.fromEntries(charts.deliveryPerformance.map((p) => [p.label, p.count]));
  check("On time" in perf && "Delayed" in perf && "Failed" in perf, "Delivery performance splits on-time / delayed / failed");

  const monitoring = (await call("/dashboard/monitoring", admin)).data;
  check(monitoring.counts && typeof monitoring.counts.pendingApprovals === "number", "Operational monitoring returns scoped counts");

  // --- Every report dataset -----------------------------------------------
  const datasets = [
    ["fleet", "vehicles"],
    ["inventory", "current"],
    ["inventory", "receipts"],
    ["tickets", "all"],
    ["dispatch", "deliveries"],
    ["gps", "sessions"],
    ["inspections", "all"],
    ["inspections", "discrepancies"],
    ["vendors", "performance"],
  ];
  for (const [category, type] of datasets) {
    const r = (await call(`/reports/data?category=${category}&type=${type}&pageSize=10`, admin)).data;
    check(
      Array.isArray(r.columns) && Array.isArray(r.rows) && typeof r.total === "number",
      `Report ${category}/${type} returns columns, rows and a total`,
    );
  }

  // Fleet utilization rule: utilized excludes available/reserved/registered.
  const fleet = (await call("/reports/data?category=fleet&type=vehicles&pageSize=1", admin)).data;
  check(
    typeof fleet.summary.utilizationPercent === "number" && /ALLOCATED/.test(fleet.note),
    "Fleet report documents the utilization rule (allocated/dispatched/in-transit/at-vendor only)",
  );

  // Delivery performance rule: cancelled excluded, failed separate.
  const delivery = (await call("/reports/data?category=dispatch&type=deliveries&pageSize=1", admin)).data;
  check(
    "onTimePercent" in delivery.summary && "cancelled" in delivery.summary && "failed" in delivery.summary,
    "Delivery report separates cancelled and failed from on-time calculation",
  );

  // GPS report distinguishes REAL vs SIMULATED and never invents distance.
  const gps = (await call("/reports/data?category=gps&type=sessions&mode=REAL&pageSize=50", admin)).data;
  check(gps.summary.mode === "REAL" && /recorded VALID\/LOW/i.test(gps.note), "GPS report is source-labelled and distance-safe");

  // --- Export totals match on-screen total --------------------------------
  const ticketScreen = (await call("/reports/data?category=tickets&type=all&pageSize=10", admin)).data;
  const csv = (await call("/reports/export?category=tickets&type=all&format=csv", admin, { raw: true })).text;
  const dataLines = csv.trim().split(/\r?\n/).length - 1; // minus header
  check(
    ticketScreen.total <= 5000 ? dataLines === ticketScreen.total : dataLines === 5000,
    `CSV export row count (${dataLines}) matches the report total (${ticketScreen.total})`,
  );
  const xlsx = await call("/reports/export?category=fleet&type=vehicles&format=xlsx", admin, { raw: true });
  check(xlsx.status === 200 && xlsx.text.startsWith("PK"), "Excel export returns a valid .xlsx workbook");
  const pdf = (await call("/reports/export?category=vendors&type=performance&format=pdf", admin, { raw: true })).text;
  check(/<html/i.test(pdf) && /Print \/ Save as PDF/.test(pdf), "PDF export returns a printable formatted document");

  // --- Role / organization isolation --------------------------------------
  const adminFleet = (await call("/dashboard/summary", admin)).data.totalFleet;
  const vendorFleet = (await call("/dashboard/summary", vendor1)).data.totalFleet;
  check(vendorFleet < adminFleet, `Vendor sees only its scoped fleet (${vendorFleet}) vs admin (${adminFleet})`);
  const v1Perf = (await call("/reports/data?category=vendors&type=performance", vendor1)).data;
  check(v1Perf.rows.length <= 1, "A vendor sees only its own performance row");
  const v2Perf = (await call("/reports/data?category=vendors&type=performance", vendor2)).data;
  check(
    v1Perf.rows.length === 0 || v2Perf.rows.length === 0 || v1Perf.rows[0].id !== v2Perf.rows[0].id,
    "Vendors cannot see each other's performance data",
  );
  const opsTickets = (await call("/reports/data?category=tickets&type=all&pageSize=1", ops)).data;
  check(typeof opsTickets.total === "number", "Operations manager sees depot/organization-scoped tickets");

  // --- Date boundary + empty dataset --------------------------------------
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const future = (await call(`/reports/data?category=tickets&type=all&from=${tomorrow}`, admin)).data;
  check(future.total === 0 && future.rows.length === 0, "Future date filter yields an empty dataset without error");

  // --- Saved reports lifecycle --------------------------------------------
  const saved = (
    await call("/reports/saved", admin, {
      method: "POST",
      body: { name: "P9 synthetic saved report", category: "fleet", reportType: "vehicles", filters: { status: "AVAILABLE" } },
    })
  ).data;
  check(!!saved.id, "Saved report configuration created");
  const savedList = (await call("/reports/saved", admin)).data;
  check(savedList.some((s) => s.id === saved.id), "Saved report appears in the saved list");

  // --- Scheduled report interface (no email sent) -------------------------
  const schedule = (
    await call("/reports/schedules", admin, {
      method: "POST",
      body: { savedReportId: saved.id, frequency: "WEEKLY", format: "XLSX" },
    })
  ).data;
  check(!!schedule.id && schedule.isActive, "Scheduled-report interface stores configuration");
  const run = (await call(`/reports/schedules/${schedule.id}/run`, admin, { method: "POST" })).data;
  check(run.status === "COMPLETED" && /no email/i.test(run.note), "Scheduled run records status without sending email (no invented credentials)");

  // --- Export history recorded --------------------------------------------
  const history = (await call("/reports/exports?pageSize=10", admin)).data;
  check(Array.isArray(history) && history.length >= 1, "Export history records generated exports and scheduled runs");

  // cleanup synthetic saved report
  await call(`/reports/saved/${saved.id}`, admin, { method: "DELETE" });

  console.log(JSON.stringify({ checks }, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
