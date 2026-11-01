const CITATION = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

export interface ParsedAnswer {
  // The answer with citation markers that don't match a real source removed.
  text: string;
  // Source ids actually cited, in order of first appearance.
  citedIds: number[];
}

// The model is asked to cite sources as [n] or [n, m]. We only trust ids we
// actually sent: anything else is dropped, so a citation always points to a real
// passage, document and page.
export function parseCitations(answer: string, validIds: Set<number>): ParsedAnswer {
  const cited: number[] = [];

  const text = answer
    .replace(CITATION, (_match, group: string) => {
      const ids = group.split(',').map((id) => Number(id.trim()));
      const kept = ids.filter((id) => validIds.has(id));
      for (const id of kept) if (!cited.includes(id)) cited.push(id);
      return kept.map((id) => `[${id}]`).join('');
    })
    .replace(/ +([.,;:!?])/g, '$1') // tidy spaces left behind by removed markers
    .replace(/ {2,}/g, ' ')
    .trim();

  return { text, citedIds: cited };
}
