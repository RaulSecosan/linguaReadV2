// Keep the original sentence boundaries: saved positions use these indices.
export const splitSentences = (text = "") => (
  text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []
).map((sentence) => sentence.trim()).filter(Boolean);

const flat = (text = "") => text.replace(/\s+/g, " ").trim();

export function chapterBlocks(chapter) {
  if (chapter.blocks?.length && flat(chapter.blocks.map((block) => block.text).join(" ")) === flat(chapter.text)) {
    return chapter.blocks;
  }
  // Legacy books retain paragraph separators even though they have no HTML.
  return String(chapter.text || "").split(/\n\s*\n/).filter((text) => text.trim()).map((text) => ({
    type: "p", text: flat(text), runs: [{ text: flat(text) }],
  }));
}

export function chapterTitle(chapter, index) {
  if (chapter.title && !/^unknown$/i.test(chapter.title.trim())) return chapter.title;
  const firstLine = String(chapter.text || "").trim().split("\n")[0].trim();
  return firstLine && firstLine.length < 90 ? firstLine : `Capitolul ${index + 1}`;
}

function slices(chapter) {
  let cursor = 0;
  const blocks = chapterBlocks(chapter).map((block, index) => {
    const text = flat(block.text);
    const result = { ...block, text, index, start: cursor, end: cursor + text.length };
    cursor += text.length + 1;
    return result;
  });
  const text = blocks.map((block) => block.text).join(" ");
  return [...text.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)].map((match, sentenceIndex) => {
    const start = match.index;
    const end = start + match[0].length;
    return {
      text: match[0].trim(), sentenceIndex,
      fragments: blocks.filter((block) => block.end > start && block.start < end).map((block) => {
        const from = Math.max(start, block.start) - block.start;
        const to = Math.min(end, block.end) - block.start;
        let offset = 0;
        const runs = (block.runs || [{ text: block.text }]).flatMap((run) => {
          const runStart = offset;
          offset += run.text.length;
          const content = run.text.slice(Math.max(0, from - runStart), Math.max(0, Math.min(run.text.length, to - runStart)));
          return content ? [{ ...run, text: content }] : [];
        });
        return { block, text: block.text.slice(from, to), runs, sentenceIndex };
      }),
    };
  }).filter((unit) => unit.text);
}

function pageFromUnits(units, chapter, title) {
  const paragraphs = [];
  for (let sentenceIndex = 0; sentenceIndex < units.length; sentenceIndex += 1) {
    for (const fragment of units[sentenceIndex].fragments) {
      let paragraph = paragraphs.at(-1);
      if (paragraph?.index !== fragment.block.index) {
        paragraph = { ...fragment.block, parts: [] };
        paragraphs.push(paragraph);
      }
      paragraph.parts.push({ ...fragment, sentenceIndex });
    }
  }
  return {
    text: units.map((unit) => unit.text).join(" "),
    sentences: units.map((unit) => unit.text), paragraphs,
    chapterId: chapter.id, chapterTitle: title,
    sentenceStartIndex: units[0]?.sentenceIndex || 0,
    sentenceEndIndex: units.at(-1)?.sentenceIndex || 0,
  };
}

export function paginateBook(book, wordsPerPage) {
  if (!book) return { pages: [], contents: [] };
  if (book.sourcePages?.length) {
    return {
      pages: book.sourcePages.map((text, index) => ({
        text, chapterId: book.chapters?.find((chapter) => index >= chapter.startPage && index <= chapter.endPage)?.id,
        chapterTitle: book.chapters?.find((chapter) => index >= chapter.startPage && index <= chapter.endPage)?.title || "Inceput",
        sourcePage: index + 1,
      })),
      contents: (book.chapters || []).map((chapter) => ({ id: chapter.id, title: chapter.title, page: chapter.startPage || 0 })),
    };
  }
  const chapters = book.chapters?.length ? book.chapters : [{ id: "chapter-1", title: book.title, text: book.text || "" }];
  const pages = [], contents = [];
  chapters.forEach((chapter, index) => {
    const title = chapterTitle(chapter, index);
    contents.push({ id: chapter.id, title, page: pages.length });
    let units = [], wordCount = 0;
    for (const unit of slices(chapter)) {
      const words = unit.text.split(/\s+/).filter(Boolean).length;
      if (units.length && wordCount + words > wordsPerPage) {
        pages.push(pageFromUnits(units, chapter, title));
        units = []; wordCount = 0;
      }
      units.push(unit); wordCount += words;
    }
    if (units.length) pages.push(pageFromUnits(units, chapter, title));
  });
  return { pages, contents };
}
