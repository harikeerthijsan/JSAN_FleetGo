const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost'});
global.window=dom.window;global.document=dom.window.document;global.Event=dom.window.Event;global.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');const h=React.createElement;
const root=createRoot(document.getElementById('root'));let fail=false;const vehiclePages=[];
const models=Array.from({length:225},(_,i)=>({id:`model${i}`,name:`Model ${i}`,variant:null,make:{id:'make',name:'Honda'}}));
const service={creationLookups:async()=>{if(fail)throw{message:'Choices unavailable'};return{models,depots:[{id:'depot',name:'North Depot'}],requestingOrganizations:[]};},availability:async()=>({totalAvailable:0,byDepot:[]})};
const components={
 Card:({title,children})=>h('section',null,h('h2',null,title),children),PageTitle:({title})=>h('h1',null,title),StatusBadge:({children})=>h('span',null,children),
 Button:({children,type='button',onClick,disabled,loading})=>h('button',{type,onClick,disabled:disabled||loading},children),
 Select:({label,options,value,onChange,disabled,required})=>h('label',null,label,h('select',{'aria-label':label,value,onChange,disabled,required},options.map(o=>h('option',{key:o.value,value:o.value},o.label)))),
 FormInput:({label,type='text',value,onChange,required})=>h('label',null,label,h('input',{'aria-label':label,type,value,onChange,required})),
 DatePicker:()=>h('input',{type:'date'}),
};
function load(relative,overrides={}){const file=path.resolve(__dirname,relative),m=new Module(file,module);m.filename=file;m.paths=module.paths;const original=m.require.bind(m);m.require=n=>n.endsWith('.css')?{}:Object.hasOwn(overrides,n)?overrides[n]:original(n);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);return m.exports;}
const ticketTypes=load('../src/types/ticket.ts');
const meta=load('../src/modules/tickets/ticketMeta.ts');
const {CreateTicketPage}=load('../src/modules/tickets/pages/CreateTicketPage.tsx',{
 'react-router-dom':{useNavigate:()=>()=>{}},'@/components':components,
 '@/context/AuthContext':{useAuth:()=>({hasAnyPermission:()=>false})},'@/hooks/useDocumentTitle':{useDocumentTitle:()=>{}},
 '@/services/ticketService':{ticketService:service},'@/services/fleetService':{fleetService:{list:async({page})=>{vehiclePages.push(page);return{data:Array.from({length:page===1?200:1},(_,i)=>({id:`v${page}-${i}`,vehicleCode:`V${page}-${i}`,registrationNumber:`R${page}-${i}`})),meta:{totalPages:2}};}}},
 '@/types/ticket':ticketTypes,'../ticketMeta':meta,
});
async function settle(fn){await act(async()=>{fn?.();await new Promise(resolve=>setTimeout(resolve,15));});}
async function main(){
 await settle(()=>root.render(h(CreateTicketPage)));
 assert.equal(document.querySelector('[aria-label="Vehicle model"]').options.length,226);
 assert.ok(document.querySelector('[aria-label="Destination depot / location"]').textContent.includes('North Depot'));
 assert.equal(vehiclePages.length,0);assert.equal(document.querySelector('[aria-label="Requesting vendor / organization"]'),null);
 console.log('PASS vendor model and depot choices load without Master Data calls or unnecessary vehicle fetches');
 await settle(()=>{const select=document.querySelector('[aria-label="Ticket type"]');select.value='RETURN';select.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.deepEqual(vehiclePages,[1,2]);assert.equal(document.querySelector('[aria-label="Vehicle"]').options.length,202);
 console.log('PASS vehicle-specific tickets load all authorized pages, including vehicles after row 200');
 fail=true;await settle(()=>root.render(h(CreateTicketPage,{key:'failed'})));
 assert.match(document.querySelector('[role="alert"]').textContent,/Choices unavailable/);
 assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Create & submit').disabled,true);
 fail=false;await settle(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry loading choices').click());
 assert.equal(document.querySelector('[role="alert"]'),null);assert.equal(document.querySelector('[aria-label="Vehicle model"]').options.length,226);
 console.log('PASS lookup errors are visible, submission disabled, and retry restores choices');
 await settle(()=>root.unmount());console.log('All ticket form checks passed. No requests or tickets created.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
