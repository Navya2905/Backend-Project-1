export interface PageText {
  pageNumber: number;
  text: string;
}

export interface TextChunk {
  index: number;
  pageNumber: number;
  content: string;
}

export interface ChunkOptions {
  // Roughly 180 words ≈ 240 tokens: small enough to be about one idea, big enough to keep context.
  maxWords?: number;
  // Words repeated from the end of one chunk at the start of the next, so a
  // thought cut at a boundary still appears whole in one chunk.
  overlapWords?: number;
}

// Splits each page into chunks of whole sentences. Chunks never cross a page
// boundary, so every chunk cites exactly one page.
export function chunkPages(pages: PageText[], options: ChunkOptions = {}): TextChunk[] {
  const maxWords = options.maxWords ?? 180;
  const overlapWords = options.overlapWords ?? 30;
  if (overlapWords >= maxWords) throw new Error('overlapWords must be smaller than maxWords');

  const chunks: TextChunk[] = [];
  for (const page of pages) {
    for (const content of chunkText(cleanText(page.text), maxWords, overlapWords)) {
      chunks.push({ index: chunks.length, pageNumber: page.pageNumber, content });
    }
  }
  return chunks;
}

// PDF text arrives with hard line breaks and hyphenated words split across lines.
export function cleanText(text: string): string {
  return text
    .replace(/\u0000/g, '') // Postgres text columns can't store NUL characters
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text: string, maxWords: number, overlapWords: number): string[] {
  if (!text) return [];
  const sentences = splitSentences(text).flatMap((s) => splitLongSentence(s, maxWords));

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const words = countWords(sentence);
    if (currentWords + words > maxWords && current.length > 0) {
      chunks.push(current.join(' '));
      // Start the next chunk with the last few sentences, up to overlapWords.
      const overlap: string[] = [];
      let overlapCount = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const n = countWords(current[i]);
        if (overlapCount + n > overlapWords) break;
        overlap.unshift(current[i]);
        overlapCount += n;
      }
      current = overlap;
      currentWords = overlapCount;
    }
    current.push(sentence);
    currentWords += words;
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/).filter((s) => s.length > 0);
}

// A "sentence" longer than a whole chunk (tables, lists without punctuation) is cut by words.
function splitLongSentence(sentence: string, maxWords: number): string[] {
  const words = sentence.split(' ');
  if (words.length <= maxWords) return [sentence];
  const parts: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) parts.push(words.slice(i, i + maxWords).join(' '));
  return parts;
}

function countWords(text: string): number {
  return text.split(' ').length;
}
