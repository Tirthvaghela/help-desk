import { Router } from 'express';
import { isDBConnected } from '../config/db.js';

const router = Router();

// GET /api/health — used by the frontend and the deployment host to check status.
router.get('/', (req, res) => {
  const dbConnected = isDBConnected();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    database: dbConnected ? 'connected' : 'disconnected',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
