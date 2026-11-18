import ExcelJS from "exceljs";
import { Readable } from "stream";
import { createHash } from "crypto";
import { prisma } from "../../database/prisma";
import { ApiError } from "../../utils/ApiError";
import type { AuthenticatedUser } from "../../types/auth";
import { receiptSchema, type ReceiptInput } from "./inventory.validators";
import { receiveTx, inventoryService } from "./inventory.service";
import { normalizeImportRow, type ImportReferences } from './import.normalization';

async function importReferences(): Promise<ImportReferences> {
  const [makeId, modelId, typeId, categoryId, fuelTypeId, ownershipTypeId, organizations, depots, users] = await Promise.all([
    prisma.vehicleMake.findMany({where:{isActive:true}}), prisma.vehicleModel.findMany({where:{isActive:true}}),
    prisma.vehicleType.findMany({where:{isActive:true}}), prisma.vehicleCategory.findMany({where:{isActive:true}}),
    prisma.fuelType.findMany({where:{isActive:true}}), prisma.ownershipType.findMany({where:{isActive:true}}),
    prisma.organization.findMany({where:{status:'ACTIVE'}}), prisma.depot.findMany({where:{status:'ACTIVE'}}),
    prisma.user.findMany({where:{status:'ACTIVE'},select:{id:true,fullName:true}}),
  ]);
  return {makeId, modelId, typeId, categoryId, fuelTypeId, ownershipTypeId,
    organizationId:organizations, receivedFromOrgId:organizations, receivingDepotId:depots,
    DEPOT:depots, ORGANIZATION:organizations,
    VENDOR:organizations.filter(o=>o.type==='VEHICLE_VENDOR'||o.type==='TRANSPORT_PARTNER'),
    USER:users.map(u=>({id:u.id,name:u.fullName}))};
}

function prepareRow(row: Record<string, unknown>, refs: ImportReferences) {
  const normalized = normalizeImportRow(row, refs);
  const parsed = receiptSchema.safeParse(normalized.values);
  const errors = [...normalized.errors, ...(parsed.success ? [] : parsed.error.issues
    .filter(issue=>!normalized.errors.some(error=>error.startsWith(`${issue.path.join('.')}:`)))
    .map(issue=>`${issue.path.join('.')}: ${issue.message}`))];
  return {input: parsed.success ? parsed.data : undefined, errors};
}
export const IMPORT_COLUMNS = [
  "registrationNumber",
  "vin",
  "makeId",
  "modelId",
  "typeId",
  "engineNumber",
  "categoryId",
  "fuelTypeId",
  "ownershipTypeId",
  "manufacturingYear",
  "color",
  "country",
  "insuranceProvider",
  "insurancePolicyNumber",
  "insuranceExpiry",
  "registrationCertNumber",
  "registrationExpiry",
  "organizationId",
  "receivedAt",
  "receivedFromOrgId",
  "receivingDepotId",
  "custodianType",
  "custodianId",
  "initialCondition",
  "odometer",
];
export async function readWorkbook(buffer: Buffer, fileName: string) {
  // Check ZIP central-directory sizes before ExcelJS allocates decompressed workbook data.
  if (fileName.toLowerCase().endsWith(".xlsx")) {
    let end = -1;
    for (
      let i = buffer.length - 22;
      i >= Math.max(0, buffer.length - 65557);
      i--
    ) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) throw ApiError.badRequest("Invalid Excel ZIP archive");
    const entries = buffer.readUInt16LE(end + 10);
    let cursor = buffer.readUInt32LE(end + 16),
      expanded = 0;
    if (entries > 2000 || entries === 0xffff)
      throw ApiError.badRequest("Workbook has too many archive entries");
    for (let n = 0; n < entries; n++) {
      if (
        cursor + 46 > buffer.length ||
        buffer.readUInt32LE(cursor) !== 0x02014b50
      )
        throw ApiError.badRequest("Invalid workbook archive directory");
      const size = buffer.readUInt32LE(cursor + 24);
      expanded += size;
      if (size === 0xffffffff || expanded > 50 * 1024 * 1024)
        throw ApiError.badRequest(
          "Workbook expands beyond the 50 MB safety limit",
        );
      cursor +=
        46 +
        buffer.readUInt16LE(cursor + 28) +
        buffer.readUInt16LE(cursor + 30) +
        buffer.readUInt16LE(cursor + 32);
    }
  }
  const book = new ExcelJS.Workbook();
  try {
    if (fileName.toLowerCase().endsWith(".csv"))
      await book.csv.read(Readable.from(buffer), { dateFormats: [] });
    else if (fileName.toLowerCase().endsWith(".xlsx"))
      await book.xlsx.load(buffer as never);
    else throw ApiError.badRequest("Use an .xlsx or .csv file");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw ApiError.badRequest("File could not be read as Excel/CSV");
  }
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount < 2)
    throw ApiError.badRequest("File needs headers and at least one data row");
  if (sheet.rowCount > 1001 || sheet.columnCount > 80)
    throw ApiError.badRequest("Maximum 1,000 rows and 80 columns per file");
  const headers: string[] = [];
  sheet
    .getRow(1)
    .eachCell({ includeEmpty: true }, (cell) =>
      headers.push(String(cell.text ?? "").trim()),
    );
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw ApiError.badRequest("Column headers must be nonempty and unique");
  const rows: Record<string, unknown>[] = [];
  for (let row = 2; row <= sheet.rowCount; row++) {
    const out: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const cell = sheet.getRow(row).getCell(i + 1);
      if (cell.value !== null) {
        if (cell.type === ExcelJS.ValueType.Formula)
          throw ApiError.badRequest(`Formula not supported in row ${row}`);
        out[h] = cell.value instanceof Date ? cell.value.toISOString()
          : typeof cell.value === 'number' && cell.value >= 20000 && cell.value <= 100000 && book.properties.date1904 && ['receivedAt','insuranceExpiry','registrationExpiry'].includes(h)
            ? new Date(Date.UTC(1904,0,1) + Math.round(cell.value * 86400000)).toISOString()
            : cell.text;
      }
    });
    rows.push(out);
  }
  return { headers, rows };
}
export async function template() {
  const b = new ExcelJS.Workbook();
  const s = b.addWorksheet("Inventory receipts");
  s.columns = IMPORT_COLUMNS.map((key) => ({ header: key, key, width: 24 }));
  s.addRow({
    registrationNumber: "SYNTHETIC-001",
    receivedAt: new Date().toISOString(),
    custodianType: "DEPOT",
    initialCondition: "GOOD",
  });
  const help = b.addWorksheet("Instructions");
  help.addRow([
    "Reference columns ending in Id accept existing names OR IDs. Matching ignores case and extra spaces. Unknown or ambiguous names are rejected; no master records are created.",
  ]);
  help.addRow([
    "Required: registrationNumber, organizationId, receivedAt, receivedFromOrgId, receivingDepotId, custodianType, initialCondition. For VENDOR custody also enter custodianId (vendor name or ID).",
  ]);
  help.addRow([
    "Delete the example row. Preview errors before confirming import. Max 1,000 rows.",
  ]);
  help.addRow(["Dates: use Excel dates, YYYY-MM-DD, DD/MM/YYYY (day first), or ISO date/time with timezone. Date-only values mean midnight UTC. A year alone is invalid. Leave unknown optional fields blank, not 0."]);
  help.addRow(["Custody accepts DEPOT / Current depot, VENDOR / Vendor / transport partner, ORGANIZATION / Assigned organization. Blank custodianId defaults to the receiving depot or assigned organization for those custody types. Vehicle type is separate from fuel type. Upload photos/videos later using Edit."]);
  return b.xlsx.writeBuffer();
}
type PreviewRow = {
  row: number;
  status: "READY" | "FAILED" | "SKIPPED";
  errors: string[];
  input?: ReceiptInput;
};
class PreviewRollback extends Error {}
export async function validateRows(
  rows: Record<string, unknown>[],
  actor: AuthenticatedUser,
) {
  const seen = new Set<string>();
  const result: PreviewRow[] = [];
  const refs = await importReferences();
  for (let i = 0; i < rows.length; i++) {
    const prepared = prepareRow(rows[i], refs);
    if (prepared.errors.length || !prepared.input) {
      result.push({
        row: i + 2,
        status: "FAILED",
        errors: prepared.errors,
      });
      continue;
    }
    const input = prepared.input;
    const keys = [
      `registration:${input.registrationNumber.toUpperCase()}`,
      ...(input.vin ? [`vin:${input.vin.toUpperCase()}`] : []),
      ...(input.vehicleId ? [`id:${input.vehicleId}`] : []),
      ...(input.vehicleCode ? [`code:${input.vehicleCode}`] : []),
    ];
    if (keys.some((k) => seen.has(k))) {
      result.push({
        row: i + 2,
        status: "SKIPPED",
        errors: ["Duplicate identity within this file"],
        input,
      });
      continue;
    }
    keys.forEach((k) => seen.add(k));
    try {
      await prisma.$transaction(
        async (tx) => {
          await receiveTx(tx, input, actor);
          throw new PreviewRollback();
        },
        { timeout: 15000 },
      );
    } catch (e) {
      if (!(e instanceof PreviewRollback)) {
        result.push({
          row: i + 2,
          status: "FAILED",
          errors: [e instanceof Error ? e.message : "Row validation failed"],
          input,
        });
        continue;
      }
    }
    result.push({ row: i + 2, status: "READY", errors: [], input });
  }
  return result;
}
export async function commitRows(
  rows: Record<string, unknown>[],
  actor: AuthenticatedUser,
  key: string,
) {
  if (!key || key.length > 100)
    throw ApiError.badRequest(
      "Use an import Idempotency-Key of 1–100 characters",
    );
  const hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  // Bind the whole import key before per-row commits, so edited payload retries are rejected.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id + ":import:" + key}))::text`;
    const prior = await tx.inventoryOperation.findUnique({
      where: { actorId_key: { actorId: actor.id, key: "import:" + key } },
    });
    if (prior && prior.requestHash !== hash)
      throw ApiError.conflict(
        "Import key has already been used for a different file",
      );
    if (!prior)
      await tx.inventoryOperation.create({
        data: {
          actorId: actor.id,
          key: "import:" + key,
          action: "import",
          requestHash: hash,
          result: { accepted: true },
        },
      });
  });
  const seen = new Set<string>();
  const result = [];
  const refs = await importReferences();
  for (let i = 0; i < rows.length; i++) {
    const prepared = prepareRow(rows[i], refs);
    if (prepared.errors.length || !prepared.input) {
      result.push({
        row: i + 2,
        status: "FAILED",
        errors: prepared.errors,
      });
      continue;
    }
    const input = prepared.input;
    const identities = [
      `registration:${input.registrationNumber.toUpperCase()}`,
      ...(input.vin ? [`vin:${input.vin.toUpperCase()}`] : []),
      ...(input.vehicleId ? [`id:${input.vehicleId}`] : []),
      ...(input.vehicleCode ? [`code:${input.vehicleCode}`] : []),
    ];
    if (identities.some(identity=>seen.has(identity))) {
      result.push({
        row: i + 2,
        status: "SKIPPED",
        errors: ["Duplicate identity within this file (registration, VIN, vehicle ID or code)"],
      });
      continue;
    }
    identities.forEach(identity=>seen.add(identity));
    try {
      const receipt = await inventoryService.receive(
        prepared.input,
        actor,
        `${key}:row:${i}`,
      );
      result.push({
        row: i + 2,
        status: "SUCCESS",
        errors: [],
        vehicleId: receipt.vehicleId,
      });
    } catch (e) {
      result.push({
        row: i + 2,
        status: "FAILED",
        errors: [e instanceof Error ? e.message : "Import failed"],
      });
    }
  }
  return {
    rows: result,
    successful: result.filter((r) => r.status === "SUCCESS").length,
    failed: result.filter((r) => r.status === "FAILED").length,
    skipped: result.filter((r) => r.status === "SKIPPED").length,
  };
}
