import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { registerSchema } from './auth.schema.js';
import * as authController from './auth.controller.js';

export const authRoutes = Router();

authRoutes.post('/register', validate(registerSchema), authController.register);
