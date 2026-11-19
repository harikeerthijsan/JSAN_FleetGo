const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
global.window=dom.window;global.document=dom.window.document;global.Event=dom.window.Event;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
function load(relative,overrides={}){const file=path.resolve(__dirname,relative),m=new Module(file,module);m.filename=file;m.paths=module.paths;const original=m.require.bind(m);m.require=n=>n.endsWith('.css')?{}:Object.hasOwn(overrides,n)?overrides[n]:original(n);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return m.exports;}
const calls=[];
const {organizationService}=load('../src/services/organizationService.ts',{'./apiClient':{apiClient:{get:async(_path,{params})=>{calls.push(params);assert.ok(params.pageSize<=100);return{data:{data:Array.from({length:params.page===1?100:5},(_,i)=>({id:`${params.page}-${i}`,name:`Vendor ${i}`})),meta:{totalPages:2}}};}}}});
let fail=false,modalProps;const existing={id:'existing',name:'Existing Vendor',type:'VEHICLE_VENDOR',status:'ACTIVE'};
const created={id:'created',name:'New Vendor',type:'VEHICLE_VENDOR',status:'ACTIVE'};
const listCalls=[];
const service={listAll:async params=>{listCalls.push(params);if(fail)throw{message:'Server unavailable'};return params.type==='VEHICLE_VENDOR'?[existing,created].filter(o=>!params.search||o.name.includes(params.search)):[];}};
const components={Button:({children,onClick})=>h('button',{onClick},children),Card:({children})=>h('section',null,children),PageTitle:({title,actions})=>h('header',null,title,actions),SearchBar:({value,onValueChange})=>h('input',{'aria-label':'Search organizations',value,onChange:e=>onValueChange(e.target.value)}),Icon:()=>null,StatusBadge:({children})=>h('span',null,children),EmptyState:({title})=>h('p',null,title),DataTable:({rows,emptyTitle,loading})=>h('div',{'data-testid':'table'},loading?'Loading':rows.length?rows.map(o=>h('p',{key:o.id},o.name)):emptyTitle)};
const {VendorsMasterPage}=load('../src/modules/masterdata/pages/VendorsMasterPage.tsx',{'@/components':components,'@/context/AuthContext':{useAuth:()=>({hasPermission:()=>true})},'@/hooks/useDocumentTitle':{useDocumentTitle:()=>{}},'@/services/organizationService':{organizationService:service},'@/modules/users/components/OrgFormModal':{OrgFormModal:props=>{modalProps=props;return null;}},'../components/MasterDataTabs':{MasterDataTabs:()=>null}});
const root=createRoot(document.getElementById('root'));
async function settle(fn){await act(async()=>{fn?.();await new Promise(resolve=>setTimeout(resolve,15));});}
async function main(){
 const rows=await organizationService.listAll({type:'VEHICLE_VENDOR'});assert.equal(rows.length,105);assert.deepEqual(calls.map(c=>[c.page,c.pageSize]),[[1,100],[2,100]]);
 console.log('PASS organization reference list uses valid 100-row requests and retrieves later pages');
 await settle(()=>root.render(h(VendorsMasterPage)));assert.match(document.body.textContent,/Existing Vendor/);assert.match(document.body.textContent,/New Vendor/);
 assert.deepEqual(modalProps.allowedTypes,['VEHICLE_VENDOR','TRANSPORT_PARTNER']);
 await settle(()=>modalProps.onSaved('Organization created successfully',created));
 assert.equal(document.querySelector('input').value,'New Vendor');assert.match(document.body.textContent,/New Vendor/);assert.ok(!document.querySelector('[data-testid="table"]').textContent.includes('Existing Vendor'));
 assert.ok(listCalls.slice(-2).every(p=>p.search==='New Vendor'));
 console.log('PASS saving an organization refreshes the list and focuses the saved name');
 fail=true;await settle(()=>modalProps.onSaved('Organization updated successfully',created));assert.match(document.querySelector('[role="alert"]').textContent,/Server unavailable/);assert.match(document.body.textContent,/Organizations could not be loaded/);
 fail=false;await settle(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry loading organizations').click());assert.equal(document.querySelector('[role="alert"]'),null);assert.match(document.querySelector('[data-testid="table"]').textContent,/New Vendor/);
 console.log('PASS request failures are visible and retry restores the organization list');
 await settle(()=>root.unmount());console.log('All vendor organization checks passed. No production data created or changed.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
