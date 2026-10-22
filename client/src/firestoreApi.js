import { normalizeCoach } from "../../shared/coachPresentation.mjs";
import { extractReadingBlocks, blocksText } from "../../shared/epubStructure.mjs";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { firestoreDb } from "./firebase";

const root = import.meta.env.VITE_FIRESTORE_COLLECTION || "linguaread";
const rootDoc = import.meta.env.VITE_FIRESTORE_DOCUMENT || "main";
const aiProxyUrl = import.meta.env.VITE_AI_PROXY_URL || "";
const rootRef = doc(firestoreDb, root, rootDoc);
const booksRef = collection(rootRef, "books");
const vocabularyRef = collection(rootRef, "vocabulary");
const chunkSize = 180_000;

function newId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const firestoreApi = {
  books: async () => {
    await ensureRoot();
    const snapshot = await getDocs(query(booksRef, orderBy("createdAt", "desc")));
    return snapshot.docs.map((item) => item.data());
  },
  book: async (id) => {
    const snapshot = await getDoc(doc(booksRef, id));
    if (!snapshot.exists()) throw new Error("Cartea nu a fost gasita.");
    const book = snapshot.data();
    const content = normalizeBookContent(await getBookContent(id));
    return { ...book, ...content };
  },
  uploadBook: async (formData) => {
    await ensureRoot();
    const book = await buildUploadedBook(formData);
    const { text, chapters, sourcePages, ...metadata } = book;
    await setDoc(doc(booksRef, book.id), metadata);
    await saveBookContent(book.id, { text, chapters, sourcePages });
    return book;
  },
  updateBook: async (bookId, formData) => {
    const patch = {};
    if (typeof formData.get("title") === "string" && formData.get("title").trim()) {
      patch.title = formData.get("title").trim();
    }
    if (typeof formData.get("author") === "string") patch.author = formData.get("author").trim();
    const cover = formData.get("cover");
    if (cover instanceof File && cover.size) patch.coverUrl = await imageToCoverDataUrl(cover);
    patch.updatedAt = new Date().toISOString();
    await updateDoc(doc(booksRef, bookId), patch);
    return firestoreApi.book(bookId);
  },
  deleteBook: async (bookId, keepVocabulary = false) => {
    await deleteDoc(doc(booksRef, bookId));
    await deleteContentChunks(bookId);
    if (!keepVocabulary) {
      const vocab = await getDocs(vocabularyRef);
      await Promise.all(vocab.docs.filter((item) => item.data().bookId === bookId).map((item) => deleteDoc(item.ref)));
    }
    return true;
  },
  updateProgress: async (bookId, payload) => {
    const bookRef = doc(booksRef, bookId);
    const bookSnapshot = await getDoc(bookRef);
    if (!bookSnapshot.exists()) throw new Error("Cartea nu a fost gasita.");
    const book = bookSnapshot.data();
    const nextPage = Math.max(0, Number(payload.page) || 0);
    const previousPage = Math.max(0, Number(book.progress?.page) || 0);
    const deltaPages = Math.max(0, nextPage - previousPage);
    const nextProgress = {
      percent: Number(payload.percent) || 0,
      position: Number(payload.position) || 0,
      page: nextPage,
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(bookRef, { progress: nextProgress });
    if (deltaPages > 0) {
      await recordDailyActivity("reading", {
        bookId,
        bookTitle: book.title,
        pagesRead: deltaPages,
        readingMinutes: estimateReadingMinutes(deltaPages),
      });
    }
    return nextProgress;
  },
  saveReadingPosition: (bookId, payload) => {
    const savedPosition = {
      page: Math.max(0, Number(payload.page) || 0),
      sourcePage: payload.sourcePage ? Math.max(1, Number(payload.sourcePage) || 1) : null,
      chapterId: String(payload.chapterId || ""),
      sentenceIndex: Math.max(0, Number(payload.sentenceIndex) || 0),
      percent: Math.max(0, Math.min(100, Number(payload.percent) || 0)),
      chapterTitle: String(payload.chapterTitle || ""),
      sentence: String(payload.sentence || ""),
      anchorText: String(payload.anchorText || payload.sentence || ""),
      savedAt: new Date().toISOString(),
    };
    return updateDoc(doc(booksRef, bookId), { savedPosition }).then(() => savedPosition);
  },
  addBookmark: async (bookId, payload) => {
    const book = await firestoreApi.book(bookId);
    const item = {
      id: newId(),
      label: payload.label || "Bookmark",
      position: Number(payload.position) || 0,
      page: Math.max(0, Number(payload.page) || 0),
      percent: Number(payload.percent) || 0,
      createdAt: new Date().toISOString(),
    };
    await updateDoc(doc(booksRef, bookId), { bookmarks: [item, ...(book.bookmarks || [])] });
    return item;
  },
  deleteBookmark: async (bookId, bookmarkId) => {
    const book = await firestoreApi.book(bookId);
    await updateDoc(doc(booksRef, bookId), {
      bookmarks: (book.bookmarks || []).filter((bookmark) => bookmark.id !== bookmarkId),
    });
    return true;
  },
  vocabulary: async (params = {}) => filterVocabulary(await allVocabulary(), params),
  saveVocabulary: async (payload) => {
    const bookSnapshot = await getDoc(doc(booksRef, payload.bookId));
    if (!bookSnapshot.exists()) throw new Error("Cartea nu a fost gasita.");
    const book = bookSnapshot.data();
    const normalized = normalizeWord(payload.word);
    const existing = (await allVocabulary()).find((item) =>
      item.bookId === book.id && normalizeWord(item.word) === normalized
    );
    const now = new Date().toISOString();
    const item = existing ? {
      ...existing,
      translation: payload.translation || existing.translation,
      sentence: payload.sentence || existing.sentence,
      sentenceRo: payload.sentenceRo || existing.sentenceRo,
      explanation: payload.explanation || existing.explanation,
      updatedAt: now,
    } : {
      id: newId(),
      bookId: book.id,
      bookTitle: book.title,
      word: payload.word,
      translation: payload.translation,
      sentence: payload.sentence,
      sentenceRo: payload.sentenceRo,
      explanation: payload.explanation || "",
      model: payload.model || "local",
      learned: false,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(vocabularyRef, item.id), item);
    return item;
  },
  updateVocabulary: async (id, payload) => {
    const ref = doc(vocabularyRef, id);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) throw new Error("Cuvantul nu a fost gasit.");
    const patch = { updatedAt: new Date().toISOString() };
    if (typeof payload.learned === "boolean") patch.learned = payload.learned;
    if (typeof payload.translation === "string") patch.translation = payload.translation.trim();
    if (typeof payload.sentence === "string") patch.sentence = payload.sentence.trim();
    if (typeof payload.sentenceRo === "string") patch.sentenceRo = payload.sentenceRo.trim();
    if (typeof payload.explanation === "string") patch.explanation = payload.explanation.trim();
    if (typeof payload.notes === "string") patch.notes = payload.notes.trim();
    await updateDoc(ref, patch);
    return { ...snapshot.data(), ...patch };
  },
  deleteVocabulary: (id) => deleteDoc(doc(vocabularyRef, id)),
  translate: async ({ word, sentence, model }) => {
    if (model === "ollama") {
      throw new Error("Mistral local nu poate rula din Firebase Hosting. Alege ChatGPT API.");
    }
    if (aiProxyUrl) return aiProxyRequest("/translate", { word, sentence });
    return {
      translation: word,
      sentenceRo: sentence,
      explanation: "Traducere locala temporara. Pentru ChatGPT real, proiectul Firebase trebuie trecut pe Blaze ca sa putem rula functia OpenAI fara sa expunem cheia in browser.",
      provider: "local",
    };
  },
  summary: async ({ bookId, chapterId }) => {
    const book = await firestoreApi.book(bookId);
    const chapter = book.chapters?.find((item) => item.id === chapterId) || book.chapters?.[0];
    if (aiProxyUrl) {
      return aiProxyRequest("/summary", {
        text: chapter?.text || book.text || "",
        chapterTitle: chapter?.title || book.title,
      });
    }
    return {
      summary: (chapter?.text || book.text || "").split(/(?<=[.!?])\s+/).slice(0, 3).join(" "),
      mainIdeas: ["Reciteste capitolul", "Salveaza expresiile utile", "Revizuieste cuvintele marcate"],
      provider: "local",
    };
  },
  difficulty: async ({ bookId }) => analyzeText((await firestoreApi.book(bookId)).text || ""),
  quiz: async ({ bookId, chapterId, count = 3 }) => {
    const book = await firestoreApi.book(bookId);
    const chapter = book.chapters?.find((item) => item.id === chapterId) || book.chapters?.[0];
    if (aiProxyUrl) {
      const result = await aiProxyRequest("/quiz", {
        text: chapter?.text || book.text || "",
        count,
        bookTitle: book.title,
        chapterTitle: chapter?.title || book.title,
      });
      return { ...result, bookTitle: book.title, chapterTitle: chapter?.title || book.title };
    }
    const sentences = (chapter?.text || book.text || "").split(/(?<=[.!?])\s+/).filter((item) => item.length > 30);
    return {
      questions: sentences.slice(0, Math.max(1, Number(count) || 3)).map((sentence, index) => ({
        id: `local-${index + 1}`,
        question: "Care propozitie apare in capitol?",
        options: [sentence.slice(0, 180), "Aceasta optiune este un distractor local.", "Capitolul nu contine aceasta afirmatie.", "Textul vorbeste despre un subiect diferit."],
        correctIndex: 0,
        explanation: "Raspunsul corect este extras direct din text.",
      })),
      bookTitle: book.title,
      chapterTitle: chapter?.title || book.title,
      provider: "local",
    };
  },
  coach: async () => buildCoachDashboard(await firestoreState()),
  generateCoach: async () => {
    const state = await firestoreState();
    if (aiProxyUrl) {
      const result = await aiProxyRequest("/coach", {
        vocabulary: state.vocabulary.slice(0, 80),
        books: state.books,
        statistics: computeStatistics(state),
      });
      state.coach.latest = result;
      await setDoc(rootRef, { coach: state.coach }, { merge: true });
      return buildCoachDashboard(state);
    }
    return buildCoachDashboard(state);
  },
  updateCoachTask: async (date, taskId, completed) => {
    const state = await firestoreState();
    buildCoachDashboard(state);
    const record = state.coach?.dailyProgress?.[date];
    const task = record?.tasks?.find((item) => item.id === taskId);
    if (!task) throw new Error("Task-ul zilnic nu a fost gasit.");
    task.completed = Boolean(completed);
    task.completedAt = task.completed ? new Date().toISOString() : null;
    record.updatedAt = new Date().toISOString();
    if (task.completed) {
      applyActivity(state.coach, date, "task", {
        taskId: task.id,
        taskType: task.type,
        taskTitle: task.title,
      });
    }
    await setDoc(rootRef, { coach: state.coach }, { merge: true });
    return buildCoachDashboard(state);
  },
  recordActivity: async (type, payload = {}) => {
    await recordDailyActivity(type, payload);
    return true;
  },
  statistics: async () => computeStatistics(await firestoreState()),
  exportVocabulary: async (params = {}) => {
    const rows = filterVocabulary(await allVocabulary(), params).map((item) => ({
      book: item.bookTitle,
      word: item.word,
      translation: item.translation,
      sentence: item.sentence,
      sentence_ro: item.sentenceRo,
      learned: item.learned ? "yes" : "no",
      created_at: item.createdAt,
    }));
    downloadCsv(rows);
  },
  exportUrl: () => "#",
};

async function ensureRoot() {
  const snapshot = await getDoc(rootRef);
  if (!snapshot.exists()) await setDoc(rootRef, { coach: { dailyActivity: {}, dailyProgress: {} } }, { merge: true });
}

async function buildUploadedBook(formData) {
  const file = formData.get("book");
  if (!file) throw new Error("Fisierul cartii este obligatoriu.");
  const id = newId();
  const extracted = await extractBook(file);
  const cover = formData.get("cover");
  const title = String(formData.get("title") || extracted.metadata?.title || "").trim()
    || file.name.replace(/\.[^.]+$/, "")
    || "Carte fara titlu";
  const analysis = analyzeText(extracted.text);
  return {
    id,
    title,
    author: String(formData.get("author") || extracted.metadata?.author || "").trim(),
    fileType: fileExtension(file.name),
    originalName: file.name,
    coverUrl: cover instanceof File && cover.size ? await imageToCoverDataUrl(cover) : "",
    text: extracted.text,
    structureVersion: extracted.structureVersion || 2,
    chapters: extracted.chapters,
    sourcePages: extracted.sourcePages || [],
    wordCount: analysis.wordCount,
    pageCount: extracted.sourcePages?.length || Math.max(1, Math.ceil(analysis.wordCount / 250)),
    analysis,
    createdAt: new Date().toISOString(),
    progress: { percent: 0, position: 0, page: 0, updatedAt: new Date().toISOString() },
    bookmarks: [],
  };
}

async function extractBook(file) {
  const extension = fileExtension(file.name);
  if (extension === "txt") {
    const text = normalizeText(await file.text());
    return { text, chapters: detectTextChapters(text), sourcePages: [] };
  }
  if (extension === "pdf") return extractPdf(file);
  if (extension === "epub") return extractEpub(file);
  throw new Error("Format neacceptat. Foloseste TXT, PDF sau EPUB.");
}

async function extractPdf(file) {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const sourcePages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    let previousY;
    let text = "";
    for (const item of content.items) {
      const y = item.transform?.[5];
      text += previousY === undefined || Math.abs(y - previousY) < 2 ? `${item.str} ` : `\n${item.str} `;
      previousY = y;
    }
    sourcePages.push(normalizeText(text));
  }
  const text = normalizeText(sourcePages.join("\n\n"));
  if (!text) throw new Error("Nu am gasit text in PDF.");
  return { text, sourcePages, chapters: detectPdfChapters(sourcePages), structureVersion: 2 };
}

export async function extractEpub(file) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("EPUB invalid: lipseste META-INF/container.xml.");
  const container = new DOMParser().parseFromString(containerXml, "application/xml");
  const opfPath = container.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("EPUB invalid: nu am gasit fisierul OPF.");
  const opfXml = await zip.file(opfPath)?.async("text");
  const opf = new DOMParser().parseFromString(opfXml, "application/xml");
  const opfDir = opfPath.split("/").slice(0, -1).join("/");
  const manifest = new Map([...opf.querySelectorAll("manifest item")].map((item) => [item.getAttribute("id"), item]));
  const docs = [];
  for (const itemref of [...opf.querySelectorAll("spine itemref")]) {
    const item = manifest.get(itemref.getAttribute("idref"));
    const href = item?.getAttribute("href");
    if (!href || itemref.getAttribute("linear") === "no") continue;
    const entryPath = normalizeZipPath([opfDir, href.split("#")[0]].filter(Boolean).join("/"));
    const html = await zip.file(entryPath)?.async("text");
    if (!html) continue;
    const htmlDoc = new DOMParser().parseFromString(html, "text/html");
    const stylesheets = await Promise.all([...htmlDoc.querySelectorAll('link[rel="stylesheet"]')].map(async (link) => {
      const path = normalizeZipPath([entryPath.split("/").slice(0, -1).join("/"), link.getAttribute("href") || ""].filter(Boolean).join("/"));
      return await zip.file(path)?.async("text") || "";
    }));
    const blocks = extractReadingBlocks(html, { stylesheets });
    const text = blocksText(blocks);
    if (text) docs.push({ path: entryPath, html, text, blocks });
  }
  const navigation = await extractEpubNavigation(zip, opf, opfDir, manifest);
  const metadata = {
    title: normalizeText(opf.querySelector("metadata title")?.textContent || ""),
    author: normalizeText(opf.querySelector("metadata creator")?.textContent || ""),
  };
  const chapters = docs.map((item, index) => {
    const navTitle = navigation.find((entry) => entry.path === item.path)?.title;
    return {
      id: `chapter-${index + 1}`,
      title: cleanChapterTitle(navTitle || extractHtmlTitle(item.html) || deriveChapterTitle(item.text, index)),
      text: item.text,
      blocks: item.blocks,
    };
  });
  const text = normalizeText(chapters.map((chapter) => chapter.text).join("\n\n"));
  if (!text) throw new Error("Nu am gasit text in EPUB.");
  return { text, chapters, metadata, sourcePages: [], structureVersion: 4 };
}

async function extractEpubNavigation(zip, opf, opfDir, manifest) {
  const navItem = [...manifest.values()].find((item) =>
    String(item.getAttribute("properties") || "").split(/\s+/).includes("nav")
  );
  if (navItem?.getAttribute("href")) {
    const navPath = normalizeZipPath([opfDir, navItem.getAttribute("href")].filter(Boolean).join("/"));
    const html = await zip.file(navPath)?.async("text");
    if (html) {
      const navDir = navPath.split("/").slice(0, -1).join("/");
      const links = parseNavigationLinks(html, navDir);
      if (links.length) return links;
    }
  }

  const tocId = opf.querySelector("spine")?.getAttribute("toc");
  const ncxItem = manifest.get(tocId) || [...manifest.values()].find((item) =>
    item.getAttribute("media-type") === "application/x-dtbncx+xml"
  );
  if (ncxItem?.getAttribute("href")) {
    const ncxPath = normalizeZipPath([opfDir, ncxItem.getAttribute("href")].filter(Boolean).join("/"));
    const xml = await zip.file(ncxPath)?.async("text");
    if (xml) {
      const ncx = new DOMParser().parseFromString(xml, "application/xml");
      const ncxDir = ncxPath.split("/").slice(0, -1).join("/");
      return [...ncx.querySelectorAll("navPoint")].map((point) => ({
        title: cleanChapterTitle(point.querySelector("navLabel text")?.textContent || ""),
        path: normalizeZipPath([ncxDir, point.querySelector("content")?.getAttribute("src")?.split("#")[0] || ""].filter(Boolean).join("/")),
      })).filter((item) => item.title && item.path);
    }
  }
  return [];
}

function parseNavigationLinks(html, navDir) {
  const navMatch = html.match(/<nav\b[^>]*(?:epub:type|type)\s*=\s*["'](?:[^"']*\s)?toc(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/nav>/i);
  const source = navMatch?.[1] || html;
  return [...source.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      title: cleanChapterTitle(htmlToText(match[2])),
      path: normalizeZipPath([navDir, decodeHtml(match[1]).split("#")[0]].filter(Boolean).join("/")),
    }))
    .filter((item) => item.title && item.path);
}

async function saveBookContent(bookId, content) {
  await deleteContentChunks(bookId);
  const payload = JSON.stringify(content);
  const chunks = payload.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, "g")) || [""];
  await Promise.all(chunks.map((chunk, index) => setDoc(doc(rootRef, "bookContent", `${bookId}-${index}`), {
    bookId,
    index,
    chunk,
    total: chunks.length,
  })));
}

async function getBookContent(bookId) {
  const snapshot = await getDocs(collection(rootRef, "bookContent"));
  const chunks = snapshot.docs
    .map((item) => item.data())
    .filter((item) => item.bookId === bookId)
    .sort((a, b) => a.index - b.index);
  if (!chunks.length) return { text: "", chapters: [], sourcePages: [] };
  return JSON.parse(chunks.map((item) => item.chunk).join(""));
}

function normalizeBookContent(content) {
  const chapters = (content.chapters || []).map((chapter, index) => ({
    ...chapter,
    title: cleanChapterTitle(chapter.title) === "Unknown"
      ? deriveChapterTitle(chapter.text || "", index)
      : cleanChapterTitle(chapter.title || deriveChapterTitle(chapter.text || "", index)),
  }));
  return { ...content, chapters };
}

async function deleteContentChunks(bookId) {
  const snapshot = await getDocs(collection(rootRef, "bookContent"));
  await Promise.all(snapshot.docs.filter((item) => item.data().bookId === bookId).map((item) => deleteDoc(item.ref)));
}

async function allVocabulary() {
  const snapshot = await getDocs(vocabularyRef);
  return snapshot.docs.map((item) => item.data()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function firestoreState() {
  const [books, vocabulary, rootSnapshot] = await Promise.all([
    firestoreApi.books(),
    allVocabulary(),
    getDoc(rootRef),
  ]);
  return { books, vocabulary, coach: rootSnapshot.data()?.coach || {} };
}

async function recordDailyActivity(type, payload = {}) {
  const snapshot = await getDoc(rootRef);
  const rootData = snapshot.data() || {};
  rootData.coach ||= {};
  applyActivity(rootData.coach, dateKey(), type, payload);
  await setDoc(rootRef, { coach: rootData.coach }, { merge: true });
}

function filterVocabulary(rows, params = {}) {
  const queryText = String(params.q || "").toLowerCase();
  return rows.filter((item) => {
    const matchesBook = !params.bookId || item.bookId === params.bookId;
    const matchesQuery = !queryText || `${item.word} ${item.translation} ${item.sentence}`.toLowerCase().includes(queryText);
    return matchesBook && matchesQuery;
  });
}

async function aiProxyRequest(path, payload) {
  const response = await fetch(`${aiProxyUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "AI proxy nu a raspuns.");
  return data;
}

function computeStatistics(data) {
  const savedWords = data.vocabulary.length;
  const learnedWords = data.vocabulary.filter((item) => item.learned).length;
  const booksRead = data.books.filter((book) => (book.progress?.percent || 0) >= 95).length;
  const pagesRead = data.books.reduce((sum, book) => (
    sum + Math.round((book.pageCount || Math.ceil((book.wordCount || 0) / 250)) * ((book.progress?.percent || 0) / 100))
  ), 0);
  const readingMinutes = data.books.reduce((sum, book) => (
    sum + Math.round(Math.ceil((book.wordCount || 0) / 220) * ((book.progress?.percent || 0) / 100))
  ), 0);
  return { totalBooks: data.books.length, booksRead, pagesRead, readingMinutes, savedWords, learnedWords };
}

function defaultCoach(data) {
  const stats = computeStatistics(data);
  const today = dateKey();
  const tasks = [
    { id: "reading-1", type: "reading", title: "Citeste cartea activa", detail: "Continua lectura timp de 15 minute.", minutes: 15, completed: false },
    { id: "vocabulary-2", type: "vocabulary", title: "Revizuieste vocabularul", detail: `Repeta ${Math.min(10, Math.max(5, stats.savedWords || 5))} cuvinte salvate.`, minutes: 10, completed: false },
    { id: "quiz-3", type: "quiz", title: "Rezolva un quiz", detail: "Alege un capitol citit si verifica ce ai retinut.", minutes: 8, completed: false },
  ];
  data.coach ||= {};
  data.coach.dailyProgress ||= {};
  data.coach.dailyActivity ||= {};
  data.coach.dailyProgress[today] ||= { date: today, tasks, updatedAt: new Date().toISOString() };
  return {
    headline: "Planul tau de lectura pentru astazi",
    insight: "Plan local generat din progresul tau.",
    dailyTarget: Math.min(10, Math.max(5, stats.savedWords || 5)),
    provider: "local",
    plan: tasks,
    focusAreas: [],
    recommendations: [],
    tracker: buildTracker(data.coach),
  };
}

function buildCoachDashboard(data) {
  const base = normalizeCoach(data.coach?.latest || defaultCoach(data));
  data.coach ||= {};
  data.coach.dailyProgress ||= {};
  const today = dateKey();
  data.coach.dailyProgress[today] ||= {
    date: today,
    tasks: base.plan.map((item, index) => ({ ...item, id: `plan-${index + 1}`, type: "practice", completed: false })),
  };
  return { ...base, tracker: buildTracker(data.coach) };
}

function buildTracker(coach = {}) {
  const today = dateKey();
  coach.dailyProgress ||= {};
  coach.dailyActivity ||= {};
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = dateKey(offsetDate(new Date(), -offset));
    const record = coach.dailyProgress?.[date];
    const activity = normalizeActivity(coach.dailyActivity?.[date]);
    const completed = record?.tasks?.filter((task) => task.completed).length || 0;
    const total = record?.tasks?.length || 0;
    days.push({
      date,
      label: offset === 0 ? "azi" : new Intl.DateTimeFormat("ro-RO", { weekday: "short" }).format(offsetDate(new Date(), -offset)),
      day: date.slice(-2),
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      isToday: date === today,
      activity,
    });
  }
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (hasAnyActivity(days[index].activity)) streak += 1;
    else break;
  }
  return {
    today: coach.dailyProgress?.[today] || { date: today, tasks: [] },
    days,
    streak,
    completedThisWeek: days.reduce((sum, day) => sum + day.completed, 0),
    totalThisWeek: days.reduce((sum, day) => sum + day.total, 0),
    activityByDate: Object.fromEntries(
      Object.entries(coach.dailyActivity || {}).map(([date, value]) => [date, normalizeActivity(value)]),
    ),
    progressByDate: coach.dailyProgress || {},
  };
}

function applyActivity(coach, date, type, payload = {}) {
  coach.dailyActivity ||= {};
  coach.dailyActivity[date] = normalizeActivity(coach.dailyActivity[date]);
  const activity = coach.dailyActivity[date];
  activity.updatedAt = new Date().toISOString();
  if (type === "reading") {
    activity.readingMinutes += Math.max(0, Number(payload.readingMinutes) || 0);
    activity.pagesRead += Math.max(0, Number(payload.pagesRead) || 0);
    if (payload.bookId) {
      activity.books[payload.bookId] ||= { title: payload.bookTitle || "Carte", pagesRead: 0 };
      activity.books[payload.bookId].title = payload.bookTitle || activity.books[payload.bookId].title;
      activity.books[payload.bookId].pagesRead += Math.max(0, Number(payload.pagesRead) || 0);
    }
  }
  if (type === "quiz") {
    activity.quizzesCompleted += 1;
    activity.quizScoreTotal += Math.max(0, Number(payload.score) || 0);
    activity.quizQuestionTotal += Math.max(0, Number(payload.totalQuestions) || 0);
    activity.lastQuiz = {
      bookTitle: payload.bookTitle || "",
      chapterTitle: payload.chapterTitle || "",
      score: Math.max(0, Number(payload.score) || 0),
      totalQuestions: Math.max(0, Number(payload.totalQuestions) || 0),
    };
  }
  if (type === "vocabulary") {
    activity.vocabularyPracticed += Math.max(1, Number(payload.count) || 1);
  }
  if (type === "task") {
    activity.tasksCompleted += 1;
    activity.taskTypes ||= {};
    activity.taskTypes[payload.taskType || payload.taskId || "other"] =
      (activity.taskTypes[payload.taskType || payload.taskId || "other"] || 0) + 1;
  }
}

function normalizeActivity(activity) {
  return {
    readingMinutes: Number(activity?.readingMinutes) || 0,
    pagesRead: Number(activity?.pagesRead) || 0,
    quizzesCompleted: Number(activity?.quizzesCompleted) || 0,
    quizScoreTotal: Number(activity?.quizScoreTotal) || 0,
    quizQuestionTotal: Number(activity?.quizQuestionTotal) || 0,
    vocabularyPracticed: Number(activity?.vocabularyPracticed) || 0,
    tasksCompleted: Number(activity?.tasksCompleted) || 0,
    books: activity?.books && typeof activity.books === "object" ? activity.books : {},
    taskTypes: activity?.taskTypes && typeof activity.taskTypes === "object" ? activity.taskTypes : {},
    lastQuiz: activity?.lastQuiz && typeof activity.lastQuiz === "object" ? activity.lastQuiz : null,
    updatedAt: activity?.updatedAt || "",
  };
}

function hasAnyActivity(activity) {
  return activity.readingMinutes > 0
    || activity.pagesRead > 0
    || activity.quizzesCompleted > 0
    || activity.vocabularyPracticed > 0
    || activity.tasksCompleted > 0;
}

function estimateReadingMinutes(pagesRead) {
  return Math.max(1, Math.round(Number(pagesRead) * 1.1));
}

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function offsetDate(date, dayOffset) {
  const next = new Date(date);
  next.setDate(next.getDate() + dayOffset);
  return next;
}

function analyzeText(text) {
  const words = text.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) || [];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const uniqueWords = new Set(words);
  const difficultWords = [...uniqueWords]
    .filter((word) => word.length >= 9 || /(tion|sion|ough|phras|ment|ive|ity|ance|ence)$/.test(word))
    .slice(0, 60);
  const averageSentenceLength = words.length / Math.max(1, sentences.length);
  const vocabularyDensity = Math.round((uniqueWords.size / Math.max(1, words.length)) * 100);
  let score = 0;
  if (averageSentenceLength > 10) score += 1;
  if (averageSentenceLength > 16) score += 1;
  if (averageSentenceLength > 23) score += 1;
  if (vocabularyDensity > 45) score += 1;
  if (difficultWords.length / Math.max(1, uniqueWords.size) > 0.14) score += 1;
  return {
    level: ["A1", "A2", "B1", "B2", "C1"][Math.min(score, 4)],
    readingTimeMinutes: Math.max(1, Math.ceil(words.length / 220)),
    difficultWords,
    vocabularyDensity,
    wordCount: words.length,
    averageSentenceLength: Number(averageSentenceLength.toFixed(1)),
  };
}

function detectTextChapters(text) {
  const matches = [...text.matchAll(/(?:^|\n)(chapter|capitolul?)\s+([^\n]{1,80})/gi)];
  if (matches.length < 2) return [{ id: "chapter-1", title: "Inceput", text }];
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = matches[index + 1]?.index || text.length;
    return {
      id: `chapter-${index + 1}`,
      title: normalizeText(match[0]).slice(0, 120),
      text: normalizeText(text.slice(start, end)),
    };
  });
}

function detectPdfChapters(pages) {
  const pageCount = pages.length || 1;
  const groupSize = Math.max(1, Math.ceil(pageCount / Math.min(12, pageCount)));
  const chapters = [];
  for (let index = 0; index < pageCount; index += groupSize) {
    chapters.push({
      id: `chapter-${chapters.length + 1}`,
      title: `Pagini ${index + 1}-${Math.min(pageCount, index + groupSize)}`,
      startPage: index,
      endPage: Math.min(pageCount - 1, index + groupSize - 1),
    });
  }
  return chapters;
}

function normalizeText(text = "") {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function htmlToText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|section|article)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractHtmlTitle(html) {
  const match = html.match(/<(?:h1|h2|title)[^>]*>([\s\S]*?)<\/(?:h1|h2|title)>/i);
  return match ? cleanChapterTitle(htmlToText(match[1])) : "";
}

function deriveChapterTitle(text, index) {
  const clean = normalizeText(text);
  const chapterMatch = clean.match(/^(chapter|prologue|epilogue|part)\s+[^.!?\n]{1,80}/i);
  if (chapterMatch) return cleanChapterTitle(chapterMatch[0]);
  const firstLine = clean.split(/\n|(?<=[.!?])\s+/).find((line) => line.trim().length >= 3 && line.trim().length <= 90);
  return cleanChapterTitle(firstLine || `Capitol ${index + 1}`);
}

function cleanChapterTitle(value) {
  const title = normalizeText(String(value || ""))
    .replace(/^unknown$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return title ? title.slice(0, 120) : "Unknown";
}

function decodeHtml(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function normalizeWord(word) {
  return String(word || "").toLowerCase().replace(/’/g, "'").replace(/^[^a-z']+|[^a-z']+$/gi, "");
}

function downloadCsv(rows) {
  const headers = ["book", "word", "translation", "sentence", "sentence_ro", "learned", "created_at"];
  const lines = rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([`${headers.join(",")}\n${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "linguaread-vocabulary.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function imageToCoverDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 420;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.76);
}

function fileExtension(name = "") {
  return name.split(".").pop()?.toLowerCase() || "txt";
}

function normalizeZipPath(value) {
  const parts = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}
