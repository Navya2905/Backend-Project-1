// Shared settings for end-to-end tests. Tests use their own database (documind_test),
// created fresh by global-setup.ts, so they never touch development data.

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://documind:documind_dev_password@localhost:5432/documind_test';

export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
  process.env.EMBEDDING_PROVIDER = 'local';
  process.env.LLM_PROVIDER = 'local';
  process.env.QUEUE_PREFIX = 'documind-test';
  process.env.MAX_UPLOAD_MB = '1';
  process.env.UPLOAD_DIR = process.env.UPLOAD_DIR ?? `${__dirname}/../.test-uploads`;
}
