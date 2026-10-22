// Store a safe reading model, never publisher HTML, scripts, or arbitrary CSS.
const blockTags = new Set(["p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre", "hr", "figure", "figcaption", "dt", "dd"]);
const ignored = new Set(["script", "style", "head", "iframe", "object", "embed", "noscript", "nav"]);
const collapse = (value) => value.replace(/\s+/g, " ");

function safeStyle(value = "") {
  const result = {};
  for (const declaration of value.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const key = declaration.slice(0, colon).trim().toLowerCase();
    const val = declaration.slice(colon + 1).replace(/!important/gi, "").trim().toLowerCase();
    if (key === "text-align" && /^(left|right|center|justify|start|end)$/.test(val)) result.textAlign = val;
    if (key === "font-style" && /^(italic|oblique|normal)$/.test(val)) result.fontStyle = val;
    if (key === "font-weight" && /^(normal|bold|[1-9]00)$/.test(val)) result.fontWeight = val;
    if (key === "text-indent" && /^-?\d*(?:\.\d+)?(?:em|rem|px|pt)$/.test(val) && Math.abs(parseFloat(val)) <= 48) result.textIndent = val;
    if (key === "display" && val === "none") result.hidden = true;
  }
  return result;
}

function cssRules(css) {
  return [...String(css).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .flatMap((match) => match[1].split(",").map((selector) => ({ selector: selector.trim(), style: safeStyle(match[2]) })))
    .filter((rule) => rule.selector && !rule.selector.startsWith("@"));
}

export function extractReadingBlocks(html, { parseDocument, stylesheets = [] } = {}) {
  const document = parseDocument ? parseDocument(html) : new DOMParser().parseFromString(html, "text/html");
  const root = document.body || document.documentElement;
  const rules = cssRules([...stylesheets, ...[...document.querySelectorAll("style")].map((element) => element.textContent)].join("\n"));
  function styleOf(element, inherited = {}) {
    const style = { ...inherited };
    for (const rule of rules) {
      try { if (element.matches(rule.selector)) Object.assign(style, rule.style); } catch { /* Unsupported publisher selector. */ }
    }
    Object.assign(style, safeStyle(element.getAttribute("style") || ""));
    const tag = element.localName?.toLowerCase();
    if (["em", "i", "cite"].includes(tag)) style.fontStyle = "italic";
    if (["strong", "b"].includes(tag)) style.fontWeight = "bold";
    return style;
  }
  const blocks = [];
  function visit(element, inherited = {}, context = {}) {
    const tag = element.localName?.toLowerCase();
    if (ignored.has(tag) || element.hasAttribute?.("hidden") || element.getAttribute?.("aria-hidden") === "true") return;
    const style = styleOf(element, inherited);
    if (style.hidden) return;
    const type = /^h[1-6]$/.test(tag) || ["blockquote", "li", "pre", "hr"].includes(tag) ? tag : "p";
    const nextContext = { ...context, quote: context.quote || tag === "blockquote", list: tag === "ol" ? "ordered" : tag === "ul" ? "unordered" : context.list };
    if (tag === "hr") { blocks.push({ type: "hr", text: "* * *", runs: [{ text: "* * *" }], style: {} }); return; }
    let runs = [];
    function flush() {
      if (!runs.length) return;
      // Normalize across inline tag boundaries without inserting fake spaces.
      const normalized = [];
      for (const run of runs) {
        let text = collapse(run.text);
        if (!normalized.length) text = text.trimStart();
        else if (normalized.at(-1).text.endsWith(" ")) text = text.replace(/^ /, "");
        if (text) normalized.push({ ...run, text });
      }
      if (normalized.length) normalized.at(-1).text = normalized.at(-1).text.trimEnd();
      const text = normalized.map((run) => run.text).join("");
      const siblings = type === "li" ? [...(element.parentElement?.children || [])].filter((node) => node.localName?.toLowerCase() === "li") : [];
      const listNumber = Number(element.getAttribute?.("value")) || (Number(element.parentElement?.getAttribute("start")) || 1) + siblings.indexOf(element);
      if (text.trim()) blocks.push({ type: nextContext.quote && type === "p" ? "blockquote" : type, text, runs: normalized, style: { textAlign: style.textAlign || "start", ...(style.textIndent ? { textIndent: style.textIndent } : {}) }, ...(nextContext.list && type === "li" ? { list: nextContext.list, listNumber } : {}) });
      runs = [];
    }
    function inline(node, inlineStyle) {
      if (node.nodeType === 3) { runs.push({ text: node.textContent, ...(inlineStyle.fontStyle ? { fontStyle: inlineStyle.fontStyle } : {}), ...(inlineStyle.fontWeight ? { fontWeight: inlineStyle.fontWeight } : {}) }); return; }
      if (node.nodeType !== 1) return;
      const childTag = node.localName?.toLowerCase();
      if (ignored.has(childTag) || node.hasAttribute("hidden")) return;
      const childStyle = styleOf(node, inlineStyle);
      if (childStyle.hidden) return;
      if (childTag === "br") { flush(); return; }
      if (blockTags.has(childTag)) { flush(); visit(node, inlineStyle, nextContext); return; }
      for (const child of node.childNodes) inline(child, childStyle);
    }
    for (const child of element.childNodes || []) inline(child, style);
    flush();
  }
  if (root) visit(root);
  return blocks;
}

export function blocksText(blocks) {
  return blocks.map((block) => block.text).join("\n\n");
}
