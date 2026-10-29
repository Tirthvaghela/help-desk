import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import agentTicketRoutes from './routes/agentTicket.routes.js';
import adminStatsRoutes from './routes/adminStats.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import customerTicketRoutes from "./routes/customerTicket.routes.js";
import authRoutes from './routes/auth.routes.js';
import categoryRoutes from './routes/category.routes.js';
import adminCategoryRoutes from './routes/adminCategory.routes.js';
import adminUserRoutes from './routes/adminUser.routes.js';
import notificationRoutes from './routes/notification.routes.js';

const app = express();
// Don't advertise the server framework in every response.
app.disable('x-powered-by');

app.use(cors({ origin: env.clientUrl }));
app.use(express.json({ limit: '100kb' }));
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
// Swati's ticket router (POST /, GET /my) must be mounted BEFORE agentTicketRoutes,
// otherwise GET /api/tickets/my reaches GET /:id (contract D-7).
app.use("/api/tickets", customerTicketRoutes);
app.use('/api/tickets', agentTicketRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin/categories', adminCategoryRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin', adminStatsRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
