import test from 'node:test';
import assert from 'node:assert/strict';
import { splitContent, joinContent } from '../shared/bookContent.mjs';
test('book text and original EPUB bytes survive chunking, including Unicode boundaries', () => {
  const value = JSON.stringify({ text: '„Dialog”\n\nAliniat 🎉 '.repeat(20000), epubArchive: Buffer.from([0,1,2,254,255]).toString('base64') });
  const pieces = splitContent(value, 180000);
  assert.ok(pieces.length > 1);
  const chunks = pieces.map((chunk,index) => ({ chunk,index,total:pieces.length })).reverse();
  assert.equal(joinContent(chunks), value);
  assert.deepEqual(JSON.parse(joinContent(chunks)), JSON.parse(value));
});
test('missing, duplicated or inconsistent chunks are rejected without attempting a write', () => {
  assert.throws(() => joinContent([{ index:0,total:2,chunk:'a' }]));
  assert.throws(() => joinContent([{ index:0,total:2,chunk:'a' },{ index:0,total:2,chunk:'a' }]));
});
