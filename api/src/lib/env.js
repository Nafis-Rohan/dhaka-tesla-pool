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
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
};

// Fail fast: signing tokens with an undefined secret would throw on the first login instead of at boot.
if (!env.jwtSecret) {
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set it.');
}