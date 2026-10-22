export function validateJournalDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error("Ziua jurnalului nu este valida.");
  }
  return date;
}

export function journalEntry(input, previous = null, now = new Date().toISOString()) {
  const text = String(input.text || "").trim();
  const time = String(input.time || "");
  if (!text) throw new Error("Scrie ce ai realizat in aceasta zi.");
  if (text.length > 10000) throw new Error("Insemnarea poate avea cel mult 10.000 de caractere.");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Ora nu este valida.");
  if (!/^[\w-]{1,100}$/.test(String(input.id || ""))) throw new Error("Insemnarea nu este valida.");
  return { id: input.id, text, time, createdAt: previous?.createdAt || now, updatedAt: now };
}

export function journalEntries(day = {}) {
  return Object.values(day.entries || {}).sort((a, b) =>
    (a.time || "24:00").localeCompare(b.time || "24:00") || a.createdAt.localeCompare(b.createdAt));
}
