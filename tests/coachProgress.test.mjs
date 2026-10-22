import test from 'node:test';
import assert from 'node:assert/strict';
import { setCoachTask, dayProgress, previewCoachTasks, activityStreak, coachDateKey } from '../shared/coachProgress.mjs';
const date = '2026-10-22';
function fixture() { return { dailyProgress: { [date]: { date, tasks: [{ id:'a',type:'reading',completed:false },{ id:'b',type:'quiz',completed:false }] } }, dailyActivity: { [date]: { readingMinutes:8,pagesRead:4 }, '2026-10-21':{pagesRead:3} } }; }
test('repeated task toggles do not inflate completed tasks or erase reading history', () => {
  const coach = fixture();
  setCoachTask(coach,date,'a',true,'now');setCoachTask(coach,date,'a',true,'later');
  assert.equal(coach.dailyActivity[date].tasksCompleted,1);
  assert.equal(coach.dailyProgress[date].tasks[0].completedAt,'now');
  setCoachTask(coach,date,'a',false);assert.equal(coach.dailyActivity[date].tasksCompleted,0);
  assert.equal(coach.dailyActivity[date].readingMinutes,8);assert.equal(coach.dailyActivity['2026-10-21'].pagesRead,3);
  setCoachTask(coach,date,'b',true);assert.deepEqual(coach.dailyActivity[date].taskTypes,{quiz:1});
});
test('historical activity appears without requiring a saved daily task list', () => {
  const day=dayProgress(null,{readingMinutes:15});assert.equal(day.hasActivity,true);assert.equal(day.percent,33);assert.equal(dayProgress(null,{}).percent,0);
});
test('optimistic checkbox and chart change immediately without mutating the saved response', () => {
  const tasks=fixture().dailyProgress[date].tasks;
  const coach={tracker:{today:{date,tasks},days:[{date,activity:{},completed:0,total:2}],progressByDate:{},completedThisWeek:0}};
  const value=previewCoachTasks(coach,{a:true});
  assert.equal(value.tracker.today.tasks[0].completed,true);assert.equal(value.tracker.days[0].percent,50);assert.equal(value.tracker.completedThisWeek,1);
  assert.equal(coach.tracker.today.tasks[0].completed,false);assert.equal(coach.tracker.completedThisWeek,0);
});

test('streak spans more than the visible week and lasts until today is practiced', () => {
  const coach={dailyActivity:{}};
  for(let day=13;day<=21;day++)coach.dailyActivity[`2026-10-${day}`]={pagesRead:1};
  assert.equal(activityStreak(coach,'2026-10-22'),9);
  coach.dailyActivity['2026-10-22']={vocabularyPracticed:1};assert.equal(activityStreak(coach,'2026-10-22'),10);
});
test('journal defaults to the Romanian calendar day around midnight', () => {
  assert.equal(coachDateKey(new Date('2026-10-22T22:30:00Z')),'2026-10-23');
});
