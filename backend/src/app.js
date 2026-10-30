import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import agentTicketRoutes from './routes/agentTicket.routes.js';
import adminStatsRoutes from './routes/adminStats.routes.js';
import { methodNotAllowed, notFound, errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLog.js';
import customerTicketRoutes from "./routes/customerTicket.routes.js";
import authRoutes from './routes/auth.routes.js';
import categoryRoutes from './routes/category.routes.js';
import adminCategoryRoutes from './routes/adminCategory.routes.js';
import adminUserRoutes from './routes/adminUser.routes.js';
import notificationRoutes from './routes/notification.routes.js';

// Security headers for every response, including 404s, errors and CORS preflights. The API
// only returns JSON, so the strictest CSP fits. HSTS is sent only when `hsts` is on (production)
// and the request arrived over HTTPS: req.secure is true for a direct HTTPS connection, or behind
// a proxy only if Express "trust proxy" is configured, so a spoofed X-Forwarded-Proto cannot
// switch it on. Local HTTP development never gets it.
export function securityHeaders({ hsts = false } = {}) {
  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    });
    if (hsts && req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
    next();
  };
}

const app = express();
// Don't advertise the server framework in every response.
app.disable('x-powered-by');

app.use(securityHeaders({ hsts: env.nodeEnv === 'production' }));
// One origin: answered as before (that origin on every response). Several (CORS_ORIGINS): only a
// listed request Origin is echoed back; any other gets no Access-Control-Allow-Origin.
app.use(cors({ origin: env.corsOrigins.length > 1 ? env.corsOrigins : env.clientUrl }));
app.use(express.json({ limit: '100kb' }));
if (env.nodeEnv !== 'test') {
  app.use(requestLogger(env.nodeEnv));
}

// Mounted in this order. One list, so the 405 check below always knows every route.
const API_ROUTES = [
  ['/api/health', healthRoutes],
  ['/api/auth', authRoutes],
  // Swati's ticket router (POST /, GET /my) must be mounted BEFORE agentTicketRoutes,
  // otherwise GET /api/tickets/my reaches GET /:id (contract D-7).
  ['/api/tickets', customerTicketRoutes],
  ['/api/tickets', agentTicketRoutes],
  ['/api/categories', categoryRoutes],
  ['/api/admin/categories', adminCategoryRoutes],
  ['/api/admin/users', adminUserRoutes],
  ['/api/admin', adminStatsRoutes],
  ['/api/notifications', notificationRoutes],
];
for (const [path, router] of API_ROUTES) app.use(path, router);

app.use(methodNotAllowed(API_ROUTES));
app.use(notFound);
app.use(errorHandler);

export default app;
