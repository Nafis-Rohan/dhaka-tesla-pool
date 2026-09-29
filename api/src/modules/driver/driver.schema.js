import { z } from 'zod';

// PUT /driver/availability
//   go online:  { "online": true, "zoneId": "<zone id>" }
//   go offline: { "online": false }
export const availabilitySchema = z
  .object({
    online: z.boolean('online must be true or false'),
    zoneId: z.uuid('zoneId must be a valid zone id').optional(),
  })
  .refine((data) => !data.online || data.zoneId, {
    message: 'zoneId is required when going online',
    path: ['zoneId'], // so the error is reported against that field
  });
