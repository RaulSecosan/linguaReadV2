export function splitContent(payload, size = 180000) {
  if (!Number.isInteger(size) || size < 2) throw new Error("Chunk size must be at least two UTF-16 units.");
  const chunks = [];
  for (let offset = 0; offset < payload.length;) {
    let end = Math.min(offset + size, payload.length);
    const previous = payload.charCodeAt(end - 1), next = payload.charCodeAt(end);
    // Firestore transmits each document as UTF-8; never split a surrogate pair.
    if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end -= 1;
    chunks.push(payload.slice(offset, end));
    offset = end;
  }
  return chunks.length ? chunks : [""];
}
export function joinContent(chunks) {
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  if (!sorted.length || sorted.length !== sorted[0].total || sorted.some((chunk, index) => chunk.index !== index || chunk.total !== sorted.length)) {
    throw new Error("Continutul cartii este incomplet. Datele salvate nu au fost modificate; incearca reincarcarea.");
  }
  return sorted.map((item) => item.chunk).join("");
}
