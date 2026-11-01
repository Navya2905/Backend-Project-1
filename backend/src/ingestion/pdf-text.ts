import { PDFParse } from 'pdf-parse';
import type { PageText } from './chunker';

// Every valid PDF starts with these bytes. Checking them catches renamed files
// that only claim to be PDFs.
export function looksLikePdf(data: Buffer): boolean {
  return data.subarray(0, 5).toString('latin1') === '%PDF-';
}

export async function extractPages(data: Buffer): Promise<PageText[]> {
  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({ pageNumber: page.num, text: page.text }));
  } finally {
    await parser.destroy();
  }
}
