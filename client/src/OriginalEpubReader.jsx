import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "./api";
const normalizedWord = (word) => word.toLowerCase().replaceAll("’", "'");
// Find an old plain-text anchor in the untouched EPUB and convert it to a native CFI.
async function findAnchor(book, anchor) {
  const query = String(anchor || "").replace(/\s+/g, " ").trim().slice(0, 55);
  if (query.length < 12) return null;
  for (const section of book.spine.spineItems) {
    await section.load(book.load.bind(book));
    const match = section.search(query)[0] || section.search(query.slice(0, 28))[0];
    if (match) return match.cfi;
  }
  return null;
}
function flattenToc(toc) {
  return toc.flatMap((item) => [{ id: item.id || item.href, href: item.href, title: item.label.trim() }, ...flattenToc(item.subitems || [])]);
}
const OriginalEpubReader = forwardRef(function OriginalEpubReader({ book, vocabulary, onSelectWord, onContents, onChapter, onNotice, theme, fontSize, fontFamily, pageWidth, initialAnchor, legacyPages }, ref) {
  const viewport = useRef(null);
  const engine = useRef(null);
  const callbacks = useRef({ onSelectWord, onContents, onChapter, onNotice });
  callbacks.current = { onSelectWord, onContents, onChapter, onNotice };
  const words = useRef(vocabulary);
  words.current = vocabulary;
  const [status, setStatus] = useState("Se deschide EPUB-ul original...");
  const [location, setLocation] = useState(null);
  const locationRef = useRef(null);
  const [error, setError] = useState("");
  const refreshMarks = useRef(() => {});
  const [navigating, setNavigating] = useState(false);
  useImperativeHandle(ref, () => ({
    display: (target) => (engine.current?.jump?.(target) || engine.current?.rendition.display(target))?.catch((err) => callbacks.current.onNotice(err.message)),
    resume: async (position) => {
      if (!engine.current) throw new Error("Cartea inca se incarca. Incearca din nou dupa deschidere.");
      const target = position?.epubCfi || await findAnchor(engine.current.book, position?.anchorText || position?.sentence);
      if (target) await (engine.current.jump?.(target) || engine.current.rendition.display(target));
      else callbacks.current.onNotice("Pozitia originala nu a putut fi localizata; marcajul salvat a fost pastrat.");
    },
    save: async () => {
      const current = locationRef.current;
      if (!current) throw new Error("Pozitia nu este disponibila cat timp cartea se incarca.");
      const range = current.start?.cfi && await engine.current.book.getRange(current.start.cfi).catch(() => null);
      const anchor = range?.startContainer?.textContent?.slice(range.startOffset, range.startOffset + 180) || "";
      await api.saveReadingPosition(book.id, { ...book.savedPosition, epubCfi: current.start.cfi,
        page: Math.max(0, Math.round(current.start.percentage * (legacyPages - 1))), percent: Math.round(current.start.percentage * 100),
        chapterId: engine.current?.chapter?.id || "", sentenceIndex: 0,
        chapterTitle: engine.current?.chapter?.title || book.title, anchorText: anchor, sentence: anchor });
    },
  }), [book, legacyPages]);
  useEffect(() => {
    let active = true, epub, rendition, ready = false, userMoved = false, readingSteps = 0, resize, timer;
    const listeners = [];
    setStatus("Se deschide EPUB-ul original..."); setError(""); setLocation(null);
    const handleError = (err) => { if (active) { setError(err.message || "EPUB-ul nu a putut fi deschis."); setStatus(""); } };
    const markContents = (contents) => {
      const doc = contents.document, win = contents.window;
      const ranges = [];
      (contents._lrAnnotationCfis || []).forEach((cfi) => rendition.annotations.remove(cfi, "highlight"));
      contents._lrAnnotationCfis = [];
      const wanted = new Set(words.current.map((item) => normalizedWord(item.word)));
      const walker = doc.createTreeWalker(doc.body, 4);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest("script,style,svg")) continue;
        for (const match of node.textContent.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)) {
          if (!wanted.has(normalizedWord(match[0]))) continue;
          const range = doc.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length); ranges.push(range);
        }
      }
      // CSS highlights decorate ranges without rewriting the publisher's XHTML.
      if (win.CSS?.highlights && win.Highlight) win.CSS.highlights.set("lr-vocabulary", new win.Highlight(...ranges));
      else {
        // Native CFI annotations work on browsers without the CSS Highlight API.
        ranges.forEach((range) => {
          const cfi = contents.cfiFromRange(range);
          contents._lrAnnotationCfis.push(cfi);
          rendition.annotations.highlight(cfi, {}, null, "lr-vocabulary", { fill: "#e9be57", "fill-opacity": ".28", "mix-blend-mode": "multiply" });
        });
      }
    };
    (async () => {
      const { default: ePub } = await import("epubjs");
      if (!active) return;
      const binary = Uint8Array.from(atob(book.epubArchive), (c) => c.charCodeAt(0)).buffer;
      epub = ePub(binary, { replacements: "blobUrl" });
      await epub.ready;
      if (!active) { epub.destroy(); return; }
      rendition = epub.renderTo(viewport.current, { width: "100%", height: "100%", spread: "none", flow: "paginated", allowScriptedContent: false });
      engine.current = { book: epub, rendition };
      rendition.hooks.content.register((contents) => {
        if (!active) return;
        const doc = contents.document;
        // Preserve original CSS, fonts and images. Only add saved-word decoration.
        const style = doc.createElement("style"); style.dataset.linguaread = "highlights";
        style.textContent = "::highlight(lr-vocabulary){background-color:#eed88799;color:inherit;}";
        doc.head.appendChild(style);
        const select = (event) => {
          if (event.target.closest?.("a,button,input")) return;
          if (contents.window.getSelection()?.toString().trim()) return;
          let range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
          if (!range) { const position = doc.caretPositionFromPoint?.(event.clientX, event.clientY); if (position) { range = doc.createRange(); range.setStart(position.offsetNode, position.offset); } }
          const textNode = range?.startContainer, offset = range?.startOffset;
          if (textNode?.nodeType !== 3) return;
          const text = textNode.textContent;
          const match = [...text.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)].find((part) => offset >= part.index && offset <= part.index + part[0].length);
          if (!match) return;
          const paragraph = textNode.parentElement.closest("p,li,blockquote,div") || textNode.parentElement;
          const context = paragraph.textContent;
          const prefix = doc.createRange(); prefix.selectNodeContents(paragraph); prefix.setEnd(textNode, match.index);
          const sentenceOffset = prefix.toString().length;
          const sentences = [...context.matchAll(/[^.!?]+[.!?]+[”’"']?|[^.!?]+$/g)];
          const sentence = (sentences.find((part) => sentenceOffset >= part.index && sentenceOffset < part.index + part[0].length)?.[0] || context).replace(/\s+/g, " ").trim();
          callbacks.current.onSelectWord(match[0], sentence, 0, `epub-${Date.now()}`);
        };
        doc.addEventListener("click", select);
        listeners.push(() => doc.removeEventListener("click", select));
        markContents(contents);
      });
      refreshMarks.current = () => rendition.getContents().forEach(markContents);
      rendition.on("displayError", handleError);
      rendition.on("relocated", (next) => {
        if (!active) return;
        locationRef.current = next; setLocation(next);
        const section = epub.spine.get(next.start.cfi);
        const nativeText = section?.document?.querySelector("body")?.textContent || "";
        const normal = (text) => String(text || "").replace(/\s+/g, " ").trim();
        const prefix = normal(nativeText).slice(0, 100);
        const legacy = book.chapters?.find((chapter) => prefix.length > 15 && normal(chapter.text).includes(prefix));
        const tocEntry = flattenToc(epub.navigation.toc).find((item) => item.href.split("#")[0] === next.start.href.split("#")[0]);
        engine.current.chapter = { href: next.start.href, id: legacy?.id, title: tocEntry?.title || legacy?.title || book.title };
        callbacks.current.onChapter?.(engine.current.chapter);
        if (!ready || !userMoved) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const percent = Math.round(next.start.percentage * 100);
          const page = Math.max(0, Math.round(next.start.percentage * (legacyPages - 1)));
          const readingPages = readingSteps;
          readingSteps = 0; userMoved = false;
          api.updateProgress(book.id, { percent, page, position: page, epubCfi: next.start.cfi, readingPages }).catch((err) => callbacks.current.onNotice(err.message));
        }, 450);
      });
      const navigation = await epub.loaded.navigation;
      await epub.locations.generate(1000);
      if (!active) return;
      const target = book.progress?.epubCfi || await findAnchor(epub, initialAnchor);
      await rendition.display(target || (book.progress?.percent > 0 ? epub.locations.cfiFromPercentage(Math.min(.999, book.progress.percent / 100)) : undefined));
      if (!active) return;
      ready = true; setStatus("");
      callbacks.current.onContents(flattenToc(navigation.toc));
      // Automatic layout/restore events must never advance or overwrite saved progress.
      engine.current.move = async (direction) => { userMoved = true; if (direction === "next") readingSteps += 1; await rendition[direction](); };
      engine.current.jump = async (target) => { userMoved = true; readingSteps = 0; await rendition.display(target); };
      let lastWidth = viewport.current.clientWidth, lastHeight = viewport.current.clientHeight;
      resize = new ResizeObserver(() => {
        if (!active || !viewport.current) return;
        const width = viewport.current.clientWidth, height = viewport.current.clientHeight;
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width; lastHeight = height;
        rendition.resize(width, height, locationRef.current?.start?.cfi || target);
      });
      resize.observe(viewport.current);
    })().catch(handleError);
    return () => { active = false; ready = false; clearTimeout(timer); resize?.disconnect(); listeners.forEach((off) => off()); engine.current = null; rendition?.q.clear(); rendition?.q.stop(); rendition?.destroy(); epub?.destroy(); };
  }, [book.id, book.epubArchive]);
  useEffect(() => { refreshMarks.current(); }, [vocabulary]);
  useEffect(() => {
    const rendition = engine.current?.rendition;
    if (!rendition) return;
    if (theme === "dark") rendition.themes.register("lr-dark", { body: { background: "#172320 !important", color: "#e1e8e4 !important" }, "p,h1,h2,h3,h4,span,div": { color: "inherit !important" } });
    else rendition.themes.register("lr-original", {});
    rendition.themes.select(theme === "dark" ? "lr-dark" : "lr-original");
  }, [theme, status]);
  useEffect(() => { if (fontSize) engine.current?.rendition.themes.fontSize(`${fontSize}px`); }, [fontSize, status]);
  useEffect(() => { if (fontFamily) engine.current?.rendition.themes.font(fontFamily); else engine.current?.rendition.themes.removeOverride("font-family"); }, [fontFamily, status]);
  const move = async (direction) => {
    if (navigating || !engine.current?.move) return;
    setNavigating(true);
    try { await engine.current.move(direction); } catch (err) { callbacks.current.onNotice(err.message); }
    finally { setNavigating(false); }
  };
  return <div className="original-epub">
    <article className="reader-page epub-reader-page" style={{ maxWidth: pageWidth, marginInline: "auto" }}>
      {status && <div role="status" className="epub-status">{status}</div>}
      {error && <div role="alert" className="quiz-error">{error} Textul si marcajele salvate sunt pastrate.</div>}
      <div className="epub-viewport" ref={viewport} aria-label="Continut EPUB original" />
      {location && <div className="epub-location" data-epub-cfi={location.start.cfi}>{Math.round(location.start.percentage * 100)}% · {location.start.displayed.page} / {location.start.displayed.total} in sectiune</div>}
    </article>
    <div className="page-navigation">
      <button className="secondary-button" disabled={!location || location.atStart || navigating} onClick={() => move("prev")}><ChevronLeft size={18} />Anterioara</button>
      <button className="primary-button" disabled={!location || location.atEnd || navigating} onClick={() => move("next")}>Urmatoarea<ChevronRight size={18} /></button>
    </div>
  </div>;
});
export default OriginalEpubReader;
