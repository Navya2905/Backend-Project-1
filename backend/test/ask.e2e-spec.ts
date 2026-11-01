import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HANDBOOK_PAGES, makePdf, uploadPdf, waitForDocument } from './fixtures';
import { auth, createTestApp, registerUser, TestUser } from './helpers';

// Runs the full pipeline with the offline providers (keyword embeddings, extractive answers).
describe('Ask (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<INestApplication<App>['getHttpServer']>;
  let teamA: TestUser;
  let teamB: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    teamA = await registerUser(app, 'askA');
    teamB = await registerUser(app, 'askB');
    const id = await uploadPdf(app, teamA, await makePdf(HANDBOOK_PAGES), 'handbook.pdf');
    await waitForDocument(app, teamA, id);
  });

  afterAll(async () => {
    await app.close();
  });

  const ask = (user: TestUser, question: string, workspaceId = user.workspaceId) =>
    request(http).post(`/api/workspaces/${workspaceId}/ask`).set(auth(user)).send({ question });

  it('answers from the documents with a citation to the right page', async () => {
    const res = await ask(teamA, 'How many days of paid leave do full-time employees get?').expect(200);

    expect(res.body.answered).toBe(true);
    expect(res.body.answer).toContain('20 days of paid leave');
    expect(res.body.citations[0]).toMatchObject({ filename: 'handbook.pdf', pageNumber: 1 });
  });

  it('says it could not find an answer when the documents don\'t cover the question', async () => {
    const res = await ask(teamA, 'What is the CEO salary?').expect(200);
    expect(res.body).toEqual({ answer: "I couldn't find this in your documents.", answered: false, citations: [] });
  });

  it('never answers from another team\'s documents', async () => {
    const res = await ask(teamB, 'How many days of paid leave do full-time employees get?').expect(200);
    expect(res.body.answered).toBe(false);
  });

  it('refuses to ask inside a workspace the user is not a member of', async () => {
    await ask(teamB, 'paid leave', teamA.workspaceId).expect(404);
  });

  it('validates the question', async () => {
    await ask(teamA, '   ').expect(400);
    await ask(teamA, 'x'.repeat(1001)).expect(400);
  });
});
