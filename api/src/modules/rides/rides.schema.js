import { z } from 'zod';
import { estimateSchema } from '../fares/fares.schema.js';

// Booking takes exactly what an estimate takes (zones, seats) plus one flag, so it reuses those
// rules and they can't drift apart. Default true: it's a pooling app, opting out is the exception.
export const createRideSchema = estimateSchema.extend({
  allowPool: z.boolean('allowPool must be true or false').default(true),
});

// GET /rides?scope=active  -> the ride in progress (0 or 1)
// GET /rides?scope=history -> finished rides (completed, cancelled, expired), newest first
export const listRidesQuerySchema = z.object({
  scope: z.enum(['active', 'history'], 'scope must be "active" or "history"').default('active'),
});

// A malformed id would reach Postgres as a bad uuid and come back as a 500, so reject it here
export const rideIdParamsSchema = z.object({
  id: z.uuid('Ride id must be a valid id'),
});
