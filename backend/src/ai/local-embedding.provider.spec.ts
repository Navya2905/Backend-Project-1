import { EMBEDDING_DIMENSIONS } from './embedding.provider';
import { LocalEmbeddingProvider } from './local-embedding.provider';

const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);

describe('LocalEmbeddingProvider', () => {
  const provider = new LocalEmbeddingProvider();

  it('returns unit-length vectors of the configured size', async () => {
    const [vector] = await provider.embed(['Employees get twenty days of paid leave'], 'document');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.hypot(...vector)).toBeCloseTo(1, 6);
  });

  it('is deterministic', async () => {
    const [a] = await provider.embed(['same text'], 'document');
    const [b] = await provider.embed(['same text'], 'query');
    expect(a).toEqual(b);
  });

  it('scores texts that share words higher than unrelated texts', async () => {
    const [question, leave, taxi] = await provider.embed(
      ['How many days of paid leave do employees get?', 'Employees get 20 days of paid leave per year.', 'Taxi fares are reimbursed in full.'],
      'document',
    );
    expect(cosine(question, leave)).toBeGreaterThan(cosine(question, taxi) + 0.3);
  });

  it('returns a zero vector for text with no meaningful words', async () => {
    const [vector] = await provider.embed(['the and of'], 'query');
    expect(vector.every((v) => v === 0)).toBe(true);
  });
});
