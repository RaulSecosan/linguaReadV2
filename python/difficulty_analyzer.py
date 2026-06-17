#!/usr/bin/env python3
"""Small standalone CEFR-style difficulty analyzer for LinguaRead text exports."""

import json
import re
import sys


def analyze(text: str) -> dict:
    words = re.findall(r"\b[a-z][a-z'-]*\b", text.lower())
    sentences = re.findall(r"[^.!?]+[.!?]+|[^.!?]+$", text)
    unique = set(words)
    difficult = sorted(
        word
        for word in unique
        if len(word) >= 9 or re.search(r"(tion|sion|ough|ment|ive|ity|ance|ence)$", word)
    )
    avg_sentence = len(words) / max(1, len(sentences))
    density = round((len(unique) / max(1, len(words))) * 100)
    score = sum(
        [
            avg_sentence > 10,
            avg_sentence > 16,
            avg_sentence > 23,
            density > 45,
            len(difficult) / max(1, len(unique)) > 0.14,
        ]
    )
    return {
        "level": ["A1", "A2", "B1", "B2", "C1"][min(score, 4)],
        "readingTimeMinutes": max(1, round(len(words) / 220)),
        "difficultWords": difficult[:60],
        "vocabularyDensity": density,
        "wordCount": len(words),
        "averageSentenceLength": round(avg_sentence, 1),
    }


if __name__ == "__main__":
    print(json.dumps(analyze(sys.stdin.read()), ensure_ascii=True, indent=2))
