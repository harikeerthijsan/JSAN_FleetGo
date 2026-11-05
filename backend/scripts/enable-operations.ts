import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/auth/rbac";
const db = new PrismaClient();
async function main() {
  for (const p of PERMISSIONS.filter((p) =>
    [
      "allocation:manage",
      "dispatch:read",
      "dispatch:manage",
      "trips:update",
    ].includes(p.key),
  )) {
    const perm = await db.permission.upsert({
      where: { key: p.key },
      create: p,
      update: p,
    });
    const names =
      p.key === "trips:update"
        ? ["TRANSPORTER_DRIVER"]
        : p.key === "dispatch:read"
          ? [
              "SUPER_ADMIN",
              "JSAN_ADMIN",
              "OPERATIONS_MANAGER",
              "CTS_USER",
              "VENDOR_USER",
              "TRANSPORTER_DRIVER",
            ]
          : ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER"];
    for (const role of await db.role.findMany({
      where: { name: { in: names } },
    }))
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
  }
  console.log(
    "Phase 6 grants added without resetting existing roles or users.",
  );
}
main().finally(() => db.$disconnect());
