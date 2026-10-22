import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceReviewQueue } from '../shared/reviewQueue.mjs';
test('deferred word returns after three other words without loss', () => {
  let queue = advanceReviewQueue(['a','b','c','d','e'], 'a', true);
  assert.deepEqual(queue, ['b','c','d','a','e']);
  for (const id of ['b','c','d']) queue = advanceReviewQueue(queue, id);
  assert.equal(queue[0], 'a');
});
test('last deferred word stays available; known word leaves the queue', () => {
  assert.deepEqual(advanceReviewQueue(['a'], 'a', true), ['a']);
  assert.deepEqual(advanceReviewQueue(['a'], 'a'), []);
  assert.deepEqual(advanceReviewQueue(['a','a','b'], 'a', true), ['b','a']);
});
