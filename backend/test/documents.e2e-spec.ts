import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HANDBOOK_PAGES, makePdf, uploadPdf, waitForDocument } from './fixtures';
import { auth, createTestApp, registerUser, TestUser } from './helpers';

describe('Documents, processing & search (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<INestApplication<App>['getHttpServer']>;
  let handbook: Buffer;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    handbook = await makePdf(HANDBOOK_PAGES);
  });

  afterAll(async () => {
    await app.close();
  });

  const search = (user: TestUser, query: string) =>
    request(http).post(`/api/workspaces/${user.workspaceId}/search`).set(auth(user)).send({ query }).expect(200);

  describe('upload and processing', () => {
    it('accepts a PDF, processes it in the background, and makes it searchable', async () => {
      const user = await registerUser(app, 'uploader');

      const upload = await request(http)
        .post(`/api/workspaces/${user.workspaceId}/documents`)
        .set(auth(user))
        .attach('file', handbook, { filename: 'handbook.pdf', contentType: 'application/pdf' })
        .expect(202);
      expect(upload.body).toMatchObject({ filename: 'handbook.pdf', status: 'pending' });

      const doc = await waitForDocument(app, user, upload.body.id);
      expect(doc).toMatchObject({ status: 'ready', error: null, pageCount: 2 });
      expect(doc.chunkCount).toBeGreaterThanOrEqual(2);

      const results = await search(user, 'taxi fares reimbursed');
      expect(results.body[0]).toMatchObject({ filename: 'handbook.pdf', pageNumber: 2 });
      expect(results.body[0].content).toContain('Taxi and train fares');
      expect(results.body[0].similarity).toBeGreaterThan(results.body.at(-1).similarity - 1e-9);
    });

    it('lists the workspace\'s documents', async () => {
      const user = await registerUser(app, 'lister');
      const id = await uploadPdf(app, user, handbook, 'policy.pdf');
      const list = await request(http).get(`/api/workspaces/${user.workspaceId}/documents`).set(auth(user)).expect(200);
      expect(list.body).toEqual([expect.objectContaining({ id, filename: 'policy.pdf' })]);
    });
  });

  describe('file validation', () => {
    it('rejects a file that is not really a PDF, whatever its name', async () => {
      const user = await registerUser(app, 'fake');
      const res = await request(http)
        .post(`/api/workspaces/${user.workspaceId}/documents`)
        .set(auth(user))
        .attach('file', Buffer.from('just some text'), { filename: 'notes.pdf', contentType: 'application/pdf' })
        .expect(400);
      expect(res.body.message).toBe('Only PDF files are supported');
    });

    it('rejects a request with no file', async () => {
      const user = await registerUser(app, 'nofile');
      await request(http).post(`/api/workspaces/${user.workspaceId}/documents`).set(auth(user)).expect(400);
    });

    it('rejects files over the size limit with 413', async () => {
      const user = await registerUser(app, 'big');
      const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(1.5 * 1024 * 1024)]); // limit is 1 MB in tests
      await request(http)
        .post(`/api/workspaces/${user.workspaceId}/documents`)
        .set(auth(user))
        .attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' })
        .expect(413);
    });

    it('marks a PDF with no text as failed, with an explanation', async () => {
      const user = await registerUser(app, 'scan');
      const id = await uploadPdf(app, user, await makePdf([[]]), 'scan.pdf');
      const doc = await waitForDocument(app, user, id);
      expect(doc.status).toBe('failed');
      expect(doc.error).toMatch(/No text was found/);
    });

    it('marks a damaged PDF as failed without retrying forever', async () => {
      const user = await registerUser(app, 'broken');
      const id = await uploadPdf(app, user, Buffer.from('%PDF-1.7\nthis is not a real pdf body'), 'broken.pdf');
      const doc = await waitForDocument(app, user, id);
      expect(doc.status).toBe('failed');
      expect(doc.error).toMatch(/could not be read/);
    });
  });

  describe('tenant isolation', () => {
    let teamA: TestUser;
    let teamB: TestUser;
    let docA: string;

    beforeAll(async () => {
      teamA = await registerUser(app, 'isoA');
      teamB = await registerUser(app, 'isoB');
      docA = await uploadPdf(app, teamA, handbook, 'team-a-secrets.pdf');
      await waitForDocument(app, teamA, docA);
    });

    it('team B cannot read, delete or retry team A\'s document through team A\'s workspace', async () => {
      const base = `/api/workspaces/${teamA.workspaceId}/documents`;
      await request(http).get(base).set(auth(teamB)).expect(404);
      await request(http).get(`${base}/${docA}`).set(auth(teamB)).expect(404);
      await request(http).delete(`${base}/${docA}`).set(auth(teamB)).expect(404);
      await request(http).post(`${base}/${docA}/retry`).set(auth(teamB)).expect(404);
    });

    it('team B cannot reach team A\'s document through its own workspace either', async () => {
      await request(http).get(`/api/workspaces/${teamB.workspaceId}/documents/${docA}`).set(auth(teamB)).expect(404);
      await request(http).delete(`/api/workspaces/${teamB.workspaceId}/documents/${docA}`).set(auth(teamB)).expect(404);
    });

    it('team B\'s search never returns team A\'s chunks, even for an exact-match query', async () => {
      const results = await search(teamB, 'Full-time employees get 20 days of paid leave per year');
      expect(results.body).toEqual([]);
    });

    it('team B cannot search inside team A\'s workspace', async () => {
      await request(http)
        .post(`/api/workspaces/${teamA.workspaceId}/search`)
        .set(auth(teamB))
        .send({ query: 'paid leave' })
        .expect(404);
    });
  });

  describe('delete and retry', () => {
    it('lets only the uploader or an owner delete; deleting removes the chunks', async () => {
      const owner = await registerUser(app, 'delOwner');
      const member = await registerUser(app, 'delMember');
      await request(http)
        .post(`/api/workspaces/${owner.workspaceId}/members`)
        .set(auth(owner))
        .send({ email: member.email })
        .expect(201);

      const id = await uploadPdf(app, owner, handbook);
      await waitForDocument(app, owner, id);

      const asMember = { ...member, workspaceId: owner.workspaceId };
      await request(http).delete(`/api/workspaces/${owner.workspaceId}/documents/${id}`).set(auth(asMember)).expect(403);
      await request(http).delete(`/api/workspaces/${owner.workspaceId}/documents/${id}`).set(auth(owner)).expect(204);
      await request(http).get(`/api/workspaces/${owner.workspaceId}/documents/${id}`).set(auth(owner)).expect(404);
      expect((await search(owner, 'taxi fares')).body).toEqual([]);
    });

    it('only allows retrying failed documents', async () => {
      const user = await registerUser(app, 'retry');
      const id = await uploadPdf(app, user, handbook);
      await waitForDocument(app, user, id);
      await request(http).post(`/api/workspaces/${user.workspaceId}/documents/${id}/retry`).set(auth(user)).expect(400);
    });
  });
});
