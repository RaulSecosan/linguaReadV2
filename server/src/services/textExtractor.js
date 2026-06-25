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
  const spine = asArray(opf.package.spine.itemref)
    .filter((item) => item.linear !== "no");
  const spineDocuments = spine
    .map((item) => manifest.get(item.idref))
    .filter(Boolean)
    .map((item) => {
      const chapterPath = path.posix.normalize(path.posix.join(opfDir, item.href.split("#")[0]));
      const entry = zip.getEntry(chapterPath);
      if (!entry) return null;
      const html = entry.getData().toString("utf8");
      const text = normalizeText(htmlToText(html));
      return {
        path: chapterPath,
        html,
        text,
      };
    })
    .filter(Boolean);
  const navigation = extractEpubNavigation({ zip, opf, opfDir, manifest, spineDocuments });
  const chapters = buildEpubChapters(spineDocuments, navigation);
  const metadata = opf.package.metadata || {};

  return {
    text: normalizeText(chapters.map((chapter) => chapter.text).join("\n\n")),
    chapters,
    metadata: {
      title: metadataValue(metadata, "title"),
      author: metadataValue(metadata, "creator"),
      language: metadataValue(metadata, "language"),
    },
    structureVersion: 3,
  };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function htmlToText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|section|article)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCodePoint(Number.parseInt(value, 16)));
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

function extractEpubNavigation({ zip, opf, opfDir, manifest, spineDocuments }) {
  const navItem = [...manifest.values()].find((item) =>
    String(item.properties || "").split(/\s+/).includes("nav"),
  );
  if (navItem) {
    const navPath = resolveEpubPath(opfDir, navItem.href);
    const entry = zip.getEntry(navPath);
    if (entry) {
      const items = parseEpub3Navigation(entry.getData().toString("utf8"), path.posix.dirname(navPath));
      if (items.length) return items;
    }
  }

  const spineTocId = opf.package.spine?.toc;
  const ncxItem = manifest.get(spineTocId) ||
    [...manifest.values()].find((item) => item["media-type"] === "application/x-dtbncx+xml");
  if (ncxItem) {
    const ncxPath = resolveEpubPath(opfDir, ncxItem.href);
    const entry = zip.getEntry(ncxPath);
    if (entry) {
      const ncx = parser.parse(entry.getData().toString("utf8"));
      const navPoints = ncx.ncx?.navMap?.navPoint || ncx.navMap?.navPoint;
      const items = flattenNcxPoints(navPoints, path.posix.dirname(ncxPath));
      if (items.length) {
        return resolveMissingNavigationTargets(items, opf.package.guide?.reference, opfDir, spineDocuments);
      }
    }
  }

  return [];
}

function parseEpub3Navigation(html, navDir) {
  const tocNav = html.match(/<nav\b[^>]*(?:epub:type|type)\s*=\s*["'](?:[^"']*\s)?toc(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/nav>/i);
  const source = tocNav?.[1] || html;
  return [...source.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      title: normalizeText(htmlToText(match[2])).slice(0, 160),
      ...splitEpubTarget(resolveEpubPath(navDir, decodeXmlAttribute(match[1]))),
    }))
    .filter((item) => item.title && item.path);
}

function flattenNcxPoints(points, navDir, result = []) {
  for (const point of asArray(points)) {
    const source = point.content?.src;
    const title = normalizeText(nodeText(point.navLabel?.text || point.navLabel)).slice(0, 160);
    if (source && title) {
      result.push({
        title,
        ...splitEpubTarget(resolveEpubPath(navDir, source)),
      });
    }
    flattenNcxPoints(point.navPoint, navDir, result);
  }
  return result;
}

function resolveMissingNavigationTargets(items, guideReferences, opfDir, spineDocuments) {
  const guide = asArray(guideReferences);
  return items.map((item, index) => {
    if (spineDocuments.some((document) => document.path === item.path)) return item;
    const guideMatch = guide.find((reference) =>
      normalizeText(reference.title || "").toLowerCase() === item.title.toLowerCase(),
    );
    if (guideMatch?.href) {
      return { ...item, ...splitEpubTarget(resolveEpubPath(opfDir, guideMatch.href)) };
    }
    if (index === 0 && spineDocuments[0]) return { ...item, path: spineDocuments[0].path, fragment: "" };
    return item;
  });
}

function buildEpubChapters(spineDocuments, navigation) {
  if (!navigation.length) {
    return spineDocuments.map((document, index) => ({
      id: `chapter-${index + 1}`,
      title: chapterTitleFromDocument(document, index),
      text: document.text,
    }));
  }

  const spineIndex = new Map(spineDocuments.map((document, index) => [document.path, index]));
  const validNavigation = navigation
    .map((item) => ({ ...item, spineIndex: spineIndex.get(item.path) }))
    .filter((item) => item.spineIndex !== undefined)
    .filter((item, index, entries) =>
      index === 0 || item.path !== entries[index - 1].path || item.fragment !== entries[index - 1].fragment,
    );

  if (!validNavigation.length) {
    return spineDocuments.map((document, index) => ({
      id: `chapter-${index + 1}`,
      title: chapterTitleFromDocument(document, index),
      text: document.text,
    }));
  }

  return validNavigation.map((item, index) => {
    const next = validNavigation[index + 1];
    const endIndex = next ? next.spineIndex : spineDocuments.length;
    const pieces = [];

    for (let documentIndex = item.spineIndex; documentIndex < Math.max(item.spineIndex + 1, endIndex); documentIndex += 1) {
      const document = spineDocuments[documentIndex];
      if (!document) continue;
      if (documentIndex === item.spineIndex && item.fragment) {
        const nextFragment = next?.path === item.path ? next.fragment : "";
        pieces.push(extractHtmlSection(document.html, item.fragment, nextFragment));
      } else {
        pieces.push(document.text);
      }
    }

    return {
      id: `chapter-${index + 1}`,
      title: item.title,
      text: normalizeText(pieces.join("\n\n")),
      sourcePath: item.path,
    };
  }).filter((chapter) => chapter.text);
}

function extractHtmlSection(html, fragment, nextFragment) {
  const start = findAnchorOffset(html, fragment);
  const end = nextFragment ? findAnchorOffset(html, nextFragment) : -1;
  const section = html.slice(start >= 0 ? start : 0, end > start ? end : html.length);
  return normalizeText(htmlToText(section));
}

function findAnchorOffset(html, fragment) {
  if (!fragment) return -1;
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<[^>]+(?:id|name)\\s*=\\s*["']${escaped}["'][^>]*>`, "i"));
  return match?.index ?? -1;
}

function inferChapterTitle(text, index) {
  const firstLine = text.split("\n").map((line) => line.trim()).find(Boolean);
  if (firstLine && firstLine.length <= 100) return firstLine;
  return `Capitolul ${index + 1}`;
}

function chapterTitleFromDocument(document, index) {
  const htmlTitle = extractHtmlTitle(document.html);
  if (htmlTitle && !/^(?:unknown|untitled|chapter)$/i.test(htmlTitle)) return htmlTitle;
  return inferChapterTitle(document.text, index);
}

function metadataValue(metadata, suffix) {
  const key = Object.keys(metadata).find((name) => name.toLowerCase().split(":").pop() === suffix);
  return normalizeText(nodeText(key ? metadata[key] : "")).slice(0, 240);
}

function nodeText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(nodeText).join(" ");
  return nodeText(value["#text"] ?? value.text ?? value.__text ?? "");
}

function resolveEpubPath(baseDir, target) {
  const rawTarget = String(target || "");
  let decoded = rawTarget;
  try {
    decoded = decodeURIComponent(rawTarget);
  } catch {
    // Some publishers leave malformed percent escapes in otherwise readable EPUB paths.
  }
  decoded = decoded.replace(/\\/g, "/");
  const [file, fragment = ""] = decoded.split("#");
  const resolved = path.posix.normalize(path.posix.join(baseDir || ".", file));
  return fragment ? `${resolved}#${fragment}` : resolved;
}

function splitEpubTarget(target) {
  const [filePath, fragment = ""] = String(target || "").split("#");
  return { path: path.posix.normalize(filePath), fragment };
}

function decodeXmlAttribute(value) {
  return String(value || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
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
