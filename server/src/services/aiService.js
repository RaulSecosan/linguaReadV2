import { analyzeText } from "./analysis.js";

const localDictionary = {
  learning: "invatare",
  language: "limba",
  reading: "citire",
  powerful: "puternic",
  sentence: "propozitie",
  context: "context",
  word: "cuvant",
  story: "poveste",
  remember: "a tine minte",
  confidence: "incredere",
  difficult: "dificil",
  strategy: "strategie",
  complete: "complet",
  journey: "calatorie",
};

export async function translateContext({ word, sentence, model }) {
  const prompt = `You are an English to Romanian reading tutor. Return strict JSON with keys translation, sentenceRo, explanation. Word: "${word}". Sentence: "${sentence}".`;
  const aiText = await callSelectedModel(model, prompt);
  const parsed = parseJson(aiText);
  if (parsed?.translation && parsed?.sentenceRo) return parsed;

  const normalized = word.toLowerCase().replace(/[^a-z'-]/g, "");
  return {
    translation: localDictionary[normalized] || `traducere pentru "${word}"`,
    sentenceRo: fallbackRomanianSentence(sentence),
    explanation: `Traducerea este estimata contextual din propozitie. Configureaza OpenAI sau Ollama pentru raspunsuri AI reale.`,
  };
}

export async function summarizeText({ text, model }) {
  const excerpt = text.slice(0, 6500);
  const prompt = `Summarize this English chapter for a Romanian learner. Return strict JSON with keys summary and mainIdeas array of 3-5 strings. Text: ${excerpt}`;
  const aiText = await callSelectedModel(model || "gpt", prompt);
  const parsed = parseJson(aiText);
  if (parsed?.summary && Array.isArray(parsed.mainIdeas)) return parsed;

  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.slice(0, 4).map((item) => item.trim()) || [];
  return {
    summary: sentences.join(" ") || "Nu exista suficient text pentru rezumat.",
    mainIdeas: [
      "Identifica ideile recurente din pasaj.",
      "Salveaza cuvintele care apar in contexte diferite.",
      "Revino la propozitiile cu expresii necunoscute.",
    ],
  };
}

export function difficultyForText(text) {
  return analyzeText(text);
}

export function buildCoach({ vocabulary, books, statistics }) {
  const phrasal = vocabulary.filter((item) => /\b(look|give|carry|figure|turn|put|get|take|come|go)\s+(up|in|on|out|off|away|over)\b/i.test(item.sentence));
  const learnedRate = vocabulary.length ? vocabulary.filter((item) => item.learned).length / vocabulary.length : 0;
  const lowProgressBooks = books.filter((book) => (book.progress?.percent || 0) < 35);

  const recommendations = [
    {
      title: phrasal.length >= 2 ? "You struggle with phrasal verbs." : "Build phrase-level memory.",
      detail: phrasal.length >= 2
        ? "Revizuieste phrasal verbs salvate si citeste propozitia completa cu voce tare."
        : "Salveaza expresii complete, nu doar cuvinte izolate.",
    },
    {
      title: "Recommended target: 10 new words/day.",
      detail: vocabulary.length > 40 ? "Mentine ritmul si marcheaza zilnic cel putin 8 cuvinte ca invatate." : "Aduna primele 40 de cuvinte ca sa ai un set bun de flashcards.",
    },
    {
      title: learnedRate > 0.5 ? "Retention is improving." : "Review before adding many new words.",
      detail: learnedRate > 0.5
        ? "Poti trece la texte putin mai dificile."
        : "Parcurge Learning Mode in grupuri de 20 inainte de urmatorul capitol.",
    },
  ];

  if (lowProgressBooks.length) {
    recommendations.push({
      title: "Finish one active book.",
      detail: `Continua "${lowProgressBooks[0].title}" pana la 60% inainte sa incepi multe carti noi.`,
    });
  }

  return {
    dailyTarget: statistics.savedWords > 60 ? 12 : 10,
    recommendations,
  };
}

async function callSelectedModel(model, prompt) {
  if (model === "ollama") return callOllama(prompt);
  return callOpenAI(prompt);
}

async function callOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) return "";
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

async function callOllama(prompt) {
  try {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "mistral:7b",
        prompt,
        stream: false,
      }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data.response || "";
  } catch {
    return "";
  }
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function fallbackRomanianSentence(sentence) {
  return `Traducere orientativa: ${sentence}`;
}
