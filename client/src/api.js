const defaultApiBase =
  typeof window === "undefined" ? "http://localhost:4000/api" : `${window.location.protocol}//${window.location.hostname}:4000/api`;

export const API_BASE = import.meta.env.VITE_API_URL || defaultApiBase;
export const DATA_PROVIDER = import.meta.env.VITE_DATA_PROVIDER || "server";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;
  return response.json();
}

const serverApi = {
  recordActivity: (type, payload) => request("/ai/activity", { method: "POST", body: JSON.stringify({ type, payload }) }),
  books: () => request("/books"),
  book: (id) => request(`/books/${id}`),
  uploadBook: (formData) => request("/books", { method: "POST", body: formData }),
  updateBook: (bookId, formData) => request(`/books/${bookId}`, { method: "PATCH", body: formData }),
  deleteBook: (bookId, keepVocabulary = false) =>
    request(`/books/${bookId}?keepVocabulary=${keepVocabulary}`, { method: "DELETE" }),
  updateProgress: (bookId, payload) =>
    request(`/books/${bookId}/progress`, { method: "PATCH", body: JSON.stringify(payload) }),
  saveReadingPosition: (bookId, payload) =>
    request(`/books/${bookId}/saved-position`, { method: "PATCH", body: JSON.stringify(payload) }),
  addBookmark: (bookId, payload) =>
    request(`/books/${bookId}/bookmarks`, { method: "POST", body: JSON.stringify(payload) }),
  deleteBookmark: (bookId, bookmarkId) =>
    request(`/books/${bookId}/bookmarks/${bookmarkId}`, { method: "DELETE" }),
  vocabulary: (params = {}) => request(`/vocabulary${toQuery(params)}`),
  saveVocabulary: (payload) => request("/vocabulary", { method: "POST", body: JSON.stringify(payload) }),
  updateVocabulary: (id, payload) =>
    request(`/vocabulary/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteVocabulary: (id) => request(`/vocabulary/${id}`, { method: "DELETE" }),
  translate: (payload, options = {}) =>
    request("/ai/translate", { ...options, method: "POST", body: JSON.stringify(payload) }),
  summary: (payload) => request("/ai/summary", { method: "POST", body: JSON.stringify(payload) }),
  difficulty: (payload) => request("/ai/difficulty", { method: "POST", body: JSON.stringify(payload) }),
  quiz: (payload) => request("/ai/quiz", { method: "POST", body: JSON.stringify(payload) }),
  journal: () => request("/ai/journal"),
  saveJournalEntry: (date, payload) => request(`/ai/journal/${date}`, { method: "POST", body: JSON.stringify(payload) }),
  coach: () => request("/ai/coach"),
  generateCoach: (model = "gpt") => request("/ai/coach", { method: "POST", body: JSON.stringify({ model }) }),
  updateCoachTask: (date, taskId, completed) =>
    request(`/ai/coach/tasks/${date}/${taskId}`, { method: "PATCH", body: JSON.stringify({ completed }) }),
  statistics: () => request("/statistics"),
  exportUrl: (params = {}) => `${API_BASE}/vocabulary/export${toQuery(params)}`,
};

let providerPromise;

async function providerApi() {
  if (DATA_PROVIDER === "server") return serverApi;
  providerPromise ||= DATA_PROVIDER === "firestore"
    ? import("./firestoreApi").then((module) => module.firestoreApi)
    : import("./githubApi").then((module) => module.githubApi);
  return providerPromise;
}

export const api = {
  dashboard: async () => {
    const provider = await providerApi();
    if (provider.dashboard) return provider.dashboard();
    const [books, vocabulary, stats] = await Promise.all([provider.books(), provider.vocabulary(), provider.statistics()]);
    return { books, vocabulary, stats };
  },
  journal: async () => (await providerApi()).journal(),
  saveJournalEntry: async (date, payload) => (await providerApi()).saveJournalEntry(date, payload),
  books: async () => (await providerApi()).books(),
  book: async (id) => (await providerApi()).book(id),
  uploadBook: async (formData) => (await providerApi()).uploadBook(formData),
  updateBook: async (bookId, formData) => (await providerApi()).updateBook(bookId, formData),
  deleteBook: async (bookId, keepVocabulary = false) => (await providerApi()).deleteBook(bookId, keepVocabulary),
  updateProgress: async (bookId, payload) => (await providerApi()).updateProgress(bookId, payload),
  saveReadingPosition: async (bookId, payload) => (await providerApi()).saveReadingPosition(bookId, payload),
  addBookmark: async (bookId, payload) => (await providerApi()).addBookmark(bookId, payload),
  deleteBookmark: async (bookId, bookmarkId) => (await providerApi()).deleteBookmark(bookId, bookmarkId),
  vocabulary: async (params = {}) => (await providerApi()).vocabulary(params),
  saveVocabulary: async (payload) => (await providerApi()).saveVocabulary(payload),
  updateVocabulary: async (id, payload) => (await providerApi()).updateVocabulary(id, payload),
  deleteVocabulary: async (id) => (await providerApi()).deleteVocabulary(id),
  translate: async (payload, options = {}) => (await providerApi()).translate(payload, options),
  summary: async (payload) => (await providerApi()).summary(payload),
  difficulty: async (payload) => (await providerApi()).difficulty(payload),
  quiz: async (payload) => (await providerApi()).quiz(payload),
  coach: async () => (await providerApi()).coach(),
  generateCoach: async (model = "gpt") => (await providerApi()).generateCoach(model),
  updateCoachTask: async (date, taskId, completed) => (await providerApi()).updateCoachTask(date, taskId, completed),
  recordActivity: async (type, payload = {}) => {
    const provider = await providerApi();
    if (provider.recordActivity) return provider.recordActivity(type, payload);
    return true;
  },
  statistics: async () => (await providerApi()).statistics(),
  exportVocabulary: async (params = {}) => {
    const provider = await providerApi();
    if (provider.exportVocabulary) return provider.exportVocabulary(params);
    window.location.href = provider.exportUrl(params);
  },
  exportUrl: (params = {}) => serverApi.exportUrl(params),
};

function toQuery(params) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
  return query.toString() ? `?${query.toString()}` : "";
}
