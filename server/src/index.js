import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import aiRouter from "./routes/ai.js";
import booksRouter from "./routes/books.js";
import statisticsRouter from "./routes/statistics.js";
import vocabularyRouter from "./routes/vocabulary.js";
import { ensureDatabase } from "./services/db.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, "../uploads");
const allowedOrigins = new Set(
  (process.env.CLIENT_URL || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

await ensureDatabase();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+):(5173|5174|5175)$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin nepermis: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadRoot));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, name: "LinguaRead API" });
});

app.use("/api/books", booksRouter);
app.use("/api/vocabulary", vocabularyRouter);
app.use("/api/ai", aiRouter);
app.use("/api/statistics", statisticsRouter);

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status || 500).json({ error: error.message || "Internal server error" });
});

app.listen(port, () => {
  console.log(`LinguaRead API running on http://localhost:${port}`);
});
