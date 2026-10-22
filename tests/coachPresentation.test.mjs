import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCoach} from '../shared/coachPresentation.mjs';
test('older saved coach responses are readable without changing any stored fields',()=>{
  const saved={plan:[{activity:'Citește un capitol.',time:'08:00'}],focusAreas:['Vocabular'],recommendations:['Repetă cuvintele.'],dailyTarget:'Citește 30 de minute și învață 5 cuvinte noi.'};
  const before=JSON.stringify(saved), view=normalizeCoach(saved);
  assert.equal(view.plan[0].title,'Citește un capitol.');
  assert.equal(view.plan[0].time,'08:00');
  assert.equal(view.focusAreas[0].title,'Vocabular');
  assert.equal(view.focusAreas[0].score,null);
  assert.equal(view.dailyTarget,5);
  assert.equal(view.plan[0].minutes,null);
  assert.equal(normalizeCoach(view).plan[0].minutes,null);
  assert.equal(JSON.stringify(saved),before);
});
test('current coach fields and actual scores remain unchanged',()=>{
  const view=normalizeCoach({plan:[{title:'Read',detail:'15 minutes',minutes:15}],dailyTarget:12,focusAreas:[{title:'Words',score:73,detail:'Review'}],recommendations:[{title:'Repeat',detail:'Daily'}]});
  assert.equal(view.plan[0].minutes,15);
  assert.equal(view.focusAreas[0].score,73);
  assert.equal(view.dailyTarget,12);
});
