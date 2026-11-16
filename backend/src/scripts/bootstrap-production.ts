import { PrismaClient, TicketType, TicketPriority } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  resolveRolePermissions,
} from '../modules/auth/rbac';
import { SETTING_DEFS } from '../modules/settings/settings.service';
import { prisma as sharedPrisma } from '../database/prisma';

const db = new PrismaClient();
const types: {
  type: TicketType;
  label: string;
  requiresInventory?: boolean;
  requiresVehicle?: boolean;
}[] = [
  {
    type: 'NEW_VEHICLE',
    label: 'New Vehicle Request',
    requiresInventory: true,
  },
  {
    type: 'DELIVERY',
    label: 'Vehicle Delivery Request',
    requiresInventory: true,
  },
  { type: 'PICKUP', label: 'Vehicle Pickup Request', requiresVehicle: true },
  {
    type: 'TRANSFER',
    label: 'Vehicle Transfer Request',
    requiresVehicle: true,
  },
  { type: 'RETURN', label: 'Vehicle Return Request', requiresVehicle: true },
  { type: 'MAINTENANCE', label: 'Maintenance Request', requiresVehicle: true },
  {
    type: 'DAMAGE_INCIDENT',
    label: 'Damage / Incident Report',
    requiresVehicle: true,
  },
  {
    type: 'REPLACEMENT',
    label: 'Vehicle Replacement Request',
    requiresVehicle: true,
  },
  { type: 'GENERAL', label: 'General Fleet Request' },
];

async function main() {
  await db.$transaction(
    async (tx) => {
      // Serializes repeated deployment bootstrap jobs. Never resets passwords or creates demo records.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7143016)`;
      const known = new Set(
        (await tx.permission.findMany({ select: { key: true } })).map(
          (p) => p.key,
        ),
      );
      const permissions = new Map<string, string>();
      for (const p of PERMISSIONS) {
        const row = await tx.permission.upsert({
          where: { key: p.key },
          create: p,
          update: p,
        });
        permissions.set(p.key, row.id);
      }
      for (const roleDef of SYSTEM_ROLES) {
        const old = await tx.role.findUnique({ where: { name: roleDef.name } });
        const role = await tx.role.upsert({
          where: { name: roleDef.name },
          create: {
            name: roleDef.name,
            displayName: roleDef.displayName,
            description: roleDef.description,
            isSystem: true,
          },
          update: {},
        });
        for (const key of resolveRolePermissions(roleDef))
          if (!old || roleDef.name === 'SUPER_ADMIN' || !known.has(key))
            await tx.rolePermission.upsert({
              where: {
                roleId_permissionId: {
                  roleId: role.id,
                  permissionId: permissions.get(key)!,
                },
              },
              create: { roleId: role.id, permissionId: permissions.get(key)! },
              update: {},
            });
      }
      const existing = await tx.user.findFirst({
        where: { status: 'ACTIVE', role: { name: 'SUPER_ADMIN' } },
      });
      if (!existing) {
        const input = z
          .object({
            email: z.string().trim().toLowerCase().email(),
            name: z.string().trim().min(2).max(150),
            password: z
              .string()
              .min(14)
              .max(72)
              .regex(/[a-z]/)
              .regex(/[A-Z]/)
              .regex(/[0-9]/)
              .refine(
                (p) => p !== 'FleetGo123' && Buffer.byteLength(p, 'utf8') <= 72,
              ),
          })
          .safeParse({
            email: process.env.BOOTSTRAP_ADMIN_EMAIL,
            name: process.env.BOOTSTRAP_ADMIN_NAME || 'FleetGo Administrator',
            password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
          });
        if (!input.success)
          throw Error(
            'No active Super Admin exists. Supply BOOTSTRAP_ADMIN_EMAIL and a unique BOOTSTRAP_ADMIN_PASSWORD (14-72 characters, upper/lowercase and number).',
          );
        if (await tx.user.findUnique({ where: { email: input.data.email } }))
          throw Error(
            'Bootstrap email already belongs to an account. Recover the existing administrator explicitly; bootstrap does not reset accounts.',
          );
        const role = await tx.role.findUniqueOrThrow({
          where: { name: 'SUPER_ADMIN' },
        });
        await tx.user.create({
          data: {
            fullName: input.data.name,
            email: input.data.email,
            passwordHash: await bcrypt.hash(input.data.password, 12),
            roleId: role.id,
            status: 'ACTIVE',
          },
        });
      }
      // An upgraded development database must not expose known demo credentials.
      const demoAccounts = await tx.user.findMany({
        where: { status: 'ACTIVE', email: { endsWith: '@fleetgo.dev' } },
        select: { passwordHash: true },
      });
      for (const account of demoAccounts)
        if (await bcrypt.compare('FleetGo123', account.passwordHash))
          throw Error(
            'Active development accounts still use the known demo password. Rotate their passwords or deactivate them before production deployment.',
          );
      for (const def of SETTING_DEFS)
        await tx.systemSetting.upsert({
          where: { key: def.key },
          create: {
            ...def,
            value: def.defaultValue,
            isEditable: def.isEditable ?? true,
          },
          update: {},
        });
      await tx.trackingPolicy.upsert({
        where: { id: 'default' },
        create: { id: 'default' },
        update: {},
      });
      for (const t of types) {
        await tx.ticketTypeConfig.upsert({
          where: { type: t.type },
          create: t,
          update: {},
        });
        for (const [priority, hours] of Object.entries({
          LOW: [72, 240],
          MEDIUM: [48, 120],
          HIGH: [24, 72],
          CRITICAL: [8, 24],
        }))
          await tx.ticketSLA.upsert({
            where: {
              ticketType_priority: {
                ticketType: t.type,
                priority: priority as TicketPriority,
              },
            },
            create: {
              ticketType: t.type,
              priority: priority as TicketPriority,
              firstApprovalHours: hours[0],
              resolutionHours: hours[1],
            },
            update: {},
          });
      }
      if (
        !(await tx.approvalWorkflow.findFirst({
          where: { ticketType: null, isDefault: true },
        }))
      )
        await tx.approvalWorkflow.create({
          data: {
            name: 'Standard Two-Step Approval',
            isDefault: true,
            steps: {
              create: [
                {
                  order: 1,
                  name: 'Operations Review',
                  approverRoleName: 'OPERATIONS_MANAGER',
                  slaHours: 24,
                },
                {
                  order: 2,
                  name: 'JSAN Admin Approval',
                  approverRoleName: 'JSAN_ADMIN',
                  slaHours: 48,
                },
              ],
            },
          },
        });
      if (
        !(await tx.approvalWorkflow.findFirst({
          where: { ticketType: 'MAINTENANCE' },
        }))
      )
        await tx.approvalWorkflow.create({
          data: {
            name: 'Maintenance Fast-Track',
            ticketType: 'MAINTENANCE',
            steps: {
              create: [
                {
                  order: 1,
                  name: 'Operations Review',
                  approverRoleName: 'OPERATIONS_MANAGER',
                  slaHours: 12,
                },
              ],
            },
          },
        });
    },
    { timeout: 60000, maxWait: 15000 },
  );
  console.log(
    'Production roles, missing defaults and administrator verified. Existing data and passwords retained; no demo data created.',
  );
}
main()
  .catch((e) => {
    console.error(
      e instanceof Error ? e.message : 'Production bootstrap failed',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
    await sharedPrisma.$disconnect();
  });
