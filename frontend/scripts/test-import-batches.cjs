const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const file=path.resolve(__dirname,'../src/services/importBatches.ts');
const m=new Module(file,module);m.filename=file;m.paths=module.paths;
m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {validateImportBatches,commitImportBatches,IMPORT_BATCH_SIZE}=m.exports;
const ready=rows=>rows.map((input,i)=>({row:i+2,status:'READY',errors:[],input}));
async function main(){
 const rows=Array.from({length:686},(_,i)=>({registrationNumber:`TEST${i}`,vin:String(i+12345678910)}));
 let calls=0;let lastProgress=0;
 const result=await validateImportBatches(rows,async batch=>{calls++;assert.ok(batch.length<=20);return ready(batch);},done=>lastProgress=done);
 assert.equal(calls,35);assert.equal(lastProgress,686);assert.equal(result.length,686);assert.equal(result[685].row,687);
 console.log('PASS 686 rows validate in 35 bounded requests with original row numbers and progress');
 const duplicates=rows.slice(0,42).map(row=>({...row}));duplicates[21].registrationNumber=' test0 ';duplicates[41].vin=duplicates[20].vin;
 const dup=await validateImportBatches(duplicates,async batch=>ready(batch),()=>{});
 assert.equal(dup[21].status,'SKIPPED');assert.equal(dup[41].status,'SKIPPED');
 console.log('PASS duplicates spanning batch boundaries remain excluded');
 await assert.rejects(validateImportBatches(rows,async()=>[],()=>{}),/Incomplete/);
 let failureCalls=0;await assert.rejects(validateImportBatches(rows,async batch=>{if(++failureCalls===2)throw Error('network');return ready(batch);},()=>{}),/network/);assert.equal(failureCalls,2);
 console.log('PASS incomplete responses and network failures stop validation');
 const plan=rows.slice(0,45).map((input,i)=>({input,fileRow:i+100}));
 const saved=new Map();const requests=[];let disconnect=true;let created=0;
 const send=async(batch,key)=>{
  requests.push(key);
  if(!saved.has(key)){saved.set(key,batch.map((input,i)=>({row:i+2,status:'SUCCESS',errors:[],vehicleId:`v${created++}`})));}
  if(key.endsWith(`:${IMPORT_BATCH_SIZE}`)&&disconnect){disconnect=false;throw Error('lost response');}
  return saved.get(key);
 };
 await assert.rejects(commitImportBatches(plan,'stable-key',send,()=>{}),/lost response/);
 const committed=await commitImportBatches(plan,'stable-key',send,()=>{});
 assert.equal(created,45);assert.equal(committed.length,45);assert.equal(committed[44].row,144);
 assert.deepEqual(requests,['stable-key:batch:0','stable-key:batch:20','stable-key:batch:0','stable-key:batch:20','stable-key:batch:40']);
 assert.equal(committed[0].input.registrationNumber,'TEST0');
 console.log('PASS partial commit retry reuses stable batch keys without duplicate creations');
 await assert.rejects(commitImportBatches(plan,'key',async()=>[],()=>{}),/Incomplete/);
 console.log('All batch checks passed. No server requests or data changes.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
