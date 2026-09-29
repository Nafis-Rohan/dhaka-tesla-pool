// The Prisma Client itself connects via @prisma/adapter-pg (src/lib/prisma.js), so the
// schema's datasource has no url. But CLI commands that need a raw connection - migrate
// deploy, migrate dev - aren't wired through that adapter, so they need one here instead.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same shared .env the API reads (api/ -> repo root). In Docker, DATABASE_URL is already
// set as a container env var and no .env file is present; dotenv never overrides an
// already-set variable, so this is a no-op there.
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
