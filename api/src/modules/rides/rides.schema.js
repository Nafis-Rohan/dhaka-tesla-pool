import { z } from 'zod';
import { estimateSchema } from '../fares/fares.schema.js';

// Booking takes exactly what an estimate takes (zones, seats) plus one flag, so it reuses those
// rules and they can't drift apart. Default true: it's a pooling app, opting out is the exception.
export const createRideSchema = estimateSchema.extend({
  allowPool: z.boolean('allowPool must be true or false').default(true),
});
