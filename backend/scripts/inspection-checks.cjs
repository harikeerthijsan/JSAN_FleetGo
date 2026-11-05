// Phase 8 — Inspection & Digital Handover integration checks.
// Invoked from test-operations.cjs when TEST_PHASE8=true, reusing the fully
// built Phase 6 fixture (confirmed dispatch, vehicles, depot, vendors). All
// data is synthetic and clearly prefixed. These checks never present image
// differences as damage and never damage a vehicle the Phase 6 flow reuses.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3YQAAAAASUVORK5CYII=",
  "base64",
);

function form(category, label) {
  const f = new FormData();
  f.append("file", new Blob([PNG], { type: "image/png" }), `${category}.png`);
  f.append("category", category);
  if (label) f.append("label", label);
  return f;
}

/**
 * Pre-dispatch gate: an incomplete pre-dispatch inspection must block dispatch
 * confirmation; completing it unblocks. Runs on a PLANNED/READY dispatch before
 * the fixture's own confirm.
 */
async function gate({ call, check, ops, dispatchId, vehicleId }) {
  const insp = (
    await call(
      "/inspections",
      ops,
      { type: "PRE_DISPATCH", vehicleId, dispatchId },
      201,
    )
  ).data;
  check(insp.status === "IN_PROGRESS", "Pre-dispatch inspection starts IN_PROGRESS");
  await call(`/dispatch/${dispatchId}/confirm`, ops, {}, 409);
  check(true, "Dispatch confirmation is blocked while pre-dispatch inspection is incomplete");
  await call(`/inspections/${insp.id}/submit`, ops, {}, 200);
  check(true, "Submitting the pre-dispatch inspection clears the dispatch gate");
}

async function workflow(ctx) {
  const {
    call,
    check,
    admin,
    ops,
    cts,
    vendor1,
    vendor2,
    dispatch,
    vehicleId,
    spareVehicleId,
    prefix,
  } = ctx;
  const vendor1Org = (await call("/auth/me", vendor1)).data.user.organizationId;

  // 1. Initial CTS receipt inspection (baseline condition evidence).
  const initial = (
    await call(
      "/inspections",
      admin,
      {
        type: "INITIAL_RECEIPT",
        vehicleId,
        exteriorCondition: "Synthetic baseline — good",
        odometer: 100,
        fuelLevel: 80,
      },
      201,
    )
  ).data;
  await call(`/inspections/${initial.id}/photos`, admin, form("FRONT", "baseline front"), 201);
  await call(`/inspections/${initial.id}/photos`, admin, form("REAR"), 201);
  await call(`/inspections/${initial.id}/submit`, admin, {}, 200);
  check(
    (await call(`/inspections/${initial.id}`, admin)).data.status === "SUBMITTED",
    "Initial CTS receipt inspection submitted with baseline photos",
  );
  // Immutability: a submitted inspection cannot be silently modified.
  await call(`/inspections/${initial.id}`, admin, { odometer: 5 }, 409, "PUT");
  check(true, "Submitted inspection is immutable (edit rejected)");

  // 2. Pre-dispatch inspection reusing existing dispatch evidence.
  const dispatchDetail = (await call(`/dispatch/${dispatch.id}`, admin)).data;
  const reusable = (dispatchDetail.evidence || []).find(
    (e) => e.vehicleId === vehicleId && (e.contentType || "").startsWith("image/"),
  );
  const pre = (
    await call(
      "/inspections",
      admin,
      { type: "PRE_DISPATCH", vehicleId, dispatchId: dispatch.id, odometer: 1200, fuelLevel: 75 },
      201,
    )
  ).data;
  if (reusable) {
    const reused = (
      await call(
        `/inspections/${pre.id}/photos/reuse`,
        admin,
        { dispatchEvidenceId: reusable.id, category: "FRONT" },
        201,
      )
    ).data;
    check(reused.reused === true, "Pre-dispatch inspection reuses existing dispatch evidence (no re-upload)");
  } else {
    await call(`/inspections/${pre.id}/photos`, admin, form("FRONT"), 201);
    check(true, "Pre-dispatch inspection photo captured");
  }
  await call(`/inspections/${pre.id}/photos`, admin, form("REAR"), 201);
  await call(`/inspections/${pre.id}/submit`, admin, {}, 200);

  // 3. Receiving inspection with discrepancy (vendor-owned).
  const receiving = (
    await call(
      "/inspections",
      admin,
      {
        type: "RECEIVING",
        vehicleId,
        dispatchId: dispatch.id,
        organizationId: vendor1Org,
        odometer: 1240,
        fuelLevel: 60,
        receivingOutcome: "WITH_DISCREPANCIES",
        newDamage: "Synthetic scratch observed on receipt",
      },
      201,
    )
  ).data;
  await call(`/inspections/${receiving.id}/photos`, admin, form("FRONT"), 201);
  await call(`/inspections/${receiving.id}/photos`, admin, form("REAR"), 201);
  // Must record a discrepancy before submitting a discrepant receiving inspection.
  await call(`/inspections/${receiving.id}/submit`, admin, {}, 400);
  check(true, "Discrepant receiving inspection cannot be submitted without a discrepancy");
  const disc = (
    await call(
      "/discrepancies",
      admin,
      {
        vehicleId,
        dispatchId: dispatch.id,
        inspectionId: receiving.id,
        category: "NEW_SCRATCH",
        description: "Synthetic new scratch, left door",
        severity: "MINOR",
      },
      201,
    )
  ).data;
  check(!!disc.reference, "Receiving discrepancy recorded (not silently ignored)");
  await call(`/inspections/${receiving.id}/submit`, admin, {}, 200);
  check(true, "Receiving inspection submitted once a discrepancy exists");

  // 4. Dispatch-vs-receiving photo comparison baseline.
  const cmp = (
    await call(`/inspections/comparison/${vehicleId}?dispatchId=${dispatch.id}`, admin)
  ).data;
  check(
    cmp.stages.INITIAL_RECEIPT.length >= 1 &&
      cmp.stages.PRE_DISPATCH.length >= 1 &&
      cmp.stages.RECEIVING.length >= 1,
    "Comparison returns initial, pre-dispatch and receiving photos side by side",
  );
  check(
    /not automatically treated as damage/i.test(cmp.note),
    "Comparison explicitly does not auto-classify image differences as damage",
  );

  // 5. Discrepancy resolution workflow (auditable, status-controlled).
  await call(`/discrepancies/${disc.id}/transition`, admin, { status: "CLOSED", remarks: "x" }, 409);
  check(true, "Illegal discrepancy transition (REPORTED→CLOSED) is rejected");
  await call(`/discrepancies/${disc.id}/transition`, admin, { status: "UNDER_REVIEW", remarks: "Reviewing" }, 200);
  await call(`/discrepancies/${disc.id}/transition`, admin, { status: "CONFIRMED", remarks: "Confirmed minor scratch" }, 200);
  await call(`/discrepancies/${disc.id}/transition`, admin, { status: "RESOLVED", remarks: "Noted; accepted" }, 200);
  await call(`/discrepancies/${disc.id}/transition`, admin, { status: "CLOSED", remarks: "Closed" }, 200);
  const resolved = (await call(`/discrepancies/${disc.id}`, admin)).data;
  check(resolved.status === "CLOSED" && resolved.comments.length >= 4, "Discrepancy resolved with full audit trail of comments");

  // 6. Serious confirmed damage marks the vehicle unavailable via Inventory (spare vehicle).
  const serious = (
    await call(
      "/discrepancies",
      admin,
      {
        vehicleId: spareVehicleId,
        category: "MECHANICAL_ISSUE",
        description: "Synthetic major mechanical fault",
        severity: "MAJOR",
      },
      201,
    )
  ).data;
  await call(`/discrepancies/${serious.id}/transition`, admin, { status: "CONFIRMED", remarks: "Confirmed major fault" }, 200);
  check(
    (await call(`/inventory/vehicles/${spareVehicleId}`, admin)).data.vehicle.status === "DAMAGED",
    "Confirmed MAJOR damage marks the vehicle DAMAGED through the Inventory service",
  );

  // 7. Digital handover + acknowledgements.
  const handover = (
    await call(
      "/handover",
      admin,
      {
        type: "RECEIVING",
        vehicleId,
        dispatchId: dispatch.id,
        inspectionId: receiving.id,
        organizationId: vendor1Org,
        handoverByName: "Synthetic Transporter",
        receivedByName: "Synthetic Vendor Receiver",
        checklist: { keys: true, documents: true },
      },
      201,
    )
  ).data;
  await call(`/handover/${handover.id}/confirm`, admin, {}, 400);
  check(true, "Handover cannot be confirmed before any acknowledgement");
  await call(
    `/handover/${handover.id}/acknowledge`,
    admin,
    { party: "HANDOVER", name: "Synthetic Transporter", acknowledged: true },
    201,
  );
  await call(
    `/handover/${handover.id}/acknowledge`,
    admin,
    { party: "RECEIVER", name: "Synthetic Vendor Receiver", acknowledged: true },
    201,
  );
  await call(`/handover/${handover.id}/confirm`, admin, {}, 200);
  check(
    (await call(`/handover/${handover.id}`, admin)).data.status === "CONFIRMED",
    "Digital handover confirmed with handover + receiver acknowledgements",
  );

  // 8. Proof of Delivery generation + printable document + idempotent regenerate.
  const pod = (
    await call("/handover/pod", admin, { dispatchId: dispatch.id, vehicleId }, 201)
  ).data;
  check(!!pod.reference, "Proof of Delivery generated");
  const podDoc = await call(`/handover/pod/${pod.id}/document`, admin, undefined, 200);
  check(true, "POD printable document is retrievable");
  const pod2 = (
    await call("/handover/pod", admin, { dispatchId: dispatch.id, vehicleId }, 201)
  ).data;
  check(pod2.reference === pod.reference, "POD generation is idempotent per (dispatch, vehicle)");

  // 9. Data isolation — vendor2 cannot see vendor1's receiving inspection or discrepancy.
  check(
    (await call(`/inspections/${receiving.id}`, vendor1)).status === 200,
    "Owning vendor can view its receiving inspection",
  );
  await call(`/inspections/${receiving.id}`, vendor2, undefined, 404);
  check(true, "A different vendor cannot view another vendor's inspection evidence");
  await call(`/discrepancies/${disc.id}`, vendor2, undefined, 404);
  check(true, "A different vendor cannot view another vendor's discrepancy");

  // 10. Permission + validation guards.
  await call(
    "/inspections",
    cts,
    { type: "PRE_DISPATCH", vehicleId },
    403,
  );
  check(true, "Users without inspections:manage cannot create a pre-dispatch inspection");
  await call(
    "/inspections",
    admin,
    { type: "RECEIVING", vehicleId },
    400,
  );
  check(true, "A receiving inspection without a linked dispatch is rejected");
  await call(
    "/inspections",
    admin,
    { type: "INITIAL_RECEIPT", vehicleId, odometer: -5 },
    422,
  );
  check(true, "Invalid inspection input is rejected (422)");
  await call(`/inspections/${initial.id}/submit`, admin, {}, 409);
  check(true, "Duplicate submission of an already-submitted inspection is rejected");

  // 11. Immutable amendment (new version retains original photos).
  const amended = (await call(`/inspections/${initial.id}/amend`, admin, {}, 201)).data;
  check(
    amended.version === 2 && amended.supersedesId === initial.id,
    "Correction creates a new inspection version superseding the original",
  );
  check(
    (await call(`/inspections/${initial.id}`, admin)).data.photos.length >= 2,
    "Original inspection photographs are retained after amendment",
  );

  // 12. Templates + dashboard.
  check(
    (await call("/inspections/templates", admin)).data.length >= 4,
    "Default inspection templates are available",
  );
  const dash = (await call("/inspections/dashboard", admin)).data;
  check(
    !!dash.byType && !!dash.byStatus,
    "Inspection dashboard summarizes inspections by type and status",
  );
  check(!!prefix, "Phase 8 checks ran against the synthetic Phase 6 fixture");

  return { receivingInspectionId: receiving.id, discrepancyId: disc.id, podId: pod.id };
}

module.exports = { gate, workflow };
