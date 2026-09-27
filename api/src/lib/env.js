// this file basically loads.env and creates an easy env object.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// api/src/lib -> api/src -> api -> repo root, where the shared .env lives
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

config({ path: path.join(rootDir, '.env') });

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
