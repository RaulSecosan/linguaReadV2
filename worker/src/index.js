import { handleSpeech } from './speech.js';
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/speech") {
      try { return await handleSpeech(request, env); } catch { return json({ error: "Pronuntia audio nu este disponibila momentan." }, 502); }
    }
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));

    try {
      if (url.pathname === "/translate") return json(await translate(body, env));
      if (url.pathname === "/summary") return json(await summary(body, env));
      if (url.pathname === "/quiz") return json(await quiz(body, env));
      if (url.pathname === "/coach") return json(await coach(body, env));
      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json({ error: error.message || "AI request failed" }, error.status || 500);
    }
  },
};

async function translate(body, env) {
  const word = String(body.word || "").trim();
  const sentence = String(body.sentence || "").trim();
  if (!word || !sentence) throw httpError("Cuvantul si propozitia sunt obligatorii.", 400);

  const prompt = `You are an English to Romanian reading tutor.
Return ONLY JSON with:
- translation: concise Romanian translation of the selected word only
- sentenceRo: complete sentence translated naturally into Romanian
- explanation: concise Romanian explanation of the word in this context
Use common contemporary Romanian. Translate exactly the selected word.
INPUT_JSON:
${JSON.stringify({ selectedWord: word, englishSentence: sentence })}`;

  const parsed = await openAiJson(env, prompt, 420);
  return {
    translation: clean(parsed.translation, 240),
    sentenceRo: clean(parsed.sentenceRo, 1400),
    explanation: clean(parsed.explanation, 1000),
    provider: "openai",
  };
}

async function summary(body, env) {
  const text = String(body.text || "").trim();
  const chapterTitle = String(body.chapterTitle || "Fara titlu");
  if (text.length < 120) throw httpError("Capitolul nu contine suficient text pentru rezumat.", 400);
  const source = text.length > 36000 ? `${text.slice(0, 18000)}\n\n[...]\n\n${text.slice(-18000)}` : text;
  const prompt = `Rezumă capitolul englezesc "${chapterTitle}" în română.
Returnează exclusiv JSON cu:
- summary: 3-6 paragrafe în română
- mainIdeas: array cu 3-8 idei concise în română
TEXT:
${source}`;
  const parsed = await openAiJson(env, prompt, 1300);
  return {
    summary: clean(parsed.summary, 5000),
    mainIdeas: Array.isArray(parsed.mainIdeas) ? parsed.mainIdeas.map((item) => clean(item, 220)).filter(Boolean).slice(0, 8) : [],
    provider: "openai",
  };
}

async function quiz(body, env) {
  const text = String(body.text || "").trim();
  const count = Math.max(3, Math.min(10, Number(body.count) || 5));
  if (text.length < 300) throw httpError("Capitolul nu contine suficient text pentru un quiz.", 400);
  const source = text.length > 30000 ? `${text.slice(0, 15000)}\n\n[...]\n\n${text.slice(-15000)}` : text;
  const prompt = `Generează exact ${count} întrebări factuale în română din capitolul englezesc de mai jos.
Returnează exclusiv JSON cu:
- questions: array de obiecte cu question, options exact 4 stringuri, correctIndex 0-3, explanation.
Nu inventa fapte care nu apar în text.
TEXT:
${source}`;
  const parsed = await openAiJson(env, prompt, 1800);
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  return {
    questions: questions.slice(0, count).map((question, index) => ({
      id: `question-${index + 1}`,
      question: clean(question.question, 400),
      options: Array.isArray(question.options) ? question.options.slice(0, 4).map((option) => clean(option, 220)) : [],
      correctIndex: Math.max(0, Math.min(3, Number(question.correctIndex) || 0)),
      explanation: clean(question.explanation, 500),
    })).filter((question) => question.question && question.options.length === 4),
    provider: "openai",
  };
}

async function coach(body, env) {
  const prompt = `Creează un plan zilnic în română pentru un cititor care învață engleza.
Date:
${JSON.stringify(body).slice(0, 12000)}
Returnează exclusiv JSON cu headline, insight, dailyTarget, focusAreas, plan, recommendations.`;
  const parsed = await openAiJson(env, prompt, 1400);
  return { ...parsed, provider: "openai" };
}

async function openAiJson(env, prompt, maxTokens) {
  if (!env.OPENAI_API_KEY) throw httpError("OPENAI_API_KEY lipseste din Worker secrets.", 500);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Return only valid JSON. No markdown." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw httpError(data.error?.message || "OpenAI request failed.", 502);
  }
  const data = await response.json();
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
