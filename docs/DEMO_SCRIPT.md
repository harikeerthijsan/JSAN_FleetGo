# FleetGo — Client Demo Script

Three parts: **(1) Roles**, **(2) Features — what the product does**, then
**(3) Demo flow — page by page**. Explain the features first, then walk the pages.

**Login:** `http://localhost:5173` · all accounts use password `FleetGo123`.
Drive the demo as **Super Admin**; switch to a **Vendor** at the very end.

---

# PART 1 — Roles (start here)

> "Everything in FleetGo is governed by role-based access. A user's role decides
> which menus, pages and actions they get, and the server re-checks every
> request — hiding a button is never the only protection. On top of that, each
> organization (CTS, JSAN, a vendor, a transporter) only ever sees its own data."

| Role (login) | Who they are | What they can do |
| --- | --- | --- |
| **Super Admin** — `superadmin@fleetgo.dev` | Platform owner | Everything, incl. Users, Roles, Settings |
| **JSAN Admin** — `jsanadmin@fleetgo.dev` | Operations admin | All day-to-day modules; no full system control |
| **Operations Manager** — `opsmanager@fleetgo.dev` | Depot manager | Approvals, allocation, dispatch — **scoped to their depots** |
| **CTS User** — `ctsuser@fleetgo.dev` | Google CTS requester | Raises requests (tickets), tracks their status |
| **Vendor User** — `vendor1@fleetgo.dev` | External vendor | **Only their own** vehicles/media; receiving; read-mostly |
| **Transporter / Driver** — `driver@fleetgo.dev` | Field driver | Updates trip status from the road |

---

# PART 2 — Features (what FleetGo does)

Explain these capabilities first, in plain language. No clicking yet.

### Access & security
Role-based permissions on every screen and API; organization/depot data
isolation enforced on the server; JWT sign-in with automatic session refresh.

### Dashboard & analytics
A role-aware operational overview (fleet by status, active tickets, pending
approvals, delayed trips, completed deliveries) with charts and a live monitoring
grid — every figure scoped to the user and linked to its source record.

### Fleet & master data
A complete vehicle register with an authoritative status lifecycle
(registered → available → reserved → allocated → dispatched → in-transit →
delivered/at-vendor…), documents and history, backed by clean reference data
(makes, models, types, depots, vendors).

### Inventory management
The central inventory of vehicles received from CTS — the single source of truth
for custody. Receiving with photo evidence, Excel/CSV bulk import with validation,
reservations, transfers, and periodic **reconciliation that requires an
independent reviewer**. Custody and movements are an **append-only ledger** (full
history, nothing silently edited).

### Ticketing & approvals
Requests for vehicles (delivery, transfer, return, maintenance, damage…) routed
through a **configurable, multi-step approval workflow** with per-step SLAs,
comments, attachments and a full activity log. Self-approval is blocked and
decisions are locked against collisions.

### Allocation
Approved tickets become allocations against **verified** inventory — multi-vehicle
and partial allocation, with each vehicle **locked** as it's committed so it can
never be allocated twice. The ticket auto-completes once fully delivered.

### Dispatch & trips
Hand vehicles to a transporter/driver with a pre-departure **checklist and
photographic evidence**, a guarded departure, and a trip timeline through to
delivery — with exception handling. Departure moves custody to the transporter;
stock isn't freed until receiving is verified.

### Live GPS tracking
Real-time location on a live map over WebSocket, with location history, route
replay, geofences and operational alerts (offline/stale/stop/delay/deviation).
**GPS is information, not authority — it never confirms delivery or changes
custody.** Real and simulated sources are strictly separated.

### Inspections & digital handover
Structured inspections (receipt, pre-dispatch, receiving, return) with checklists
and categorized photos, a **dispatch-vs-receiving photo comparison**, a damage/
discrepancy workflow, and a signed **digital handover with printable Proof of
Delivery**. Submitted inspections are immutable (corrections are new versions);
confirmed major damage marks a vehicle unavailable only via central Inventory.

### Disk & media logistics
The same rigor applied to the physical storage media (HDD/SSD/tape) that travels
with the fleet, independently of vehicles: registration, shipments
(plan → dispatch → track → receive), custody chain, reconciliation and
discrepancies — append-only, idempotent, and review-gated.

### Vendor management
A full vendor workspace over the organization identity: profile, contacts,
locations, assigned users, status, uploaded **documents (consent forms,
agreements, supporting files)**, and an **operational summary** of everything a
vendor holds (vehicles, media, allocations, dispatches, inspections, tickets). A
vendor holding stock can't be deactivated.

### Reporting
Operational reports read directly from the modules — Fleet, Inventory, Tickets,
Dispatch & Delivery, GPS, Inspection & Damage, Vendor Performance — plus a report
builder, saved reports and CSV/Excel/print-ready PDF exports whose totals always
match the screen.

### Administration & settings
User administration and the RBAC role/permission catalogue; a typed, audited
**system settings** registry (some values drive live behavior, e.g. organization
name, default page size, pre-dispatch requirement); and per-user **preferences**
(theme, density, default landing page).

### Under the hood (if asked)
Transactions with per-row locks and idempotency keys prevent double
allocation/dispatch; append-only ledgers and audit logs give a tamper-evident
history; delivered in additive phases with API/workflow test suites all green.

---

# PART 3 — Demo flow (page by page)

Now walk the pages in this order; for each page the numbered steps are what to
click, and the quote is the one line to say.

### 1. Login
1. Enter `superadmin@fleetgo.dev` / `FleetGo123`, sign in.
2. *"The menu you see is built from this user's permissions."*

### 2. Dashboard  (`/dashboard`)
1. Scan the summary cards.
2. Scroll to the charts.
3. Click a row in the monitoring grid to jump to the record.
4. *"Every number is scoped to your role and links back to its source."*

### 3. Vehicle registration and details  (`/inventory/vehicles`)
1. Open the vehicle list; filter by status.
2. Open one vehicle → show status lifecycle + documents.
3. *"Vehicle status is the authoritative state everything downstream respects."*

### 4. Master Data  (`/master-data`)
1. Open the tabs (makes/models/types, depots, vendors).
2. *"Clean reference data keeps the whole system consistent."*

### 5. Inventory  (`/inventory`)
1. Receive a vehicle with a photo → show it becomes AVAILABLE.
2. Open its custody & movement history.
3. Open a reconciliation → show the independent reviewer approval.
4. *"Custody is an append-only ledger; corrections need a separate approver."*

### 6. Ticketing & Approvals  (`/tickets`)
1. Create a ticket (e.g. a delivery request) and submit.
2. Open the approval inbox → approve through the chain.
3. *"Configurable workflow per ticket type; self-approval blocked; decisions locked."*

### 7. Allocation stage in Allocation Dispatch and Trips  (`/dispatch/requests`)
1. Open the approved ticket → allocate vehicles from verified inventory.
2. Show requested/allocated/pending quantities update.
3. *"Each vehicle locks as it's committed — never double-allocated."*

### 8. Dispatch and trip stage in the same workspace  (`/dispatch`)
1. Build a dispatch → assign transporter/driver.
2. Complete the checklist + photos → confirm departure.
3. Open the trip timeline → (as `driver@fleetgo.dev`) mark delivered.
4. *"Departure moves custody to the transporter; stock isn't freed until receiving."*

### 9. Live Tracking  (`/tracking`)
1. Open the map → select a vehicle → view its history.
2. Run a route replay; open geofences/alerts.
3. *"GPS is information, not authority — it never confirms delivery."*

### 10. Inspections & Handover  (`/inspections`)
1. Do a receiving inspection → compare dispatch vs receiving photos.
2. Record a discrepancy → complete the digital handover.
3. Generate the Proof of Delivery.
4. *"Submitted inspections are immutable; major damage marks unavailable via Inventory."*

### 11. Disk & Media Logistics  (`/disk-logistics`)
1. Register a disk → create a shipment → dispatch → add a tracking event.
2. Receive it into a vendor → open the disk's custody history.
3. *"Same guarantees as vehicles — append-only custody, review-gated discrepancies."*

### 12. Vendor Management  (`/vendors`)
1. Click **Register vendor** → fill name/type → attach a **Consent form** and any
   **Other documents** (agreements) → register.
2. Open the vendor → show the operational summary and the **Documents** card
   (download/add more); add a contact + location; open the Disks-in-custody tab.
3. Try to deactivate a vendor that holds stock (blocked).
4. *"A vendor is an organization — no duplicate — with its agreements/consent on
   file, and it can't be deactivated while holding stock."*

### 13. Reports  (`/reports`)
1. Open Dispatch & Delivery → apply a date filter.
2. Export CSV/PDF → save the configuration.
3. *"Exports reuse the on-screen query, so totals always match."*

### 14. Users & Roles  (`/users`, `/roles`)
1. Show Users (create/edit/status) → open Roles and a permission matrix.
2. *"This catalogue drives every menu and every API check."*

### 15. Settings  (`/settings`)
1. Change **Organization name** → Save → point at the sidebar updating live.
2. Switch **theme/density** (applies instantly); set a default landing page.
3. *"Persisted, typed and audited — and several settings drive real behavior."*

### 16. The closer — data isolation
1. In a new incognito window, sign in as `vendor1@fleetgo.dev`.
2. Show the smaller sidebar, only Vendor Alpha's data, only their custody, no
   create/register.
3. *"Same platform — the server scopes every response to who's asking."*

---

## End-to-end one-liner (to tie it together)
> "Received → requested → approved → allocated → dispatched → tracked →
> inspected & handed over with proof of delivery → media shipped and received →
> reflected in reports — every step role-scoped and fully audited."

## Quick tips
- ≤ 10 logins per 15 minutes (auth rate limit) — plan role switches.
- Prefer the light theme on a projector; dark mode is functional with minor polish gaps.
- Data is seeded/synthetic; the commercial baseline is 802 vehicles.
