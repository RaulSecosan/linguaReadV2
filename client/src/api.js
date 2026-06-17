const defaultApiBase =
  typeof window === "undefined" ? "http://localhost:4000/api" : `${window.location.protocol}//${window.location.hostname}:4000/api`;

export const API_BASE = import.meta.env.VITE_API_URL || defaultApiBase;

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

export const api = {
  books: () => request("/books"),
  book: (id) => request(`/books/${id}`),
  uploadBook: (formData) => request("/books", { method: "POST", body: formData }),
  updateProgress: (bookId, payload) =>
    request(`/books/${bookId}/progress`, { method: "PATCH", body: JSON.stringify(payload) }),
  addBookmark: (bookId, payload) =>
    request(`/books/${bookId}/bookmarks`, { method: "POST", body: JSON.stringify(payload) }),
  deleteBookmark: (bookId, bookmarkId) =>
    request(`/books/${bookId}/bookmarks/${bookmarkId}`, { method: "DELETE" }),
  vocabulary: (params = {}) => request(`/vocabulary${toQuery(params)}`),
  saveVocabulary: (payload) => request("/vocabulary", { method: "POST", body: JSON.stringify(payload) }),
  updateVocabulary: (id, payload) =>
    request(`/vocabulary/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  translate: (payload, options = {}) =>
    request("/ai/translate", { ...options, method: "POST", body: JSON.stringify(payload) }),
  summary: (payload) => request("/ai/summary", { method: "POST", body: JSON.stringify(payload) }),
  difficulty: (payload) => request("/ai/difficulty", { method: "POST", body: JSON.stringify(payload) }),
  coach: () => request("/ai/coach"),
  statistics: () => request("/statistics"),
  exportUrl: (params = {}) => `${API_BASE}/vocabulary/export${toQuery(params)}`,
};

function toQuery(params) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
  return query.toString() ? `?${query.toString()}` : "";
}
