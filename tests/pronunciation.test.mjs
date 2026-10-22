import test from 'node:test';
import assert from 'node:assert/strict';
import { createPronouncer, selectVoice } from '../client/src/pronunciation.js';
function fakeBrowser({voices=[],audioSession=true}={}) {
  const calls=[],timers=new Map(),events=new Map();let next=0,sessionType='auto';
  const session={ get type(){return sessionType;},set type(value){sessionType=value;calls.push(`session:${value}`);} };
  const synth={speaking:false,pending:false,paused:false,voices,
    getVoices(){return this.voices;},addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);},
    cancel(){calls.push('cancel');this.speaking=this.pending=false;},
    resume(){calls.push('resume');this.paused=false;},
    speak(utterance){calls.push('speak');this.utterance=utterance;this.pending=true;},
  };
  const browser={speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},navigator:audioSession?{audioSession:session}:{},
    setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);},
  };
  return {browser,synth,calls,timers,events,session};
}
test('iPhone playback session and voice are set synchronously, with utterance retained until completion',async()=>{
  const voice={lang:'en-US',localService:true};const f=fakeBrowser({voices:[voice]}),p=createPronouncer(f.browser),states=[];
  const done=p.speak('reading','en-US',{onState:s=>states.push(s)});
  assert.deepEqual(f.calls,['session:playback','speak']);
  assert.equal(p.activeUtterance,f.synth.utterance);assert.equal(p.activeUtterance.voice,voice);assert.equal(p.activeUtterance.volume,1);
  p.activeUtterance.onstart();assert.deepEqual(states,['starting','speaking']);assert.equal(f.timers.size,0);
  p.activeUtterance.onend();await done;assert.equal(p.activeUtterance,null);assert.equal(f.session.type,'auto');assert.equal(states.at(-1),'idle');p.destroy();
});
test('paused engines resume inside the same gesture; desktop without AudioSession still speaks',async()=>{
  const f=fakeBrowser({audioSession:false}),p=createPronouncer(f.browser);f.synth.paused=true;
  const done=p.speak('hello');assert.deepEqual(f.calls,['resume','speak']);p.activeUtterance.onend();await done;p.destroy();
});
test('changing words cancels once and ignores stale completion events',async()=>{
  const f=fakeBrowser(),p=createPronouncer(f.browser);const first=p.speak('first'),old=p.activeUtterance;
  const second=p.speak('second');await first;
  assert.equal(f.calls.filter(x=>x==='cancel').length,1);assert.equal(old.onend,null);assert.equal(p.activeUtterance.text,'second');
  p.activeUtterance.onend();await second;p.destroy();
});
test('blocked or stalled speech reports a failure instead of silently succeeding',async()=>{
  const f=fakeBrowser(),p=createPronouncer(f.browser);
  const blocked=p.speak('hello');p.activeUtterance.onerror({error:'not-allowed'});await assert.rejects(blocked,/blocat/);assert.equal(f.session.type,'auto');
  const stalled=p.speak('again');[...f.timers.values()][0]();await assert.rejects(stalled,/nu a putut porni/);assert.equal(p.activeUtterance,null);assert.equal(f.session.type,'auto');p.destroy();
});
test('voices loaded later are used on the next tap, with exact language before another accent',async()=>{
  const f=fakeBrowser(),p=createPronouncer(f.browser);f.synth.voices=[{lang:'en-GB',localService:true},{lang:'en-US',localService:false},{lang:'ro-RO',localService:true}];f.events.get('voiceschanged')();
  const done=p.speak('hello');assert.equal(p.activeUtterance.voice.lang,'en-US');p.activeUtterance.onend();await done;
  assert.equal(selectVoice(f.synth.voices,'ro-RO').lang,'ro-RO');assert.equal(selectVoice(f.synth.voices,'fr-FR'),undefined);p.destroy();
});
test('unavailable native speech rejects explicitly',async()=>{
  const f=fakeBrowser();f.browser.speechSynthesis=undefined;const p=createPronouncer(f.browser);await assert.rejects(p.speak('hello'),/nu este disponibila/);p.destroy();
});
