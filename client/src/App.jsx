import {
  BarChart3,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  Library,
  ListChecks,
  Moon,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Upload,
  Volume2,
} from "lucide-react";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

const paginateBook = (book, wordsPerPage) => {
  if (!book) return { pages: [], contents: [] };

  if (book.sourcePages?.length) {
    const pages = book.sourcePages.map((text, index) => ({
      text,
      chapterTitle:
        book.chapters?.find((chapter) => index >= chapter.startPage && index <= chapter.endPage)?.title || "Inceput",
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
    sentences.forEach((sentence) => {
      const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;
      if (pageText && wordCount + sentenceWords > wordsPerPage) {
        pages.push({ text: pageText.trim(), chapterTitle: chapter.title });
        pageText = "";
        wordCount = 0;
      }
      pageText += `${sentence} `;
      wordCount += sentenceWords;
    });
    if (pageText.trim()) pages.push({ text: pageText.trim(), chapterTitle: chapter.title });
  });
  return { pages, contents };
};

const speak = (text, lang = "en-US") => {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
};

function App() {
  const [activeView, setActiveView] = useState("dashboard");
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

  const loadCoach = async () => {
    const data = await api.coach();
    setCoach(data);
  };

  useEffect(() => {
    if (activeView === "coach") loadCoach().catch((error) => setNotice(error.message));
  }, [activeView]);

  return (
    <div className="app-shell">
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
            <span className="eyebrow">Aplicatie full stack</span>
            <h1>{navigation.find((item) => item.id === activeView)?.label || "LinguaRead"}</h1>
          </div>
          <BookSelector books={books} value={currentBookId} onChange={setCurrentBookId} />
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
              <LibraryView books={books} onUpload={handleUpload} onOpenBook={handleOpenBook} />
            )}
            {activeView === "reader" && (
              <Reader
                book={currentBook}
                vocabulary={bookVocabulary}
                onRefresh={refreshBook}
                onNotice={setNotice}
              />
            )}
            {activeView === "vocabulary" && (
              <VocabularyView books={books} vocabulary={vocabulary} onRefresh={refresh} />
            )}
            {activeView === "learning" && (
              <LearningMode vocabulary={vocabulary} onRefresh={refresh} />
            )}
            {activeView === "coach" && (
              <CoachView coach={coach} onRefresh={loadCoach} stats={stats} />
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
    { label: "Timp citire", value: `${stats?.readingMinutes || 0} min` },
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

function LibraryView({ books, onUpload, onOpenBook }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [bookFile, setBookFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [busy, setBusy] = useState(false);

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

      <div className="book-grid">
        {books.map((book) => (
          <article className="book-card" key={book.id}>
            <Cover book={book} />
            <div className="book-card-body">
              <span className="tag">{book.fileType.toUpperCase()}</span>
              <h3>{book.title}</h3>
              <p>{book.author || "Autor necunoscut"}</p>
              <ProgressBar value={book.progress?.percent || 0} />
              <button className="secondary-button" onClick={() => onOpenBook(book.id)}>
                <BookOpen size={16} />
                Deschide
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
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

function Reader({ book, vocabulary, onRefresh, onNotice }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("lr-theme") || "light");
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("lr-font-size")) || 18);
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem("lr-font") || fontOptions[0].value);
  const [pageWidth, setPageWidth] = useState(() => Number(localStorage.getItem("lr-page-width")) || 760);
  const [selected, setSelected] = useState(null);
  const [model, setModel] = useState("gpt");
  const [translation, setTranslation] = useState(null);
  const [translationError, setTranslationError] = useState("");
  const [summary, setSummary] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [busy, setBusy] = useState("");
  const [currentPage, setCurrentPage] = useState(0);

  const wordsPerPage = Math.max(180, Math.round(430 * (pageWidth / 760) * (18 / fontSize)));
  const pagination = useMemo(() => paginateBook(book, wordsPerPage), [book, wordsPerPage]);
  const page = pagination.pages[currentPage] || pagination.pages[0];
  const sentences = useMemo(() => splitSentences(page?.text), [page?.text]);
  const highlighted = useMemo(() => new Set(vocabulary.map((item) => normalizeWord(item.word))), [vocabulary]);
  const progressPercent = pagination.pages.length
    ? Math.round(((currentPage + 1) / pagination.pages.length) * 100)
    : 0;

  useEffect(() => {
    localStorage.setItem("lr-theme", theme);
    localStorage.setItem("lr-font-size", String(fontSize));
    localStorage.setItem("lr-font", fontFamily);
    localStorage.setItem("lr-page-width", String(pageWidth));
  }, [theme, fontSize, fontFamily, pageWidth]);

  useEffect(() => {
    setSelected(null);
    setTranslation(null);
    setTranslationError("");
    setSummary(null);
    setDifficulty(null);
    setCurrentPage(Math.max(0, Number(book?.progress?.page) || 0));
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

  if (!book) return <div className="empty-state">Alege sau incarca o carte.</div>;

  const addBookmark = async () => {
    await api.addBookmark(book.id, {
      position: currentPage,
      page: currentPage,
      percent: progressPercent,
      label: selected?.sentence?.slice(0, 80) || `${page?.chapterTitle || "Pagina"} · ${currentPage + 1}`,
    });
    await onRefresh();
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

  const loadSummary = async () => {
    setBusy("summary");
    api
      .summary({ bookId: book.id, text: page?.text, chapterTitle: page?.chapterTitle })
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
    saveProgress(safePage);
  };

  return (
    <section className={`reader-shell ${theme}`}>
      <div className="reader-toolbar">
        <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} title="Light/Dark">
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <label className="range-label">
          Aa
          <input min="15" max="28" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} type="range" />
        </label>
        <label className="select-label compact">
          <Settings size={16} />
          <select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
            {fontOptions.map((font) => (
              <option value={font.value} key={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <label className="range-label wide">
          Latime
          <input min="560" max="980" value={pageWidth} onChange={(event) => setPageWidth(Number(event.target.value))} type="range" />
        </label>
        <button className="secondary-button" onClick={addBookmark}>
          <Bookmark size={16} />
          Bookmark
        </button>
        <button className="secondary-button" onClick={loadSummary}>
          <Sparkles size={16} />
          Rezumat
        </button>
        <button className="secondary-button" onClick={loadDifficulty}>
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
          <div className="toc-list">
            {pagination.contents.map((chapter) => (
              <button
                className={currentPage >= chapter.page &&
                  currentPage < (pagination.contents.find((item) => item.page > chapter.page)?.page ?? Infinity)
                  ? "active"
                  : ""}
                key={chapter.id}
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
            <span className="sentence" key={`${sentenceIndex}-${sentence.slice(0, 12)}`}>
              {sentence.split(/(\b[A-Za-z][A-Za-z'-]*\b)/g).map((part, index) => {
                const normalized = normalizeWord(part);
                if (!normalized) return part;
                return (
                  <button
                    className={`word-token ${highlighted.has(normalized) ? "highlighted" : ""}`}
                    key={`${sentenceIndex}-${index}-${part}`}
                    onClick={() => setSelected({ word: part, sentence, sentenceIndex })}
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

        <aside className="reader-inspector">
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
              </div>
              <label>
                Model
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  <option value="gpt">GPT OpenAI API</option>
                  <option value="ollama">Local AI Mistral 7B</option>
                </select>
              </label>
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
              <p>{summary.summary}</p>
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

  const filtered = vocabulary.filter((item) => {
    const matchesBook = !bookId || item.bookId === bookId;
    const matchesQuery = !query || `${item.word} ${item.translation}`.toLowerCase().includes(query.toLowerCase());
    return matchesBook && matchesQuery;
  });

  const markLearned = async (item) => {
    await api.updateVocabulary(item.id, { learned: !item.learned });
    await onRefresh();
  };

  return (
    <section className="view-grid">
      <div className="filters-row">
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cauta cuvant" />
        </label>
        <select value={bookId} onChange={(event) => setBookId(event.target.value)}>
          <option value="">Toate cartile</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
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
            <div>
              <strong>{item.word}</strong>
              <span>{item.translation}</span>
            </div>
            <p>{item.sentence}</p>
            <p className="muted">{item.sentenceRo}</p>
            <button className="icon-button" onClick={() => markLearned(item)} title="Marcheaza invatat">
              <Check size={18} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function LearningMode({ vocabulary, onRefresh }) {
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
  const group = groups[groupIndex] || [];
  const card = group[cardIndex];
  const learned = group.filter((item) => item.learned).length;

  useEffect(() => {
    setCardIndex(0);
    setFlipped(false);
  }, [groupIndex]);

  if (!vocabulary.length) return <div className="empty-state">Salveaza cuvinte din reader pentru flashcards.</div>;

  const updateLearned = async () => {
    if (!card) return;
    await api.updateVocabulary(card.id, { learned: true });
    await onRefresh();
  };

  return (
    <section className="learning-layout">
      <div className="learning-controls">
        <button className="icon-button" disabled={groupIndex === 0} onClick={() => setGroupIndex(groupIndex - 1)}>
          <ChevronLeft size={18} />
        </button>
        <span>Grup {groupIndex + 1} / {groups.length}</span>
        <button className="icon-button" disabled={groupIndex >= groups.length - 1} onClick={() => setGroupIndex(groupIndex + 1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <ProgressBar value={group.length ? Math.round((learned / group.length) * 100) : 0} />

      {card && (
        <button className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
          <span>{flipped ? card.translation : card.word}</span>
          <p>{flipped ? card.sentenceRo : card.sentence}</p>
        </button>
      )}

      <div className="learning-actions">
        <button className="secondary-button" onClick={() => setCardIndex(Math.max(0, cardIndex - 1))}>
          <ChevronLeft size={16} />
          Inapoi
        </button>
        <button className="primary-button" onClick={updateLearned}>
          <Check size={16} />
          Stiu
        </button>
        <button className="secondary-button" onClick={() => setCardIndex(Math.min(group.length - 1, cardIndex + 1))}>
          Urmator
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}

function CoachView({ coach, onRefresh, stats }) {
  return (
    <section className="coach-layout">
      <div className="coach-hero">
        <div>
          <span className="eyebrow">AI Reading Coach</span>
          <h2>Recomandari bazate pe progres si vocabular</h2>
        </div>
        <button className="primary-button" onClick={onRefresh}>
          <Sparkles size={16} />
          Actualizeaza
        </button>
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
