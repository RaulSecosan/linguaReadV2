import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { build } = require('esbuild');
test('a warmed Coach task click performs one transaction without scanning books or vocabulary again', async () => {
  const source = await readFile(new URL('../client/src/firestoreApi.js', import.meta.url), 'utf8');
  const sdk = `
    export const __counts={getDocs:0,getDoc:0,transactionReads:0,writes:0};
    let root={coach:{latest:{plan:[{title:'Read',detail:'Read today',minutes:15}],focusAreas:[],recommendations:[]},dailyActivity:{'2026-10-01':{pagesRead:4}}}};
    export function doc(...args){return {path:args.filter(a=>typeof a==='string').join('/')}}
    export function collection(parent,name){return {path:parent.path+'/'+name}}
    export const orderBy=()=>null;export const query=(ref)=>ref;
    export async function getDoc(){__counts.getDoc++;return {exists:()=>true,data:()=>structuredClone(root)}}
    export async function getDocs(ref){__counts.getDocs++;return {docs:ref.path.endsWith('/books')?[{data:()=>({id:'b',wordCount:1000,progress:{page:2,percent:10}})}]:[]}}
    export async function runTransaction(db,callback){let pending;const value=await callback({get:async()=>{__counts.transactionReads++;return {exists:()=>true,data:()=>structuredClone(root)}},update:(ref,patch)=>{__counts.writes++;pending=patch}});if(pending)root={...root,...pending};return value}
    export const setDoc=async()=>{throw new Error('Unexpected nontransactional write')};
    export const updateDoc=async()=>{};export const deleteDoc=async()=>{};export const writeBatch=()=>{};
    export const __root=()=>structuredClone(root);
  `;
  const result = await build({ stdin:{contents:source+'\nexport {__counts,__root} from "firebase/firestore";',resolveDir:fileURLToPath(new URL('../client/src/',import.meta.url)),sourcefile:'firestoreApi.js'},bundle:true,write:false,platform:'node',format:'esm',external:['jszip','pdfjs-dist','pdfjs-dist/*'],define:{'import.meta.env':'{}'},plugins:[{name:'isolated-sdk',setup(plugin){plugin.onResolve({filter:/^firebase\/firestore$/},()=>({path:'sdk',namespace:'mock'}));plugin.onResolve({filter:/^\.\/firebase$/},()=>({path:'app',namespace:'mock'}));plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='sdk'?sdk:'export const firestoreDb={};',loader:'js'}));}}] });
  const module = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const initial=await module.firestoreApi.coach();
  for(const key of Object.keys(module.__counts))module.__counts[key]=0;
  const date=initial.tracker.today.date,taskId=initial.tracker.today.tasks[0].id;
  const saved=await module.firestoreApi.updateCoachTask(date,taskId,true);
  assert.deepEqual(module.__counts,{getDocs:0,getDoc:0,transactionReads:1,writes:1});
  assert.equal(saved.tracker.today.tasks[0].completed,true);
  assert.equal(module.__root().coach.dailyActivity['2026-10-01'].pagesRead,4);
  await module.firestoreApi.updateCoachTask(date,taskId,false);
  assert.equal(module.__root().coach.dailyActivity[date].tasksCompleted,0);
});
