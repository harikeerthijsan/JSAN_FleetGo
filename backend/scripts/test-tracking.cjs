// Runs Phase 7 against an API started with the same synthetic fixture secret.
if (!process.env.GPS_PHASE7_TEST_SECRET)
  throw Error(
    "Set GPS_PHASE7_TEST_SECRET on the local API and this test process. Do not use production credentials.",
  );
process.env.TEST_PHASE7 = "true";
require("./test-operations.cjs");
