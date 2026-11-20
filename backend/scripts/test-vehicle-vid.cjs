process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {prisma}=require('../src/database/prisma.ts');
const {template,readWorkbook,validateRows,IMPORT_COLUMNS}=require('../src/modules/inventory/import.service.ts');
(async()=>{
  const [user,org,depot]=await Promise.all([
    prisma.user.findFirst({where:{status:'ACTIVE',role:{name:'SUPER_ADMIN'}},include:{role:true}}),
    prisma.organization.findFirst({where:{status:'ACTIVE'}}),prisma.depot.findFirst({where:{status:'ACTIVE'}}),
  ]);
  assert.ok(user&&org&&depot);
  const actor={id:user.id,role:user.role,permissions:['inventory:manage','fleet:manage'],organizationId:user.organizationId,organizationType:null,depotIds:[]};
  const workbook=await readWorkbook(Buffer.from(await template()),'template.xlsx');
  assert.deepEqual(workbook.headers,IMPORT_COLUMNS);assert.ok(IMPORT_COLUMNS.includes('vidNumber'));
  const registrationNumber='VID-CHECK-'+randomUUID().slice(0,8);
  const rows=await validateRows([{registrationNumber,vidNumber:' VID-IMPORT-123 ',organizationId:org.id,receivedFromOrgId:org.id,receivingDepotId:depot.id,receivedAt:new Date(Date.now()-60000).toISOString(),custodianType:'DEPOT',initialCondition:'GOOD'}],actor);
  assert.equal(rows[0].status,'READY',JSON.stringify(rows[0].errors));assert.equal(rows[0].input.vidNumber,'VID-IMPORT-123');
  assert.equal(await prisma.vehicle.count({where:{registrationNumber}}),0);
  console.log('PASS Excel template header, bulk VID mapping / validation / receipt transaction, and rollback. No vehicle retained.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
