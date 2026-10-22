import test from 'node:test';import assert from 'node:assert/strict';
import { handleSpeech } from '../worker/src/speech.js';
function setup(){let calls=0;const store=new Map();return {get calls(){return calls;},env:{OPENAI_API_KEY:'test-only'},cache:{async match(r){return store.get(r.url)?.clone();},async put(r,v){assert.ok(!r.url.includes('reading'));store.set(r.url,v);}},async fetchAudio(url,options){calls++;assert.equal(url,'https://api.openai.com/v1/audio/speech');assert.equal(JSON.parse(options.body).input,'reading');return new Response(new Uint8Array([73,68,51,0,1,2,3,4]),{headers:{'Content-Type':'audio/mpeg'}});}};}
const req=(headers={},text='reading')=>new Request(`https://worker.example/speech?text=${text}&lang=en-US`,{headers:{Origin:'https://lingua-59cff.web.app',...headers}});
test('valid speech is returned as audio and cached; iPhone byte ranges reuse the same generation',async()=>{
 const s=setup();const first=await handleSpeech(req(),s.env,s);assert.equal(first.status,200);assert.equal(first.headers.get('Content-Type'),'audio/mpeg');assert.equal(first.headers.get('Content-Length'),'8');assert.equal(first.headers.get('Cache-Control'),'private, max-age=86400');assert.equal((await first.arrayBuffer()).byteLength,8);
 const range=await handleSpeech(req({Range:'bytes=0-1'}),s.env,s);assert.equal(range.status,206);assert.equal(range.headers.get('Content-Range'),'bytes 0-1/8');assert.equal((await range.arrayBuffer()).byteLength,2);assert.equal(s.calls,1);
 const suffix=await handleSpeech(req({Range:'bytes=-3'}),s.env,s);assert.equal(suffix.status,206);assert.equal((await suffix.arrayBuffer()).byteLength,3);assert.equal(s.calls,1);
});
test('invalid input and external origins do not invoke the paid speech API',async()=>{
 const s=setup();assert.equal((await handleSpeech(req({},''),s.env,s)).status,400);assert.equal((await handleSpeech(req({},'x'.repeat(2001)),s.env,s)).status,400);assert.equal((await handleSpeech(new Request('https://worker.example/speech?text=reading',{headers:{Origin:'https://unrelated.example'}}),s.env,s)).status,403);assert.equal(s.calls,0);
});
test('upstream audio failures are not cached or returned as an apparently valid MP3',async()=>{
 const s=setup();const r=await handleSpeech(req(),s.env,{cache:s.cache,fetchAudio:async()=>new Response('{}',{status:401,headers:{'Content-Type':'application/json'}})});assert.equal(r.status,502);assert.equal(r.headers.get('Content-Type').startsWith('audio/'),false);
});
