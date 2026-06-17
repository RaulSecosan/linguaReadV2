import express from "express";
import { readDb } from "../services/db.js";
import { buildCoach, difficultyForText, summarizeText, translateContext } from "../services/aiService.js";
import { computeStatistics } from "../services/statistics.js";

const router = express.Router();

router.post("/translate", async (request, response) => {
  const { word, sentence, model } = request.body;
  if (!word || !sentence) return response.status(400).json({ error: "Cuvantul si propozitia sunt obligatorii." });
  try {
    const result = await translateContext({ word, sentence, model });
    response.json(result);
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message || "Traducerea nu a putut fi generata." });
  }
});

router.post("/summary", async (request, response) => {
  const data = await readDb();
  const book = data.books.find((item) => item.id === request.body.bookId);
  if (!book) return response.status(404).json({ error: "Cartea nu a fost gasita." });
  const selectedText = typeof request.body.text === "string" && request.body.text.trim()
    ? request.body.text
    : book.text;
  const result = await summarizeText({ text: selectedText, model: request.body.model });
  response.json(result);
});

router.post("/difficulty", async (request, response) => {
  const data = await readDb();
  const book = data.books.find((item) => item.id === request.body.bookId);
  if (!book) return response.status(404).json({ error: "Cartea nu a fost gasita." });
  response.json(difficultyForText(book.text));
});

router.get("/coach", async (_request, response) => {
  const data = await readDb();
  const statistics = computeStatistics(data);
  response.json(buildCoach({ vocabulary: data.vocabulary, books: data.books, statistics }));
});

export default router;
