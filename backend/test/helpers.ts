import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { applyTestEnv } from './test-env';

applyTestEnv();

export async function createTestApp(): Promise<INestApplication<App>> {
  // Imported after applyTestEnv() so ConfigModule sees the test settings.
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

export interface TestUser {
  token: string;
  userId: string;
  email: string;
  workspaceId: string;
}

let counter = 0;

export async function registerUser(app: INestApplication<App>, label = 'user'): Promise<TestUser> {
  counter += 1;
  const email = `${label}-${Date.now()}-${counter}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password: 'correct-horse-battery', name: label })
    .expect(201);
  return {
    token: res.body.accessToken,
    userId: res.body.user.id,
    email,
    workspaceId: res.body.workspace.id,
  };
}

export const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
