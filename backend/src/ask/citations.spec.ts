import { parseCitations } from './citations';

const valid = new Set([1, 2, 3]);

describe('parseCitations', () => {
  it('keeps valid citations and lists them in order of first use', () => {
    const result = parseCitations('Leave is 20 days [2]. It carries over [1]. Again [2].', valid);
    expect(result.citedIds).toEqual([2, 1]);
    expect(result.text).toBe('Leave is 20 days [2]. It carries over [1]. Again [2].');
  });

  it('drops citations to sources that were never sent', () => {
    const result = parseCitations('Made-up fact [7]. Real fact [1].', valid);
    expect(result.citedIds).toEqual([1]);
    expect(result.text).toBe('Made-up fact. Real fact [1].');
  });

  it('handles grouped citations like [1, 3] and filters inside the group', () => {
    const result = parseCitations('Both say so [1, 9, 3].', valid);
    expect(result.citedIds).toEqual([1, 3]);
    expect(result.text).toBe('Both say so [1][3].');
  });

  it('reports no citations when the answer has none', () => {
    expect(parseCitations('No brackets here.', valid).citedIds).toEqual([]);
  });
});
