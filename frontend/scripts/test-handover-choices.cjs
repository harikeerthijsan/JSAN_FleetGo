const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
global.window=dom.window;global.document=dom.window.document;global.Event=dom.window.Event;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),h=React.createElement;
const root=createRoot(document.getElementById('root'));let manage=false,confirm=true,failed=false;const mutations=[];
const choices={vehicles:[{id:'uuid-a',vehicleCode:'FG-A',registrationNumber:'REG-A'},{id:'uuid-b',vehicleCode:'FG-B',registrationNumber:'REG-B'}],dispatches:[{id:'dispatch-a',reference:'DSP-A',vehicleIds:['uuid-a']},{id:'dispatch-b',reference:'DSP-B',vehicleIds:['uuid-b']}],allowedTypes:[]};
const components={Card:({children})=>h('section',null,children),DataTable:()=>null,Pagination:()=>null,Modal:()=>null,StatusBadge:()=>null,
Button:({children,type='button',onClick,disabled,loading})=>h('button',{type,onClick,disabled:disabled||loading},children),
Select:({label,options,value,onChange,required})=>h('select',{'aria-label':label,value,onChange,required},options.map(o=>h('option',{key:o.value,value:o.value},o.label))),
FormInput:({label,value,onChange})=>h('input',{'aria-label':label,value,onChange})};
const file=path.resolve(__dirname,'../src/modules/inspections/pages/InspectionsManagement.tsx'),m=new Module(file,module);m.paths=module.paths;const original=m.require.bind(m);
const shared={useLoad:p=>({data:p?choices:null,loading:false,error:p&&failed?'Choices unavailable':'',load:()=>{}}),Feedback:({error})=>error?h('p',{role:'alert'},error):null,StatusTag:()=>null,human:s=>s,when:s=>s};
const api={list:async()=>({data:[],meta:{total:0}}),mutate:async(p,b)=>{mutations.push({p,b});return{id:'created'};}};
m.require=n=>n==='@/components'?components:n==='@/context/AuthContext'?{useAuth:()=>({hasPermission:p=>p==='inspections:manage'?manage:confirm})}:n==='@/services/inspectionsService'?{inspectionsApi:api}:n==='./inspectionsShared'?shared:n==='react-router-dom'?{useParams:()=>({}),useSearchParams:()=>[new URLSearchParams()],Link:()=>null}:original(n);
m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
const {HandoverList,PodScreen}=m.exports;
async function settle(fn){await act(async()=>{fn?.();await new Promise(r=>setTimeout(r,5));});}
const select=label=>document.querySelector(`[aria-label="${label}"]`);
async function change(label,value){await settle(()=>{select(label).value=value;select(label).dispatchEvent(new Event('change',{bubbles:true}));});}
(async()=>{
 await settle(()=>root.render(h(HandoverList)));assert.equal(select('Type').value,'RECEIVING');
 await change('Vehicle','uuid-a');assert.match(select('Vehicle').textContent,/FG-A — REG-A/);assert.equal(select('Dispatch (optional)').options.length,2);assert.match(select('Dispatch (optional)').textContent,/DSP-A/);assert.ok(!select('Dispatch (optional)').textContent.includes('DSP-B'));
 await change('Dispatch (optional)','dispatch-a');await change('Vehicle','uuid-b');assert.equal(select('Dispatch (optional)').value,'');
 await settle(()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(mutations[0].b.vehicleId,'uuid-b');assert.equal(mutations[0].b.dispatchId,undefined);
 manage=true;await settle(()=>root.render(h(PodScreen)));await change('Vehicle','uuid-a');await change('Dispatch','dispatch-a');
 await settle(()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.deepEqual(mutations[1],{p:'/handover/pod',b:{vehicleId:'uuid-a',dispatchId:'dispatch-a'}});
 failed=true;await settle(()=>root.render(h(PodScreen,{key:'failed'})));assert.match(document.querySelector('[role="alert"]').textContent,/Choices unavailable/);assert.ok([...document.querySelectorAll('button')].find(b=>b.textContent==='Generate POD').disabled);
 manage=false;confirm=false;await settle(()=>root.render(h(HandoverList,{key:'read-only'})));assert.equal(document.querySelector('form'),null);await settle(()=>root.render(h(PodScreen,{key:'view-only'})));assert.equal(document.querySelector('form'),null);
 await settle(()=>root.unmount());console.log('PASS vendor default, vehicle labels, matching dispatches, stale selection reset, UUID payloads, failed lookups, read-only forms hidden. No business records created.');
})().catch(e=>{console.error(e);process.exitCode=1});
