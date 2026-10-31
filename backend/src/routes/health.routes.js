import { Router } from 'express';
import { hasDBClient, pingDB } from '../config/db.js';
import { ensureDatabase } from '../middleware/database.js';

const router = Router();

// With no client yet (a new instance), connect first; otherwise ask the one there is, since it may
// be recovering. Every step has a time limit.
async function databaseAvailable() {
  if (!hasDBClient()) {
    try {
      await ensureDatabase();
    } catch {
      return false;
    }
  }
  return pingDB();
}

// GET /api/health — used by the deployment host to check status. Any answer means the API process
// is running; 200 or 503 says whether the database answered a ping just now.
router.get('/', async (req, res) => {
  const dbConnected = await databaseAvailable();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    database: dbConnected ? 'connected' : 'disconnected',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
