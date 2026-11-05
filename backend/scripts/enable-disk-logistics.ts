import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/auth/rbac";

/**
 * Phase 10 enablement — grants disk-logistics permissions to the appropriate
 * system roles. It creates no disk, shipment or reconciliation data. Safe to
 * re-run (idempotent upserts).
 */
const db = new PrismaClient();

const ROLE_GRANTS: Record<string, string[]> = {
  "disk:read": ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER", "CTS_USER", "VENDOR_USER"],
  "disk:manage": ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER"],
  "disk:review": ["SUPER_ADMIN", "JSAN_ADMIN"],
};

async function main() {
  for (const def of PERMISSIONS.filter((p) => p.category === "disk-logistics")) {
    const perm = await db.permission.upsert({ where: { key: def.key }, create: def, update: def });
    const roles = await db.role.findMany({ where: { name: { in: ROLE_GRANTS[def.key] ?? [] } } });
    for (const role of roles)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
  }
  console.log("Disk logistics permissions granted to the appropriate roles. No disk or shipment data was created.");
}

main().finally(() => db.$disconnect());
