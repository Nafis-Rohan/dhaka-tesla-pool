import { Router } from "express";
import { healthRoutes } from "./health.routes.js";

export const router = Router();

router.use("/health", healthRoutes);

// Phase 5+ mounts more routers here: auth, zones, rides, driver...
