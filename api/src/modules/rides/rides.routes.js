import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { createRideSchema, listRidesQuerySchema, rideIdParamsSchema } from './rides.schema.js';
import * as ridesController from './rides.controller.js';

export const ridesRoutes = Router();

// Every ride route is for passengers only (drivers have their own /driver routes)
ridesRoutes.use(requireAuth, requireRole('PASSENGER'));

ridesRoutes.post('/', validate(createRideSchema), ridesController.create);
ridesRoutes.get('/', validate(listRidesQuerySchema, 'query'), ridesController.list);
ridesRoutes.get('/:id', validate(rideIdParamsSchema, 'params'), ridesController.get);
