import test from 'node:test';import assert from 'node:assert/strict';
import { createRecordedPronouncer, isAppleTouchDevice } from '../client/src/recordedPronunciation.js';
function fake(){const calls=[],timers=new Map();let n=0;class Audio{src='';setAttribute(){}load(){calls.push('load');}pause(){calls.push('pause');}play(){calls.push('play');return Promise.resolve();}}
 const browser={Audio,navigator:{userAgent:'iPhone',audioSession:{type:'auto'}},setTimeout(fn){timers.set(++n,fn);return n;},clearTimeout(id){timers.delete(id);}};
 return {browser,calls,timers};}
test('iPhone MP3 playback calls play synchronously inside the tap and restores the audio session',async()=>{
 const f=fake(),player=createRecordedPronouncer(f.browser,'https://example.com'),states=[];
 const result=player.speak('reading','en-US',{onState:s=>states.push(s)});
 assert.deepEqual(f.calls,['load','play']);assert.equal(f.browser.navigator.audioSession.type,'playback');
 const audio=player.activeAudio;assert.equal(new URL(audio.src).pathname,'/speech');assert.equal(new URL(audio.src).searchParams.get('text'),'reading');
 audio.onplaying();assert.equal(states.at(-1),'speaking');assert.equal(f.timers.size,0);audio.onended();await result;assert.equal(player.activeAudio,null);assert.equal(f.browser.navigator.audioSession.type,'auto');
});
test('switching audio pauses the previous word; stale completion cannot affect the next pronunciation',async()=>{
 const f=fake(),player=createRecordedPronouncer(f.browser,'https://example.com');const first=player.speak('first'),second=player.speak('second');await first;
 assert.equal(f.calls.filter(x=>x==='pause').length,1);assert.equal(new URL(player.activeAudio.src).searchParams.get('text'),'second');player.activeAudio.onended();await second;
});
test('audio network errors and stalled loading reject with a visible failure message',async()=>{
 const f=fake(),player=createRecordedPronouncer(f.browser,'https://example.com');const first=player.speak('reading');player.activeAudio.onerror();await assert.rejects(first,/incarcata/);
 const second=player.speak('reading');[...f.timers.values()][0]();await assert.rejects(second,/dureaza prea mult/);assert.equal(player.activeAudio,null);
});
test('recorded playback is selected for iPhone and iPad, leaving desktop native speech available',()=>{
 assert.equal(isAppleTouchDevice({navigator:{userAgent:'iPhone'}}),true);assert.equal(isAppleTouchDevice({navigator:{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5}}),true);assert.equal(isAppleTouchDevice({navigator:{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0}}),false);
});
