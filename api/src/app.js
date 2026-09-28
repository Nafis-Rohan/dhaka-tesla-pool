import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './lib/env.js';
import { pool } from './lib/db.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authLimiter } from './middleware/rateLimit.js';
import { authRoutes } from './modules/auth/auth.routes.js';

export const app = express();

app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: '10kb' })); //Don't accept JSON bodies larger than 10 KB. max JSON body size

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    req.log?.error({ err }, 'health check: database unreachable');
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

app.use('/auth', authLimiter, authRoutes);

app.use(errorHandler);
