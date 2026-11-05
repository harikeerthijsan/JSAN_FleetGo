# Inventory module

Phase 4 is implemented as an independent top-level module under `/api/v1/inventory` and `/inventory`.

See [Phase 4 documentation](../../../../docs/PHASE4_INVENTORY.md) for schema, permissions, endpoints, transactions, screens, tests and known limitations.

The central inventory service owns all receiving, reservation, custody/location and inventory status mutations. Fleet cannot bypass these controls for received vehicles. Movements, receipts and adjustments are append-only ledgers enforced by PostgreSQL triggers.

Future allocation/dispatch receiving contracts are defined in the service, with no Phase 5/6 workflow endpoints or screens.
