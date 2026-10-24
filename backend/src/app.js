import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(cors({ origin: env.clientUrl }));
app.use(express.json({ limit: '100kb' }));
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

app.use('/api/health', healthRoutes);
// Feature routes are mounted here as modules are built, e.g.:
// app.use('/api/auth', authRoutes);
// app.use('/api/tickets', ticketRoutes);
// app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
