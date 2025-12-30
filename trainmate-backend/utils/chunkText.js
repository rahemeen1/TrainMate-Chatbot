export const chunkText = (text, size = 400, overlap = 50) => {
  const words = text.split(" ");
  const chunks = [];
  let i = 0;

  while (i < words.length) {
    chunks.push(words.slice(i, i + size).join(" "));
    i += size - overlap;
  }

  return chunks;
};
