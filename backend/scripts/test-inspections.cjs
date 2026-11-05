// Runs Phase 8 Inspection & Digital Handover checks by extending the Phase 6
// operations fixture. All records are synthetic and clearly prefixed. Requires
// a local API started against a development database with seeded users.
process.env.TEST_PHASE8 = "true";
require("./test-operations.cjs");
