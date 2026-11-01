import { EMBEDDING_DIMENSIONS, EmbeddingKind, EmbeddingProvider } from './embedding.provider';

const STOP_WORDS = new Set(
  'a an and are as at be by can do does for from get got had has have how i if in is it its me my no not of on or our so than that the their them then there these they this to was we were what when where which who why will with you your'.split(
    ' ',
  ),
);

// Offline embeddings for development and tests: no API key, no network, deterministic.
//
// It hashes words and word pairs into a fixed-size vector ("feature hashing"), so texts
// that share words point in similar directions. It does NOT understand meaning:
// "vacation" and "paid leave" share no words, so they won't match. Use the Voyage or
// OpenAI provider for real semantic search.
export class LocalEmbeddingProvider extends EmbeddingProvider {
  readonly model = 'local-hash-v1';

  // Documents and queries are embedded the same way here, so `kind` is unused.
  embed(texts: string[], _kind?: EmbeddingKind): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.embedOne(text)));
  }

  private embedOne(text: string): number[] {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    const words = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP_WORDS.has(w)).map(stem);

    const add = (feature: string, weight: number) => {
      const hash = fnv1a(feature);
      const sign = hash & 1 ? 1 : -1;
      vector[(hash >>> 1) % EMBEDDING_DIMENSIONS] += sign * weight;
    };
    words.forEach((word, i) => {
      add(word, 1);
      if (i > 0) add(`${words[i - 1]} ${word}`, 0.5);
    });

    const norm = Math.hypot(...vector);
    return norm === 0 ? vector : vector.map((v) => v / norm);
  }
}

// Very light stemming so "days"/"day" and "reimbursed"/"reimbursement" share features.
function stem(word: string): string {
  for (const suffix of ['ments', 'ment', 'ing', 'ed', 'es', 's']) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
