import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { mutateDb, readDb } from "../services/db.js";
import { buildBookStructure, extractBook } from "../services/textExtractor.js";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, "../../uploads");
const coverRoot = path.resolve(uploadRoot, "covers");

await fs.mkdir(uploadRoot, { recursive: true });
await fs.mkdir(coverRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_request, file, callback) => {
    callback(null, file.fieldname === "cover" ? coverRoot : uploadRoot);
  },
  filename: (_request, file, callback) => {
    callback(null, `${Date.now()}-${uuid()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get("/", async (_request, response) => {
  const data = await readDb();
  response.json(data.books.map(({ text, sourcePages, chapters, storedPath, ...book }) => book));
});

router.get("/:id", async (request, response) => {
  let data = await readDb();
  let book = data.books.find((item) => item.id === request.params.id);
  if (!book) return response.status(404).json({ error: "Cartea nu a fost gasita." });

  if (!book.chapters?.length || (book.structureVersion || 0) < 2) {
    let structure;
    if (book.storedPath) {
      try {
        structure = await extractBook(book.storedPath, book.originalName);
      } catch {
        structure = buildBookStructure(book.text, book.fileType);
      }
    } else {
      structure = buildBookStructure(book.text, book.fileType);
    }
    await mutateDb((nextData) => {
      const storedBook = nextData.books.find((item) => item.id === book.id);
      Object.assign(storedBook, structure, { structureVersion: 2 });
    });
    data = await readDb();
    book = data.books.find((item) => item.id === request.params.id);
  }
  response.json(book);
});

router.post("/", upload.fields([{ name: "book", maxCount: 1 }, { name: "cover", maxCount: 1 }]), async (request, response) => {
  const bookFile = request.files?.book?.[0];
  if (!bookFile) return response.status(400).json({ error: "Fisierul cartii este obligatoriu." });

  const fileType = path.extname(bookFile.originalname).replace(".", "").toLowerCase();
  const extracted = await extractBook(bookFile.path, bookFile.originalname);
  const { text } = extracted;
  if (!text) return response.status(400).json({ error: "Nu am gasit text in fisier." });

  const coverFile = request.files?.cover?.[0];
  const book = {
    id: uuid(),
    title: request.body.title || path.basename(bookFile.originalname, path.extname(bookFile.originalname)),
    author: request.body.author || "",
    fileType,
    originalName: bookFile.originalname,
    storedPath: bookFile.path,
    coverUrl: coverFile ? `/uploads/covers/${path.basename(coverFile.path)}` : "",
    text,
    structureVersion: 2,
    chapters: extracted.chapters,
    sourcePages: extracted.sourcePages,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    createdAt: new Date().toISOString(),
    progress: {
      percent: 0,
      position: 0,
      updatedAt: new Date().toISOString(),
    },
    bookmarks: [],
  };

  await mutateDb((data) => {
    data.books.unshift(book);
  });

  response.status(201).json(book);
});

router.patch("/:id/progress", async (request, response) => {
  const updated = await mutateDb((data) => {
    const book = data.books.find((item) => item.id === request.params.id);
    if (!book) return null;
    book.progress = {
      percent: Number(request.body.percent) || 0,
      position: Number(request.body.position) || 0,
      page: Math.max(0, Number(request.body.page) || 0),
      updatedAt: new Date().toISOString(),
    };
    return book.progress;
  });

  if (!updated) return response.status(404).json({ error: "Cartea nu a fost gasita." });
  response.json(updated);
});

router.post("/:id/bookmarks", async (request, response) => {
  const bookmark = await mutateDb((data) => {
    const book = data.books.find((item) => item.id === request.params.id);
    if (!book) return null;
    const item = {
      id: uuid(),
      label: request.body.label || "Bookmark",
      position: Number(request.body.position) || 0,
      page: Math.max(0, Number(request.body.page) || 0),
      percent: Number(request.body.percent) || 0,
      createdAt: new Date().toISOString(),
    };
    book.bookmarks.unshift(item);
    return item;
  });

  if (!bookmark) return response.status(404).json({ error: "Cartea nu a fost gasita." });
  response.status(201).json(bookmark);
});

router.delete("/:id/bookmarks/:bookmarkId", async (request, response) => {
  const deleted = await mutateDb((data) => {
    const book = data.books.find((item) => item.id === request.params.id);
    if (!book) return false;
    book.bookmarks = book.bookmarks.filter((bookmark) => bookmark.id !== request.params.bookmarkId);
    return true;
  });

  if (!deleted) return response.status(404).json({ error: "Cartea nu a fost gasita." });
  response.status(204).end();
});

export default router;
