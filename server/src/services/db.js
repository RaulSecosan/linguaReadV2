import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "../../data/db.json");
const backupPath = `${dbPath}.bak`;
let writeQueue = Promise.resolve();
let mutationQueue = Promise.resolve();

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

const emptyDb = {
  books: [],
  vocabulary: [],
  coach: {},
};

function normalizeDb(data) {
  return {
    ...emptyDb,
    ...(data && typeof data === "object" ? data : {}),
    books: Array.isArray(data?.books) ? data.books : [],
    vocabulary: Array.isArray(data?.vocabulary) ? data.vocabulary : [],
    coach: data?.coach && typeof data.coach === "object" ? data.coach : {},
  };
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) throw new Error("Database file is empty");
  return normalizeDb(JSON.parse(raw));
}

export async function ensureDatabase() {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await writeDbImmediate(seed);
  }
}

export async function readDb() {
  await ensureDatabase();
  try {
    return await readJsonFile(dbPath);
  } catch (error) {
    try {
      const backup = await readJsonFile(backupPath);
      await writeDb(backup);
      return backup;
    } catch {
      const recovered = normalizeDb(seed);
      await writeDb(recovered);
      return recovered;
    }
  }
}

async function writeDbImmediate(data) {
  const normalized = normalizeDb(data);
  const payload = `${JSON.stringify(normalized, null, 2)}\n`;
  const tempPath = `${dbPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await readJsonFile(dbPath);
    await fs.copyFile(dbPath, backupPath);
  } catch {
    // The first write or a corrupt database has no useful previous state to back up.
  }
  await fs.writeFile(tempPath, payload);
  await fs.rename(tempPath, dbPath);
}

export async function writeDb(data) {
  writeQueue = writeQueue.then(() => writeDbImmediate(data), () => writeDbImmediate(data));
  return writeQueue;
}

export async function mutateDb(mutator) {
  mutationQueue = mutationQueue.then(async () => {
    const data = await readDb();
    const result = await mutator(data);
    await writeDbImmediate(data);
    return result;
  }, async () => {
    const data = await readDb();
    const result = await mutator(data);
    await writeDbImmediate(data);
    return result;
  });
  return mutationQueue;
}
