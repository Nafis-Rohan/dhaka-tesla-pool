import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './lib/env.js';
import { pool } from './lib/db.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authLimiter } from './middleware/rateLimit.js';
import { authRoutes, meRoutes } from './modules/auth/auth.routes.js';
import { zonesRoutes } from './modules/zones/zones.routes.js';
import { faresRoutes } from './modules/fares/fares.routes.js';
import { ridesRoutes } from './modules/rides/rides.routes.js';
import { driverRoutes } from './modules/driver/driver.routes.js';
import { poolRoutes } from './modules/pools/pools.routes.js';

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
app.use('/me', meRoutes);
app.use('/zones', zonesRoutes);
app.use('/fares', faresRoutes);
app.use('/rides', ridesRoutes);
app.use('/driver/pool', poolRoutes); // before /driver, so the more specific path is matched first
app.use('/driver', driverRoutes);

app.use(errorHandler);
