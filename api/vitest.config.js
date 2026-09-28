// This file tells Vitest: you're testing a Node backend. Use the test database,
// not the development database, and run database tests one at a time.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Same shared .env the API reads (api/ -> repo root), so host and port always match the dev setup
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// Same server and credentials as DATABASE_URL, but the database name gets a "_test" suffix
// (tesla_pool -> tesla_pool_test). Set TEST_DATABASE_URL to override completely.
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example)');

  const url = new URL(process.env.DATABASE_URL);
  if (!url.pathname.endsWith('_test')) url.pathname += '_test';
  return url.toString();
}

export default defineConfig({
  test: {
    environment: 'node',

    // Set before any app code loads, so tests never touch the dev database.
    // dotenv (in lib/env.js) does not override variables that are already set.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: 'test-only-secret-not-used-anywhere-else',
    },

    // All test files share one database, so run them one after another
    fileParallelism: false,
  },
});
