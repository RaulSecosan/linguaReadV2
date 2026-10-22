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

## Firebase Hosting + Firestore ca baza de date

Aplicatia poate rula ca site static pe Firebase Hosting si poate folosi Firestore pentru carti, progres, vocabular si coach. Firestore are cota gratuita pe planul Spark/no-cost; daca depasesti cota, proiectul trebuie trecut explicit pe billing.

1. Creeaza baza de date Firestore in proiectul Firebase `lingua-59cff`.
2. Copiaza `client/.env.production.example` in `client/.env.production`:

```bash
VITE_DATA_PROVIDER=firestore
VITE_FIRESTORE_COLLECTION=linguaread
VITE_FIRESTORE_DOCUMENT=main
```

3. Build si deploy:

```bash
npm run build
npx firebase-tools deploy
```

In modul Firestore static, upload-ul de carti suporta `.txt`, `.pdf` si `.epub`. ChatGPT ruleaza prin Cloudflare Worker; Ollama/Mistral ramane doar pentru rulare locala cu serverul Node.

## GPT fara Firebase Blaze

Firebase Functions cere Blaze pentru secrete, asa ca traducerile ChatGPT folosesc un Cloudflare Worker gratuit ca proxy OpenAI:

```bash
cd worker
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

URL-ul Worker-ului se seteaza in `client/.env.production`:

```bash
VITE_AI_PROXY_URL=https://linguaread-ai.secoraul8-linguaread.workers.dev
```

Cheia OpenAI ramane in Cloudflare Worker secrets si nu ajunge in browser.
