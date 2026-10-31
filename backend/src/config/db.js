import mongoose from 'mongoose';

// The same options on a long-running server and on a host that runs the API as a function.
//   serverSelectionTimeoutMS: give up after 5 s, so an unreachable database fails a request instead
//     of holding it for the driver's default 30 s.
//   connectTimeoutMS: also limits the driver's checks on the server, so a database that has gone
//     silent is noticed in about 15 s rather than 40 s.
//   maxPoolSize: each running instance holds its own pool, so this stays far below the driver's
//     default of 100; the database sees this number times the number of instances.
//   maxIdleTimeMS: release connections that have not been used for a minute.
export const CONNECTION_OPTIONS = Object.freeze({
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 5_000,
  maxPoolSize: 10,
  maxIdleTimeMS: 60_000,
});

// How long a ping may take: when a request finds the connection lost, and for GET /api/health.
export const RECOVERY_PING_TIMEOUT_MS = 5_000;
export const HEALTH_PING_TIMEOUT_MS = 2_500;
// How long a caller waits for an attempt. This limits the wait only: the attempt carries on, and the
// driver options above do not cover the DNS lookup for a mongodb+srv URI.
export const CONNECT_DEADLINE_MS = 7_000;

// The client from the last successful connection. It is never closed to recover: requests may
// still be using it, and the driver reconnects it by itself once the database answers again.
let connectedClient = null;
mongoose.connection.on('close', () => {
  connectedClient = null;
});

// The attempt in progress, so requests arriving together share it. Cleared only when it settles, so
// a failed attempt is not remembered, and a caller giving up cannot start a second connection.
let attempt = null;

// Resolves once the database can be used; rejects if it cannot, or if this caller's deadline passes.
// The attempt carries on after a deadline, and later calls can use its result. Safe to call on every
// request: while connected it does nothing, and it never opens a second client while one may still
// recover.
export function connectDB(uri, { deadlineMs = CONNECT_DEADLINE_MS } = {}) {
  if (isDBConnected()) return Promise.resolve();
  attempt ??= (connectedClient ? ping(connectedClient, RECOVERY_PING_TIMEOUT_MS) : openConnection(uri)).finally(() => {
    attempt = null;
  });
  return withDeadline(attempt, deadlineMs, `no connection within ${deadlineMs} ms`);
}

async function openConnection(uri) {
  await mongoose.connect(uri, { ...CONNECTION_OPTIONS });
  connectedClient = mongoose.connection.client ?? null;
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

// Rejects if `work` has not settled within `timeoutMs`. `work` itself carries on.
async function withDeadline(work, timeoutMs, message) {
  let timer;
  const timedOut = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([work, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function ping(client, timeoutMs) {
  return withDeadline(client.db('admin').command({ ping: 1 }), timeoutMs, `no answer to a ping within ${timeoutMs} ms`);
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

function currentClient() {
  return isDBConnected() ? mongoose.connection.client : connectedClient;
}

// True when a client exists to ask, whatever state it is in.
export function hasDBClient() {
  return Boolean(currentClient());
}

// Asks the database itself. readyState is only the driver's last known state, and stays "connected"
// for a while after a database stops answering. Only GET /api/health calls this: ordinary requests
// must not pay for a round trip.
export async function pingDB(timeoutMs = HEALTH_PING_TIMEOUT_MS) {
  const client = currentClient();
  if (!client) return false;
  try {
    await ping(client, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

// A connection error's text for the logs, with any username and password masked.
export function describeDBError(err) {
  return String(err?.message ?? err).replace(/\/\/\S*@/g, '//***@');
}
