import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {extractReadingBlocks,blocksText} from '../shared/epubStructure.mjs';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const {DOMParser}=require('linkedom');
const parseDocument=html=>new DOMParser().parseFromString(html,'text/html');
const parse=(source,stylesheets=[])=>extractReadingBlocks(`<html><body>${source}</body></html>`,{parseDocument,stylesheets});

test('EPUB XHTML retains dialogue, block elements and inline emphasis without added spaces',()=>{
  const blocks=parse('<h1>Chapter One</h1><p>“First speaker,” she said.</p><p>“Second <em>speaker</em>.”</p><blockquote><p>A quotation.</p></blockquote><ul><li>Item one</li><li>Item two</li></ul><p>can<strong>not</strong> stop.</p>');
  assert.equal(blocks.length,7);
  assert.equal(blocks[0].type,'h1');
  assert.equal(blocks[3].type,'blockquote');
  assert.equal(blocks[4].type,'li');
  assert.equal(blocks[4].list,'unordered');
  assert.equal(blocks[5].listNumber,2);
  assert.equal(blocks[6].text,'cannot stop.');
  assert.ok(blocks[2].runs.some(r=>r.text==='speaker'&&r.fontStyle==='italic'));
  assert.match(blocksText(blocks),/said\.\n\n“Second/);
});

test('publisher CSS formatting is retained but executable and layout-breaking styles are rejected',()=>{
  const blocks=parse('<p class="center">Centered</p><p class="secret">Hidden</p><p style="position:fixed; text-indent:1.5em; background:url(https://bad.example);color:transparent" onclick="alert(1)">Visible</p><script>evil()</script>', ['.center { text-align:center; font-style:italic; } .secret { display:none; }']);
  assert.equal(blocks.length,2);
  assert.equal(blocks[0].style.textAlign,'center');
  assert.equal(blocks[0].runs[0].fontStyle,'italic');
  assert.equal(blocks[1].style.textIndent,'1.5em');
  assert.ok(!JSON.stringify(blocks).includes('evil'));
  assert.ok(!JSON.stringify(blocks).includes('bad.example'));
});

test('line breaks separate verse or dialogue and scripts never appear',()=>{
  assert.deepEqual(parse('<p>First line<br/>Second line</p><hr/><p>Third &amp; final.</p>').map(b=>b.text),['First line','Second line','* * *','Third & final.']);
});
