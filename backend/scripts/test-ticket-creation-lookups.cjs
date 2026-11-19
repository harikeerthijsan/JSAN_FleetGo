const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript'),express=require('express');
function load(relative,overrides={}){
 const file=path.resolve(__dirname,relative),m=new Module(file,module);m.filename=file;m.paths=module.paths;
 const original=m.require.bind(m);m.require=n=>Object.hasOwn(overrides,n)?overrides[n]:original(n);
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);return m.exports;
}
const {ApiError}=load('../src/utils/ApiError.ts');
const {asyncHandler}=load('../src/utils/asyncHandler.ts');
const {ApiResponse}=load('../src/utils/ApiResponse.ts');
const workflow=load('../src/modules/tickets/tickets.workflow.ts');
const {SYSTEM_ROLES,resolveRolePermissions}=load('../src/modules/auth/rbac.ts');
let referenceReads=0,organizationReads=0;
const records=Object.fromEntries(SYSTEM_ROLES.map(role=>[role.name,{id:role.name,fullName:role.displayName,email:'test@example.invalid',status:'ACTIVE',organizationId:'own-org',organization:{type:role.name==='VENDOR_USER'?'VEHICLE_VENDOR':'CTS'},depots:[{depotId:'own-depot'}],role:{id:role.name,name:role.name,displayName:role.displayName,permissions:resolveRolePermissions(role).map(key=>({permission:{key}}))}}]));
const models=Array.from({length:225},(_,i)=>({id:`model-${i}`,name:`Model ${i}`,variant:null,make:{id:'make',name:'Honda'}}));
const db={user:{findUnique:async({where})=>records[where.id]??null},
 vehicleModel:{findMany:async args=>{referenceReads++;assert.deepEqual(args.where,{isActive:true,make:{isActive:true}});assert.equal(args.take,undefined);return models;}},
 depot:{findMany:async args=>{assert.deepEqual(args.select,{id:true,name:true});assert.equal(args.where.status,'ACTIVE');return [{id:'destination',name:'North Depot'}];}},
 organization:{findMany:async args=>{organizationReads++;assert.equal(args.where.status,'ACTIVE');assert.deepEqual(args.where.type.in,['VEHICLE_VENDOR','TRANSPORT_PARTNER']);return [{id:'vendor',name:'Vendor Alpha Motors'}];}}};
const auth=load('../src/middlewares/auth.ts',{'../database/prisma':{prisma:db},'../utils/ApiError':{ApiError},'../utils/asyncHandler':{asyncHandler},'../utils/jwt':{accessToken:{verify:token=>({sub:token})}}});
const {ticketCreationLookups}=load('../src/modules/tickets/tickets.lookups.ts',{'../../database/prisma':{prisma:db},'../../utils/ApiError':{ApiError},'./tickets.workflow':workflow});
const validators=load('../src/modules/tickets/tickets.validators.ts');
const noop=(_req,_res,next)=>next();
const {ticketsRoutes}=load('../src/modules/tickets/tickets.routes.ts',{'../../middlewares':{authenticate:auth.authenticate,authorize:auth.authorize,uploadMediaSingle:()=>noop,validate:()=>noop},'./tickets.controller':{ticketsController:new Proxy({},{get:()=>noop})},'./tickets.lookups':{ticketCreationLookups},'../../utils/asyncHandler':{asyncHandler},'../../utils/ApiResponse':{ApiResponse},'./tickets.validators':validators});
const app=express();app.use('/api/v1/tickets',ticketsRoutes);app.use((error,_req,res,_next)=>res.status(error.statusCode??500).json({message:error.message}));
async function main(){
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const url=`http://127.0.0.1:${server.address().port}/api/v1/tickets/creation-lookups`;
 try{
  assert.equal((await fetch(url)).status,401);
  for(const role of SYSTEM_ROLES){
   const allowed=resolveRolePermissions(role).includes('tickets:create');
   const before=referenceReads;
   const response=await fetch(url,{headers:{Authorization:`Bearer ${role.name}`}});
   assert.equal(response.status,allowed?200:403,role.name);
   if(allowed){const {data}=await response.json();assert.equal(data.models.length,225);assert.equal(data.depots[0].name,'North Depot');const internal=['SUPER_ADMIN','JSAN_ADMIN','OPERATIONS_MANAGER'].includes(role.name);assert.equal(data.requestingOrganizations.length,internal?1:0);}
   else assert.equal(referenceReads,before);
   console.log('PASS',role.name,allowed?'can load ticket choices':'cannot create ordinary tickets');
  }
  assert.equal(organizationReads,3);
  const vendor=records.VENDOR_USER;
  assert.ok(!vendor.role.permissions.some(p=>p.permission.key==='masterdata:read'));
  vendor.role.permissions=vendor.role.permissions.filter(p=>p.permission.key!=='tickets:create');
  assert.equal((await fetch(url,{headers:{Authorization:'Bearer VENDOR_USER'}})).status,403);
  vendor.status='INACTIVE';assert.equal((await fetch(url,{headers:{Authorization:'Bearer VENDOR_USER'}})).status,401);
  console.log('PASS no Master Data permission expansion; external organization list hidden; revoked permissions and inactive users rejected.');
  console.log('All role checks passed with synthetic database records. No business records created.');
 }finally{server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
