/**
 * FleetGo database seed (development).
 *
 * Idempotent: safe to run repeatedly. Seeds the permission catalog, the
 * built-in system roles with their permission sets, synthetic organizations
 * and depots, and one synthetic test user per role.
 *
 * All accounts use SYNTHETIC data only — no real CTS user information.
 * Run with:  npm run db:seed
 */
import { OrganizationType, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  resolveRolePermissions,
} from '../src/modules/auth/rbac';

const prisma = new PrismaClient();

// Shared development password for every synthetic account.
const DEV_PASSWORD = 'FleetGo123';

async function seedPermissions() {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { category: perm.category, description: perm.description },
      create: perm,
    });
  }
  console.log(`✔ Permissions seeded (${PERMISSIONS.length})`);
}

async function seedRoles() {
  for (const roleDef of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {
        displayName: roleDef.displayName,
        description: roleDef.description,
        isSystem: true,
      },
      create: {
        name: roleDef.name,
        displayName: roleDef.displayName,
        description: roleDef.description,
        isSystem: true,
      },
    });

    const keys = resolveRolePermissions(roleDef);
    const permissions = await prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });

    // Reset and reassign permissions to match the catalog definition.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  console.log(`✔ System roles seeded (${SYSTEM_ROLES.length})`);
}

async function upsertOrganization(
  name: string,
  type: OrganizationType,
  contactEmail: string,
) {
  return prisma.organization.upsert({
    where: { name_type: { name, type } },
    update: {},
    create: { name, type, contactEmail, status: 'ACTIVE' },
  });
}

async function upsertDepot(name: string, code: string, region: string) {
  return prisma.depot.upsert({
    where: { code },
    update: { name, region },
    create: { name, code, region, status: 'ACTIVE' },
  });
}

async function seedUsersAndOrgs() {
  const cts = await upsertOrganization('Google CTS', OrganizationType.CTS, 'ops@cts.example');
  const jsan = await upsertOrganization('JSAN Logistics', OrganizationType.JSAN, 'ops@jsan.example');
  const vendorA = await upsertOrganization('Vendor Alpha Motors', OrganizationType.VEHICLE_VENDOR, 'contact@vendoralpha.example');
  const vendorB = await upsertOrganization('Vendor Beta Fleet', OrganizationType.VEHICLE_VENDOR, 'contact@vendorbeta.example');
  const transport = await upsertOrganization('Swift Transport Partners', OrganizationType.TRANSPORT_PARTNER, 'dispatch@swift.example');
  console.log('✔ Organizations seeded (5)');

  const depotNorth = await upsertDepot('North Depot', 'DEP-N', 'North');
  const depotSouth = await upsertDepot('South Depot', 'DEP-S', 'South');
  console.log('✔ Depots seeded (2)');

  const roles = await prisma.role.findMany();
  const roleByName = Object.fromEntries(roles.map((r) => [r.name, r.id]));
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  const testUsers = [
    { fullName: 'Sara Superadmin', email: 'superadmin@fleetgo.dev', roleName: 'SUPER_ADMIN', orgId: jsan.id, depotIds: [] as string[] },
    { fullName: 'Jay JSAN Admin', email: 'jsanadmin@fleetgo.dev', roleName: 'JSAN_ADMIN', orgId: jsan.id, depotIds: [depotNorth.id, depotSouth.id] },
    { fullName: 'Omar Operations', email: 'opsmanager@fleetgo.dev', roleName: 'OPERATIONS_MANAGER', orgId: jsan.id, depotIds: [depotNorth.id] },
    { fullName: 'Cathy CTS', email: 'ctsuser@fleetgo.dev', roleName: 'CTS_USER', orgId: cts.id, depotIds: [] },
    { fullName: 'Victor Vendor (Alpha)', email: 'vendor1@fleetgo.dev', roleName: 'VENDOR_USER', orgId: vendorA.id, depotIds: [depotNorth.id] },
    { fullName: 'Bianca Vendor (Beta)', email: 'vendor2@fleetgo.dev', roleName: 'VENDOR_USER', orgId: vendorB.id, depotIds: [depotSouth.id] },
    { fullName: 'Dan Driver', email: 'driver@fleetgo.dev', roleName: 'TRANSPORTER_DRIVER', orgId: transport.id, depotIds: [] },
  ];

  for (const u of testUsers) {
    const roleId = roleByName[u.roleName];
    if (!roleId) throw new Error(`Role ${u.roleName} not found — seed roles first`);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        fullName: u.fullName,
        roleId,
        organizationId: u.orgId,
        status: 'ACTIVE',
      },
      create: {
        fullName: u.fullName,
        email: u.email,
        passwordHash,
        roleId,
        organizationId: u.orgId,
        status: 'ACTIVE',
      },
    });

    // Reset depot assignments to match the seed definition.
    await prisma.userDepot.deleteMany({ where: { userId: user.id } });
    if (u.depotIds.length) {
      await prisma.userDepot.createMany({
        data: u.depotIds.map((depotId) => ({ userId: user.id, depotId })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`✔ Test users seeded (${testUsers.length}) — password: ${DEV_PASSWORD}`);
}

// --- Phase 3: master data + synthetic vehicles ------------------------------
async function seedMasterData() {
  const upsertNamed = (delegate: {
    upsert: (args: unknown) => Promise<unknown>;
  }) => async (name: string, extra: Record<string, unknown> = {}) => {
    await delegate.upsert({
      where: { name },
      update: extra,
      create: { name, ...extra },
    });
  };

  const makes = ['Toyota', 'Ford', 'Tata', 'Mahindra', 'Ashok Leyland'];
  for (const name of makes) await upsertNamed(prisma.vehicleMake)(name);

  const categories = ['Passenger', 'Commercial', 'Heavy'];
  for (const name of categories) await upsertNamed(prisma.vehicleCategory)(name);

  const types = ['Sedan', 'SUV', 'Van', 'Truck', 'Pickup'];
  for (const name of types) await upsertNamed(prisma.vehicleType)(name);

  const fuels = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG'];
  for (const name of fuels) await upsertNamed(prisma.fuelType)(name);

  const ownerships = ['Owned', 'Leased', 'Vendor-Supplied'];
  for (const name of ownerships) await upsertNamed(prisma.ownershipType)(name);

  const docTypes: Array<[string, string]> = [
    ['Registration Certificate', 'registration'],
    ['Insurance Policy', 'insurance'],
    ['Vehicle Photo', 'photo'],
    ['Other Document', 'other'],
  ];
  for (const [name, category] of docTypes) {
    await prisma.documentType.upsert({
      where: { name },
      update: { category },
      create: { name, category },
    });
  }

  // Link a couple of types to categories for demonstration.
  const passenger = await prisma.vehicleCategory.findUnique({ where: { name: 'Passenger' } });
  const commercial = await prisma.vehicleCategory.findUnique({ where: { name: 'Commercial' } });
  if (passenger) {
    await prisma.vehicleType.updateMany({ where: { name: { in: ['Sedan', 'SUV'] } }, data: { categoryId: passenger.id } });
  }
  if (commercial) {
    await prisma.vehicleType.updateMany({ where: { name: { in: ['Van', 'Truck', 'Pickup'] } }, data: { categoryId: commercial.id } });
  }

  console.log('✔ Master data seeded (makes, models*, categories, types, fuels, ownerships, document types)');
}

async function seedVehicles() {
  // Only seed sample vehicles if none exist yet.
  const existing = await prisma.vehicle.count();
  if (existing > 0) {
    console.log(`✔ Vehicles already present (${existing}); skipping sample seed`);
    return;
  }

  const [makes, types, fuels, ownerships, depots, jsan, vendorA, vendorB] =
    await Promise.all([
      prisma.vehicleMake.findMany(),
      prisma.vehicleType.findMany(),
      prisma.fuelType.findMany(),
      prisma.ownershipType.findMany(),
      prisma.depot.findMany(),
      prisma.organization.findFirst({ where: { type: 'JSAN' } }),
      prisma.organization.findFirst({ where: { name: 'Vendor Alpha Motors' } }),
      prisma.organization.findFirst({ where: { name: 'Vendor Beta Fleet' } }),
    ]);

  const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];
  const statuses = [
    'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'REGISTERED', 'RECEIVED',
    'ALLOCATED', 'ALLOCATED', 'UNDER_MAINTENANCE', 'DAMAGED', 'RESERVED',
    'AVAILABLE', 'INACTIVE',
  ] as const;

  let counter = 0;
  for (let i = 0; i < statuses.length; i++) {
    counter = (await prisma.counter.upsert({
      where: { name: 'vehicle' },
      update: { value: { increment: 1 } },
      create: { name: 'vehicle', value: 1 },
    })).value;
    const vendor = i % 3 === 0 ? vendorA : i % 3 === 1 ? vendorB : null;
    const status = statuses[i];
    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleCode: `FG-VEH-${String(counter).padStart(6, '0')}`,
        registrationNumber: `KA01${String.fromCharCode(65 + (i % 26))}${1000 + i}`,
        vin: `FGVIN${String(100000 + i)}`,
        makeId: pick(makes, i).id,
        typeId: pick(types, i).id,
        fuelTypeId: pick(fuels, i).id,
        ownershipTypeId: pick(ownerships, i).id,
        manufacturingYear: 2019 + (i % 6),
        color: pick(['White', 'Silver', 'Black', 'Blue'], i),
        organizationId: jsan?.id ?? null,
        vendorId: vendor?.id ?? null,
        depotId: depots.length ? pick(depots, i).id : null,
        status: status as never,
        isActive: status !== 'INACTIVE',
      },
    });
    await prisma.vehicleStatusHistory.create({
      data: { vehicleId: vehicle.id, fromStatus: null, toStatus: status as never, reason: 'Seed data' },
    });
  }
  console.log(`✔ Sample vehicles seeded (${statuses.length})`);
}

// --- Phase 5: ticket type configs, approval workflows and SLA rules --------
async function seedTicketing() {
  const types: Array<{
    type: string;
    label: string;
    requiresInventory?: boolean;
    requiresVehicle?: boolean;
  }> = [
    { type: 'NEW_VEHICLE', label: 'New Vehicle Request', requiresInventory: true },
    { type: 'DELIVERY', label: 'Vehicle Delivery Request', requiresInventory: true },
    { type: 'PICKUP', label: 'Vehicle Pickup Request', requiresVehicle: true },
    { type: 'TRANSFER', label: 'Vehicle Transfer Request', requiresVehicle: true },
    { type: 'RETURN', label: 'Vehicle Return Request', requiresVehicle: true },
    { type: 'MAINTENANCE', label: 'Maintenance Request', requiresVehicle: true },
    { type: 'DAMAGE_INCIDENT', label: 'Damage / Incident Report', requiresVehicle: true },
    { type: 'REPLACEMENT', label: 'Vehicle Replacement Request', requiresVehicle: true },
    { type: 'GENERAL', label: 'General Fleet Request' },
  ];
  for (const t of types) {
    await prisma.ticketTypeConfig.upsert({
      where: { type: t.type as never },
      update: { label: t.label, requiresInventory: !!t.requiresInventory, requiresVehicle: !!t.requiresVehicle },
      create: {
        type: t.type as never,
        label: t.label,
        requiresInventory: !!t.requiresInventory,
        requiresVehicle: !!t.requiresVehicle,
      },
    });
  }
  console.log(`✔ Ticket type configs seeded (${types.length})`);

  // Default two-step workflow (Operations Manager → JSAN Admin) applied to all
  // ticket types unless a more specific workflow is configured.
  const existingDefault = await prisma.approvalWorkflow.findFirst({
    where: { isDefault: true, ticketType: null },
  });
  if (!existingDefault) {
    await prisma.approvalWorkflow.create({
      data: {
        name: 'Standard Two-Step Approval',
        description: 'Operations Manager then JSAN Admin.',
        ticketType: null,
        allowSelfApproval: false,
        isActive: true,
        isDefault: true,
        steps: {
          create: [
            { order: 1, name: 'Operations Review', approverRoleName: 'OPERATIONS_MANAGER', slaHours: 24 },
            { order: 2, name: 'JSAN Admin Approval', approverRoleName: 'JSAN_ADMIN', slaHours: 48 },
          ],
        },
      },
    });
  }
  // Single-step workflow for maintenance/damage (Operations Manager only).
  const existingMaint = await prisma.approvalWorkflow.findFirst({
    where: { ticketType: 'MAINTENANCE' },
  });
  if (!existingMaint) {
    await prisma.approvalWorkflow.create({
      data: {
        name: 'Maintenance Fast-Track',
        description: 'Single Operations Manager approval for maintenance.',
        ticketType: 'MAINTENANCE',
        allowSelfApproval: false,
        isActive: true,
        isDefault: false,
        steps: {
          create: [
            { order: 1, name: 'Operations Review', approverRoleName: 'OPERATIONS_MANAGER', slaHours: 12 },
          ],
        },
      },
    });
  }
  console.log('✔ Approval workflows seeded');

  // SLA rules per type + priority (hours to first approval / resolution).
  const slaHours: Record<string, [number, number]> = {
    LOW: [72, 240],
    MEDIUM: [48, 120],
    HIGH: [24, 72],
    CRITICAL: [8, 24],
  };
  const allTypes = types.map((t) => t.type);
  let slaCount = 0;
  for (const type of allTypes) {
    for (const [priority, [first, resolution]] of Object.entries(slaHours)) {
      await prisma.ticketSLA.upsert({
        where: { ticketType_priority: { ticketType: type as never, priority: priority as never } },
        update: { firstApprovalHours: first, resolutionHours: resolution, isActive: true },
        create: {
          ticketType: type as never,
          priority: priority as never,
          firstApprovalHours: first,
          resolutionHours: resolution,
          isActive: true,
        },
      });
      slaCount++;
    }
  }
  console.log(`✔ Ticket SLA rules seeded (${slaCount})`);
}

async function main() {
  console.log('Seeding FleetGo database…');
  await seedPermissions();
  await seedRoles();
  await seedUsersAndOrgs();
  await seedMasterData();
  await seedVehicles();
  await seedTicketing();
  console.log('\nSeed complete. Development login accounts (password: FleetGo123):');
  console.log('  superadmin@fleetgo.dev   (Super Admin)');
  console.log('  jsanadmin@fleetgo.dev    (JSAN Admin)');
  console.log('  opsmanager@fleetgo.dev   (Operations Manager)');
  console.log('  ctsuser@fleetgo.dev      (CTS User)');
  console.log('  vendor1@fleetgo.dev      (Vendor User — Vendor Alpha)');
  console.log('  vendor2@fleetgo.dev      (Vendor User — Vendor Beta)');
  console.log('  driver@fleetgo.dev       (Transporter / Driver)');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
