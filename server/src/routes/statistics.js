import express from "express";
import { readDb } from "../services/db.js";
import { computeStatistics } from "../services/statistics.js";

const router = express.Router();

router.get("/", async (_request, response) => {
  const data = await readDb();
  response.json(computeStatistics(data));
});

export default router;
