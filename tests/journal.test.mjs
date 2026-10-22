import test from 'node:test';
import assert from 'node:assert/strict';
import { journalEntry, journalEntries, validateJournalDate } from '../shared/journal.mjs';

test('journal accepts an optional hour, preserves creation time when edited and sorts timed notes first', () => {
  const first = journalEntry({ id: 'one', text: '  Am citit.  ', time: '' }, null, '2026-10-23T10:00:00Z');
  const edited = journalEntry({ ...first, text: 'Am citit doua capitole.', time: '08:30' }, first, '2026-10-23T11:00:00Z');
  assert.equal(edited.createdAt, first.createdAt);
  assert.equal(edited.updatedAt, '2026-10-23T11:00:00Z');
  assert.equal(first.text, 'Am citit.');
  const second = journalEntry({ id: 'two', text: 'Vocabular', time: '07:00' });
  assert.deepEqual(journalEntries({ entries: { one: edited, two: second, three: { ...first, id: 'three' } } }).map(e=>e.id), ['two', 'one', 'three']);
});
test('invalid dates, hours, identifiers and empty or overlong notes cannot reach storage', () => {
  for (const date of ['2026-02-30', '2026-13-12', '2026-1-01', 'invalid']) assert.throws(() => validateJournalDate(date));
  assert.equal(validateJournalDate('2028-02-29'), '2028-02-29');
  for (const patch of [{text:' '},{time:'24:00'},{time:'09:70'},{id:'../root'},{text:'x'.repeat(10001)}]) {
    assert.throws(() => journalEntry({ id:'good', text:'Reading', time:'', ...patch }));
  }
});
