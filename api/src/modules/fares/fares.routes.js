import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { estimateSchema } from './fares.schema.js';
import * as faresController from './fares.controller.js';

export const faresRoutes = Router();

// Order matters: who are you -> are you a passenger -> is the body valid -> do the work
faresRoutes.post(
  '/estimate',
  requireAuth,
  requireRole('PASSENGER'),
  validate(estimateSchema),
  faresController.estimate,
);
