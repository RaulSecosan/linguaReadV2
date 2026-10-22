import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateBook, splitSentences } from '../client/src/readingLayout.js';

test('dialogue and blank-line paragraphs survive pagination and retain sentence anchors', () => {
  const chapter = { id: 'chapter-7', title: 'Chapter Seven', text: 'Chapter Seven\n\n“Hello,” she said. “Are you there?”\n\n“Yes.”\n\nHe smiled.' };
  const { pages } = paginateBook({ chapters: [chapter] }, 7);
  assert.deepEqual(pages.flatMap(page => page.sentences), splitSentences(chapter.text));
  assert.ok(pages.some(page => page.paragraphs.length > 1));
  assert.equal(pages[0].sentenceStartIndex, 0);
  assert.equal(pages.at(-1).sentenceEndIndex, splitSentences(chapter.text).length - 1);
  const paragraphs = new Map();
  for (const p of pages.flatMap(page => page.paragraphs)) paragraphs.set(p.index, (paragraphs.get(p.index) || '') + p.parts.map(part => part.text).join(''));
  const recovered = [...paragraphs.values()].join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(recovered, chapter.text.replace(/\s+/g,' ').trim());
});

test('publisher emphasis, headings and alignment survive on a page', () => {
  const chapter = {id:'c1', title:'Chapter', text:'A title\n\nSome emphasized words.', blocks:[
    {type:'h2',text:'A title',runs:[{text:'A title'}],style:{textAlign:'center'}},
    {type:'p',text:'Some emphasized words.',runs:[{text:'Some '},{text:'emphasized',fontStyle:'italic'},{text:' words.'}]},
  ]};
  const page = paginateBook({chapters:[chapter]}, 430).pages[0];
  assert.equal(page.paragraphs[0].type,'h2');
  assert.equal(page.paragraphs[0].style.textAlign,'center');
  assert.ok(page.paragraphs[1].parts.flatMap(p => p.runs).some(r => r.fontStyle === 'italic' && r.text === 'emphasized'));
});

test('inconsistent rich data falls back to the original complete text', () => {
  const chapter = {id:'c1',text:'Keep this original text.',blocks:[{text:'Wrong text'}]};
  assert.equal(paginateBook({chapters:[chapter]},430).pages[0].text, chapter.text);
});

test('PDF pages and chapter mapping are preserved', () => {
  const book = {sourcePages:['First page.','Second page.'],chapters:[{id:'c1',title:'One',startPage:0,endPage:1}]};
  const layout = paginateBook(book,430);
  assert.deepEqual(layout.pages.map(p=>p.text), book.sourcePages);
  assert.equal(layout.pages[1].sourcePage,2);
});
