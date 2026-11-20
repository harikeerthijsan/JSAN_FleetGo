# Vehicle VID number

VID number is a separate optional field in vehicle registration and editing. It is not the VIN/chassis number or the generated FleetGo vehicle code. It accepts up to 80 characters and preserves letters, numbers and punctuation. No uniqueness rule is imposed because no business uniqueness requirement was supplied.

The field is persisted as nullable `Vehicle.vidNumber`, displayed in vehicle details, and searchable through fleet and inventory searches. Clearing it in Edit saves null. Existing vehicles remain valid with a blank VID.

Both downloaded bulk import templates and the column mapping include `vidNumber`. Older import files can omit this optional column. Photos and videos are still added through vehicle editing.

Database migration: `20261120150000_vehicle_vid_number` (additive nullable column). Applied locally only.

Verification:

- Backend and frontend TypeScript checks.
- Frontend production build.
- `node --require tsx/cjs scripts/test-registration-inventory.cjs`: 56 assertions, including create, update, clear and length validation; transactions rolled back.
- `node --require tsx/cjs scripts/test-vehicle-vid.cjs`: template header and bulk receipt preview checks; transactions rolled back.
- Local authenticated fleet/inventory VID searches and template column check.

Temporary saved web sample data and its cleanup instructions are described in `WEB_TEST_DATA.md`.
