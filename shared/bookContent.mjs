export function splitContent(payload, size = 180000) {
  return Array.from({ length: Math.max(1, Math.ceil(payload.length / size)) }, (_, index) => payload.slice(index * size, (index + 1) * size));
}
export function joinContent(chunks) {
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  if (!sorted.length || sorted.length !== sorted[0].total || sorted.some((chunk, index) => chunk.index !== index || chunk.total !== sorted.length)) {
    throw new Error("Continutul cartii este incomplet. Datele salvate nu au fost modificate; incearca reincarcarea.");
  }
  return sorted.map((item) => item.chunk).join("");
}
