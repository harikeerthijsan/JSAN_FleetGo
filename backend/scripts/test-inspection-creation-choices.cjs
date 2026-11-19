const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/modules/inspections/inspection-creation.lookups.ts');
const m = new Module(file, module);
m.paths = module.paths;
let reads = 0;
const db = {
  vehicle: { findMany: async args => { reads++; assert.deepEqual(args.where, { inventory: { currentCustodianType: 'VENDOR', currentCustodianId: 'vendor-a' } }); return [{ id: 'vehicle-uuid', vehicleCode: 'FG-VEH-000797', registrationNumber: 'TEST797' }]; } },
  dispatchVehicle: { findMany: async args => { assert.deepEqual(args.where.vehicleId.in, ['vehicle-uuid']); assert.deepEqual(args.where.dispatch.state.in, ['PLANNED', 'READY', 'CONFIRMED']); return [{ vehicleId: 'vehicle-uuid', dispatch: { id: 'dispatch-uuid', reference: 'DSP-1', destinationDepotId: 'depot-a' } }]; } },
};
const original = m.require.bind(m);
m.require = name => name === '../../database/prisma' ? { prisma: db } : name === '../../utils/ApiError' ? { ApiError: { forbidden: () => new Error('Forbidden') } } : original(name);
m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
const { inspectionCreationChoices, inspectionCreationVehicleScope: scope } = m.exports;
const actor = { role: { name: 'VENDOR_USER' }, organizationId: 'vendor-a', organizationType: 'VEHICLE_VENDOR', depotIds: [], permissions: ['inspections:confirm'] };
(async () => {
  const choices = await inspectionCreationChoices(actor);
  assert.deepEqual(choices.allowedTypes, ['RECEIVING']);
  assert.equal(choices.vehicles[0].id, 'vehicle-uuid');
  assert.deepEqual(choices.dispatches[0].vehicleIds, ['vehicle-uuid']);
  await assert.rejects(inspectionCreationChoices({ ...actor, permissions: ['inspections:read'] }), /Forbidden/);
  assert.equal(reads, 1, 'Read-only accounts must not query creation choices');
  assert.deepEqual(scope({ ...actor, role: { name: 'SUPER_ADMIN' } }), {});
  assert.deepEqual(scope({ ...actor, organizationType: 'JSAN', role: { name: 'OPERATIONS_MANAGER' }, depotIds: ['assigned-depot'] }), { inventory: { currentDepotId: { in: ['assigned-depot'] } } });
  assert.deepEqual(scope({ ...actor, organizationType: 'CTS', role: { name: 'CTS_USER' } }), { OR: [{ organizationId: 'vendor-a' }, { inventory: { receivedFromOrgId: 'vendor-a' } }] });
  console.log('PASS vendor receiving choices, internal vehicle IDs, matching dispatches, read-only denial, admin / operations / CTS scope. No business records created.');
})().catch(error => { console.error(error); process.exitCode = 1; });
