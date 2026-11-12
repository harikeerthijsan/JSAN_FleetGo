const assert=require('node:assert/strict');
const {processSchema}=require('../src/modules/claims/claims.validators.ts');
const {claimsService}=require('../src/modules/claims/claims.service.ts');
const {prisma}=require('../src/database/prisma.ts');
(async()=>{try{
assert.equal(processSchema.parse({currency:' usd '}).currency,'USD');
for(const currency of ['', 'US', 'USDD', '12$', 'U$D'])assert.equal(processSchema.safeParse({currency}).success,false);
let record={id:'test',status:'OPEN',currency:'INR',estimatedAmount:100,payableAmount:50};let note='';
prisma.insuranceClaim.findFirst=async()=>record;
prisma.$transaction=async fn=>fn({insuranceClaim:{update:async({data})=>{record={...record,...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined))};return record}},claimEvent:{create:async({data})=>{note=data.note}}});
const saved=await claimsService.process('test',processSchema.parse({currency:'USD',estimatedAmount:1234.56,payableAmount:987.65}),{id:'admin'});
assert.equal(saved.currency,'USD');assert.equal(saved.estimatedAmount,1234.56);assert.equal(saved.payableAmount,987.65);assert.match(note,/currency INR -> USD/);
await claimsService.process('test',processSchema.parse({status:'WIP'}),{id:'admin'});assert.equal(record.currency,'USD');
prisma.insuranceClaim.count=async()=>2;
prisma.insuranceClaim.aggregate=async()=>({_sum:{payableAmount:150,estimatedAmount:300}});
prisma.insuranceClaim.groupBy=async({by})=>by[0]==='currency'?[{currency:'INR',_sum:{payableAmount:100,estimatedAmount:200}},{currency:'USD',_sum:{payableAmount:50,estimatedAmount:100}}]:[];
const dash=await claimsService.dashboard({id:'admin'});assert.deepEqual(dash.totalsByCurrency,[{currency:'INR',estimatedAmount:200,payableAmount:100},{currency:'USD',estimatedAmount:100,payableAmount:50}]);
console.log('PASS currency validation/normalization, amount persistence, currency audit, partial updates and separate currency totals; no live database writes.');
}finally{await prisma.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
