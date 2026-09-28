import { z } from 'zod';

// 1 to 3 seats: Bullet has 3 and the vehicles table caps capacity at 3 (rules.md B9)
export const estimateSchema = z.object({
  pickupZoneId: z.uuid('pickupZoneId must be a valid zone id'),
  destZoneId: z.uuid('destZoneId must be a valid zone id'),
  seats: z
    .number('seats must be a number')
    .int('seats must be a whole number')
    .min(1, 'Book at least 1 seat')
    .max(3, 'You can book at most 3 seats'),
});
