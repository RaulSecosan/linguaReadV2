import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestoreDb } from "./firebase";

const dataProvider = import.meta.env.VITE_DATA_PROVIDER || "server";
const owner = import.meta.env.VITE_GITHUB_OWNER;
const repo = import.meta.env.VITE_GITHUB_REPO;
const branch = import.meta.env.VITE_GITHUB_BRANCH || "main";
const dbPath = import.meta.env.VITE_GITHUB_DB_PATH || "data/linguaread-db.json";
const token = import.meta.env.VITE_GITHUB_TOKEN;
const firestoreCollection = import.meta.env.VITE_FIRESTORE_COLLECTION || "linguaread";
const firestoreDocument = import.meta.env.VITE_FIRESTORE_DOCUMENT || "main";

const apiRoot = "https://api.github.com";
let cache = null;
let sha = "";
let writeQueue = Promise.resolve();

const seedText = `Learning a new language through reading is powerful because every sentence gives context. When you meet a new word inside a story, your brain connects it with characters, actions, and emotion. This context makes vocabulary easier to remember.

Good readers do not translate every word. They notice patterns, save useful expressions, and return to difficult sentences later. A learner who reads ten pages every day builds confidence faster than a learner who studies isolated lists.

LinguaRead helps you slow down at the right moments. Click a word, listen to its pronunciation, read the Romanian sentence, and save the complete context.`;

function newId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyDb() {
  const book = buildBook({
    title: "Context Reading Starter",
    author: "LinguaRead",
    fileType: "txt",
    originalName: "context-reading-starter.txt",
    text: seedText,
  });
  return { books: [book], vocabulary: [], coach: {} };
}

function normalizeDb(data) {
  return {
    books: Array.isArray(data?.books) ? data.books : [],
    vocabulary: Array.isArray(data?.vocabulary) ? data.vocabulary : [],
    coach: data?.coach && typeof data.coach === "object" ? data.coach : {},
  };
}

function assertConfig() {
  if (dataProvider === "firestore") return;
  const missing = [
    ["VITE_GITHUB_OWNER", owner],
    ["VITE_GITHUB_REPO", repo],
    ["VITE_GITHUB_TOKEN", token],
  ].filter(([, value]) => !value);
  if (missing.length) {
    throw new Error(`Lipsesc variabilele GitHub: ${missing.map(([name]) => name).join(", ")}.`);
  }
}

function headers() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function loadDb(force = false) {
  if (dataProvider === "firestore") return loadFirestoreDb(force);
  assertConfig();
  if (cache && !force) return cache;
  const url = `${apiRoot}/repos/${owner}/${repo}/contents/${encodeURIComponentPath(dbPath)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: headers() });
  if (response.status === 404) {
    cache = emptyDb();
    sha = "";
    await saveDb(cache, "Initialize LinguaRead database");
    return cache;
  }
  if (!response.ok) throw new Error(await githubError(response, "Nu am putut citi baza de date din GitHub."));
  const payload = await response.json();
  sha = payload.sha;
  const raw = decodeBase64(payload.content || "");
  cache = normalizeDb(JSON.parse(raw || "{}"));
  return cache;
}

async function saveDb(data, message = "Update LinguaRead database") {
  if (dataProvider === "firestore") return saveFirestoreDb(data);
  assertConfig();
  const normalized = normalizeDb(data);
  const body = {
    message,
    content: encodeBase64(`${JSON.stringify(normalized, null, 2)}\n`),
    branch,
    ...(sha ? { sha } : {}),
  };
  const url = `${apiRoot}/repos/${owner}/${repo}/contents/${encodeURIComponentPath(dbPath)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await githubError(response, "Nu am putut salva baza de date in GitHub."));
  const payload = await response.json();
  sha = payload.content?.sha || sha;
  cache = normalized;
  return cache;
}

async function loadFirestoreDb(force = false) {
  if (cache && !force) return cache;
  const ref = doc(firestoreDb, firestoreCollection, firestoreDocument);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    cache = emptyDb();
    return cache;
  }
  cache = normalizeDb(snapshot.data());
  return cache;
}

async function saveFirestoreDb(data) {
  const normalized = normalizeDb(data);
  const ref = doc(firestoreDb, firestoreCollection, firestoreDocument);
  await setDoc(ref, normalized);
  cache = normalized;
  return cache;
}

async function mutateDb(mutator, message) {
  writeQueue = writeQueue.then(async () => {
    const data = structuredClone(await loadDb(true));
    const result = await mutator(data);
    await saveDb(data, message);
    return result;
  });
  return writeQueue;
}

function publicBook(book) {
  const { text, sourcePages, chapters, ...rest } = book;
  return rest;
}

function buildBook({ title, author, fileType, originalName, text, coverUrl = "" }) {
  const analysis = analyzeText(text);
  return {
    id: newId(),
    title: title || originalName?.replace(/\.[^.]+$/, "") || "Carte fara titlu",
    author: author || "",
    fileType: fileType || "txt",
    originalName: originalName || "book.txt",
    coverUrl,
    text,
    structureVersion: 2,
    chapters: [{ id: "chapter-1", title: title || "Inceput", text, startPage: 0, endPage: 0 }],
    sourcePages: [],
    wordCount: analysis.wordCount,
    pageCount: Math.max(1, Math.ceil(analysis.wordCount / 250)),
    analysis,
    createdAt: new Date().toISOString(),
    progress: { percent: 0, position: 0, page: 0, updatedAt: new Date().toISOString() },
    bookmarks: [],
  };
}

async function formDataTextBook(formData) {
  const file = formData.get("book");
  if (!file) throw new Error("Fisierul cartii este obligatoriu.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "txt";
  if (extension !== "txt" && file.type !== "text/plain") {
    throw new Error("In modul GitHub static poti incarca momentan doar fisiere .txt. Pentru PDF/EPUB ruleaza serverul local.");
  }
  const text = await file.text();
  if (!text.trim()) throw new Error("Nu am gasit text in fisier.");
  const cover = formData.get("cover");
  return buildBook({
    title: String(formData.get("title") || "").trim(),
    author: String(formData.get("author") || "").trim(),
    fileType: "txt",
    originalName: file.name,
    text,
    coverUrl: cover instanceof File && cover.size ? await fileToDataUrl(cover) : "",
  });
}

async function formDataBookPatch(formData, book) {
  if (typeof formData.get("title") === "string" && formData.get("title").trim()) {
    book.title = formData.get("title").trim();
  }
  if (typeof formData.get("author") === "string") book.author = formData.get("author").trim();
  const cover = formData.get("cover");
  if (cover instanceof File && cover.size) book.coverUrl = await fileToDataUrl(cover);
  book.updatedAt = new Date().toISOString();
  return book;
}

function filterVocabulary(data, params = {}) {
  const query = String(params.q || "").toLowerCase();
  return data.vocabulary.filter((item) => {
    const matchesBook = !params.bookId || item.bookId === params.bookId;
    const matchesQuery = !query || `${item.word} ${item.translation} ${item.sentence}`.toLowerCase().includes(query);
    return matchesBook && matchesQuery;
  });
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

function defaultCoach(data) {
  const stats = computeStatistics(data);
  const today = new Date().toISOString().slice(0, 10);
  const tasks = [
    { id: "reading-1", type: "reading", title: "Citeste cartea activa", detail: "Continua lectura timp de 15 minute.", minutes: 15, completed: false },
    { id: "vocabulary-2", type: "vocabulary", title: "Revizuieste vocabularul", detail: `Repeta ${Math.min(10, Math.max(5, stats.savedWords || 5))} cuvinte salvate.`, minutes: 10, completed: false },
    { id: "quiz-3", type: "quiz", title: "Rezolva un quiz", detail: "Alege un capitol citit si verifica ce ai retinut.", minutes: 8, completed: false },
  ];
  data.coach.dailyProgress ||= {};
  data.coach.dailyProgress[today] ||= { date: today, tasks, updatedAt: new Date().toISOString() };
  return {
    headline: "Planul tau de lectura pentru astazi",
    insight: "Modul GitHub foloseste un plan local; generarea AI ramane disponibila prin serverul Node.",
    dailyTarget: Math.min(10, Math.max(5, stats.savedWords || 5)),
    provider: "local",
    plan: tasks,
    focusAreas: [],
    recommendations: [],
    tracker: {
      today: data.coach.dailyProgress[today],
      days: [{ date: today, label: "azi", day: today.slice(-2), completed: tasks.filter((task) => task.completed).length, total: tasks.length, percent: 0, isToday: true }],
      streak: 0,
      completedThisWeek: 0,
      totalThisWeek: tasks.length,
    },
  };
}

function csvUrl(params = {}) {
  const rows = filterVocabulary(cache || { vocabulary: [] }, params).map((item) => ({
    book: item.bookTitle,
    word: item.word,
    translation: item.translation,
    sentence: item.sentence,
    sentence_ro: item.sentenceRo,
    learned: item.learned ? "yes" : "no",
    created_at: item.createdAt,
  }));
  const headers = ["book", "word", "translation", "sentence", "sentence_ro", "learned", "created_at"];
  const lines = rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","));
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`${headers.join(",")}\n${lines.join("\n")}\n`)}`;
}

export const githubApi = {
  books: async () => (await loadDb()).books.map(publicBook),
  book: async (id) => {
    const book = (await loadDb()).books.find((item) => item.id === id);
    if (!book) throw new Error("Cartea nu a fost gasita.");
    return book;
  },
  uploadBook: async (formData) => {
    const book = await formDataTextBook(formData);
    await mutateDb((data) => {
      data.books.unshift(book);
      return book;
    }, `Add book: ${book.title}`);
    return book;
  },
  updateBook: (bookId, formData) => mutateDb(async (data) => {
    const book = data.books.find((item) => item.id === bookId);
    if (!book) throw new Error("Cartea nu a fost gasita.");
    return formDataBookPatch(formData, book);
  }, "Update book details"),
  deleteBook: (bookId, keepVocabulary = false) => mutateDb((data) => {
    data.books = data.books.filter((item) => item.id !== bookId);
    if (!keepVocabulary) data.vocabulary = data.vocabulary.filter((item) => item.bookId !== bookId);
    return true;
  }, "Delete book"),
  updateProgress: (bookId, payload) => mutateDb((data) => {
    const book = data.books.find((item) => item.id === bookId);
    if (!book) throw new Error("Cartea nu a fost gasita.");
    book.progress = {
      percent: Number(payload.percent) || 0,
      position: Number(payload.position) || 0,
      page: Math.max(0, Number(payload.page) || 0),
      updatedAt: new Date().toISOString(),
    };
    return book.progress;
  }, "Update reading progress"),
  saveReadingPosition: (bookId, payload) => mutateDb((data) => {
    const book = data.books.find((item) => item.id === bookId);
    if (!book) throw new Error("Cartea nu a fost gasita.");
    book.savedPosition = {
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
    return book.savedPosition;
  }, "Save reading position"),
  addBookmark: (bookId, payload) => mutateDb((data) => {
    const book = data.books.find((item) => item.id === bookId);
    if (!book) throw new Error("Cartea nu a fost gasita.");
    const item = { id: newId(), label: payload.label || "Bookmark", position: Number(payload.position) || 0, page: Math.max(0, Number(payload.page) || 0), percent: Number(payload.percent) || 0, createdAt: new Date().toISOString() };
    book.bookmarks.unshift(item);
    return item;
  }, "Add bookmark"),
  deleteBookmark: (bookId, bookmarkId) => mutateDb((data) => {
    const book = data.books.find((item) => item.id === bookId);
    if (!book) throw new Error("Cartea nu a fost gasita.");
    book.bookmarks = book.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
    return true;
  }, "Delete bookmark"),
  vocabulary: async (params = {}) => filterVocabulary(await loadDb(), params),
  saveVocabulary: (payload) => mutateDb((data) => {
    const book = data.books.find((item) => item.id === payload.bookId);
    if (!book) throw new Error("Cartea nu a fost gasita.");
    const normalized = normalizeWord(payload.word);
    const existing = data.vocabulary.find((item) => item.bookId === book.id && normalizeWord(item.word) === normalized);
    if (existing) {
      Object.assign(existing, {
        translation: payload.translation || existing.translation,
        sentence: payload.sentence || existing.sentence,
        sentenceRo: payload.sentenceRo || existing.sentenceRo,
        explanation: payload.explanation || existing.explanation,
        updatedAt: new Date().toISOString(),
      });
      return existing;
    }
    const item = {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.vocabulary.unshift(item);
    return item;
  }, "Save vocabulary"),
  updateVocabulary: (id, payload) => mutateDb((data) => {
    const item = data.vocabulary.find((entry) => entry.id === id);
    if (!item) throw new Error("Cuvantul nu a fost gasit.");
    if (typeof payload.learned === "boolean") item.learned = payload.learned;
    if (typeof payload.translation === "string") item.translation = payload.translation.trim();
    if (typeof payload.sentence === "string") item.sentence = payload.sentence.trim();
    if (typeof payload.sentenceRo === "string") item.sentenceRo = payload.sentenceRo.trim();
    if (typeof payload.explanation === "string") item.explanation = payload.explanation.trim();
    if (typeof payload.notes === "string") item.notes = payload.notes.trim();
    item.updatedAt = new Date().toISOString();
    return item;
  }, "Update vocabulary"),
  deleteVocabulary: (id) => mutateDb((data) => {
    data.vocabulary = data.vocabulary.filter((item) => item.id !== id);
    return true;
  }, "Delete vocabulary"),
  translate: async ({ word, sentence }) => ({
    translation: word,
    sentenceRo: sentence,
    explanation: "Traducere locala demonstrativa. Pentru OpenAI/Ollama ruleaza serverul Node si foloseste providerul server.",
    provider: "local",
  }),
  summary: async ({ bookId, chapterId }) => {
    const book = await githubApi.book(bookId);
    const chapter = book.chapters?.find((item) => item.id === chapterId) || book.chapters?.[0];
    return {
      summary: (chapter?.text || book.text || "").split(/(?<=[.!?])\s+/).slice(0, 3).join(" "),
      mainIdeas: ["Reciteste capitolul", "Salveaza expresiile utile", "Revizuieste cuvintele marcate"],
      provider: "local",
    };
  },
  difficulty: async ({ bookId }) => analyzeText((await githubApi.book(bookId)).text || ""),
  quiz: async ({ bookId, chapterId, count = 3 }) => {
    const book = await githubApi.book(bookId);
    const chapter = book.chapters?.find((item) => item.id === chapterId) || book.chapters?.[0];
    const sentences = (chapter?.text || book.text || "").split(/(?<=[.!?])\s+/).filter((item) => item.length > 30);
    const questions = sentences.slice(0, Math.max(1, Number(count) || 3)).map((sentence, index) => ({
      id: `local-${index + 1}`,
      question: "Care propozitie apare in capitol?",
      options: [
        sentence.slice(0, 180),
        "Aceasta optiune este un distractor local.",
        "Capitolul nu contine aceasta afirmatie.",
        "Textul vorbeste despre un subiect diferit.",
      ],
      correctIndex: 0,
      explanation: "Raspunsul corect este extras direct din text.",
    }));
    return { questions, bookTitle: book.title, chapterTitle: chapter?.title || book.title, provider: "local" };
  },
  coach: async () => defaultCoach(await loadDb()),
  generateCoach: async () => defaultCoach(await loadDb()),
  updateCoachTask: (date, taskId, completed) => mutateDb((data) => {
    const record = data.coach?.dailyProgress?.[date];
    const task = record?.tasks?.find((item) => item.id === taskId);
    if (!task) throw new Error("Task-ul zilnic nu a fost gasit.");
    task.completed = Boolean(completed);
    task.completedAt = task.completed ? new Date().toISOString() : null;
    record.updatedAt = new Date().toISOString();
    return defaultCoach(data);
  }, "Update coach task"),
  statistics: async () => computeStatistics(await loadDb()),
  exportUrl: (params = {}) => csvUrl(params),
};

function normalizeWord(word) {
  return String(word || "").toLowerCase().replace(/^[^a-z']+|[^a-z']+$/gi, "");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function encodeURIComponentPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function encodeBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64(value) {
  return decodeURIComponent(escape(atob(value.replace(/\n/g, ""))));
}

async function githubError(response, fallback) {
  const data = await response.json().catch(() => null);
  return data?.message ? `${fallback} GitHub: ${data.message}` : fallback;
}
