import type { ImportRow } from '@/types/inventory';

export const IMPORT_BATCH_SIZE = 20;
type Row = Record<string, unknown>;
export type ImportPlanRow = { input: Row; fileRow: number };
type Send = (rows: Row[], key?: string) => Promise<ImportRow[]>;

/** Keep each request small; preserve file row numbers and duplicate checks across batches. */
export async function validateImportBatches(rows: Row[], send: Send, progress: (done: number, results: ImportRow[]) => void) {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  rows.forEach((row, index) => {
    const identities = ['registrationNumber','vin','vehicleId','vehicleCode']
      .filter(field => String(row[field] ?? '').trim())
      .map(field => `${field}:${String(row[field]).trim().toUpperCase()}`);
    if (identities.some(identity => seen.has(identity))) duplicates.add(index);
    identities.forEach(identity => seen.add(identity));
  });
  const results: ImportRow[] = [];
  for (let start = 0; start < rows.length; start += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(start, start + IMPORT_BATCH_SIZE);
    const response = await send(batch);
    if (response.length !== batch.length) throw new Error('Incomplete validation response. Validate again before importing.');
    results.push(...response.map((result, i) => duplicates.has(start + i)
      ? {row:start+i+2,status:'SKIPPED',errors:['Duplicate registration, VIN, vehicle ID or code within this file.'],input:batch[i]}
      : {...result,row:start+i+2,input:result.input ?? batch[i]}));
    progress(results.length, [...results]);
  }
  return results;
}

/** Stable batch keys make retrying a partial import safe within the same plan. */
export async function commitImportBatches(plan: ImportPlanRow[], importKey: string, send: Send, progress: (done: number, results: ImportRow[]) => void) {
  const results: ImportRow[] = [];
  for (let start = 0; start < plan.length; start += IMPORT_BATCH_SIZE) {
    const batch = plan.slice(start, start + IMPORT_BATCH_SIZE);
    const response = await send(batch.map(row => row.input), `${importKey}:batch:${start}`);
    if (response.length !== batch.length) throw new Error('Incomplete import response. Retry this import to recover its results.');
    results.push(...response.map((result, i) => ({...result,row:batch[i].fileRow,input:batch[i].input})));
    progress(results.length, [...results]);
  }
  return results;
}
