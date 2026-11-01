import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { auth, createTestApp, registerUser } from './helpers';

describe('Auth & workspaces (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<INestApplication<App>['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register', () => {
    it('creates the user, a personal workspace, and returns a token', async () => {
      const res = await request(http)
        .post('/api/auth/register')
        .send({ email: 'asha@example.com', password: 'correct-horse-battery', name: 'Asha' })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toEqual({ id: expect.any(String), email: 'asha@example.com', name: 'Asha' });
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(res.body.workspace).toMatchObject({ name: "Asha's workspace", role: 'owner' });
    });

    it('rejects a second account with the same email in different case', async () => {
      await request(http)
        .post('/api/auth/register')
        .send({ email: 'ASHA@Example.com', password: 'another-password', name: 'Imposter' })
        .expect(409);
    });

    it('rejects invalid input and unknown fields', async () => {
      const res = await request(http)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short', name: 'X', isAdmin: true })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining(['property isAdmin should not exist', 'email must be an email']),
      );
    });
  });

  describe('login', () => {
    it('returns a token for the right password', async () => {
      const res = await request(http)
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: 'correct-horse-battery' })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(http)
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await request(http)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever-123' })
        .expect(401);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('protected routes', () => {
    it('reject requests without a token', async () => {
      await request(http).get('/api/auth/me').expect(401);
    });

    it('reject a tampered token', async () => {
      const user = await registerUser(app, 'tamper');
      const tampered = user.token.slice(0, -2) + (user.token.endsWith('aa') ? 'bb' : 'aa');
      await request(http).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`).expect(401);
    });

    it('/auth/me returns the user and their workspaces', async () => {
      const user = await registerUser(app, 'me');
      const res = await request(http).get('/api/auth/me').set(auth(user)).expect(200);
      expect(res.body.user.email).toBe(user.email);
      expect(res.body.workspaces).toEqual([expect.objectContaining({ id: user.workspaceId, role: 'owner' })]);
    });
  });

  describe('workspaces', () => {
    it('lets a user create another workspace and become its owner', async () => {
      const user = await registerUser(app, 'creator');
      const created = await request(http)
        .post('/api/workspaces')
        .set(auth(user))
        .send({ name: 'Research' })
        .expect(201);
      expect(created.body).toMatchObject({ name: 'Research', role: 'owner' });

      const list = await request(http).get('/api/workspaces').set(auth(user)).expect(200);
      expect(list.body.map((w: { name: string }) => w.name)).toEqual(['creator\'s workspace', 'Research']);
    });

    it('lets an owner add a member, who can then see the workspace', async () => {
      const owner = await registerUser(app, 'owner');
      const colleague = await registerUser(app, 'colleague');

      await request(http)
        .post(`/api/workspaces/${owner.workspaceId}/members`)
        .set(auth(owner))
        .send({ email: colleague.email })
        .expect(201);

      const members = await request(http)
        .get(`/api/workspaces/${owner.workspaceId}/members`)
        .set(auth(colleague))
        .expect(200);
      expect(members.body.map((m: { email: string }) => m.email).sort()).toEqual(
        [owner.email, colleague.email].sort(),
      );
    });

    it('stops a plain member from adding people (403)', async () => {
      const owner = await registerUser(app, 'owner2');
      const member = await registerUser(app, 'member2');
      const outsider = await registerUser(app, 'outsider2');
      await request(http)
        .post(`/api/workspaces/${owner.workspaceId}/members`)
        .set(auth(owner))
        .send({ email: member.email })
        .expect(201);

      await request(http)
        .post(`/api/workspaces/${owner.workspaceId}/members`)
        .set(auth(member))
        .send({ email: outsider.email })
        .expect(403);
    });

    it('hides other teams\' workspaces from non-members (404, not 403)', async () => {
      const teamA = await registerUser(app, 'teamA');
      const teamB = await registerUser(app, 'teamB');
      await request(http).get(`/api/workspaces/${teamA.workspaceId}/members`).set(auth(teamB)).expect(404);
    });

    it('treats a malformed workspace id as not found', async () => {
      const user = await registerUser(app, 'malformed');
      await request(http).get('/api/workspaces/not-a-uuid/members').set(auth(user)).expect(404);
    });
  });
});
