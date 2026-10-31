import { env } from '../config/env.js';
import { connectDB, describeDBError } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

// Connect on demand, for hosts where server.js does not run first. Tests manage their own connection.
const connectIfNeeded = env.nodeEnv === 'test' ? async () => {} : () => connectDB(env.mongodbUri);

// Throws 503 DATABASE_UNAVAILABLE unless the database can be used. Cheap while connected (config/db.js).
// The reason is logged with credentials masked, and never reaches the client.
export async function ensureDatabase(connect = connectIfNeeded) {
  try {
    await connect();
  } catch (err) {
    console.error(`Could not connect to MongoDB: ${describeDBError(err)}`);
    throw ApiError.databaseUnavailable();
  }
}

// For public routes that use the database, after their rate limiter. Routes behind requireAuth
// already get this check, once the token has been verified.
export async function requireDatabase(req, res, next) {
  await ensureDatabase();
  next();
}
