import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/auth/rbac";

/**
 * Phase 11 enablement — ensures the vendor-management permissions exist and are
 * granted to the appropriate roles. Vendor users get `vendors:read` so they can
 * view their own vendor profile; administrators get `vendors:manage`. Creates no
 * vendor data. Idempotent.
 */
const db = new PrismaClient();

const ROLE_GRANTS: Record<string, string[]> = {
  "vendors:read": ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER", "VENDOR_USER"],
  "vendors:manage": ["SUPER_ADMIN", "JSAN_ADMIN"],
};

async function main() {
  for (const def of PERMISSIONS.filter((p) => p.category === "vendors")) {
    const perm = await db.permission.upsert({ where: { key: def.key }, create: def, update: def });
    const roles = await db.role.findMany({ where: { name: { in: ROLE_GRANTS[def.key] ?? [] } } });
    for (const role of roles)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
  }
  console.log("Vendor-management permissions granted to the appropriate roles. No vendor data was created.");
}

main().finally(() => db.$disconnect());
