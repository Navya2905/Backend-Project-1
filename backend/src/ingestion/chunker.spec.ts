import { chunkPages, cleanText } from './chunker';

const sentence = (n: number, words = 10) => `Sentence ${n} ${'word '.repeat(words - 3).trim()} end.`;

describe('cleanText', () => {
  it('joins words hyphenated across line breaks and collapses whitespace', () => {
    expect(cleanText('reimburse-\nment is   paid\n\nmonthly')).toBe('reimbursement is paid monthly');
  });

  it('removes NUL characters that Postgres cannot store', () => {
    expect(cleanText('a\u0000b')).toBe('ab');
  });
});

describe('chunkPages', () => {
  it('keeps a short page as one chunk with its page number', () => {
    const chunks = chunkPages([{ pageNumber: 3, text: 'Employees get 20 days of leave. It renews in April.' }]);
    expect(chunks).toEqual([
      { index: 0, pageNumber: 3, content: 'Employees get 20 days of leave. It renews in April.' },
    ]);
  });

  it('never lets a chunk cross a page boundary', () => {
    const chunks = chunkPages([
      { pageNumber: 1, text: 'Page one text.' },
      { pageNumber: 2, text: 'Page two text.' },
    ]);
    expect(chunks.map((c) => [c.pageNumber, c.content])).toEqual([
      [1, 'Page one text.'],
      [2, 'Page two text.'],
    ]);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it('splits long pages on sentence boundaries within the word limit', () => {
    const text = Array.from({ length: 10 }, (_, i) => sentence(i)).join(' ');
    const chunks = chunkPages([{ pageNumber: 1, text }], { maxWords: 30, overlapWords: 0 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.split(' ').length).toBeLessThanOrEqual(30);
      expect(chunk.content).toMatch(/^Sentence \d+ .* end\.$/); // starts and ends on whole sentences
    }
  });

  it('repeats the end of one chunk at the start of the next (overlap)', () => {
    const text = Array.from({ length: 6 }, (_, i) => sentence(i)).join(' ');
    const chunks = chunkPages([{ pageNumber: 1, text }], { maxWords: 30, overlapWords: 10 });

    const lastOfFirst = chunks[0].content.split(/(?<=\.) /).at(-1);
    expect(chunks[1].content.startsWith(lastOfFirst!)).toBe(true);
  });

  it('cuts a single over-long "sentence" (e.g. a table) by words', () => {
    const table = Array.from({ length: 100 }, (_, i) => `cell${i}`).join(' ');
    const chunks = chunkPages([{ pageNumber: 1, text: table }], { maxWords: 40, overlapWords: 0 });
    expect(chunks.map((c) => c.content.split(' ').length)).toEqual([40, 40, 20]);
  });

  it('skips pages with no text', () => {
    expect(chunkPages([{ pageNumber: 1, text: '   \n ' }])).toEqual([]);
  });

  it('rejects an overlap as large as the chunk', () => {
    expect(() => chunkPages([], { maxWords: 10, overlapWords: 10 })).toThrow();
  });
});
