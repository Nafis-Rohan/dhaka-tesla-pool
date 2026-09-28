import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import * as zonesController from './zones.controller.js';

export const zonesRoutes = Router();

zonesRoutes.get('/', requireAuth, zonesController.list);
