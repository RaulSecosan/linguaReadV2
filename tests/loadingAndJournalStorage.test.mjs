import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const { build } = require('esbuild');
const source = await readFile(new URL('../client/src/firestoreApi.js', import.meta.url), 'utf8');
const sdk = `
 export const counts={books:0,words:0,root:0,metadata:0,content:0,writes:0};
 export const state={root:{coach:{dailyActivity:{history:{pagesRead:9}},latest:{headline:'Keep'}}},book:{id:'b',createdAt:'first',title:'Book',progress:{page:7}},journals:{}};
 export function doc(parent,...parts){return {path:[parent?.path,...parts].filter(Boolean).join('/')}}
 export function collection(parent,name){return {path:parent.path+'/'+name}}
 export const orderBy=()=>null; export const where=(field,op,values)=>({field,op,values}); export const query=(ref,...conditions)=>({...ref,conditions});
 const snapshot=data=>({exists:()=>Boolean(data),data:()=>data?structuredClone(data):undefined});
 export async function getDoc(ref){if(ref.path.endsWith('/books/b')){counts.metadata++;return snapshot(state.book)}counts.root++;return snapshot(state.root)}
 export async function getDocs(ref){
  if(ref.path.endsWith('/books')){counts.books++;return {docs:[{data:()=>structuredClone(state.book)}]}}
  if(ref.path.endsWith('/vocabulary')){counts.words++;return {docs:[{data:()=>({id:'word',word:'reading',learned:true})}]}}
  if(ref.path.endsWith('/journal'))return {docs:Object.entries(state.journals).map(([id,data])=>({id,data:()=>structuredClone(data)}))};
  if(ref.path.endsWith('/bookContent')){counts.content++;if(!ref.conditions.some(c=>c.field==='bookId'&&c.op==='in'&&c.values.includes('b')&&c.values.includes('b:epub')))throw Error('Unfiltered content scan');
   return {docs:[{data:()=>({bookId:'b',index:0,total:1,chunk:JSON.stringify({text:'Original text',chapters:[]})})},{data:()=>({bookId:'b:epub',index:0,total:1,chunk:'original-base64'})}]}}
  throw Error('Unexpected query '+ref.path);
 }
 export async function runTransaction(db,callback){return callback({get:async ref=>snapshot(state.journals[ref.path.split('/').at(-1)]),set:(ref,value)=>{counts.writes++;state.journals[ref.path.split('/').at(-1)]=structuredClone(value)}})}
 export const setDoc=async()=>{throw Error('Unexpected write')};export const updateDoc=async()=>{};export const deleteDoc=async()=>{};export const writeBatch=()=>{};
`;
const built = await build({stdin:{contents:source+'\nexport {counts,state} from "firebase/firestore";',resolveDir:fileURLToPath(new URL('../client/src/',import.meta.url))},bundle:true,write:false,platform:'node',format:'esm',external:['jszip','pdfjs-dist','pdfjs-dist/*'],define:{'import.meta.env':'{}'},plugins:[{name:'mock',setup(p){p.onResolve({filter:/^firebase\/firestore$/},()=>({path:'sdk',namespace:'mock'}));p.onResolve({filter:/^\.\/firebase$/},()=>({path:'app',namespace:'mock'}));p.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='sdk'?sdk:'export const firestoreDb={};',loader:'js'}));}}]});
const module=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const {firestoreApi:api,counts,state}=module;
test('dashboard reads books and words once, without initializing or overwriting the root',async()=>{
 const original=structuredClone(state.root);const dashboard=await api.dashboard();
 assert.equal(dashboard.stats.savedWords,1);assert.equal(dashboard.books.length,1);
 assert.deepEqual(counts,{books:1,words:1,root:1,metadata:0,content:0,writes:0});assert.deepEqual(state.root,original);
});
test('book openings share content reads, filter by book ID and fetch current progress separately',async()=>{
 const [a,b]=await Promise.all([api.book('b'),api.book('b')]);assert.equal(counts.content,1);assert.equal(counts.metadata,1);
 assert.equal(a.epubArchive,'original-base64');assert.equal(a.text,b.text);
 state.book.progress.page=11;const again=await api.book('b');assert.equal(again.progress.page,11);assert.equal(counts.content,1);assert.equal(counts.metadata,2);
 state.book.updatedAt='revision2';await api.book('b');assert.equal(counts.content,2);
});
test('journal add/edit preserves other entries, dates, books and all existing Coach history',async()=>{
 const before=structuredClone({root:state.root,book:state.book});
 await api.saveJournalEntry('2026-10-23',{id:'one',text:'Reading',time:'10:00'});
 await api.saveJournalEntry('2026-10-23',{id:'two',text:'Vocabulary',time:''});
 await api.saveJournalEntry('2026-10-22',{id:'three',text:'Yesterday',time:''});
 const created=state.journals['2026-10-23'].entries.one.createdAt;
 await api.saveJournalEntry('2026-10-23',{id:'one',text:'Reading edited',time:'11:00'});
 assert.equal(state.journals['2026-10-23'].entries.two.text,'Vocabulary');
 assert.equal(state.journals['2026-10-23'].entries.one.createdAt,created);
 assert.equal(state.journals['2026-10-22'].entries.three.text,'Yesterday');
 assert.deepEqual({root:state.root,book:state.book},before);
 assert.equal(Object.keys(await api.journal()).length,2);
 const writes=counts.writes;await assert.rejects(api.saveJournalEntry('2026-02-31',{id:'bad',text:'text'}));assert.equal(counts.writes,writes);
});
