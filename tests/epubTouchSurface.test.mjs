import test from 'node:test';
import assert from 'node:assert/strict';
import { framePoint, isTap } from '../client/src/epubTouchSurface.js';

test('parent taps map to text in distant EPUB columns after scrolling', () => {
  assert.deepEqual(framePoint({clientX:150,clientY:510},{left:-8784,top:444,width:10400,height:880},10400,880),{x:8934,y:66});
});
test('zoomed iframe taps account for CSS scale independently on each axis', () => {
  assert.deepEqual(framePoint({clientX:150,clientY:200},{left:-100,top:100,width:500,height:250},1000,500),{x:500,y:200});
  assert.equal(framePoint({clientX:0,clientY:0},{left:0,top:0,width:0,height:0},0,0),null);
});
test('scroll, cancelled gestures and missing starts do not trigger word selection', () => {
  const start={clientX:100,clientY:300};
  assert.equal(isTap(start,{clientX:104,clientY:304},false),true);
  assert.equal(isTap(start,{clientX:100,clientY:350},false),false);
  assert.equal(isTap(start,start,true),false);
  assert.equal(isTap(null,start,false),false);
});
