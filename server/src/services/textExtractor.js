import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import fs from "node:fs/promises";
import path from "node:path";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

export async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === ".txt") {
    return normalizeText(await fs.readFile(filePath, "utf8"));
  }
  if (ext === ".pdf") {
    return extractPdf(filePath);
  }
  if (ext === ".epub") {
    return extractEpub(filePath);
  }
  const error = new Error("Format neacceptat. Foloseste TXT, PDF sau EPUB.");
  error.status = 400;
  throw error;
}

async function extractPdf(filePath) {
  const buffer = await fs.readFile(filePath);
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return normalizeText(data.text);
  } catch (error) {
    throw new Error(`Nu am putut extrage textul din PDF: ${error.message}`);
  }
}

async function extractEpub(filePath) {
  const zip = new AdmZip(filePath);
  const containerEntry = zip.getEntry("META-INF/container.xml");
  if (!containerEntry) throw new Error("EPUB invalid: lipseste META-INF/container.xml");

  const container = parser.parse(containerEntry.getData().toString("utf8"));
  const opfPath = container.container.rootfiles.rootfile["full-path"];
  const opfEntry = zip.getEntry(opfPath);
  if (!opfEntry) throw new Error("EPUB invalid: nu am gasit fisierul OPF.");

  const opf = parser.parse(opfEntry.getData().toString("utf8"));
  const opfDir = path.posix.dirname(opfPath);
  const manifestItems = asArray(opf.package.manifest.item);
  const manifest = new Map(manifestItems.map((item) => [item.id, item]));
  const spine = asArray(opf.package.spine.itemref);

  const chapters = spine
    .map((item) => manifest.get(item.idref))
    .filter(Boolean)
    .map((item) => path.posix.normalize(path.posix.join(opfDir, item.href)))
    .map((chapterPath) => zip.getEntry(chapterPath))
    .filter(Boolean)
    .map((entry) => htmlToText(entry.getData().toString("utf8")));

  return normalizeText(chapters.join("\n\n"));
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeText(text) {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
