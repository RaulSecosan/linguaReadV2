import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "./api";
import { installWordInteractions } from "./epubInteraction";
const normalizedWord = (word) => word.toLowerCase().replaceAll("’", "'");
// Find an old plain-text anchor in the untouched EPUB and convert it to a native CFI.
async function findAnchor(book, anchor) {
  const query = String(anchor || "").replace(/\s+/g, " ").trim().slice(0, 55);
  if (query.length < 12) return null;
  for (const section of book.spine.spineItems) {
    await section.load(book.load.bind(book));
    const match = section.search(query)[0] || section.search(query.slice(0, 28))[0];
    if (match) {
      const { default: ePub } = await import("epubjs");
      const point = new ePub.CFI(match.cfi);
      point.collapse(true);
      return point.toString();
    }
  }
  return null;
}
function flattenToc(toc) {
  return toc.flatMap((item) => [{ id: item.id || item.href, href: item.href, title: item.label.trim() }, ...flattenToc(item.subitems || [])]);
}
const OriginalEpubReader = forwardRef(function OriginalEpubReader({ book, vocabulary, selectedWord, onSelectWord, onContents, onChapter, onNotice, theme, fontSize, fontFamily, pageWidth, initialAnchor, legacyPages }, ref) {
  const viewport = useRef(null);
  const engine = useRef(null);
  const callbacks = useRef({ onSelectWord, onContents, onChapter, onNotice });
  callbacks.current = { onSelectWord, onContents, onChapter, onNotice };
  const selectedRef = useRef({ word: selectedWord, cfi: null });
  if (!selectedWord) selectedRef.current = { word: "", cfi: null };
  const words = useRef(vocabulary);
  words.current = vocabulary;
  const [status, setStatus] = useState("Se deschide EPUB-ul original...");
  const [location, setLocation] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState("");
  const locationRef = useRef(null);
  const [error, setError] = useState("");
  const refreshMarks = useRef(() => {});
  const [navigating, setNavigating] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 650px)").matches);
  const appliedFontSize = fontSize || (mobile ? 19 : null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 650px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
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
    let active = true, epub, rendition, ready = false, userMoved = false, readingSteps = 0, restorationAttempts = 0, resize, timer;
    const listeners = [];
    setStatus("Se deschide EPUB-ul original..."); setError(""); setLocation(null);
    const handleError = (err) => { if (active) { setError(err.message || "EPUB-ul nu a putut fi deschis."); setStatus(""); } };
    const markContents = (contents) => {
      const doc = contents.document, win = contents.window;
      const ranges = [];
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
      contents._lrWordInteractions?.setSavedRanges(ranges);
    };
    (async () => {
      const { default: ePub } = await import("epubjs");
      if (!active) return;
      const binary = Uint8Array.from(atob(book.epubArchive), (c) => c.charCodeAt(0)).buffer;
      epub = ePub(binary, { replacements: "blobUrl" });
      await epub.ready;
      if (!active) { epub.destroy(); return; }
      rendition = epub.renderTo(viewport.current, { width: "100%", height: "100%", spread: "none", flow: "paginated", allowScriptedContent: false });
      engine.current = { book: epub, rendition, theme, fontSize: appliedFontSize, fontFamily };
      rendition.themes.register("lr-dark", { body: { background: "#172320 !important", color: "#e1e8e4 !important" }, "p,h1,h2,h3,h4,span,div": { color: "inherit !important" } });
      rendition.themes.register("lr-original", {});
      rendition.themes.select(theme === "dark" ? "lr-dark" : "lr-original");
      if (appliedFontSize) rendition.themes.fontSize(`${appliedFontSize}px`);
      if (fontFamily) rendition.themes.font(fontFamily);
      rendition.hooks.content.register((contents) => {
        if (!active) return;
        const doc = contents.document;
        // Preserve original CSS, fonts and images. Only add saved-word decoration.
        const style = doc.createElement("style"); style.dataset.linguaread = "highlights";
        style.textContent = "html,body{background:transparent!important;} ::highlight(lr-vocabulary){background-color:#eed88799;color:inherit;}";
        doc.head.appendChild(style);
        const interactions = installWordInteractions(contents, (word, sentence, cfi) => {
          selectedRef.current = { word, cfi };
          callbacks.current.onSelectWord(word, sentence, 0, `epub-${Date.now()}`);
        });
        contents._lrWordInteractions = interactions;
        listeners.push(() => interactions.destroy());
        markContents(contents);
        interactions.restoreSelection(selectedRef.current.word, selectedRef.current.cfi);
      });
      refreshMarks.current = () => rendition.getContents().forEach(markContents);
      rendition.on("displayError", handleError);
      rendition.on("relocated", (next) => {
        if (!active || !engine.current) return;
        const anchor = engine.current.anchorCfi;
        const includesAnchor = !anchor || (rendition.epubcfi.compare(next.start.cfi, anchor) <= 0 && rendition.epubcfi.compare(anchor, next.end.cfi) <= 0);
        // Layout can temporarily report the section start while rebuilding columns.
        // Keep the reading anchor independent of those intermediate reports.
        if (!userMoved && !includesAnchor) {
          if (ready && ++restorationAttempts <= 3) rendition.display(anchor).catch(handleError);
          return;
        }
        restorationAttempts = 0;
        if (userMoved || !anchor) engine.current.anchorCfi = next.start.cfi;
        const globalPage = Math.max(1, epub.locations.locationFromCfi(next.start.cfi) + 1);
        const globalTotal = Math.max(1, epub.locations.length());
        locationRef.current = next; setLocation({ ...next, globalPage, globalTotal });
        rendition.getContents().forEach((contents) => {
          contents._lrWordInteractions?.restoreSelection(selectedRef.current.word, selectedRef.current.cfi);
          contents._lrWordInteractions?.redraw();
        });
        const section = epub.spine.get(next.start.cfi);
        const nativeText = section?.document?.querySelector("body")?.textContent || "";
        const normal = (text) => String(text || "").replace(/\s+/g, " ").trim();
        const prefix = normal(nativeText).slice(0, 100);
        const legacy = book.chapters?.find((chapter) => prefix.length > 15 && normal(chapter.text).includes(prefix));
        const tocEntry = flattenToc(epub.navigation.toc).find((item) => item.href.split("#")[0] === next.start.href.split("#")[0]);
        engine.current.chapter = { href: next.start.href, id: legacy?.id, title: tocEntry?.title || legacy?.title || book.title };
        callbacks.current.onChapter?.(engine.current.chapter);
        if (!ready || !userMoved) return;
        userMoved = false;
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
      setRestoreTarget(target || "");
      const initialPosition = target || (book.progress?.percent > 0 ? epub.locations.cfiFromPercentage(Math.min(.999, book.progress.percent / 100)) : undefined);
      engine.current.anchorCfi = initialPosition || null;
      // First render the section. Position ranges are reliable once its iframe and fonts have a layout.
      const initialSection = initialPosition ? epub.spine.get(initialPosition) : null;
      await new Promise((resolve, reject) => {
        rendition.once("relocated", resolve);
        rendition.display(initialSection?.href).catch(reject);
      });
      await Promise.all(rendition.getContents().map((contents) => contents.document.fonts?.ready));
      if (!active) return;
      if (initialPosition) await new Promise((resolve, reject) => {
        rendition.once("relocated", resolve);
        rendition.display(initialPosition).catch(reject);
      });
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
        rendition.resize(width, height, engine.current?.anchorCfi || locationRef.current?.start?.cfi || target);
      });
      resize.observe(viewport.current);
    })().catch(handleError);
    return () => { active = false; ready = false; clearTimeout(timer); resize?.disconnect(); listeners.forEach((off) => off()); engine.current = null; rendition?.q.clear(); rendition?.q.stop(); rendition?.destroy(); epub?.destroy(); };
  }, [book.id, book.epubArchive]);
  useEffect(() => { refreshMarks.current(); }, [vocabulary]);
  useEffect(() => { engine.current?.rendition.getContents().forEach((contents) => contents._lrWordInteractions?.syncSelection(selectedWord)); }, [selectedWord]);
  useEffect(() => {
    const current = engine.current;
    if (!current || status) return;
    const { rendition } = current;
    const cfi = current.anchorCfi || locationRef.current?.start?.cfi;
    let changed = false;
    if (current.theme !== theme) {
      current.theme = theme;
      rendition.themes.select(theme === "dark" ? "lr-dark" : "lr-original"); changed = true;
    }
    if (current.fontSize !== appliedFontSize) {
      current.fontSize = appliedFontSize;
      if (appliedFontSize) rendition.themes.fontSize(`${appliedFontSize}px`);
      else rendition.themes.removeOverride("font-size");
      changed = true;
    }
    if (current.fontFamily !== fontFamily) {
      current.fontFamily = fontFamily;
      if (fontFamily) rendition.themes.font(fontFamily);
      else rendition.themes.removeOverride("font-family");
      changed = true;
    }
    // Apply initial styles before display; later user changes retain the current CFI.
    if (changed && cfi) {
      const frame = requestAnimationFrame(() => { if (engine.current === current) rendition.display(cfi).catch((err) => callbacks.current.onNotice(err.message)); });
      return () => cancelAnimationFrame(frame);
    }
  }, [theme, appliedFontSize, fontFamily, status]);
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
      <div className="epub-viewport" ref={viewport} data-restore-target={restoreTarget} data-restore-anchor={initialAnchor} aria-label="Continut EPUB original" />
      {location && <div className="epub-location" title="Pozitii EPUB globale, stabile pe intreaga carte. Numarul paginilor afisate depinde de ecran si font." data-epub-cfi={location.start.cfi}>Pozitia {location.globalPage} din {location.globalTotal} in carte · {Math.round(location.start.percentage * 100)}%</div>}
    </article>
    <div className="page-navigation">
      <button className="secondary-button" disabled={Boolean(status) || !location || location.atStart || navigating} onClick={() => move("prev")}><ChevronLeft size={18} />Anterioara</button>
      <button className="primary-button" disabled={Boolean(status) || !location || location.atEnd || navigating} onClick={() => move("next")}>Urmatoarea<ChevronRight size={18} /></button>
    </div>
  </div>;
});
export default OriginalEpubReader;
