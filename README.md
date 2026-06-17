# LinguaRead

LinguaRead este o aplicație web responsive pentru învățarea limbii engleze prin citirea cărților digitale (`txt`, `pdf`, `epub`).

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Analiză auxiliară: Python script pentru dificultate
- AI: OpenAI API sau Ollama/Mistral 7B, cu fallback local

## Pornire locală

```bash
npm run install:all
npm run dev
```

Clientul rulează implicit pe `http://localhost:5173`, iar API-ul pe `http://localhost:4000`.

## Configurare AI

Copiază `server/.env.example` în `server/.env` și setează opțional:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b
```

Dacă nu există cheie OpenAI și Ollama nu rulează, aplicația folosește răspunsuri locale demonstrative.
