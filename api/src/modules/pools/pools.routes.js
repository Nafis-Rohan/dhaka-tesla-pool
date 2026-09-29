import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { rideIdParamsSchema } from '../rides/rides.schema.js';
import * as poolsController from './pools.controller.js';

// Mounted at /driver/pool. Everything here is the driver running their current trip.
export const poolRoutes = Router();

poolRoutes.use(requireAuth, requireRole('DRIVER'));

poolRoutes.get('/current', poolsController.current);

// State changes are action endpoints, each with its own rules (rules.md B10)
poolRoutes.post('/arrive', poolsController.arrive);
poolRoutes.post('/start', poolsController.start);
poolRoutes.post('/cancel', poolsController.cancel);

// :id is a passenger's ride request id
poolRoutes.post('/requests/:id/dropoff', validate(rideIdParamsSchema, 'params'), poolsController.dropOff);
poolRoutes.post('/requests/:id/no-show', validate(rideIdParamsSchema, 'params'), poolsController.noShow);
