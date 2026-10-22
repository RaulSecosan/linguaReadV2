import test from 'node:test';import assert from 'node:assert/strict';
import { createAudioTap } from '../client/src/audioTap.js';
test('pointerup, touchend and compatibility click activate one pronunciation, with rapid second tap still allowed',()=>{
 let calls=0,time=1000;const tap=createAudioTap(()=>calls++,()=>time),point={clientX:20,clientY:20};
 tap.down(point);tap.end(point);tap.end(point);tap.click();assert.equal(calls,1);
 time+=100;tap.down(point);tap.end(point);tap.click();assert.equal(calls,2);
});
test('scrolls and cancelled touches do not speak, while keyboard activation remains possible',()=>{
 let calls=0;const tap=createAudioTap(()=>calls++),point={clientX:20,clientY:20};
 tap.down(point);tap.move({...point,clientY:80});tap.end(point);tap.click();assert.equal(calls,0);
 tap.down(point);tap.cancel();tap.end(point);tap.click();assert.equal(calls,0);
 tap.click(true);assert.equal(calls,1);
});
