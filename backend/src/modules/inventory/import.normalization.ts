/** Resolve human-readable spreadsheet values before the normal receipt validation.
 * No fuzzy matching or master-data creation: ambiguous names require an ID.
 */
export type ImportReference = { id: string; name: string; type?: string; makeId?: string; variant?: string | null };
export type ImportReferences = Record<string, ImportReference[]>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const referenceFields = ['makeId', 'modelId', 'typeId', 'categoryId', 'fuelTypeId', 'ownershipTypeId', 'organizationId', 'receivedFromOrgId', 'receivingDepotId', 'custodianId'];

export function importDate(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const text = String(value).trim();
  // Plain Excel serials are common when a date cell has General formatting.
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20000 && serial <= 100000)
      return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000)).toISOString();
  }
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (iso || local) {
    [year, month, day] = iso ? [+iso[1], +iso[2], +iso[3]] : [+local![3], +local![2], +local![1]];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.toISOString();
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(text) && /(?:Z|[+-]\d{2}:\d{2})$/i.test(text) && Number.isFinite(Date.parse(text))) {
    return text;
  }
  throw new Error('Enter a full date: YYYY-MM-DD, DD/MM/YYYY, an Excel date, or an ISO date/time with timezone. A year alone is not a date.');
}

export function normalizeImportRow(row: Record<string, unknown>, refs: ImportReferences) {
  const values: Record<string, unknown> = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '').map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
  const errors: string[] = [];
  const custody: Record<string, string> = { 'current depot': 'DEPOT', depot: 'DEPOT', 'vendor / transport partner': 'VENDOR', vendor: 'VENDOR', 'transport partner': 'VENDOR', 'assigned organization': 'ORGANIZATION', organization: 'ORGANIZATION', user: 'USER' };
  if (values.custodianType) values.custodianType = custody[key(values.custodianType)] ?? values.custodianType;
  const condition: Record<string, string> = {good:'GOOD',damaged:'DAMAGED',maintenance:'MAINTENANCE','requires maintenance':'MAINTENANCE'};
  if (values.initialCondition) values.initialCondition = condition[key(values.initialCondition)] ?? values.initialCondition;
  for (const field of ['receivedAt', 'insuranceExpiry', 'registrationExpiry']) {
    if (values[field] !== undefined) {
      try { values[field] = importDate(values[field]); }
      catch (e) { errors.push(`${field}: ${(e as Error).message}`); }
    }
  }
  for (const field of referenceFields) {
    const value = values[field];
    if (value === undefined) continue;
    let candidates = refs[field] ?? [];
    if (field === 'modelId' && values.makeId) candidates = candidates.filter(r => r.makeId === values.makeId);
    if (field === 'custodianId') candidates = refs[String(values.custodianType)] ?? [];
    const matches = candidates.filter(r => uuid.test(String(value)) ? key(r.id) === key(value) : [r.name, r.type ? `${r.name} (${r.type})` : '', r.variant ? `${r.name} (${r.variant})` : ''].some(n => n && key(n) === key(value)));
    if (matches.length === 1) values[field] = matches[0].id;
    else errors.push(`${field}: ${matches.length ? 'Ambiguous name' : 'Unknown or inactive reference'} "${value}". ${matches.length ? 'Use the exact existing ID to distinguish records.' : 'Use an existing name or ID from FleetGo; check the selected make or custodian type where applicable.'}`);
  }
  if (!values.custodianId && values.custodianType === 'DEPOT') values.custodianId = values.receivingDepotId;
  if (!values.custodianId && values.custodianType === 'ORGANIZATION') values.custodianId = values.organizationId;
  if (!values.custodianId && values.custodianType === 'VENDOR') errors.push('custodianId: Enter the existing vendor or transport partner name (or ID).');
  return { values, errors };
}
