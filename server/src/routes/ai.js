import express from "express";
import { mutateDb, readDb } from "../services/db.js";
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
  const chapter = book.chapters?.find((item) => item.id === request.body.chapterId);
  if (!chapter) return response.status(404).json({ error: "Capitolul nu a fost gasit." });
  const cacheKey = request.body.model === "ollama" ? "ollama" : "gpt";
  const cached = book.summaries?.[chapter.id]?.[cacheKey];
  if (cached) return response.json({ ...cached, cached: true });

  const chapterText = Array.isArray(book.sourcePages)
    ? book.sourcePages.slice(chapter.startPage, chapter.endPage + 1).join("\n\n")
    : chapter.text;

  try {
    const result = await summarizeText({
      text: chapterText,
      model: request.body.model,
      chapterTitle: chapter.title,
    });
    await mutateDb((nextData) => {
      const storedBook = nextData.books.find((item) => item.id === book.id);
      storedBook.summaries ||= {};
      storedBook.summaries[chapter.id] ||= {};
      storedBook.summaries[chapter.id][cacheKey] = {
        ...result,
        generatedAt: new Date().toISOString(),
      };
    });
    response.json(result);
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message || "Rezumatul nu a putut fi generat." });
  }
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
