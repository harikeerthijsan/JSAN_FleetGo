import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/auth/rbac";
import { settingsService } from "../src/modules/settings/settings.service";

/**
 * Phase 12 enablement — ensures the settings permission exists and is granted to
 * administrators, and seeds the default system-settings catalogue (idempotent).
 * Seeding never overwrites an administrator's saved value.
 */
const db = new PrismaClient();

const ROLE_GRANTS: Record<string, string[]> = {
  "settings:manage": ["SUPER_ADMIN", "JSAN_ADMIN"],
};

async function main() {
  for (const def of PERMISSIONS.filter((p) => p.category === "settings")) {
    const perm = await db.permission.upsert({ where: { key: def.key }, create: def, update: def });
    const roles = await db.role.findMany({ where: { name: { in: ROLE_GRANTS[def.key] ?? [] } } });
    for (const role of roles)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
  }
  const { seeded } = await settingsService.seedDefaults();
  console.log(`Settings permission granted to administrators. Default settings catalogue ensured (${seeded} keys).`);
}

main().finally(() => db.$disconnect());
