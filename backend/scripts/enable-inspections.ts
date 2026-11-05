import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../src/modules/auth/rbac";

/**
 * Phase 8 enablement — grants inspection permissions to the appropriate system
 * roles and seeds clearly-labelled DEFAULT inspection templates. It creates no
 * vehicle, dispatch or inspection data. Safe to re-run (idempotent upserts).
 */
const db = new PrismaClient();

const ROLE_GRANTS: Record<string, string[]> = {
  "inspections:read": [
    "SUPER_ADMIN",
    "JSAN_ADMIN",
    "OPERATIONS_MANAGER",
    "CTS_USER",
    "VENDOR_USER",
  ],
  "inspections:manage": ["SUPER_ADMIN", "JSAN_ADMIN", "OPERATIONS_MANAGER"],
  "inspections:review": ["SUPER_ADMIN", "JSAN_ADMIN"],
  "inspections:confirm": [
    "SUPER_ADMIN",
    "JSAN_ADMIN",
    "CTS_USER",
    "VENDOR_USER",
    "TRANSPORTER_DRIVER",
  ],
};

const CONDITION_ITEMS = (prefix: string) => [
  { label: "Front view", category: "EXTERIOR", photoRequired: true, requiredPhotoCategory: "FRONT" as const },
  { label: "Rear view", category: "EXTERIOR", photoRequired: true, requiredPhotoCategory: "REAR" as const },
  { label: "Left side", category: "EXTERIOR", photoRequired: true, requiredPhotoCategory: "LEFT" as const },
  { label: "Right side", category: "EXTERIOR", photoRequired: true, requiredPhotoCategory: "RIGHT" as const },
  { label: "Interior", category: "INTERIOR", photoRequired: true, requiredPhotoCategory: "INTERIOR" as const },
  { label: "Dashboard & odometer", category: "INTERIOR", photoRequired: true, requiredPhotoCategory: "DASHBOARD" as const },
  { label: "Tyres & wheels", category: "TYRES", photoRequired: false },
  { label: "Glass & mirrors", category: "GLASS", photoRequired: false },
  { label: "Lights & indicators", category: "LIGHTS", photoRequired: false },
  { label: "Accessories & equipment", category: "ACCESSORIES", photoRequired: false },
  { label: "Keys & documents", category: "KEYS_DOCUMENTS", photoRequired: false },
  { label: `${prefix} remarks`, category: "REMARKS", inputType: "TEXT" as const, required: false, photoRequired: false },
];

const TEMPLATES = [
  { type: "INITIAL_RECEIPT" as const, name: "CTS initial receipt (default)", items: CONDITION_ITEMS("General") },
  { type: "PRE_DISPATCH" as const, name: "Pre-dispatch inspection (default)", items: CONDITION_ITEMS("Inspection") },
  { type: "RECEIVING" as const, name: "Receiving inspection (default)", items: CONDITION_ITEMS("Receiving") },
  { type: "RETURN" as const, name: "Return inspection (default)", items: CONDITION_ITEMS("Return") },
];

async function main() {
  for (const def of PERMISSIONS.filter((p) => p.category === "inspections")) {
    const perm = await db.permission.upsert({
      where: { key: def.key },
      create: def,
      update: def,
    });
    const roles = await db.role.findMany({
      where: { name: { in: ROLE_GRANTS[def.key] ?? [] } },
    });
    for (const role of roles)
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
  }

  for (const t of TEMPLATES) {
    const existing = await db.inspectionTemplate.findFirst({
      where: { type: t.type, name: t.name },
    });
    if (existing) continue;
    await db.inspectionTemplate.create({
      data: {
        type: t.type,
        name: t.name,
        isActive: true,
        isDefault: true,
        items: {
          create: t.items.map((it, i) => ({
            label: it.label,
            category: it.category,
            inputType: it.inputType ?? "CONDITION",
            required: it.required ?? true,
            photoRequired: it.photoRequired ?? false,
            requiredPhotoCategory: it.requiredPhotoCategory ?? null,
            sortOrder: i,
          })),
        },
      },
    });
  }

  console.log(
    "Inspection permissions granted and default INITIAL_RECEIPT / PRE_DISPATCH / RECEIVING / RETURN templates seeded. No vehicle, dispatch or inspection records were created.",
  );
}

main().finally(() => db.$disconnect());
