import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/auth/rbac";

/**
 * Claims enablement — ensures the insurance-claim permissions exist and are
 * granted to the appropriate roles. Vendor/CTS users can report and view their
 * own claims; operations/admin can process them. Creates no claim data.
 */
const db = new PrismaClient();

const ROLE_GRANTS: Record<string, string[]> = {
  "claims:read": ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER", "CTS_USER", "VENDOR_USER"],
  "claims:report": ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER", "CTS_USER", "VENDOR_USER"],
  "claims:manage": ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER"],
};

async function main() {
  for (const def of PERMISSIONS.filter((p) => p.category === "claims")) {
    const perm = await db.permission.upsert({ where: { key: def.key }, create: def, update: def });
    const roles = await db.role.findMany({ where: { name: { in: ROLE_GRANTS[def.key] ?? [] } } });
    for (const role of roles)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
  }
  console.log("Insurance-claim permissions granted to the appropriate roles. No claim data was created.");
}

main().finally(() => db.$disconnect());
