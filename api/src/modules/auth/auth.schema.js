import { z } from 'zod';

// Bangladeshi mobile: 01 + operator digit 3-9 + 8 more digits (rules.md B9)
const phone = z
  .string()
  .trim()
  .regex(/^01[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number, e.g. 01712345678');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60, 'Name is too long'),
  phone,
  // bcrypt only uses the first 72 bytes, so a longer password gives a false sense of security
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});

export const loginSchema = z.object({
  phone,
  password: z.string().min(1, 'Password is required'),
});
