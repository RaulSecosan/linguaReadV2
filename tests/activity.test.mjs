import test from 'node:test';
import assert from 'node:assert/strict';
import { applyActivity, normalizeActivity, hasAnyActivity } from '../shared/activity.mjs';
test('activity days reflect practice, reading and quizzes, without losing existing history', () => {
  const coach = { dailyActivity:{ '2026-10-21': {pagesRead:3,books:{old:{pagesRead:3}}} } };
  applyActivity(coach,'2026-10-22','vocabulary',{count:1});
  applyActivity(coach,'2026-10-22','quiz',{score:4,totalQuestions:5});
  assert.equal(coach.dailyActivity['2026-10-21'].pagesRead,3);
  assert.equal(coach.dailyActivity['2026-10-22'].vocabularyPracticed,1);
  assert.equal(coach.dailyActivity['2026-10-22'].quizScoreTotal,4);
  assert.ok(hasAnyActivity(normalizeActivity(coach.dailyActivity['2026-10-21'])));
  assert.equal(hasAnyActivity(normalizeActivity()),false);
});
