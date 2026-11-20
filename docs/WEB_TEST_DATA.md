# Temporary web test records

Created 20 November 2026. The user explicitly authorized showing these samples on the live web app.

The hardcoded fixture set is in `backend/scripts/web-test-data.cjs`. It saves 75 initial linked records, labelled `DEMO-WEB-20261120`. Existing records and permissions are not replaced. The local set has 76 tracked records, including one maintenance-generated demo alert. A fresh live import creates 75.

The Docker startup command explicitly authorizes this named dataset using `FLEETGO_WEB_TEST_DATA=DEMO-WEB-20261120` and `seed --live`. It runs after normal setup and before the server starts. The import is atomic, serialized by a transaction lock, and runs once per database. Failures roll back the import and do not prevent the application from starting.

The exact record IDs and original snapshots are stored in `web_test_datasets` in the same transaction. This survives container restarts and redeploys. Existing datasets are checked, not overwritten. A removed dataset is marked removed and will not be recreated by later startups. No public seed or removal API is added.

## View the samples

Open the live website or the local web app at http://127.0.0.1:5173 and sign in with an existing administrator account. Search for `DEMO-WEB-20261120` or registrations starting `DEMO20NOV`. For vehicle VID search, use `DEMO-VID`. Normal account scopes still apply; accounts outside the sample organization/depot scope do not gain access.

- Master Data: a sample make/model, category, type, fuel, ownership and document type; two depots; three organizations.
- Inventory: eight vehicles across available, reserved, allocated, in-transit, vendor-held, maintenance, damaged and delivered states. VID values are `DEMO-VID-001` through `DEMO-VID-008`. There is also a reservation and draft reconciliation.
- Tickets: approved delivery, submitted damage incident, draft general ticket, and a sample comment.
- Allocation / Dispatch / Trips: one linked allocation, three dispatches and trips, a sample driver and transport partner, and an exception.
- Inspections / Handover: a receiving template, draft receiving inspection, discrepancy, pending handover and clearly identified sample POD. The sample POD is not proof that a real delivery or acceptance occurred.
- Tracking: a simulated provider/device, mapping, closed historical session, fixed sample position and alerts. Choose the SIMULATED source and history if enabled. The closed session avoids generating automatic ongoing alerts. This is not live telemetry; the position does not move automatically. Existing simulation controls remain unchanged.
- Vendors: organization, profile, contact and location.
- Disks: disk inventory, planned shipment with an item, and draft reconciliation.
- Claims: a sample open incident, without fabricated attachments or an insurer submission.
- Reports / Dashboard: existing reports aggregate the sample business records. A sample saved report belongs to the local administrator who ran the script.
- User Management: one inactive sample vendor account. It cannot sign in; no existing role or access is changed.
- Settings: existing settings are retained. No fake security or operational configuration is inserted.

These are explicitly synthetic database snapshots for browsing and training. No false receipt, movement or trip-event ledgers are manufactured. Photos and documents are not faked; upload your own test files if required. Operational actions can require additional real workflow checks. Other accounts still follow their normal organization and depot scope.

## Re-run without duplicates

From `backend`:

```powershell
node scripts/web-test-data.cjs seed
```

The durable database manifest tracks exact record IDs and original snapshots. The original local file at `outputs/web-test-data/manifest.json` can be adopted for older local samples, but live imports do not depend on container files. Re-running checks the existing set and does not reset edited records.

## Remove later

First run a rollback-only cleanup rehearsal:

```powershell
node scripts/web-test-data.cjs check
```

Then, when you want the samples removed:

```powershell
node scripts/web-test-data.cjs --remove
```

Without explicit authorization, both commands refuse non-local databases and production mode. In the live service's container, use the exact named authorization for a rehearsal:

```sh
FLEETGO_WEB_TEST_DATA=DEMO-WEB-20261120 node scripts/web-test-data.cjs check --live
```

When removal is requested, replace `check` with `--remove` in that command. Cleanup only targets the tracked set. It checks for edits and performs deletion in one transaction; the check command rolls that transaction back. If a sample has changed or dependent work prevents deletion, it stops without a partial cleanup. Do not bypass ledger protections or remove unrelated records. Review later work first. Removal records a durable removed marker so startup cannot recreate the samples.

Immutable history created by using real workflow actions needs separate review; this script does not disable database protections to erase it.

Verification: `node scripts/test-web-test-data.cjs` exercises a fresh live-authorized import, all 75 rows, durable manifest creation and complete reverse-order deletion in a local transaction, then rolls everything back. The existing local manifest adoption, idempotent rerun and cleanup rehearsal are also checked.
