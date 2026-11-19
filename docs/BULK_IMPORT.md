# Vehicle bulk import

Download a fresh Excel or CSV template from Inventory Management > Bulk import.
The two templates use the same 25 columns. Photos, videos and PDF documents can
be attached afterward through the vehicle's Edit form. Accessories and Remarks
are excluded from the download templates.

## Reference values

Columns ending in `Id` accept an existing FleetGo name or its exact ID. For
example, `makeId` can contain `Honda`, `receivingDepotId` can contain `North Depot`,
and `organizationId` can contain `JSAN Logistics`. Organization labels such as
`JSAN Logistics (JSAN)` are also accepted. Matching ignores capitalization and
extra whitespace, but does not guess misspellings or create new reference records.

Models are matched within the selected make. If multiple active records have the
same name, use the exact ID to distinguish them. Vehicle type and fuel type are
separate choices: a fuel label such as Hybrid is not necessarily a vehicle type.

Custody values accept the labels shown on registration:

| Vehicle held by | custodianType | custodianId |
| --- | --- | --- |
| Current depot | DEPOT or Current depot | Depot name/ID, or blank to use receivingDepotId |
| Vendor / transport partner | VENDOR or Vendor / transport partner | Required existing vendor/transport partner name or ID |
| Assigned organization | ORGANIZATION or Assigned organization | Organization name/ID, or blank to use organizationId |

All existing organization, depot and custody access restrictions still apply.
Recognizing a name does not grant access to that record.

## Dates and optional fields

Use an Excel date, `YYYY-MM-DD`, `DD/MM/YYYY` (day first), or a full ISO date/time
with timezone. Examples: `2026-11-17`, `17/11/2026`, `2026-11-17T10:00:00+05:30`.
Date-only values are interpreted as midnight UTC. Use a timezone-bearing timestamp
when the arrival time matters. Both Excel date systems are supported for numeric
date cells. A standalone year such as `2030` is rejected: supply the actual date.

Leave unknown optional values blank, not `0`. Zero is valid for odometer.
Do not put an organization name in receivedAt; this column is the arrival date.
registrationNumber accepts short alphanumeric registrations. Optional VIN must
follow the existing 11-17 character rule, excluding I, O and Q.

## Preview and correction

1. Upload the completed file and check the column mappings.
2. Select Validate and preview.
3. Correct unknown/ambiguous names, missing vendors, dates and repeated identities.
4. Re-upload the corrected file and validate again.
5. Confirm only after reviewing the READY rows. A partial import can leave failed
   rows unimported; check results before retrying.

The maximum is 1,000 rows and 5 MB per file. Formula cells are rejected.
Existing ID-based spreadsheets remain supported.

Validation and confirmation run in batches of 20 rows, showing progress. Only
READY rows are submitted for import after complete validation. Duplicate identities
are checked across the whole file, including between batches. Each import request
has a stable batch key. If a connection fails during confirmation, keep the page
open and choose Retry import to recover results without creating duplicate vehicles.
Do not refresh or change the file during a partial import: retry keys are retained
only while this page remains open. If the page was closed, inspect saved inventory
before attempting another import. Import requests have a 60-second timeout per
batch; other app requests retain their normal timeout.

## Local verification

Run `node scripts/test-import-normalization.cjs` from backend for focused checks.
These checks use synthetic references and do not create database records.
Run `node scripts/test-import-batches.cjs` from frontend for batch and retry checks.
