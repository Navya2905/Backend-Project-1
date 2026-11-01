import { INestApplication } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import request from 'supertest';
import type { App } from 'supertest/types';
import { auth, TestUser } from './helpers';

// Builds a real PDF in memory: one entry per page, each page a list of lines.
export async function makePdf(pages: string[][]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 740 - i * 18, size: 11, font }));
  }
  return Buffer.from(await doc.save());
}

export const HANDBOOK_PAGES = [
  [
    'Acme Employee Handbook',
    'Full-time employees get 20 days of paid leave per year.',
    'Unused leave days can be carried over to the next year, up to 5 days.',
  ],
  [
    'Travel and expenses',
    'Taxi and train fares on business trips are reimbursed in full.',
    'Submit expense claims within 30 days of the trip.',
  ],
];

export async function uploadPdf(
  app: INestApplication<App>,
  user: TestUser,
  pdf: Buffer,
  filename = 'handbook.pdf',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(`/api/workspaces/${user.workspaceId}/documents`)
    .set(auth(user))
    .attach('file', pdf, { filename, contentType: 'application/pdf' })
    .expect(202);
  return res.body.id;
}

// Processing happens in the background, so poll until the document settles.
export async function waitForDocument(
  app: INestApplication<App>,
  user: TestUser,
  documentId: string,
  timeoutMs = 15_000,
): Promise<{ status: string; error: string | null; pageCount: number | null; chunkCount: number | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer())
      .get(`/api/workspaces/${user.workspaceId}/documents/${documentId}`)
      .set(auth(user))
      .expect(200);
    if (res.body.status === 'ready' || res.body.status === 'failed') return res.body;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Document ${documentId} did not finish processing within ${timeoutMs}ms`);
}
