// Run with: node --require tsx/cjs scripts/test-claims-required.cjs
// Real multipart middleware and service, with database/storage replaced in memory.
const assert = require('node:assert/strict');
const express = require('express');
const { createSchema, updateSchema } = require('../src/modules/claims/claims.validators.ts');
const { claimsService } = require('../src/modules/claims/claims.service.ts');
const { prisma } = require('../src/database/prisma.ts');
const { storage } = require('../src/utils/storage/index.ts');
const { uploadClaimMedia } = require('../src/middlewares/upload.ts');
const { validate } = require('../src/middlewares/validate.ts');

const fields = { vehicleId: '11111111-1111-4111-8111-111111111111', incidentType: 'ACCIDENT', damageLevel: 'MEDIUM', category: 'Collision', city: 'Test city', location: 'Test depot', incidentDate: '2026-11-10', description: 'Synthetic incident for validation' };
let commits = 0, writes = 0, failSave = false, failTransaction = false;
const removed = [];
prisma.vehicle.findUnique = async () => ({ id: fields.vehicleId, vendorId: 'vendor' });
storage.save = async () => { writes++; if (failSave && writes === 2) throw Error('Storage unavailable'); return { key: 'test-file-' + writes }; };
storage.remove = async key => { removed.push(key); };
prisma.$transaction = async fn => {
  const result = await fn({ counter: { upsert: async () => ({ value: 1 }) }, insuranceClaim: { create: async ({ data }) => ({ id: 'test-claim', ...data }) }, claimEvent: { create: async () => ({}) } });
  if (failTransaction) throw Error('Transaction failed');
  commits++; return result;
};
const app = express();
app.use(express.json());
app.post('/claims', uploadClaimMedia(), validate({ body: createSchema }), (req, res, next) => {
  claimsService.create(req.body, { id: 'vendor-user', organizationId: 'vendor' }, Array.isArray(req.files) ? req.files : []).then(data => res.status(201).json(data)).catch(next);
});
app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));

async function main() {
  let checks = 0;
  for (const key of Object.keys(fields)) {
    const missing = { ...fields }; delete missing[key];
    assert.equal(createSchema.safeParse(missing).success, false, key + ' must be present'); checks++;
    assert.equal(createSchema.safeParse({ ...fields, [key]: '   ' }).success, false, key + ' must not be blank'); checks++;
  }
  assert.equal(createSchema.parse({ ...fields, policeComplaint: 'false' }).policeComplaint, false); checks++;
  assert.equal(createSchema.parse(fields).policeComplaint, false); checks++;
  assert.equal(Object.hasOwn(updateSchema.parse({ city: 'Updated city' }), 'thirdParties'), false); checks++;
  assert.deepEqual(updateSchema.parse({ thirdParties: [] }).thirdParties, []); checks++;
  const party = { type: 'TWO_WHEELER', name: 'Example Rider', phone: '9876543210', registrationNumber: 'TEST-123', damageDescription: 'Front wheel damaged', address: 'Example address', insurerName: 'Example insurer', policyNumber: 'POL-TEST' };
  assert.deepEqual(createSchema.parse(fields).thirdParties, []); checks++;
  assert.equal(createSchema.safeParse({ ...fields, incidentType: 'THIRD_PARTY' }).success, false); checks++;
  for (const key of ['type', 'name', 'phone', 'registrationNumber', 'damageDescription']) {
    const invalid = { ...party }; delete invalid[key];
    assert.equal(createSchema.safeParse({ ...fields, thirdParties: [invalid] }).success, false, 'third party ' + key); checks++;
  }
  assert.equal(createSchema.safeParse({ ...fields, thirdParties: 'not json' }).success, false); checks++;
  assert.equal(createSchema.safeParse({ ...fields, thirdParties: Array(11).fill(party) }).success, false); checks++;
  assert.equal(createSchema.safeParse({ ...fields, thirdParties: [{ ...party, type: 'PEDESTRIAN', registrationNumber: '' }] }).success, true); checks++;
  assert.equal(createSchema.safeParse({ ...fields, thirdParties: [party, { ...party, name: 'Second person' }] }).success, true); checks++;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function submit(overrides = {}, media = ['image/png', 'video/mp4']) {
    const fd = new FormData();
    for (const [key, value] of Object.entries({ ...fields, ...overrides })) if (value !== undefined) fd.append(key, value);
    for (const type of media) fd.append('files', new Blob(['synthetic evidence'], { type }), type.startsWith('image') ? 'test.png' : 'test.mp4');
    return fetch(base + '/claims', { method: 'POST', body: fd });
  }
  try {
    for (const media of [[], ['image/png'], ['video/mp4']]) { assert.equal((await submit({}, media)).status, 400); checks++; }
    assert.equal(commits, 0); assert.equal(writes, 0); checks += 2;
    assert.equal((await submit({ city: '' })).status, 422); checks++;
    assert.equal((await submit({}, ['application/pdf', 'video/mp4'])).status, 415); checks++;
    const valid = await submit({ policeComplaint: 'false' }); assert.equal(valid.status, 201);
    const record = await valid.json(); assert.equal(record.policeComplaint, false); assert.equal(record.attachments.create.length, 2); assert.equal(commits, 1); checks += 4;
    writes = 0; removed.length = 0; failSave = true;
    assert.equal((await submit()).status, 500); assert.equal(commits, 1); assert.deepEqual(removed, ['test-file-1']); checks += 3;
    failSave = false; failTransaction = true; writes = 0; removed.length = 0;
    assert.equal((await submit()).status, 500); assert.equal(commits, 1); assert.deepEqual(removed.sort(), ['test-file-1', 'test-file-2']); checks += 3;
    failTransaction = false;
    const thirdPartyResponse = await submit({ incidentType: 'THIRD_PARTY', thirdParties: JSON.stringify([party]) });
    assert.equal(thirdPartyResponse.status, 201); const thirdPartyClaim = await thirdPartyResponse.json();
    assert.deepEqual(thirdPartyClaim.thirdParties, [party]); checks += 2;
    const previousWrites = writes;
    assert.equal((await submit({ thirdParties: JSON.stringify([{ ...party, registrationNumber: '' }]) })).status, 422);
    assert.equal(writes, previousWrites); checks += 2;
    const evidenceOverrides = { thirdParties: JSON.stringify([party, { ...party, name: 'Second party' }]), thirdPartyFileCounts: JSON.stringify([1, 1]) };
    const optionalEvidence = await submit(evidenceOverrides, ['image/png', 'video/mp4', 'image/png', 'video/mp4']);
    assert.equal(optionalEvidence.status, 201);
    const linked = (await optionalEvidence.json()).attachments.create;
    assert.deepEqual(linked.map(file => file.caption), [null, null, 'Third party 1 evidence', 'Third party 2 evidence']); checks += 2;
    const writesBeforeInvalid = writes;
    assert.equal((await submit({ ...evidenceOverrides, thirdPartyFileCounts: '[2]' })).status, 400);
    assert.equal((await submit({ ...evidenceOverrides, thirdPartyFileCounts: '[1,1]' })).status, 400);
    assert.equal((await submit({ thirdPartyFileCounts: '[1]' })).status, 400);
    assert.equal(writes, writesBeforeInvalid); checks += 4;
    assert.equal((await submit({ thirdParties: JSON.stringify([party]), thirdPartyFileCounts: '[0]' })).status, 201); checks++;
    console.log(`PASS ${checks} required-field, third-party persistence/validation and optional evidence linking, multipart, optional-police and failure-cleanup assertions; no live database or storage writes.`);
  } finally { await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
