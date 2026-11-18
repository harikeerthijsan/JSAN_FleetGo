// Pure import-boundary tests: no database connections or user records.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../src/modules/inventory/import.normalization.ts');
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, filename);
const {normalizeImportRow,importDate} = mod.exports;
const id = n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const refs = {
 makeId:[{id:id(1),name:'Honda'},{id:id(2),name:'Toyota'}],
 modelId:[{id:id(3),name:'Civic',makeId:id(1)},{id:id(4),name:'Civic',makeId:id(2)}],
 organizationId:[{id:id(5),name:'JSAN Logistics',type:'JSAN'},{id:id(9),name:'Other Organization',type:'CTS'}],
 receivedFromOrgId:[{id:id(5),name:'JSAN Logistics',type:'JSAN'}],
 receivingDepotId:[{id:id(6),name:'North Depot'}],
 DEPOT:[{id:id(6),name:'North Depot'}],
 ORGANIZATION:[{id:id(5),name:'JSAN Logistics',type:'JSAN'}],
 VENDOR:[{id:id(7),name:'Test Transport',type:'TRANSPORT_PARTNER'}],
};
const row = {registrationNumber:'TBC801',makeId:' hOnDa ',modelId:'Civic',organizationId:'JSAN   Logistics (JSAN)',receivedFromOrgId:'JSAN Logistics',receivingDepotId:'North Depot',custodianType:'Current depot',initialCondition:'Good',receivedAt:'17/11/2026',insuranceExpiry:'2030-01-01',odometer:0};
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name);}
check('names, display labels, whitespace and make-scoped models',()=>{const r=normalizeImportRow(row,refs);assert.deepEqual(r.errors,[]);assert.equal(r.values.makeId,id(1));assert.equal(r.values.modelId,id(3));assert.equal(r.values.organizationId,id(5));assert.equal(r.values.custodianId,id(6));assert.equal(r.values.odometer,0);assert.equal(r.values.receivedAt,'2026-11-17T00:00:00.000Z');});
check('legacy existing UUIDs',()=>assert.deepEqual(normalizeImportRow({...row,makeId:id(1),modelId:id(3)},refs).errors,[]));
check('vendor label and existing vendor name',()=>{const r=normalizeImportRow({...row,custodianType:'Vendor / transport partner',custodianId:'Test Transport'},refs);assert.deepEqual(r.errors,[]);assert.equal(r.values.custodianId,id(7));});
check('vendor missing or dummy reference rejected',()=>{assert.ok(normalizeImportRow({...row,custodianType:'VENDOR'},refs).errors.some(e=>e.includes('actual')||e.includes('existing vendor')));assert.ok(normalizeImportRow({...row,custodianType:'VENDOR',custodianId:id(99)},refs).errors.some(e=>e.includes('Unknown')));});
check('unknown name rejected',()=>assert.ok(normalizeImportRow({...row,makeId:'Hondaa'},refs).errors.some(e=>e.startsWith('makeId:'))));
check('ambiguous names rejected',()=>assert.ok(normalizeImportRow(row,{...refs,receivingDepotId:[...refs.receivingDepotId,{id:id(8),name:'North Depot'}]}).errors.some(e=>e.includes('Ambiguous'))));
check('wrong make-model combination rejected',()=>assert.ok(normalizeImportRow({...row,modelId:id(4)},refs).errors.some(e=>e.startsWith('modelId:'))));
check('organization custody defaults',()=>assert.equal(normalizeImportRow({...row,custodianType:'Assigned organization'},refs).values.custodianId,id(5)));
check('ISO, Excel serial, Excel Date and day-first dates',()=>{assert.equal(importDate(47804),new Date(Date.UTC(1899,11,30)+47804*86400000).toISOString());assert.equal(importDate('01/02/2030'),'2030-02-01T00:00:00.000Z');assert.equal(importDate(new Date('2030-01-01Z')),'2030-01-01T00:00:00.000Z');assert.equal(importDate('2030-01-01T12:00:00+05:30'),'2030-01-01T12:00:00+05:30');});
check('bad, incomplete and impossible dates rejected',()=>{for(const v of ['2030','JSAN Logistics','31/02/2030','2030-02-30','2030-01-01T12:00:00'])assert.throws(()=>importDate(v));});
check('multiple actionable errors, optional blanks and no input mutation',()=>{const original={...row,receivedAt:'JSAN Logistics',insuranceExpiry:2030,categoryId:''};const before=JSON.stringify(original);const r=normalizeImportRow(original,refs);assert.equal(r.errors.length,2);assert.equal(r.values.categoryId,undefined);assert.equal(JSON.stringify(original),before);});
console.log(`${checks} focused checks passed; no database data created.`);

async function workflowChecks() {
 const ExcelJS=require('exceljs');
 let received=[];
 const delegates={vehicleMake:'makeId',vehicleModel:'modelId',vehicleType:'typeId',vehicleCategory:'categoryId',fuelType:'fuelTypeId',ownershipType:'ownershipTypeId',organization:'organizationId',depot:'receivingDepotId',user:'users'};
 const db=Object.fromEntries(Object.entries(delegates).map(([delegate,field])=>[delegate,{findMany:async()=>refs[field]??[]}]));
 db.$transaction=async fn=>fn({$queryRaw:async()=>[],inventoryOperation:{findUnique:async()=>null,create:async()=>({})}});
 const serviceFile=path.resolve(__dirname,'../src/modules/inventory/import.service.ts');
 const schemaFile=path.resolve(__dirname,'../src/modules/inventory/inventory.validators.ts');
 function load(file,overrides={}) {
  const m=new Module(file,module);m.filename=file;m.paths=module.paths;
  const original=m.require.bind(m);m.require=name=>Object.hasOwn(overrides,name)?overrides[name]:original(name);
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);return m.exports;
 }
 const validators=load(schemaFile);
 const service=load(serviceFile,{'../../utils/ApiError':load(path.resolve(__dirname,'../src/utils/ApiError.ts')),'../../database/prisma':{prisma:db},'./import.normalization':mod.exports,'./inventory.validators':validators,'./inventory.service':{
  receiveTx:async(tx,input)=>{if(input.organizationId!==id(5))throw Error('Outside your organization scope');return {};},
  inventoryService:{receive:async(input)=>{received.push(input);return {vehicleId:id(100+received.length)};}}
 }});
 const xlsx=await service.template();
 const parsed=await service.readWorkbook(Buffer.from(xlsx),'template.xlsx');
 assert.deepEqual(parsed.headers,service.IMPORT_COLUMNS);assert.equal(parsed.rows.length,1);
 assert.ok(!parsed.headers.includes('accessories')&&!parsed.headers.includes('remarks'));
 console.log('PASS generated Excel template round-trip');
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Data');sheet.addRow(['receivedAt','registrationExpiry']);sheet.addRow([new Date('2026-11-17T00:00:00Z'),47804]);
 const dates=await service.readWorkbook(Buffer.from(await book.xlsx.writeBuffer()),'dates.xlsx');
 assert.equal(dates.rows[0].receivedAt,'2026-11-17T00:00:00.000Z');assert.equal(importDate(dates.rows[0].registrationExpiry),importDate(47804));
 const csv=await service.readWorkbook(Buffer.from('receivedAt,registrationNumber\n01/02/2026,TBC801'),'dates.csv');
 assert.equal(importDate(csv.rows[0].receivedAt),'2026-02-01T00:00:00.000Z');
 book.properties.date1904=true;sheet.getCell('A2').value=44000;
 const mac=await service.readWorkbook(Buffer.from(await book.xlsx.writeBuffer()),'mac.xlsx');
 assert.equal(mac.rows[0].receivedAt,new Date(Date.UTC(1904,0,1)+44000*86400000).toISOString());
 console.log('PASS Excel dates, general serials, 1904 workbook and day-first CSV');
 const actor={id:id(10)};
 const preview=await service.validateRows([row,{...row,registrationNumber:'TBC802',vin:'12345678910'},{...row,registrationNumber:'TBC803',vin:'12345678910'},{...row,registrationNumber:'TBC804',receivedAt:'JSAN Logistics'}],actor);
 assert.deepEqual(preview.map(r=>r.status),['READY','READY','SKIPPED','FAILED']);assert.equal(received.length,0);
 assert.ok(preview[3].errors.some(e=>e.startsWith('receivedAt:')));
 console.log('PASS validation normalizes before receipt checks and does not commit');
 const result=await service.commitRows([row,{...row,registrationNumber:'TBC802',vin:'12345678910'},{...row,registrationNumber:'TBC803',vin:'12345678910'},{...row,registrationNumber:'TBC804',receivedAt:'2030'}],actor,'test-key');
 assert.equal(result.successful,2);assert.equal(result.skipped,1);assert.equal(result.failed,1);
 assert.equal(received[0].makeId,id(1));assert.equal(received[0].custodianId,id(6));
 console.log('PASS commit uses the same normalization and duplicate identity checks');
 const scope=await service.validateRows([{...row,organizationId:'Other Organization'}],actor);assert.equal(scope[0].status,'FAILED');assert.ok(scope[0].errors.includes('Outside your organization scope'));
 console.log('All workflow checks passed with in-memory database stubs; no real data created.');
}
workflowChecks().catch(error=>{console.error(error);process.exitCode=1;});
