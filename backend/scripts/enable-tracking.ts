import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/auth/rbac";
const db = new PrismaClient();
async function main() {
  for (const p of PERMISSIONS.filter((p) => p.category === "tracking")) {
    const perm = await db.permission.upsert({
      where: { key: p.key },
      create: p,
      update: p,
    });
    const roles = await db.role.findMany({
      where: {
        name: {
          in:
            p.key === "tracking:manage"
              ? ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER"]
              : [
                  "SUPER_ADMIN",
                  "JSAN_ADMIN",
                  "OPERATIONS_MANAGER",
                  "CTS_USER",
                  "VENDOR_USER",
                  "TRANSPORTER_DRIVER",
                ],
        },
      },
    });
    for (const role of roles)
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
  }
  await db.trackingPolicy.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  await db.gPSProviderConfiguration.upsert({
    where: { slug: "development-simulation" },
    create: {
      slug: "development-simulation",
      name: "Development simulation - NOT REAL GPS",
      mode: "SIMULATED",
      adapter: "SIMULATION",
    },
    update: {},
  });
  console.log(
    "Tracking permissions and labelled development simulation metadata enabled; no location data or credentials invented.",
  );
}
main().finally(() => db.$disconnect());
