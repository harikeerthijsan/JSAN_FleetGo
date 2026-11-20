// Verify the fresh startup path and full cleanup without retaining any records.
require('dotenv').config();
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {PrismaClient}=require('@prisma/client');const client=new PrismaClient();
const marker='DEMO-WEB-20261120-VERIFY';
const url=new URL(process.env.DATABASE_URL);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Local database only');
const original=client.$transaction.bind(client);
class Rollback extends Error{}
client.$transaction=fn=>original(async tx=>{
  await fn(tx);
  const rows=await tx.$queryRaw`SELECT "manifest" FROM "web_test_datasets" WHERE "marker"=${marker}`;
  assert.equal(rows.length,1);assert.equal(rows[0].manifest.records.length,75);
  const entries=rows[0].manifest.records;
  const sessions=entries.filter(r=>r.model==='trackingSession').map(r=>r.id);
  await tx.trackingSession.updateMany({where:{id:{in:sessions}},data:{latestLocationId:null}});
  for(const r of [...entries].reverse())await tx[r.model].deleteMany({where:{id:r.id}});
  assert.equal(await tx.vehicle.count({where:{vehicleCode:{startsWith:marker}}}),0);
  throw new Rollback();
},{timeout:60000});
const file=path.resolve(__dirname,'web-test-data.cjs'),m=new Module(file,module);m.paths=module.paths;
const req=m.require.bind(m);m.require=n=>n==='@prisma/client'?{PrismaClient:function(){return client;}}:req(n);
process.argv.push('--live');process.env.FLEETGO_WEB_TEST_DATA=marker;
let source=fs.readFileSync(file,'utf8').replaceAll('DEMO-WEB-20261120',marker).replaceAll('DEMO20NOV','VERIFY20NOV').replaceAll('fleetgo-web-demo@example.invalid','fleetgo-web-demo-verify@example.invalid');
source=source.slice(0,source.indexOf("const action=process.argv[2]"))+'\nmodule.exports={seed};';
m._compile(source,file);
(async()=>{
 await assert.rejects(m.exports.seed(),Rollback);
 assert.equal((await client.$queryRaw`SELECT "marker" FROM "web_test_datasets" WHERE "marker"=${marker}`).length,0);
 assert.equal(await client.vehicle.count({where:{vehicleCode:{startsWith:marker}}}),0);
 console.log('PASS fresh live-authorized seed, 75 linked records, atomic manifest, full reverse cleanup, and transaction rollback. No verification data retained.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>client.$disconnect());
