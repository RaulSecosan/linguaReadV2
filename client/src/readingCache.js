// Optional, disposable copies only: saved positions and learning data stay on the server.
let database;
function openCache() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  database ||= new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1500);
    const finish = (value) => { clearTimeout(timer); resolve(value); };
    const request = indexedDB.open('linguaread-reading-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('content');
    request.onsuccess = () => finish(request.result);
    request.onerror = request.onblocked = () => finish(null);
  });
  return database;
}
export async function readCache(key) {
  try {
    const db = await openCache();
    if (!db) return null;
    return await new Promise((resolve) => {
      const request = db.transaction('content').objectStore('content').get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch { return null; }
}
export async function writeCache(key, value) {
  try {
    const db = await openCache();
    if (!db) return;
    await new Promise((resolve) => {
      const transaction = db.transaction('content', 'readwrite');
      transaction.objectStore('content').put(value, key);
      transaction.oncomplete = transaction.onerror = transaction.onabort = resolve;
    });
  } catch { /* Storage restrictions must never prevent reading a book. */ }
}

// Share concurrent requests, but never retain failed reads or cache mutable metadata.
export function singleFlight() {
  const pending = new Map();
  return (key, load) => {
    if (!pending.has(key)) pending.set(key, Promise.resolve().then(load).finally(() => pending.delete(key)));
    return pending.get(key);
  };
}
