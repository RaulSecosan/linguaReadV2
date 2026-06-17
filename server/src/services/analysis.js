const cefrLevels = ["A1", "A2", "B1", "B2", "C1"];

export function analyzeText(text) {
  const words = tokenize(text);
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));
  const difficultWords = [...uniqueWords]
    .filter((word) => word.length >= 9 || /(tion|sion|ough|phras|ment|ive|ity|ance|ence)$/.test(word))
    .slice(0, 60);
  const averageSentenceLength = words.length / Math.max(1, sentences.length);
  const vocabularyDensity = Math.round((uniqueWords.size / Math.max(1, words.length)) * 100);

  let score = 0;
  if (averageSentenceLength > 10) score += 1;
  if (averageSentenceLength > 16) score += 1;
  if (averageSentenceLength > 23) score += 1;
  if (vocabularyDensity > 45) score += 1;
  if (difficultWords.length / Math.max(1, uniqueWords.size) > 0.14) score += 1;

  return {
    level: cefrLevels[Math.min(score, cefrLevels.length - 1)],
    readingTimeMinutes: Math.max(1, Math.ceil(words.length / 220)),
    difficultWords,
    vocabularyDensity,
    wordCount: words.length,
    averageSentenceLength: Number(averageSentenceLength.toFixed(1)),
  };
}

export function tokenize(text) {
  return text.toLowerCase().match(/\b[a-z][a-z'-]*\b/g) || [];
}
