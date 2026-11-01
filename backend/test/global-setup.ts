import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './test-env';

// Runs once before all e2e tests: recreate the test database and apply every migration.
export default async function globalSetup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`Refusing to reset "${dbName}": test database names must end in _test`);
  }

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.end();
  }

  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'migrate.js')], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
