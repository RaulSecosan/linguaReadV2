import express from "express";
import { v4 as uuid } from "uuid";
import { mutateDb, readDb } from "../services/db.js";
import { rowsToXlsx } from "../services/excelExport.js";

const router = express.Router();

router.get("/export", async (request, response) => {
  const { format = "csv", bookId, date } = request.query;
  const rows = await vocabularyRows({ bookId, date });

  if (format === "xlsx") {
    const buffer = rowsToXlsx(rows, "Vocabulary");
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", "attachment; filename=linguaread-vocabulary.xlsx");
    return response.send(buffer);
  }

  const csv = toCsv(rows);
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", "attachment; filename=linguaread-vocabulary.csv");
  response.send(csv);
});

router.get("/", async (request, response) => {
  const { bookId, q } = request.query;
  const data = await readDb();
  const query = String(q || "").toLowerCase();
  const rows = data.vocabulary.filter((item) => {
    const matchesBook = !bookId || item.bookId === bookId;
    const matchesQuery = !query || `${item.word} ${item.translation} ${item.sentence}`.toLowerCase().includes(query);
    return matchesBook && matchesQuery;
  });
  response.json(rows);
});

router.post("/", async (request, response) => {
  const saved = await mutateDb((data) => {
    const book = data.books.find((item) => item.id === request.body.bookId);
    if (!book) return null;
    const normalized = normalizeWord(request.body.word);
    const existing = data.vocabulary.find((item) => item.bookId === book.id && normalizeWord(item.word) === normalized);
    if (existing) {
      existing.translation = request.body.translation || existing.translation;
      existing.sentence = request.body.sentence || existing.sentence;
      existing.sentenceRo = request.body.sentenceRo || existing.sentenceRo;
      existing.explanation = request.body.explanation || existing.explanation;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }

    const item = {
      id: uuid(),
      bookId: book.id,
      bookTitle: book.title,
      word: request.body.word,
      translation: request.body.translation,
      sentence: request.body.sentence,
      sentenceRo: request.body.sentenceRo,
      explanation: request.body.explanation || "",
      model: request.body.model || "gpt",
      learned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.vocabulary.unshift(item);
    return item;
  });

  if (!saved) return response.status(404).json({ error: "Cartea nu a fost gasita." });
  response.status(201).json(saved);
});

router.patch("/:id", async (request, response) => {
  const updated = await mutateDb((data) => {
    const item = data.vocabulary.find((entry) => entry.id === request.params.id);
    if (!item) return null;
    if (typeof request.body.learned === "boolean") item.learned = request.body.learned;
    item.updatedAt = new Date().toISOString();
    return item;
  });

  if (!updated) return response.status(404).json({ error: "Cuvantul nu a fost gasit." });
  response.json(updated);
});

async function vocabularyRows({ bookId, date }) {
  const data = await readDb();
  return data.vocabulary
    .filter((item) => !bookId || item.bookId === bookId)
    .filter((item) => !date || item.createdAt.startsWith(date))
    .map((item) => ({
      book: item.bookTitle,
      word: item.word,
      translation: item.translation,
      sentence: item.sentence,
      sentence_ro: item.sentenceRo,
      learned: item.learned ? "yes" : "no",
      created_at: item.createdAt,
    }));
}

function toCsv(rows) {
  if (!rows.length) return "book,word,translation,sentence,sentence_ro,learned,created_at\n";
  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return `${headers.join(",")}\n${lines.join("\n")}\n`;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function normalizeWord(word) {
  return String(word || "").toLowerCase().replace(/^[^a-z']+|[^a-z']+$/gi, "");
}

export default router;
