// Uses the local database, but rolls every test transaction back deliberately.
// No vehicles, inventory records, counters or history are retained.
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { prisma } = require('../src/database/prisma.ts');
const { fleetService } = require('../src/modules/fleet/fleet.service.ts');
const { createVehicleSchema, updateVehicleSchema } = require('../src/modules/fleet/fleet.validators.ts');
class Rollback extends Error {}

async function main() {
  const [user, depot, organization, vendor] = await Promise.all([
    prisma.user.findFirst({ where: { status: 'ACTIVE', role: { name: 'SUPER_ADMIN' } }, include: { role: true } }),
    prisma.depot.findFirst({ where: { status: 'ACTIVE' } }),
    prisma.organization.findFirst({ where: { status: 'ACTIVE' } }),
    prisma.organization.findFirst({ where: { status: 'ACTIVE', type: 'VEHICLE_VENDOR' } }),
  ]);
  assert.ok(user && depot && organization && vendor, 'Requires an active local admin, depot, organization and vendor');
  const actor = { id: user.id, role: user.role, permissions: ['fleet:manage', 'inventory:manage'], organizationId: user.organizationId, organizationType: null, depotIds: [depot.id] };
  const originalTransaction = prisma.$transaction.bind(prisma);
  let inspect = async () => {};
  prisma.$transaction = fn => originalTransaction(async tx => {
    const result = await fn(tx);
    await inspect(tx, result);
    throw new Rollback('Intentional verification rollback');
  });
  let checks = 0;
  const registrations = [];
  const input = () => ({ registrationNumber: 'TEST-MERGE-' + randomUUID().slice(0, 8), organizationId: organization.id, depotId: depot.id, insuranceProvider: 'Test insurer', insurancePolicyNumber: 'TEST-POLICY', receiving: { receivedAt: new Date(Date.now() - 60000).toISOString(), receivedFromOrgId: organization.id, custodianType: 'DEPOT', custodianId: depot.id, initialCondition: 'GOOD', odometer: 1234, accessories: 'Two keys' } });
  try {
    for (const scenario of [{ condition: 'GOOD', custody: 'DEPOT', status: 'AVAILABLE' }, { condition: 'GOOD', custody: 'VENDOR', status: 'AT_VENDOR' }, { condition: 'DAMAGED', custody: 'DEPOT', status: 'DAMAGED' }, { condition: 'MAINTENANCE', custody: 'DEPOT', status: 'UNDER_MAINTENANCE' }]) {
      const body = input(); registrations.push(body.registrationNumber);
      body.receiving.initialCondition = scenario.condition; body.receiving.custodianType = scenario.custody; body.receiving.custodianId = scenario.custody === 'VENDOR' ? vendor.id : depot.id;
      inspect = async (tx, vehicle) => {
        assert.equal(vehicle.status, scenario.status); checks++;
        const inv = await tx.vehicleInventory.findUnique({ where: { vehicleId: vehicle.id } });
        assert.ok(inv); assert.equal(inv.currentDepotId, depot.id); assert.equal(inv.currentCustodianId, body.receiving.custodianId); assert.equal(inv.odometer, 1234); checks += 4;
        assert.equal(await tx.vehicleReceipt.count({ where: { vehicleId: vehicle.id } }), 1); checks++;
        assert.equal(await tx.vehicleMovement.count({ where: { vehicleId: vehicle.id, type: 'RECEIPT' } }), 1); checks++;
        assert.equal(await tx.vehicleCustody.count({ where: { vehicleId: vehicle.id, toDate: null } }), 1); checks++;
        assert.equal(vehicle.insurancePolicyNumber, 'TEST-POLICY'); checks++;
      };
      await assert.rejects(fleetService.create(createVehicleSchema.parse(body), actor), Rollback);
    }
    inspect = async () => { throw Error('Invalid registration must not complete'); };
    const badSource = input(); registrations.push(badSource.registrationNumber); badSource.receiving.receivedFromOrgId = randomUUID();
    await assert.rejects(fleetService.create(createVehicleSchema.parse(badSource), actor), /missing or inactive/); checks++;
    const future = input(); registrations.push(future.registrationNumber); future.receiving.receivedAt = new Date(Date.now() + 86400000).toISOString();
    await assert.rejects(fleetService.create(createVehicleSchema.parse(future), actor), /future/); checks++;
    const outside = input(); registrations.push(outside.registrationNumber);
    await assert.rejects(fleetService.create(createVehicleSchema.parse(outside), { ...actor, role: { ...actor.role, name: 'OPERATIONS_MANAGER' }, depotIds: [] }), /outside your assigned depots/); checks++;
    await assert.rejects(fleetService.create(createVehicleSchema.parse(input()), { ...actor, permissions: ['fleet:manage'] }), /inventory management permission/); checks++;
    const missing = input(); delete missing.receiving;
    assert.equal(createVehicleSchema.safeParse(missing).success, false); checks++;
    assert.equal(updateVehicleSchema.safeParse({ remarks: 'Existing vehicle update' }).success, true); checks++;
    assert.equal(await prisma.vehicle.count({ where: { registrationNumber: { in: registrations } } }), 0); checks++;
    console.log(`PASS ${checks} assertions: registration + inventory + receipt/custody/movement history, condition-derived statuses, validation, permissions, depot scope and transaction rollback. No test records retained.`);
  } finally { prisma.$transaction = originalTransaction; await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
