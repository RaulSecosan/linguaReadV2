import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/db.json");

const sampleText = `Learning a new language through reading is powerful because every sentence gives context. When you meet a new word inside a story, your brain connects it with characters, actions, and emotion. This context makes vocabulary easier to remember.

Good readers do not translate every word. They notice patterns, save useful expressions, and return to difficult sentences later. A learner who reads ten pages every day builds confidence faster than a learner who studies isolated lists.

Phrasal verbs are often difficult for Romanian speakers. Expressions such as look up, give in, carry on, and figure out change meaning depending on the sentence. The best strategy is to collect them with complete examples.

LinguaRead helps you slow down at the right moments. Click a word, listen to its pronunciation, read the Romanian sentence, and save the complete context. After a few chapters, the vocabulary list becomes a personal map of your reading journey.`;

const seed = {
  books: [
    {
      id: uuid(),
      title: "Context Reading Starter",
      author: "LinguaRead",
      fileType: "txt",
      originalName: "context-reading-starter.txt",
      storedPath: null,
      coverUrl: "",
      text: sampleText,
      wordCount: sampleText.split(/\s+/).length,
      createdAt: new Date().toISOString(),
      progress: {
        percent: 0,
        position: 0,
        updatedAt: new Date().toISOString(),
      },
      bookmarks: [],
    },
  ],
  vocabulary: [],
};

export async function ensureDatabase() {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await writeDb(seed);
  }
}

export async function readDb() {
  await ensureDatabase();
  const raw = await fs.readFile(dbPath, "utf8");
  return JSON.parse(raw);
}

export async function writeDb(data) {
  await fs.writeFile(dbPath, `${JSON.stringify(data, null, 2)}\n`);
}

export async function mutateDb(mutator) {
  const data = await readDb();
  const result = await mutator(data);
  await writeDb(data);
  return result;
}
