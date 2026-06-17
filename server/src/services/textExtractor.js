import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import fs from "node:fs/promises";
import path from "node:path";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

export async function extractBook(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === ".txt") {
    const text = normalizeText(await fs.readFile(filePath, "utf8"));
    return { text, chapters: detectTextChapters(text) };
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
    const sourcePages = [];
    const data = await pdfParse(buffer, {
      pagerender: async (pageData) => {
        const content = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });
        let previousY;
        let pageText = "";
        for (const item of content.items) {
          const y = item.transform?.[5];
          pageText += previousY === undefined || y === previousY ? item.str : `\n${item.str}`;
          previousY = y;
        }
        const normalized = normalizeText(pageText);
        sourcePages.push(normalized);
        return normalized;
      },
    });
    const pages = sourcePages.filter(Boolean);
    const text = normalizeText(pages.length ? pages.join("\n\n") : data.text);
    return {
      text,
      sourcePages: pages,
      chapters: detectPdfChapters(pages.length ? pages : [text]),
    };
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
    .map((item, index) => {
      const chapterPath = path.posix.normalize(path.posix.join(opfDir, item.href.split("#")[0]));
      const entry = zip.getEntry(chapterPath);
      if (!entry) return null;
      const html = entry.getData().toString("utf8");
      const text = normalizeText(htmlToText(html));
      if (!text) return null;
      return {
        id: `chapter-${index + 1}`,
        title: extractHtmlTitle(html) || `Capitolul ${index + 1}`,
        text,
      };
    })
    .filter(Boolean);

  return {
    text: normalizeText(chapters.map((chapter) => chapter.text).join("\n\n")),
    chapters,
  };
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

function extractHtmlTitle(html) {
  const match = html.match(/<(?:h1|h2|title)[^>]*>([\s\S]*?)<\/(?:h1|h2|title)>/i);
  return match ? normalizeText(htmlToText(match[1])).slice(0, 140) : "";
}

export function buildBookStructure(text, fileType = "txt") {
  const normalized = normalizeText(text || "");
  return {
    text: normalized,
    structureVersion: 2,
    chapters: fileType === "pdf" ? detectPdfChapters([normalized]) : detectTextChapters(normalized),
  };
}

function detectPdfChapters(pages) {
  const chapters = [];
  let current = null;

  pages.forEach((pageText, pageIndex) => {
    const title = findChapterHeading(pageText);
    if (title || !current) {
      current = {
        id: `chapter-${chapters.length + 1}`,
        title: title || "Inceput",
        startPage: pageIndex,
        endPage: pageIndex,
      };
      chapters.push(current);
    } else {
      current.endPage = pageIndex;
    }
  });

  return chapters;
}

function detectTextChapters(text) {
  const headingPattern = /^(?:(?:chapter|capitol(?:ul)?|part|book)\s+(?:[ivxlcdm]+|\d+)(?:[.:\s-]+.*)?|preface|introduction|contents|conclusion|epilogue)$/gim;
  const matches = [...text.matchAll(headingPattern)];
  if (!matches.length) {
    return [{ id: "chapter-1", title: "Text complet", text }];
  }

  const chapters = [];
  if (matches[0].index > 0) {
    const intro = normalizeText(text.slice(0, matches[0].index));
    if (intro) chapters.push({ id: "chapter-1", title: "Inceput", text: intro });
  }
  matches.forEach((match, index) => {
    const chapterText = normalizeText(text.slice(match.index, matches[index + 1]?.index ?? text.length));
    if (chapterText) {
      chapters.push({
        id: `chapter-${chapters.length + 1}`,
        title: normalizeText(match[0]).slice(0, 140),
        text: chapterText,
      });
    }
  });
  return chapters;
}

function findChapterHeading(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 18);
  const headingPattern = /^(?:(?:chapter|capitol(?:ul)?|part|book)\s+(?:[ivxlcdm]+|\d+)(?:[.:\s-]+.*)?|preface|introduction|conclusion|epilogue)$/i;
  const headings = lines.filter((line) => headingPattern.test(line));
  if (headings.length > 2 || lines.some((line) => /^(contents|table of contents|cuprins)$/i.test(line))) return "";
  return headings[0]?.slice(0, 140) || "";
}

function normalizeText(text) {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
