import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validate } from '../../middleware/validate.js';
import { rideIdParamsSchema } from '../rides/rides.schema.js';
import { availabilitySchema } from './driver.schema.js';
import * as driverController from './driver.controller.js';

// Mounted at /driver. The trip actions (arrive, start, drop-off ...) are under /driver/pool.
export const driverRoutes = Router();

driverRoutes.use(requireAuth, requireRole('DRIVER'));

// PUT because it sets the whole state ("online in Banani" / "offline") and is safe to repeat
driverRoutes.get('/availability', driverController.getAvailability);
driverRoutes.put('/availability', validate(availabilitySchema), driverController.setAvailability);

driverRoutes.get('/requests', driverController.listRequests);
driverRoutes.post('/requests/:id/accept', validate(rideIdParamsSchema, 'params'), driverController.accept);

driverRoutes.get('/history', driverController.history);
