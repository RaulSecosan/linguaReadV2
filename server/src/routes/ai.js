import express from "express";
import { mutateDb, readDb } from "../services/db.js";
import {
  buildCoach,
  difficultyForText,
  generateChapterQuiz,
  generateCoach,
  summarizeText,
  translateContext,
} from "../services/aiService.js";
import { computeStatistics } from "../services/statistics.js";

const router = express.Router();
const coachTimeZone = "Europe/Bucharest";

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: coachTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function defaultCoachAnalysis(data, statistics) {
  const fallback = buildCoach({ vocabulary: data.vocabulary, books: data.books, statistics });
  return {
    headline: "Planul tau de lectura pentru astazi",
    insight: "Finalizeaza task-urile zilnice, apoi genereaza o analiza AI pentru recomandari adaptate vocabularului tau.",
    dailyTarget: fallback.dailyTarget,
    provider: "local",
    plan: [
      { title: "Citeste cartea activa", detail: "Continua lectura timp de 15 minute.", minutes: 15, type: "reading" },
      { title: "Revizuieste vocabularul", detail: `Repeta ${Math.min(10, Math.max(5, fallback.dailyTarget))} cuvinte salvate.`, minutes: 10, type: "vocabulary" },
      { title: "Rezolva un quiz", detail: "Alege un capitol citit si verifica ce ai retinut.", minutes: 8, type: "quiz" },
    ],
    focusAreas: [],
    recommendations: fallback.recommendations,
  };
}

function taskType(item, index) {
  const value = `${item.title} ${item.detail}`.toLowerCase();
  if (/quiz|intrebar/.test(value)) return "quiz";
  if (/vocab|cuv/.test(value)) return "vocabulary";
  if (/cit|lectur|carte|capitol/.test(value)) return "reading";
  return `practice-${index + 1}`;
}

function buildTasks(analysis) {
  return (analysis.plan || []).slice(0, 5).map((item, index) => ({
    id: `${taskType(item, index)}-${index + 1}`,
    type: item.type || taskType(item, index),
    title: item.title,
    detail: item.detail,
    minutes: Math.max(1, Math.min(60, Number(item.minutes) || 10)),
    completed: false,
  }));
}

function ensureTodayTasks(data, analysis, replace = false) {
  data.coach ||= {};
  data.coach.dailyProgress ||= {};
  const today = dateKey();
  const existing = data.coach.dailyProgress[today];
  if (!existing || replace) {
    const completedTypes = new Set((existing?.tasks || []).filter((task) => task.completed).map((task) => task.type));
    data.coach.dailyProgress[today] = {
      date: today,
      tasks: buildTasks(analysis).map((task) => ({ ...task, completed: completedTypes.has(task.type) })),
      updatedAt: new Date().toISOString(),
    };
  }
  return data.coach.dailyProgress[today];
}

function coachDashboard(data) {
  const statistics = computeStatistics(data);
  const analysis = data.coach?.latest || defaultCoachAnalysis(data, statistics);
  const today = ensureTodayTasks(data, analysis);
  const days = [];
  const current = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(current);
    day.setDate(current.getDate() - offset);
    const key = dateKey(day);
    const record = data.coach?.dailyProgress?.[key];
    const completed = record?.tasks?.filter((task) => task.completed).length || 0;
    const total = record?.tasks?.length || 0;
    days.push({
      date: key,
      label: new Intl.DateTimeFormat("ro-RO", { timeZone: coachTimeZone, weekday: "short" }).format(day),
      day: new Intl.DateTimeFormat("ro-RO", { timeZone: coachTimeZone, day: "2-digit" }).format(day),
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      isToday: key === today.date,
    });
  }
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].total && days[index].completed === days[index].total) streak += 1;
    else break;
  }
  return {
    ...analysis,
    tracker: {
      today,
      days,
      streak,
      completedThisWeek: days.reduce((sum, day) => sum + day.completed, 0),
      totalThisWeek: days.reduce((sum, day) => sum + day.total, 0),
    },
  };
}

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

  const chapterText = book.sourcePages?.length
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

router.post("/quiz", async (request, response) => {
  const data = await readDb();
  const book = data.books.find((item) => item.id === request.body.bookId);
  if (!book) return response.status(404).json({ error: "Cartea nu a fost gasita." });
  const chapter = book.chapters?.find((item) => item.id === request.body.chapterId);
  if (!chapter) return response.status(404).json({ error: "Capitolul nu a fost gasit." });
  const chapterText = book.sourcePages?.length
    ? book.sourcePages.slice(chapter.startPage, chapter.endPage + 1).join("\n\n")
    : chapter.text;
  try {
    const result = await generateChapterQuiz({
      text: chapterText,
      model: request.body.model,
      count: request.body.count,
      bookTitle: book.title,
      chapterTitle: chapter.title,
    });
    response.json({ ...result, bookTitle: book.title, chapterTitle: chapter.title });
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message || "Quiz-ul nu a putut fi generat." });
  }
});

router.post("/coach", async (request, response) => {
  const data = await readDb();
  const statistics = computeStatistics(data);
  try {
    const analysis = await generateCoach({
      vocabulary: data.vocabulary,
      books: data.books,
      statistics,
      model: request.body.model,
    });
    await mutateDb((nextData) => {
      nextData.coach ||= {};
      nextData.coach.latest = analysis;
      ensureTodayTasks(nextData, analysis, true);
    });
    response.json(coachDashboard(await readDb()));
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message || "AI Coach nu a putut genera analiza." });
  }
});

router.get("/coach", async (_request, response) => {
  await mutateDb((data) => {
    const statistics = computeStatistics(data);
    ensureTodayTasks(data, data.coach?.latest || defaultCoachAnalysis(data, statistics));
  });
  response.json(coachDashboard(await readDb()));
});

router.patch("/coach/tasks/:date/:taskId", async (request, response) => {
  const updated = await mutateDb((data) => {
    const record = data.coach?.dailyProgress?.[request.params.date];
    const task = record?.tasks?.find((item) => item.id === request.params.taskId);
    if (!task) return false;
    task.completed = Boolean(request.body.completed);
    task.completedAt = task.completed ? new Date().toISOString() : null;
    record.updatedAt = new Date().toISOString();
    return true;
  });
  if (!updated) return response.status(404).json({ error: "Task-ul zilnic nu a fost gasit." });
  response.json(coachDashboard(await readDb()));
});

export default router;
