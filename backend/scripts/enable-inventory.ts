import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/auth/rbac";
const db = new PrismaClient();
async function main() {
  for (const def of PERMISSIONS.filter((p) => p.category === "inventory")) {
    const permission = await db.permission.upsert({
      where: { key: def.key },
      create: def,
      update: def,
    });
    const roleNames =
      def.key === "inventory:review"
        ? ["SUPER_ADMIN", "JSAN_ADMIN"]
        : def.key === "inventory:read"
          ? [
              "SUPER_ADMIN",
              "JSAN_ADMIN",
              "OPERATIONS_MANAGER",
              "CTS_USER",
              "VENDOR_USER",
            ]
          : ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER"];
    for (const role of await db.role.findMany({
      where: { name: { in: roleNames } },
    })) {
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
  console.log(
    "Inventory permissions enabled without resetting existing roles or users.",
  );
}
main().finally(() => db.$disconnect());
