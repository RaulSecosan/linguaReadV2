import {
  BarChart3,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Grid2X2,
  GraduationCap,
  Library,
  List,
  ListChecks,
  MoreVertical,
  Moon,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, api } from "./api";

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "library", label: "Biblioteca", icon: Library },
  { id: "reader", label: "Reader", icon: BookOpen },
  { id: "vocabulary", label: "Vocabular", icon: ListChecks },
  { id: "learning", label: "Learning", icon: GraduationCap },
  { id: "coach", label: "AI Coach", icon: Sparkles },
];

const fontOptions = [
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Atkinson", value: "'Atkinson Hyperlegible', Inter, sans-serif" },
  { label: "Mono", value: "'SFMono-Regular', Consolas, monospace" },
];

const normalizeWord = (word) => word.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/gi, "");

const splitSentences = (text = "") => {
  const matches = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches?.map((sentence) => sentence.trim()).filter(Boolean) || [];
};

const normalizeAnchorText = (text = "") => text.replace(/\s+/g, " ").trim().slice(0, 220);

const paginateBook = (book, wordsPerPage) => {
  if (!book) return { pages: [], contents: [] };

  if (book.sourcePages?.length) {
    const pages = book.sourcePages.map((text, index) => ({
      text,
      chapterId: book.chapters?.find((chapter) => index >= chapter.startPage && index <= chapter.endPage)?.id,
      chapterTitle: book.chapters?.find((chapter) => index >= chapter.startPage && index <= chapter.endPage)?.title || "Inceput",
      sourcePage: index + 1,
    }));
    const contents = (book.chapters || []).map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      page: chapter.startPage || 0,
    }));
    return { pages, contents };
  }

  const chapters = book.chapters?.length
    ? book.chapters
    : [{ id: "chapter-1", title: book.title, text: book.text || "" }];
  const pages = [];
  const contents = [];
  chapters.forEach((chapter) => {
    contents.push({ id: chapter.id, title: chapter.title, page: pages.length });
    const sentences = splitSentences(chapter.text);
    let pageText = "";
    let wordCount = 0;
    let sentenceStartIndex = 0;
    sentences.forEach((sentence, sentenceIndex) => {
      const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;
      if (pageText && wordCount + sentenceWords > wordsPerPage) {
        pages.push({
          text: pageText.trim(),
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          sentenceStartIndex,
          sentenceEndIndex: sentenceIndex - 1,
        });
        pageText = "";
        wordCount = 0;
        sentenceStartIndex = sentenceIndex;
      }
      pageText += `${sentence} `;
      wordCount += sentenceWords;
    });
    if (pageText.trim()) {
      pages.push({
        text: pageText.trim(),
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        sentenceStartIndex,
        sentenceEndIndex: Math.max(sentenceStartIndex, sentences.length - 1),
      });
    }
  });
  return { pages, contents };
};

const resolveSavedPageIndex = (savedPosition, pages) => {
  if (!savedPosition || !pages.length) return null;
  if (savedPosition.sourcePage) {
    const sourceIndex = pages.findIndex((item) => item.sourcePage === Number(savedPosition.sourcePage));
    if (sourceIndex >= 0) return sourceIndex;
  }
  if (savedPosition.chapterId && Number.isFinite(Number(savedPosition.sentenceIndex))) {
    const sentenceIndex = Number(savedPosition.sentenceIndex);
    const semanticIndex = pages.findIndex((item) => (
      item.chapterId === savedPosition.chapterId
      && Number(item.sentenceStartIndex) <= sentenceIndex
      && Number(item.sentenceEndIndex) >= sentenceIndex
    ));
    if (semanticIndex >= 0) return semanticIndex;
  }
  const anchor = normalizeAnchorText(savedPosition.anchorText || savedPosition.sentence || "");
  if (anchor) {
    const foundIndex = pages.findIndex((item) => normalizeAnchorText(item.text).includes(anchor));
    if (foundIndex >= 0) return foundIndex;
  }
  return Math.max(0, Math.min(Number(savedPosition.page) || 0, pages.length - 1));
};

const speak = (text, lang = "en-US") => {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
};

const formatReadingTime = (minutes = 0) => {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes < 60) return `${safeMinutes} min`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
};

function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [appTheme, setAppTheme] = useState(() => localStorage.getItem("lr-theme") || "light");
  const [books, setBooks] = useState([]);
  const [currentBookId, setCurrentBookId] = useState("");
  const [currentBook, setCurrentBook] = useState(null);
  const [vocabulary, setVocabulary] = useState([]);
  const [stats, setStats] = useState(null);
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [bookList, vocabList, nextStats] = await Promise.all([
      api.books(),
      api.vocabulary(),
      api.statistics(),
    ]);
    setBooks(bookList);
    setVocabulary(vocabList);
    setStats(nextStats);
    if (!currentBookId && bookList[0]) setCurrentBookId(bookList[0].id);
  }, [currentBookId]);

  useEffect(() => {
    refresh()
      .catch((error) => setNotice(error.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!currentBookId || activeView !== "reader") return;
    setCurrentBook((loadedBook) => loadedBook?.id === currentBookId ? loadedBook : null);
    api.book(currentBookId).then(setCurrentBook).catch((error) => setNotice(error.message));
  }, [activeView, currentBookId]);

  const refreshBook = useCallback(async () => {
    if (!currentBookId) return;
    const [book, vocabList, nextStats] = await Promise.all([
      api.book(currentBookId),
      api.vocabulary(),
      api.statistics(),
    ]);
    setCurrentBook(book);
    setVocabulary(vocabList);
    setStats(nextStats);
  }, [currentBookId]);

  const bookVocabulary = useMemo(
    () => vocabulary.filter((item) => item.bookId === currentBookId),
    [vocabulary, currentBookId],
  );

  const handleUpload = async (formData) => {
    const created = await api.uploadBook(formData);
    await refresh();
    setCurrentBookId(created.id);
    setActiveView("reader");
    setNotice(`Cartea "${created.title}" a fost incarcata.`);
  };

  const handleOpenBook = (bookId) => {
    setCurrentBookId(bookId);
    setActiveView("reader");
  };

  const loadCoach = async (model = "") => {
    const data = model ? await api.generateCoach(model) : await api.coach();
    setCoach(data);
    return data;
  };

  useEffect(() => {
    if (activeView === "coach") loadCoach().catch((error) => setNotice(error.message));
  }, [activeView]);

  useEffect(() => {
    localStorage.setItem("lr-theme", appTheme);
  }, [appTheme]);

  const handleUpdateBook = async (bookId, formData) => {
    await api.updateBook(bookId, formData);
    await refresh();
    if (currentBookId === bookId && activeView === "reader") await refreshBook();
    setNotice("Detaliile cartii au fost actualizate.");
  };

  const handleDeleteBook = async (bookId, keepVocabulary) => {
    await api.deleteBook(bookId, keepVocabulary);
    const [bookList, vocabList, nextStats] = await Promise.all([
      api.books(),
      api.vocabulary(),
      api.statistics(),
    ]);
    setBooks(bookList);
    setVocabulary(vocabList);
    setStats(nextStats);
    if (currentBookId === bookId) {
      setCurrentBookId(bookList[0]?.id || "");
      setCurrentBook(null);
    }
    setNotice("Cartea a fost stearsa.");
  };

  return (
    <div className={`app-shell ${appTheme}`}>
      <aside className="sidebar" aria-label="Navigare principala">
        <div className="brand">
          <div className="brand-mark">LR</div>
          <div>
            <strong>LinguaRead</strong>
            <span>English learning reader</span>
          </div>
        </div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeView === item.id ? "active" : ""}`}
                onClick={() => setActiveView(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">LinguaRead</span>
            <h1>{navigation.find((item) => item.id === activeView)?.label || "LinguaRead"}</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button theme-toggle"
              onClick={() => setAppTheme(appTheme === "light" ? "dark" : "light")}
              title={appTheme === "light" ? "Activeaza modul intunecat" : "Activeaza modul luminos"}
            >
              {appTheme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        {notice && (
          <button className="notice" onClick={() => setNotice("")}>
            {notice}
          </button>
        )}

        {loading ? (
          <div className="empty-state">Se incarca datele...</div>
        ) : (
          <>
            {activeView === "dashboard" && (
              <Dashboard stats={stats} books={books} vocabulary={vocabulary} onOpenBook={handleOpenBook} />
            )}
            {activeView === "library" && (
              <LibraryView
                books={books}
                onUpload={handleUpload}
                onOpenBook={handleOpenBook}
                onUpdateBook={handleUpdateBook}
                onDeleteBook={handleDeleteBook}
              />
            )}
            {activeView === "reader" && (
              <Reader
                book={currentBook}
                vocabulary={bookVocabulary}
                onRefresh={refreshBook}
                onNotice={setNotice}
                theme={appTheme}
                onToggleTheme={() => setAppTheme(appTheme === "light" ? "dark" : "light")}
              />
            )}
            {activeView === "vocabulary" && (
              <VocabularyView books={books} vocabulary={vocabulary} onRefresh={refresh} />
            )}
            {activeView === "learning" && (
              <LearningMode
                books={books}
                currentBookId={currentBookId}
                vocabulary={vocabulary}
                onRefresh={refresh}
              />
            )}
            {activeView === "coach" && (
              <CoachView
                coach={coach}
                onRefresh={loadCoach}
                onToggleTask={async (date, taskId, completed) => {
                  const data = await api.updateCoachTask(date, taskId, completed);
                  setCoach(data);
                }}
                stats={stats}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function BookSelector({ books, value, onChange }) {
  return (
    <label className="select-label">
      <BookOpen size={16} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {books.map((book) => (
          <option key={book.id} value={book.id}>
            {book.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function Dashboard({ stats, books, vocabulary, onOpenBook }) {
  const cards = [
    { label: "Carti citite", value: stats?.booksRead || 0 },
    { label: "Pagini citite", value: stats?.pagesRead || 0 },
    { label: "Timp citire", value: formatReadingTime(stats?.readingMinutes || 0) },
    { label: "Cuvinte salvate", value: vocabulary.length },
    { label: "Cuvinte invatate", value: vocabulary.filter((item) => item.learned).length },
  ];

  return (
    <section className="view-grid">
      <div className="metric-grid">
        {cards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <section className="section-band">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Biblioteca activa</span>
            <h2>Progres pe carti</h2>
          </div>
        </div>
        <div className="book-grid">
          {books.map((book) => (
            <article className="book-card" key={book.id}>
              <Cover book={book} />
              <div className="book-card-body">
                <h3>{book.title}</h3>
                <p>{book.author || "Autor necunoscut"}</p>
                <div className="book-facts">
                  <span>{book.pageCount || 1} pagini</span>
                  <span>Nivel {book.analysis?.level || "B1"}</span>
                  <span>{formatReadingTime(book.analysis?.readingTimeMinutes || 0)}</span>
                </div>
                <ProgressBar value={book.progress?.percent || 0} />
                <button className="primary-button" onClick={() => onOpenBook(book.id)}>
                  <BookOpen size={16} />
                  Continua
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function LibraryView({ books, onUpload, onOpenBook, onUpdateBook, onDeleteBook }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [bookFile, setBookFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("lr-library-view") || "grid");

  const submit = async (event) => {
    event.preventDefault();
    if (!bookFile) return;
    setBusy(true);
    const formData = new FormData();
    formData.append("book", bookFile);
    if (coverFile) formData.append("cover", coverFile);
    if (title) formData.append("title", title);
    if (author) formData.append("author", author);
    await onUpload(formData);
    setTitle("");
    setAuthor("");
    setBookFile(null);
    setCoverFile(null);
    event.currentTarget.reset();
    setBusy(false);
  };

  return (
    <section className="library-layout">
      <form className="upload-panel" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Upload</span>
            <h2>Adauga o carte</h2>
          </div>
          <Upload size={22} />
        </div>
        <label>
          Titlu
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" />
        </label>
        <label>
          Autor
          <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Optional" />
        </label>
        <label>
          Fisier carte
          <input
            type="file"
            accept=".txt,.pdf,.epub,text/plain,application/pdf,application/epub+zip"
            onChange={(event) => setBookFile(event.target.files?.[0] || null)}
            required
          />
        </label>
        <label>
          Coperta
          <input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] || null)} />
        </label>
        <button className="primary-button" disabled={busy || !bookFile}>
          <Plus size={16} />
          {busy ? "Se incarca..." : "Adauga"}
        </button>
      </form>

      <div className="library-books">
        <div className="library-toolbar">
          <div>
            <span className="eyebrow">Colectia ta</span>
            <strong>{books.length} {books.length === 1 ? "carte" : "carti"}</strong>
          </div>
          <div className="segmented-control" aria-label="Mod vizualizare">
            <button
              className={viewMode === "grid" ? "active" : ""}
              onClick={() => {
                setViewMode("grid");
                localStorage.setItem("lr-library-view", "grid");
              }}
              title="Vizualizare grila"
            >
              <Grid2X2 size={17} />
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() => {
                setViewMode("list");
                localStorage.setItem("lr-library-view", "list");
              }}
              title="Vizualizare lista"
            >
              <List size={18} />
            </button>
          </div>
        </div>
        <div className={`book-grid ${viewMode === "list" ? "book-list-view" : ""}`}>
        {books.map((book) => (
          <article className="book-card" key={book.id}>
            <Cover book={book} />
            <div className="book-card-body">
              <button
                className="icon-button book-menu-button"
                onClick={() => setEditingBook(book)}
                title="Setari carte"
              >
                <MoreVertical size={17} />
              </button>
              <span className="tag">{book.fileType.toUpperCase()}</span>
              <h3>{book.title}</h3>
              <p>{book.author || "Autor necunoscut"}</p>
              <div className="book-facts">
                <span>{book.pageCount || 1} pagini</span>
                <span>Nivel {book.analysis?.level || "B1"}</span>
                <span>{formatReadingTime(book.analysis?.readingTimeMinutes || 0)}</span>
              </div>
              <ProgressBar value={book.progress?.percent || 0} />
              <button className="secondary-button" onClick={() => onOpenBook(book.id)}>
                <BookOpen size={16} />
                Deschide
              </button>
            </div>
          </article>
        ))}
        </div>
      </div>
      {editingBook && (
        <BookSettingsModal
          key={editingBook.id}
          book={editingBook}
          onClose={() => setEditingBook(null)}
          onSave={async (formData) => {
            await onUpdateBook(editingBook.id, formData);
            setEditingBook(null);
          }}
          onDelete={async (keepVocabulary) => {
            await onDeleteBook(editingBook.id, keepVocabulary);
            setEditingBook(null);
          }}
        />
      )}
    </section>
  );
}

function BookSettingsModal({ book, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author || "");
  const [cover, setCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keepVocabulary, setKeepVocabulary] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("author", author);
    if (cover) formData.append("cover", cover);
    try {
      await onSave(formData);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="book-settings-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Setari carte</span>
            <h2>Editeaza detaliile</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Inchide">
            <X size={18} />
          </button>
        </div>
        <div className="book-settings-preview">
          <Cover book={book} />
          <div>
            <strong>{title || book.title}</strong>
            <span>{author || "Autor necunoscut"}</span>
            <small>{book.fileType.toUpperCase()} · {book.pageCount || 1} pagini</small>
          </div>
        </div>
        <label>
          Numele cartii
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          Autor
          <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Autor necunoscut" />
        </label>
        <label>
          Coperta noua
          <input type="file" accept="image/*" onChange={(event) => setCover(event.target.files?.[0] || null)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Renunta</button>
          <button className="primary-button" disabled={busy || !title.trim()}>
            <Pencil size={16} />
            {busy ? "Se salveaza..." : "Salveaza"}
          </button>
        </div>
        <div className="danger-zone">
          <div>
            <strong>Stergere carte</strong>
            <span>Elimina fisierul, progresul si datele asociate.</span>
          </div>
          <button type="button" className="danger-button" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} />
            Sterge cartea
          </button>
        </div>
        {confirmDelete && (
          <div className="delete-confirmation">
            <strong>Stergi definitiv „{book.title}”?</strong>
            <p>Aceasta actiune nu poate fi anulata.</p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={keepVocabulary}
                onChange={(event) => setKeepVocabulary(event.target.checked)}
              />
              Pastreaza vocabularul salvat din aceasta carte
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)}>
                Anuleaza
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onDelete(keepVocabulary);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={16} />
                {busy ? "Se sterge..." : "Sterge definitiv"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function Cover({ book }) {
  if (book.coverUrl) {
    return <img className="cover" src={`${API_BASE.replace("/api", "")}${book.coverUrl}`} alt="" />;
  }
  return (
    <div className="cover generated-cover">
      <FileText size={32} />
      <span>{book.title.slice(0, 2).toUpperCase()}</span>
    </div>
  );
}

function Reader({ book, vocabulary, onRefresh, onNotice, theme, onToggleTheme }) {
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("lr-font-size")) || 18);
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem("lr-font") || fontOptions[0].value);
  const [pageWidth, setPageWidth] = useState(() => Number(localStorage.getItem("lr-page-width")) || 760);
  const [selected, setSelected] = useState(null);
  const [model, setModel] = useState(() => localStorage.getItem("lr-ai-model") || "gpt");
  const [translation, setTranslation] = useState(null);
  const [translationError, setTranslationError] = useState("");
  const [summary, setSummary] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [busy, setBusy] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const tocListRef = useRef(null);
  const activeTocRef = useRef(null);
  const savedSentenceRef = useRef(null);

  const wordsPerPage = Math.max(180, Math.round(430 * (pageWidth / 760) * (18 / fontSize)));
  const pagination = useMemo(() => paginateBook(book, wordsPerPage), [book, wordsPerPage]);
  const page = pagination.pages[currentPage] || pagination.pages[0];
  const sentences = useMemo(() => splitSentences(page?.text), [page?.text]);
  const highlighted = useMemo(() => new Set(vocabulary.map((item) => normalizeWord(item.word))), [vocabulary]);
  const selectedVocabulary = useMemo(
    () => vocabulary.find((item) => normalizeWord(item.word) === normalizeWord(selected?.word || "")),
    [selected?.word, vocabulary],
  );
  const activeChapter = useMemo(
    () => [...pagination.contents].reverse().find((chapter) => currentPage >= chapter.page),
    [currentPage, pagination.contents],
  );
  const progressPercent = pagination.pages.length
    ? Math.round(((currentPage + 1) / pagination.pages.length) * 100)
    : 0;
  const savedPageIndex = useMemo(
    () => resolveSavedPageIndex(book?.savedPosition, pagination.pages),
    [book?.savedPosition, pagination.pages],
  );
  const savedLocalSentenceIndex = useMemo(() => {
    if (!book?.savedPosition || !page) return null;
    const savedSentenceIndex = Number(book.savedPosition.sentenceIndex);
    if (
      book.savedPosition.chapterId
      && page.chapterId === book.savedPosition.chapterId
      && Number.isFinite(savedSentenceIndex)
      && Number(page.sentenceStartIndex) <= savedSentenceIndex
      && Number(page.sentenceEndIndex) >= savedSentenceIndex
    ) {
      return savedSentenceIndex - Number(page.sentenceStartIndex);
    }
    if (savedPageIndex === currentPage) return 0;
    return null;
  }, [book?.savedPosition, currentPage, page, savedPageIndex]);

  useEffect(() => {
    localStorage.setItem("lr-font-size", String(fontSize));
    localStorage.setItem("lr-font", fontFamily);
    localStorage.setItem("lr-page-width", String(pageWidth));
    localStorage.setItem("lr-ai-model", model);
  }, [fontSize, fontFamily, pageWidth, model]);

  useEffect(() => {
    setSelected(null);
    setTranslation(null);
    setTranslationError("");
    setSummary(null);
    setDifficulty(null);
    setCurrentPage(Math.max(0, Number(book?.progress?.page) || 0));
    setShowReaderSettings(false);
  }, [book?.id]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let active = true;
    setTranslation(null);
    setTranslationError("");
    setBusy("translate");
    api
      .translate({
        bookId: book.id,
        word: selected.word,
        sentence: selected.sentence,
        model,
      }, { signal: controller.signal })
      .then((result) => {
        if (active) setTranslation(result);
      })
      .catch((error) => {
        if (active && error.name !== "AbortError") setTranslationError(error.message);
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected, model, book?.id, onNotice]);

  const saveProgress = useCallback((nextPage) => {
    if (!book || !pagination.pages.length) return;
    const safePage = Math.max(0, Math.min(nextPage, pagination.pages.length - 1));
    const percent = Math.round(((safePage + 1) / pagination.pages.length) * 100);
    api.updateProgress(book.id, { percent, page: safePage, position: safePage }).catch(() => {});
  }, [book, pagination.pages.length]);

  useEffect(() => {
    if (currentPage >= pagination.pages.length && pagination.pages.length) {
      setCurrentPage(pagination.pages.length - 1);
    }
  }, [currentPage, pagination.pages.length]);

  useEffect(() => {
    const list = tocListRef.current;
    const active = activeTocRef.current;
    if (!list || !active) return;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 8);
    if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight + 12;
    }
  }, [activeChapter?.id]);

  useEffect(() => {
    if (savedPageIndex !== currentPage || savedLocalSentenceIndex === null) return;
    const target = savedSentenceRef.current;
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, savedLocalSentenceIndex, savedPageIndex]);

  if (!book) return <div className="empty-state">Alege sau incarca o carte.</div>;

  const saveReadingPosition = async () => {
    const anchorText = normalizeAnchorText(sentences[0] || page?.text || "");
    await api.saveReadingPosition(book.id, {
      page: currentPage,
      sourcePage: page?.sourcePage,
      chapterId: page?.chapterId || activeChapter?.id,
      sentenceIndex: page?.sentenceStartIndex ?? 0,
      percent: progressPercent,
      chapterTitle: page?.chapterTitle || book.title,
      sentence: sentences[0] || "",
      anchorText,
    });
    await onRefresh();
    onNotice(`Pagina ${currentPage + 1} a fost salvata.`);
  };

  const saveVocabulary = async () => {
    if (!selected || !translation) return;
    await api.saveVocabulary({
      bookId: book.id,
      word: selected.word,
      sentence: selected.sentence,
      translation: translation.translation,
      sentenceRo: translation.sentenceRo,
      explanation: translation.explanation,
      model,
    });
    await onRefresh();
    onNotice(`"${selected.word}" a fost salvat in vocabular.`);
  };

  const removeVocabulary = async () => {
    if (!selectedVocabulary) return;
    await api.deleteVocabulary(selectedVocabulary.id);
    await onRefresh();
    onNotice(`"${selectedVocabulary.word}" a fost eliminat din vocabular.`);
  };

  const loadSummary = async () => {
    setBusy("summary");
    setSummary(null);
    api
      .summary({ bookId: book.id, chapterId: activeChapter?.id, model })
      .then(setSummary)
      .catch((error) => onNotice(error.message))
      .finally(() => setBusy(""));
  };

  const loadDifficulty = async () => {
    setBusy("difficulty");
    api
      .difficulty({ bookId: book.id })
      .then(setDifficulty)
      .catch((error) => onNotice(error.message))
      .finally(() => setBusy(""));
  };

  const goToPage = (nextPage) => {
    const safePage = Math.max(0, Math.min(nextPage, pagination.pages.length - 1));
    setCurrentPage(safePage);
    setSelected(null);
    setTranslation(null);
    setTranslationError("");
    setSummary(null);
    setShowReaderSettings(false);
    saveProgress(safePage);
  };

  const goToSavedPosition = async () => {
    try {
      const latestBook = await api.book(book.id);
      const latestPagination = paginateBook(latestBook, wordsPerPage);
      const nextPage = resolveSavedPageIndex(latestBook.savedPosition, latestPagination.pages);
      await onRefresh();
      if (nextPage === null) {
        onNotice("Nu exista o pagina salvata pentru aceasta carte.");
        return;
      }
      goToPage(nextPage);
    } catch (error) {
      onNotice(error.message);
    }
  };

  const changeModel = (nextModel) => {
    setModel(nextModel);
    setTranslation(null);
    setTranslationError("");
    setSummary(null);
  };

  const selectWord = (word, sentence, sentenceIndex, tokenIndex) => {
    setSelected({
      word,
      sentence,
      sentenceIndex,
      tokenIndex,
    });
  };

  return (
    <section className={`reader-shell ${theme}`}>
      <div className={`reader-toolbar ${showReaderSettings ? "mobile-menu-open" : ""}`}>
        <div className="reader-current-book">
          <span className="eyebrow">Carte curenta</span>
          <strong>{book.title}</strong>
        </div>
        <button className="icon-button reader-setting-control" onClick={onToggleTheme} title="Light/Dark">
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <label className="range-label reader-setting-control">
          Aa
          <input min="15" max="28" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} type="range" />
        </label>
        <label className="select-label compact reader-setting-control">
          <Settings size={16} />
          <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
            {fontOptions.map((font) => (
              <option value={font.value} key={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <label className="range-label wide reader-setting-control">
          Latime
          <input min="560" max="980" value={pageWidth} onChange={(event) => setPageWidth(Number(event.target.value))} type="range" />
        </label>
        <label className="ai-model-selector reader-setting-control">
          <Sparkles size={16} />
          <span>Motor AI</span>
          <select value={model} onChange={(event) => changeModel(event.target.value)}>
            <option value="gpt">ChatGPT API</option>
            <option value="ollama">Mistral local</option>
          </select>
        </label>
        <button className="secondary-button saved-position-button" onClick={saveReadingPosition}>
          <Bookmark size={16} />
          Salveaza aici
        </button>
        <button
          className="icon-button reader-mobile-menu-button"
          onClick={() => setShowReaderSettings((value) => !value)}
          title="Optiuni reader"
        >
          {showReaderSettings ? <X size={18} /> : <MoreVertical size={18} />}
        </button>
        <button
          className="secondary-button resume-position-button reader-setting-control"
          onClick={goToSavedPosition}
          title={savedPageIndex !== null ? `Pagina salvata: ${savedPageIndex + 1}` : "Verifica pagina salvata"}
        >
          <Play size={16} />
          Pagina salvata
        </button>
        <button
          className="icon-button resume-position-mobile-button"
          onClick={goToSavedPosition}
          title={savedPageIndex !== null ? `Mergi la pagina salvata: ${savedPageIndex + 1}` : "Verifica pagina salvata"}
        >
          <Play size={17} />
        </button>
        <button className="secondary-button reader-analysis-control" onClick={loadSummary} disabled={busy === "summary"}>
          <Sparkles size={16} />
          {busy === "summary" ? "Se rezuma..." : "Rezumat"}
        </button>
        <button className="secondary-button reader-analysis-control" onClick={loadDifficulty}>
          <BarChart3 size={16} />
          Nivel
        </button>
      </div>

      <div className="reader-layout">
        <nav className="reader-toc" aria-label="Cuprins">
          <div className="toc-heading">
            <span className="eyebrow">Cuprins</span>
            <strong>{pagination.contents.length} capitole</strong>
          </div>
          <div className="toc-list" ref={tocListRef}>
            {pagination.contents.map((chapter) => (
              <button
                className={activeChapter?.id === chapter.id ? "active" : ""}
                key={chapter.id}
                ref={activeChapter?.id === chapter.id ? activeTocRef : null}
                onClick={() => goToPage(chapter.page)}
              >
                <span>{chapter.title}</span>
                <small>{chapter.page + 1}</small>
              </button>
            ))}
          </div>
        </nav>

        <div className="reader-stage">
        <article
          className="reader-page"
          style={{ maxWidth: pageWidth, fontFamily, fontSize }}
        >
          <header className="reader-title">
            <span>{page?.chapterTitle || book.title}</span>
            <h2>{currentPage === 0 ? book.title : page?.chapterTitle}</h2>
            <ProgressBar value={progressPercent} />
          </header>

          {sentences.map((sentence, sentenceIndex) => (
            <span
              className={`sentence ${
                savedLocalSentenceIndex === sentenceIndex ? "saved-position-sentence" : ""
              }`}
              ref={savedLocalSentenceIndex === sentenceIndex ? savedSentenceRef : null}
              key={`${sentenceIndex}-${sentence.slice(0, 12)}`}
            >
              {sentence.split(/(\b[A-Za-z][A-Za-z'-]*\b)/g).map((part, index) => {
                const normalized = normalizeWord(part);
                if (!normalized) return part;
                const isSelected = selected?.sentenceIndex === sentenceIndex && selected?.tokenIndex === index;
                return (
                  <button
                    className={`word-token ${highlighted.has(normalized) ? "highlighted" : ""} ${isSelected ? "selected-word" : ""}`}
                    key={`${sentenceIndex}-${index}-${part}`}
                    onClick={() => selectWord(part, sentence, sentenceIndex, index)}
                  >
                    {part}
                  </button>
                );
              })}{" "}
            </span>
          ))}
          <footer className="book-page-number">
            {page?.sourcePage ? `Pagina PDF ${page.sourcePage}` : `Pagina ${currentPage + 1}`} din {pagination.pages.length}
          </footer>
        </article>
        <div className="page-navigation">
          <button className="secondary-button" disabled={currentPage === 0} onClick={() => goToPage(currentPage - 1)}>
            <ChevronLeft size={18} />
            Anterioara
          </button>
          <label>
            Pagina
            <input
              type="number"
              min="1"
              max={pagination.pages.length}
              value={currentPage + 1}
              onChange={(event) => goToPage(Number(event.target.value) - 1)}
            />
            <span>din {pagination.pages.length}</span>
          </label>
          <button
            className="primary-button"
            disabled={currentPage >= pagination.pages.length - 1}
            onClick={() => goToPage(currentPage + 1)}
          >
            Urmatoarea
            <ChevronRight size={18} />
          </button>
        </div>
        </div>

        <aside className={`reader-inspector ${selected ? "has-selection" : "no-selection"}`}>
          {selected ? (
            <div className="inspector-block">
              <div className="inspector-heading">
                <div>
                  <span className="eyebrow">Cuvant selectat</span>
                  <h3>{selected.word}</h3>
                </div>
                <button className="icon-button" onClick={() => speak(selected.word)} title="Pronunta cuvant">
                  <Volume2 size={18} />
                </button>
                <button className="icon-button mobile-close-word" onClick={() => setSelected(null)} title="Inchide">
                  <X size={18} />
                </button>
                {selectedVocabulary && (
                  <button className="icon-button remove-highlight" onClick={removeVocabulary} title="Elimina din vocabular si sterge highlight-ul">
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
              <div className="active-model">
                <Sparkles size={14} />
                {model === "ollama" ? "Mistral local" : "ChatGPT API"}
              </div>
              {busy === "translate" ? (
                <div className="mini-loader">Se traduce contextual...</div>
              ) : translationError ? (
                <div className="translation-error" role="alert">
                  <strong>Traducerea nu este disponibila</strong>
                  <p>{translationError}</p>
                  <button
                    className="secondary-button"
                    onClick={() => setSelected((value) => value ? { ...value, requestId: Date.now() } : value)}
                  >
                    Incearca din nou
                  </button>
                </div>
              ) : translation ? (
                <>
                  <div className="translation-card">
                    <span>Traducere · {translation.provider === "ollama" ? "Mistral local" : translation.provider === "openai" ? "OpenAI" : "local"}</span>
                    <strong>{translation.translation}</strong>
                    <p>{translation.explanation}</p>
                  </div>
                  <SentenceAudio label="Propozitie EN" text={selected.sentence} lang="en-US" />
                  <SentenceAudio label="Propozitie RO" text={translation.sentenceRo} lang="ro-RO" />
                  <button className="primary-button" onClick={saveVocabulary}>
                    <Check size={16} />
                    Salveaza vocabular
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="empty-panel">Click pe un cuvant din text.</div>
          )}

          {book.bookmarks?.length ? (
            <div className="inspector-block">
              <span className="eyebrow">Bookmark-uri</span>
              <div className="bookmark-list">
                {book.bookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    onClick={() => goToPage(Number(bookmark.page ?? bookmark.position) || 0)}
                  >
                    <Bookmark size={14} />
                    <span>{bookmark.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {summary && (
            <AiPanel title="Rezumat capitol" items={summary.mainIdeas}>
              <div className="summary-copy">
                {summary.summary.split(/\n{2,}/).map((paragraph) => (
                  <p key={paragraph.slice(0, 80)}>{paragraph}</p>
                ))}
              </div>
            </AiPanel>
          )}

          {difficulty && (
            <div className="inspector-block">
              <span className="eyebrow">Difficulty Analyzer</span>
              <div className="level-badge">{difficulty.level}</div>
              <dl className="data-list">
                <div><dt>Reading time</dt><dd>{difficulty.readingTimeMinutes} min</dd></div>
                <div><dt>Density</dt><dd>{difficulty.vocabularyDensity}%</dd></div>
                <div><dt>Difficult words</dt><dd>{difficulty.difficultWords.length}</dd></div>
              </dl>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function SentenceAudio({ label, text, lang }) {
  return (
    <div className="sentence-audio">
      <span>{label}</span>
      <p>{text}</p>
      <button className="icon-button" onClick={() => speak(text, lang)} title="Pronunta propozitia">
        <Volume2 size={17} />
      </button>
    </div>
  );
}

function AiPanel({ title, items, children }) {
  return (
    <div className="inspector-block">
      <span className="eyebrow">AI</span>
      <h3>{title}</h3>
      {children}
      <ul className="idea-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function VocabularyView({ books, vocabulary, onRefresh }) {
  const [query, setQuery] = useState("");
  const [bookId, setBookId] = useState("");
  const [learnedOverrides, setLearnedOverrides] = useState({});
  const effectiveVocabulary = useMemo(
    () => vocabulary.map((item) => ({
      ...item,
      learned: Object.prototype.hasOwnProperty.call(learnedOverrides, item.id)
        ? learnedOverrides[item.id]
        : item.learned,
    })),
    [vocabulary, learnedOverrides],
  );
  const bookWordCounts = useMemo(() => {
    const counts = new Map();
    vocabulary.forEach((item) => counts.set(item.bookId, (counts.get(item.bookId) || 0) + 1));
    return counts;
  }, [vocabulary]);

  useEffect(() => {
    setLearnedOverrides({});
  }, [vocabulary]);

  const filtered = effectiveVocabulary.filter((item) => {
    const matchesBook = !bookId || item.bookId === bookId;
    const matchesQuery = !query || `${item.word} ${item.translation} ${item.bookTitle} ${item.sentence}`
      .toLowerCase()
      .includes(query.toLowerCase());
    return matchesBook && matchesQuery;
  });

  const markLearned = async (item) => {
    const nextLearned = !item.learned;
    setLearnedOverrides((current) => ({ ...current, [item.id]: nextLearned }));
    try {
      await api.updateVocabulary(item.id, { learned: nextLearned });
      await onRefresh();
    } catch (error) {
      setLearnedOverrides((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      throw error;
    }
  };

  return (
    <section className="view-grid">
      <div className="vocabulary-overview">
        <div>
          <span className="eyebrow">Vocabular personal</span>
          <h2>{vocabulary.length} cuvinte salvate</h2>
        </div>
        <div className="vocabulary-counts">
          <span><strong>{filtered.length}</strong> afisate</span>
          <span><strong>{effectiveVocabulary.filter((item) => item.learned).length}</strong> invatate</span>
        </div>
      </div>
      <div className="filters-row">
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cauta cuvant" />
        </label>
        <select value={bookId} onChange={(event) => setBookId(event.target.value)}>
          <option value="">Toate cartile ({vocabulary.length})</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title} ({bookWordCounts.get(book.id) || 0})
            </option>
          ))}
        </select>
        <a className="secondary-button" href={api.exportUrl({ format: "csv", bookId })}>
          <Download size={16} />
          CSV
        </a>
        <a className="secondary-button" href={api.exportUrl({ format: "xlsx", bookId })}>
          <Download size={16} />
          Excel
        </a>
      </div>

      <div className="vocab-table">
        {filtered.map((item) => (
          <article className={`vocab-row ${item.learned ? "learned" : ""}`} key={item.id}>
            <button className="icon-button vocab-audio" onClick={() => speak(item.word)} title={`Pronunta ${item.word}`}>
              <Volume2 size={17} />
            </button>
            <div className="vocab-word">
              <strong>{item.word}</strong>
              <span>{item.translation}</span>
              <small>{item.bookTitle || "Carte necunoscuta"}</small>
              {item.learned && <em>Invatat</em>}
            </div>
            <div className="vocab-context">
              <p>{item.sentence}</p>
              <p className="muted">{item.sentenceRo}</p>
            </div>
            <button
              className="icon-button"
              onClick={() => markLearned(item)}
              title={item.learned ? "Marcheaza ca neinvatat" : "Marcheaza invatat"}
              aria-pressed={item.learned}
            >
              <Check size={18} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function LearningMode({ books, currentBookId, vocabulary, onRefresh }) {
  const [mode, setMode] = useState("vocabulary");

  return (
    <section className="learning-hub">
      <div className="learning-mode-header">
        <div>
          <span className="eyebrow">Learning</span>
          <h2>Antreneaza vocabularul si intelegerea cartii</h2>
          <p>Alege flashcards pentru cuvintele salvate sau genereaza un quiz AI dintr-un capitol.</p>
        </div>
        <div className="learning-tabs" role="tablist">
          <button className={mode === "vocabulary" ? "active" : ""} onClick={() => setMode("vocabulary")}>
            <ListChecks size={17} />
            Vocabular
          </button>
          <button className={mode === "quiz" ? "active" : ""} onClick={() => setMode("quiz")}>
            <Sparkles size={17} />
            Quiz din capitol
          </button>
        </div>
      </div>
      {mode === "vocabulary" ? (
        <VocabularyLearning vocabulary={vocabulary} onRefresh={onRefresh} />
      ) : (
        <ChapterQuiz books={books} currentBookId={currentBookId} />
      )}
    </section>
  );
}

function VocabularyLearning({ vocabulary, onRefresh }) {
  const groups = useMemo(() => {
    const chunks = [];
    for (let index = 0; index < vocabulary.length; index += 20) {
      chunks.push(vocabulary.slice(index, index + 20));
    }
    return chunks;
  }, [vocabulary]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [learnedOverrides, setLearnedOverrides] = useState({});
  const [completionPrompt, setCompletionPrompt] = useState(false);
  const baseGroup = groups[groupIndex] || [];
  const group = useMemo(
    () => baseGroup.map((item) => ({
      ...item,
      learned: Object.prototype.hasOwnProperty.call(learnedOverrides, item.id)
        ? learnedOverrides[item.id]
        : item.learned,
    })),
    [baseGroup, learnedOverrides],
  );
  const card = group[cardIndex];
  const learned = group.filter((item) => item.learned).length;
  const completedCurrentGroup = group.length && group.every((item) => item.learned);

  useEffect(() => {
    setCardIndex(0);
    setFlipped(false);
    setCompletionPrompt(false);
  }, [groupIndex]);

  useEffect(() => {
    setLearnedOverrides({});
    setCompletionPrompt(false);
  }, [vocabulary]);

  if (!vocabulary.length) return <div className="empty-state">Salveaza cuvinte din reader pentru flashcards.</div>;

  const resetGroupProgress = async () => {
    if (!group.length) return;
    setLearnedOverrides((current) => {
      const next = { ...current };
      group.forEach((item) => {
        next[item.id] = false;
      });
      return next;
    });
    await Promise.all(group.map((item) => api.updateVocabulary(item.id, { learned: false })));
    setCardIndex(0);
    setFlipped(false);
    setCompletionPrompt(false);
    await onRefresh();
  };

  const finishGroup = () => {
    setCompletionPrompt(true);
  };

  const hasNextGroup = groupIndex < groups.length - 1;

  const continueAfterGroup = () => {
    setCompletionPrompt(false);
    if (hasNextGroup) {
      setGroupIndex(groupIndex + 1);
      setCardIndex(0);
      setFlipped(false);
    }
  };

  const advanceCard = async () => {
    setFlipped(false);
    if (cardIndex < group.length - 1) {
      setCardIndex(cardIndex + 1);
    } else {
      await finishGroup();
    }
  };

  const updateLearned = async () => {
    if (!card) return;
    setLearnedOverrides((current) => ({ ...current, [card.id]: true }));
    await api.updateVocabulary(card.id, { learned: true });
    await onRefresh();
    if (cardIndex < group.length - 1) {
      setFlipped(false);
      setCardIndex(cardIndex + 1);
    } else {
      await finishGroup();
    }
  };

  const goBack = () => {
    setCardIndex(Math.max(0, cardIndex - 1));
    setFlipped(false);
  };

  return (
    <section className="learning-layout">
      <div className="learning-header">
        <div>
          <span className="eyebrow">Sesiune de repetare</span>
          <h2>Invata cate un cuvant</h2>
          <p>Apasa pe card pentru traducere, apoi marcheaza cuvintele pe care le stapanesti.</p>
        </div>
        <div className="learning-group-picker">
          <button className="icon-button" disabled={groupIndex === 0} onClick={() => setGroupIndex(groupIndex - 1)}>
            <ChevronLeft size={18} />
          </button>
          <span>Grup {groupIndex + 1} din {groups.length}</span>
          <button className="icon-button" disabled={groupIndex >= groups.length - 1} onClick={() => setGroupIndex(groupIndex + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {card && (
        <div className="learning-workspace">
          <aside className="learning-progress-panel">
            <span className="eyebrow">Progres grup</span>
            <strong>{learned} din {group.length}</strong>
            <ProgressBar value={group.length ? Math.round((learned / group.length) * 100) : 0} />
            <dl>
              <div><dt>Card curent</dt><dd>{cardIndex + 1}</dd></div>
              <div><dt>Ramase</dt><dd>{Math.max(0, group.length - cardIndex - 1)}</dd></div>
              <div><dt>Carte</dt><dd>{card.bookTitle || "Necunoscuta"}</dd></div>
            </dl>
          </aside>

          <article
            className={`flashcard ${flipped ? "flipped" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setFlipped(!flipped)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setFlipped(!flipped);
              }
            }}
            aria-label={flipped ? "Afiseaza cuvantul in engleza" : "Afiseaza traducerea in romana"}
          >
            <div className="flashcard-topline">
              <span>{flipped ? "Traducere" : "Flashcard"}</span>
              <strong>{cardIndex + 1} / {group.length}</strong>
            </div>
            <button
              className="flashcard-audio"
              onClick={(event) => {
                event.stopPropagation();
                speak(card.word);
              }}
              title={`Pronunta ${card.word}`}
            >
              <Volume2 size={20} />
            </button>
            <div className="flashcard-content">
              <strong>{flipped ? card.translation : card.word}</strong>
              <p>{flipped ? card.sentenceRo : card.sentence}</p>
            </div>
            <div className="flashcard-cue" aria-hidden="true">
              <RotateCcw size={16} />
              <span />
              <span />
              <span />
            </div>
          </article>
        </div>
      )}

      {completionPrompt && (
        <div className="learning-complete-card" role="status" aria-live="polite">
          <div>
            <span className="eyebrow">Grup finalizat</span>
            <strong>{learned} din {group.length} cuvinte parcurse</strong>
            <p>
              {hasNextGroup
                ? "Vrei sa treci la urmatorul grup sau sa resetezi progresul si sa repeti aceste cuvinte de la 0?"
                : "Ai ajuns la ultimul grup. Poti pastra progresul sau il poti reseta pentru a repeta cuvintele de la 0."}
            </p>
          </div>
          <div className="learning-complete-actions">
            <button className="secondary-button" onClick={resetGroupProgress}>
              <RotateCcw size={16} />
              Reseteaza si repeta
            </button>
            <button className="primary-button" onClick={continueAfterGroup}>
              {hasNextGroup ? <ChevronRight size={16} /> : <Check size={16} />}
              {hasNextGroup ? "Urmatorul grup" : "Pastreaza progresul"}
            </button>
          </div>
        </div>
      )}

      <div className="learning-actions">
        <button
          className="secondary-button"
          onClick={goBack}
        >
          <ChevronLeft size={16} />
          Inapoi
        </button>
        <button className="secondary-button repeat-button" onClick={advanceCard}>
          <RotateCcw size={16} />
          Repeta mai tarziu
        </button>
        {completedCurrentGroup && (
          <button className="secondary-button" onClick={resetGroupProgress}>
            <RotateCcw size={16} />
            Reseteaza grupul
          </button>
        )}
        <button className="primary-button" onClick={updateLearned}>
          <Check size={16} />
          Stiu, urmatorul
        </button>
      </div>
    </section>
  );
}

function ChapterQuiz({ books, currentBookId }) {
  const [bookId, setBookId] = useState(currentBookId || books[0]?.id || "");
  const [book, setBook] = useState(null);
  const [chapterId, setChapterId] = useState("");
  const [model, setModel] = useState("gpt");
  const [count, setCount] = useState(5);
  const [quiz, setQuiz] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const quizChapters = useMemo(() => {
    if (!book?.chapters) return [];
    if (book.sourcePages?.length) return book.chapters;
    return book.chapters.filter((chapter) => (chapter.text || "").trim().length >= 300);
  }, [book]);

  useEffect(() => {
    if (!bookId) return;
    setBook(null);
    setQuiz(null);
    setError("");
    api.book(bookId)
      .then((loadedBook) => {
        setBook(loadedBook);
        const firstUsableChapter = loadedBook.sourcePages?.length
          ? loadedBook.chapters?.[0]
          : loadedBook.chapters?.find((chapter) => (chapter.text || "").trim().length >= 300);
        setChapterId(firstUsableChapter?.id || "");
      })
      .catch((loadError) => setError(loadError.message));
  }, [bookId]);

  const generateQuiz = async () => {
    if (!bookId || !chapterId) return;
    setBusy(true);
    setError("");
    setQuiz(null);
    setQuestionIndex(0);
    setAnswers({});
    setFinished(false);
    try {
      setQuiz(await api.quiz({ bookId, chapterId, model, count }));
    } catch (quizError) {
      setError(quizError.message);
    } finally {
      setBusy(false);
    }
  };

  const questions = quiz?.questions || [];
  const question = questions[questionIndex];
  const selectedAnswer = question ? answers[question.id] : undefined;
  const completed = questions.length > 0 && finished;
  const score = questions.reduce(
    (total, item) => total + (answers[item.id] === item.correctIndex ? 1 : 0),
    0,
  );

  return (
    <div className="quiz-layout">
      <aside className="quiz-setup">
        <div>
          <span className="eyebrow">Generator AI</span>
          <h3>Configureaza quiz-ul</h3>
        </div>
        <label>
          Carte
          <select value={bookId} onChange={(event) => setBookId(event.target.value)}>
            {books.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label>
          Capitol
          <select value={chapterId} onChange={(event) => setChapterId(event.target.value)} disabled={!book}>
            {quizChapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
            ))}
          </select>
        </label>
        <label>
          Motor AI
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            <option value="gpt">ChatGPT API</option>
            <option value="ollama">Mistral local</option>
          </select>
        </label>
        <label>
          Numar intrebari
          <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
            <option value={3}>3 intrebari</option>
            <option value={5}>5 intrebari</option>
            <option value={8}>8 intrebari</option>
            <option value={10}>10 intrebari</option>
          </select>
        </label>
        <button className="primary-button" disabled={busy || !chapterId} onClick={generateQuiz}>
          <Sparkles size={16} />
          {busy ? "AI genereaza..." : "Genereaza quiz"}
        </button>
        <small>Intrebarile sunt create exclusiv din continutul capitolului selectat.</small>
      </aside>

      <section className="quiz-workspace">
        {error && <div className="quiz-error">{error}</div>}
        {!quiz && !busy && !error && (
          <div className="quiz-empty">
            <Sparkles size={28} />
            <h3>Testeaza cat ai inteles din lectura</h3>
            <p>AI-ul va crea intrebari despre personaje, locuri, evenimente si motivatii.</p>
          </div>
        )}
        {busy && <div className="mini-loader">Se analizeaza capitolul si se compun intrebarile...</div>}
        {question && !completed && (
          <article className="quiz-question">
            <div className="quiz-progress">
              <span>Intrebarea {questionIndex + 1} din {questions.length}</span>
              <ProgressBar value={((questionIndex + 1) / questions.length) * 100} />
            </div>
            <h3>{question.question}</h3>
            <div className="quiz-options">
              {question.options.map((option, index) => {
                const answered = selectedAnswer !== undefined;
                const optionClass = answered
                  ? index === question.correctIndex
                    ? "correct"
                    : index === selectedAnswer
                      ? "wrong"
                      : ""
                  : "";
                return (
                  <button
                    key={`${question.id}-${option}`}
                    className={optionClass}
                    disabled={answered}
                    onClick={() => setAnswers((current) => ({ ...current, [question.id]: index }))}
                  >
                    <span>{String.fromCharCode(65 + index)}</span>
                    {option}
                  </button>
                );
              })}
            </div>
            {selectedAnswer !== undefined && (
              <div className={`quiz-feedback ${selectedAnswer === question.correctIndex ? "correct" : "wrong"}`}>
                <strong>{selectedAnswer === question.correctIndex ? "Corect" : "Raspuns incorect"}</strong>
                <p>{question.explanation}</p>
                <button
                  className="primary-button"
                  onClick={() => {
                    if (questionIndex === questions.length - 1) {
                      setFinished(true);
                    } else {
                      setQuestionIndex(questionIndex + 1);
                    }
                  }}
                >
                  {questionIndex === questions.length - 1 ? "Vezi rezultatul" : "Intrebarea urmatoare"}
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </article>
        )}
        {completed && (
          <div className="quiz-result">
            <span className="eyebrow">Quiz finalizat</span>
            <strong>{score} / {questions.length}</strong>
            <h3>{score / questions.length >= 0.8 ? "Ai inteles foarte bine capitolul." : "Capitolul merita recitit."}</h3>
            <p>{quiz.bookTitle} · {quiz.chapterTitle}</p>
            <button className="primary-button" onClick={generateQuiz}>
              <RotateCcw size={16} />
              Genereaza alte intrebari
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function CoachView({ coach, onRefresh, onToggleTask, stats }) {
  const [model, setModel] = useState("gpt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const regenerate = async () => {
    setBusy(true);
    setError("");
    try {
      await onRefresh(model);
    } catch (coachError) {
      setError(coachError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="coach-layout">
      <div className="coach-hero">
        <div>
          <span className="eyebrow">AI Reading Coach</span>
          <h2>{coach?.headline || "Analiza automata bazata pe lectura si vocabular"}</h2>
          <p>{coach?.insight || "AI-ul identifica tipare si construieste un plan de invatare personalizat."}</p>
        </div>
        <div className="coach-actions">
          <select value={model} onChange={(event) => setModel(event.target.value)} aria-label="Motor AI Coach">
            <option value="gpt">ChatGPT API</option>
            <option value="ollama">Mistral local</option>
          </select>
          <button className="primary-button" onClick={regenerate} disabled={busy}>
            <Sparkles size={16} />
            {busy ? "Se analizeaza..." : "Genereaza analiza"}
          </button>
        </div>
      </div>
      {error && <div className="quiz-error">{error}</div>}
      <div className="coach-daily-grid">
        <section className="coach-tasks">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Planul de azi</span>
              <h2>Task-uri recomandate</h2>
            </div>
            <strong>
              {coach?.tracker?.today?.tasks?.filter((task) => task.completed).length || 0}
              {" / "}
              {coach?.tracker?.today?.tasks?.length || 0}
            </strong>
          </div>
          <div className="daily-task-list">
            {(coach?.tracker?.today?.tasks || []).map((task) => (
              <button
                key={task.id}
                className={task.completed ? "completed" : ""}
                onClick={() => onToggleTask(coach.tracker.today.date, task.id, !task.completed)}
              >
                <span className="task-check">{task.completed ? <Check size={16} /> : null}</span>
                <span className="task-copy">
                  <strong>{task.title}</strong>
                  <small>{task.detail}</small>
                </span>
                <span className="task-time">{task.minutes} min</span>
              </button>
            ))}
          </div>
        </section>
        <section className="coach-week">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Ritmul tau</span>
              <h2>Progres pe zile</h2>
            </div>
            <span className="streak-badge">{coach?.tracker?.streak || 0} zile consecutive</span>
          </div>
          <div className="week-progress">
            {(coach?.tracker?.days || []).map((day) => (
              <div key={day.date} className={day.isToday ? "today" : ""}>
                <span>{day.label}</span>
                <div className="day-progress-track">
                  <i style={{ height: `${Math.max(6, day.percent)}%` }} />
                </div>
                <strong>{day.day}</strong>
                <small>{day.total ? `${day.completed}/${day.total}` : "—"}</small>
              </div>
            ))}
          </div>
          <div className="week-summary">
            <div><span>Task-uri saptamana</span><strong>{coach?.tracker?.completedThisWeek || 0}/{coach?.tracker?.totalThisWeek || 0}</strong></div>
            <ProgressBar value={
              coach?.tracker?.totalThisWeek
                ? (coach.tracker.completedThisWeek / coach.tracker.totalThisWeek) * 100
                : 0
            } />
          </div>
        </section>
      </div>
      <div className="metric-grid">
        <article className="metric-card">
          <span>Target zilnic</span>
          <strong>{coach?.dailyTarget || 10} cuvinte</strong>
        </article>
        <article className="metric-card">
          <span>Timp citire</span>
          <strong>{stats?.readingMinutes || 0} min</strong>
        </article>
        <article className="metric-card">
          <span>Analiza realizata cu</span>
          <strong>{coach?.provider === "ollama" ? "Mistral" : "GPT"}</strong>
        </article>
      </div>
      <div className="coach-section">
        <div className="section-heading">
          <div><span className="eyebrow">Plan personalizat</span><h2>Sesiunea recomandata</h2></div>
        </div>
        <div className="coach-plan">
          {(coach?.plan || []).map((item, index) => (
            <article key={`${item.title}-${index}`}>
              <span>{index + 1}</span>
              <div><strong>{item.title}</strong><p>{item.detail}</p></div>
              <small>{item.minutes} min</small>
            </article>
          ))}
        </div>
      </div>
      <div className="coach-section">
        <div className="section-heading">
          <div><span className="eyebrow">Detectie AI</span><h2>Zone de imbunatatit</h2></div>
        </div>
        <div className="coach-focus-grid">
          {(coach?.focusAreas || []).map((area) => (
            <article key={area.title}>
              <div><strong>{area.title}</strong><span>{area.score}%</span></div>
              <ProgressBar value={area.score} />
              <p>{area.detail}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="recommendation-list">
        {(coach?.recommendations || []).map((recommendation) => (
          <article key={recommendation.title} className="recommendation">
            <Sparkles size={18} />
            <div>
              <strong>{recommendation.title}</strong>
              <p>{recommendation.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="progress-bar" aria-label={`Progres ${value}%`}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      <strong>{Math.round(value)}%</strong>
    </div>
  );
}

export default App;
