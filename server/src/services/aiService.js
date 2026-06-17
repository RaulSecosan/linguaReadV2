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
  const prompt = `You are an English to Romanian reading tutor.
Return ONLY a valid JSON object with these string keys:
- "translation": the concise Romanian translation of the selected word only
- "sentenceRo": the complete sentence translated naturally into Romanian
- "explanation": a concise Romanian explanation of the word's meaning in this exact context
Selected word: "${word}"
English sentence: "${sentence}"`;
  const aiText = await callSelectedModel(model, prompt);
  const parsed = parseJson(aiText);
  if (isValidTranslation(parsed)) {
    return {
      translation: cleanModelText(parsed.translation, 240),
      sentenceRo: cleanModelText(parsed.sentenceRo, 1400),
      explanation: cleanModelText(parsed.explanation || "", 1000),
      provider: model === "ollama" ? "ollama" : "openai",
    };
  }

  if (model === "ollama") {
    const error = new Error("Mistral nu a returnat o traducere valida. Incearca din nou.");
    error.status = 502;
    throw error;
  }

  const normalized = word.toLowerCase().replace(/[^a-z'-]/g, "");
  return {
    translation: localDictionary[normalized] || `traducere pentru "${word}"`,
    sentenceRo: fallbackRomanianSentence(sentence),
    explanation: "Traducere orientativa locala. Configureaza cheia OpenAI pentru traducere AI.",
    provider: "fallback",
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
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "mistral:7b",
        prompt,
        format: "json",
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 320,
        },
      }),
    });
    if (!response.ok) {
      const error = new Error(`Ollama a raspuns cu status ${response.status}.`);
      error.status = 502;
      throw error;
    }
    const data = await response.json();
    return data.response || "";
  } catch (error) {
    if (error.status) throw error;
    const serviceError = new Error(
      error.name === "TimeoutError"
        ? "Mistral a depasit timpul de raspuns. Incearca din nou."
        : "Ollama nu este disponibil. Verifica daca serviciul ruleaza.",
    );
    serviceError.status = 503;
    throw serviceError;
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

function isValidTranslation(value) {
  return value
    && typeof value.translation === "string"
    && value.translation.trim()
    && typeof value.sentenceRo === "string"
    && value.sentenceRo.trim()
    && (!value.explanation || typeof value.explanation === "string");
}

function cleanModelText(value, maxLength) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
