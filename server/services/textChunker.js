const CHUNK_SIZE_CHARS = 1800; // ~450 tokens at ~4 chars/token, a heuristic to avoid a tokenizer dependency
const CHUNK_OVERLAP_CHARS = 260; // ~65 tokens

// Splits text into overlapping chunks, breaking on paragraph/sentence boundaries where
// possible instead of mid-word. Character-based sizing is an approximation, not a real
// token count - close enough for chunk sizing without pulling in a tokenizer.
function chunkText(text) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
  };

  for (const paragraph of paragraphs) {
    const pieces = paragraph.length > CHUNK_SIZE_CHARS ? splitBySentence(paragraph) : [paragraph];

    for (const piece of pieces) {
      if (current.length > 0 && current.length + piece.length + 1 > CHUNK_SIZE_CHARS) {
        pushCurrent();
        current = current.slice(-CHUNK_OVERLAP_CHARS);
      }
      current += (current ? ' ' : '') + piece;
    }
  }
  pushCurrent();

  return chunks;
}

function splitBySentence(text) {
  return text.split(/(?<=[.!?])\s+/);
}

module.exports = { chunkText };
