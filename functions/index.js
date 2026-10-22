import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

setGlobalOptions({ region: "europe-west3", maxInstances: 4 });

const openAiKey = defineSecret("OPENAI_API_KEY");
const openAiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const translateContext = onCall({ secrets: [openAiKey] }, async (request) => {
  const word = String(request.data?.word || "").trim();
  const sentence = String(request.data?.sentence || "").trim();
  if (!word || !sentence) {
    throw new HttpsError("invalid-argument", "Cuvantul si propozitia sunt obligatorii.");
  }

  const prompt = `You are an English to Romanian reading tutor.
Return ONLY a valid JSON object with these string keys:
- "translation": the concise Romanian translation of the selected word only
- "sentenceRo": the complete sentence translated naturally into Romanian
- "explanation": a concise Romanian explanation of the word's meaning in this exact context
Use common, contemporary Romanian. Translate exactly the selected word in context.
INPUT_JSON:
${JSON.stringify({ selectedWord: word, englishSentence: sentence })}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey.value()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel,
      messages: [
        { role: "system", content: "Return only valid JSON. No markdown." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new HttpsError("internal", error.error?.message || "Traducerea OpenAI nu a putut fi generata.");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpsError("internal", "OpenAI nu a returnat JSON valid.");
  }

  return {
    translation: cleanText(parsed.translation, 240),
    sentenceRo: cleanText(parsed.sentenceRo, 1400),
    explanation: cleanText(parsed.explanation, 1000),
    provider: "openai",
  };
});

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
