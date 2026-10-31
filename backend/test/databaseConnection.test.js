import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, describeDBError, pingDB, CONNECT_DEADLINE_MS, CONNECTION_OPTIONS, HEALTH_PING_TIMEOUT_MS, RECOVERY_PING_TIMEOUT_MS } from '../src/config/db.js';
import { ensureDatabase, requireDatabase } from '../src/middleware/database.js';
import { requireAuth } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { freePort } from './helpers/freePort.js';
import { startMongoProxy } from './helpers/mongoProxy.js';

import authRoutes from '../src/routes/auth.routes.js';
import adminCategoryRoutes from '../src/routes/adminCategory.routes.js';
import adminStatsRoutes from '../src/routes/adminStats.routes.js';
import adminUserRoutes from '../src/routes/adminUser.routes.js';
import agentTicketRoutes from '../src/routes/agentTicket.routes.js';
import categoryRoutes from '../src/routes/category.routes.js';
import customerTicketRoutes from '../src/routes/customerTicket.routes.js';
import notificationRoutes from '../src/routes/notification.routes.js';

// Connecting on demand (src/config/db.js, src/middleware/database.js). Real connections only ever
// use the local *_test database, directly or through a proxy on a spare port, or port 1, where
// nothing listens.

const LOCAL_URI = process.env.MONGODB_URI;
const local = new URL(LOCAL_URI);
const LOCAL_PORT = Number(local.port) || 27017;
const SECRET_USER = 'ci-user';
const SECRET_PASSWORD = 's3cret-pass';
const UNREACHABLE_URI = `mongodb://${SECRET_USER}:${SECRET_PASSWORD}@127.0.0.1:1/helpdesk_test`;
const backendDir = fileURLToPath(new URL('..', import.meta.url));
const UNAVAILABLE_BODY = {
  error: { code: 'DATABASE_UNAVAILABLE', message: 'The service is temporarily unavailable. Please try again in a moment.' },
};
// Generous upper limits, so a slow CI machine cannot fail a test that still proves the point: each
// is well under the 40 s or more that an unlimited wait took.
const SLACK_MS = 6_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// By identity, with a plain message: assert.equal would try to describe two clients on failure, and
// describing this connection's client runs the test process out of memory.
function assertSameClient(actual, expected, message = 'expected the same client') {
  assert.ok(actual === expected, message);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function waitFor(condition, ms) {
  const started = Date.now();
  while (!condition() && Date.now() - started < ms) await sleep(10);
  return condition();
}

function reachable() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: LOCAL_PORT }, () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

let localDB = false;
before(async () => {
  assert.match(LOCAL_URI, /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[^/?]+_test$/, 'local *_test database only');
  localDB = await reachable();
  if (!localDB && process.env.REQUIRE_TEST_DB === '1') assert.fail('REQUIRE_TEST_DB=1 but MongoDB is not reachable');
});

afterEach(async () => {
  await mongoose.disconnect();
});

function needsDB(t) {
  if (!localDB) t.skip('MongoDB is not reachable');
  return localDB;
}

describe('connectDB without a real database', () => {
  it('concurrent calls share one attempt, with the bounded options', async (t) => {
    const gate = deferred();
    const connect = t.mock.method(mongoose, 'connect', () => gate.promise);

    const calls = [connectDB('mongodb://shared/x_test'), connectDB('mongodb://shared/x_test'), connectDB('mongodb://shared/x_test')];
    await sleep(0);
    assert.equal(connect.mock.callCount(), 1);
    gate.resolve();
    await Promise.all(calls);

    assert.deepEqual(connect.mock.calls[0].arguments, ['mongodb://shared/x_test', { ...CONNECTION_OPTIONS }]);
    assert.deepEqual(
      { ...CONNECTION_OPTIONS },
      { serverSelectionTimeoutMS: 5_000, connectTimeoutMS: 5_000, maxPoolSize: 10, maxIdleTimeMS: 60_000 },
    );
  });

  it('a failed attempt rejects everyone waiting on it, is not remembered, and the next call tries again', async (t) => {
    const gate = deferred();
    const connect = t.mock.method(mongoose, 'connect', () => gate.promise);

    const calls = [connectDB('mongodb://retry/x_test'), connectDB('mongodb://retry/x_test')];
    await sleep(0);
    gate.reject(new Error('no server'));
    const results = await Promise.allSettled(calls);
    assert.deepEqual(results.map((result) => result.reason?.message), ['no server', 'no server']);
    assert.equal(connect.mock.callCount(), 1);

    connect.mock.mockImplementation(async () => {});
    await connectDB('mongodb://retry/x_test');
    assert.equal(connect.mock.callCount(), 2);
  });

  it('a caller past its deadline gets an error, the attempt stays cached, and no second connection starts', async (t) => {
    const gate = deferred();
    const connect = t.mock.method(mongoose, 'connect', () => gate.promise);

    await assert.rejects(connectDB('mongodb://deadline/x_test', { deadlineMs: 20 }), /no connection within 20 ms/);
    await assert.rejects(connectDB('mongodb://deadline/x_test', { deadlineMs: 20 }), /no connection within 20 ms/);
    assert.equal(connect.mock.callCount(), 1, 'the second caller waited on the same attempt');

    const waiting = connectDB('mongodb://deadline/x_test');
    gate.resolve();
    await waiting;
    assert.equal(connect.mock.callCount(), 1);
  });

  it('an attempt that fails after every caller has given up causes no unhandled rejection, and is retried', async (t) => {
    const gate = deferred();
    const connect = t.mock.method(mongoose, 'connect', () => gate.promise);
    const unhandled = [];
    const onUnhandled = (err) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
      await assert.rejects(connectDB('mongodb://late-failure/x_test', { deadlineMs: 20 }), /no connection within 20 ms/);
      gate.reject(new Error('no server'));
      await sleep(20);
      assert.deepEqual(unhandled, []);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    connect.mock.mockImplementation(async () => {});
    await connectDB('mongodb://late-failure/x_test');
    assert.equal(connect.mock.callCount(), 2);
  });

  it('the default deadline is about 7 seconds', () => {
    assert.equal(CONNECT_DEADLINE_MS, 7_000);
  });

  it('never disconnects to connect', async (t) => {
    const disconnect = t.mock.method(mongoose, 'disconnect', async () => {});
    t.mock.method(mongoose, 'connect', async () => {});

    await connectDB('mongodb://order/x_test');
    assert.equal(disconnect.mock.callCount(), 0);
  });

  it('masks credentials in connection error text, including malformed URIs', () => {
    for (const uri of [UNREACHABLE_URI, 'mongodb+srv://u:p%40ss@h/db', 'mongodb://u:p@ss@h/db', 'mongodb://u:a/b@h/db']) {
      const text = describeDBError(new Error(`failed for ${uri} now`));
      assert.match(text, /^failed for mongodb(\+srv)?:\/\/\*\*\*@/, text);
      for (const secret of [SECRET_USER, SECRET_PASSWORD, 'p%40ss', 'ss@', 'a/b']) assert.ok(!text.includes(secret), text);
    }
  });
});

describe('connectDB with the local test database', () => {
  it('connects to the named database', async (t) => {
    if (!needsDB(t)) return;
    await connectDB(LOCAL_URI);
    assert.equal(mongoose.connection.readyState, 1);
    assert.match(mongoose.connection.name, /_test$/);
  });

  it('reuses the open connection instead of opening another', async (t) => {
    if (!needsDB(t)) return;
    await connectDB(LOCAL_URI);
    const client = mongoose.connection.client;
    const connect = t.mock.method(mongoose, 'connect');

    await connectDB(LOCAL_URI);
    await connectDB(LOCAL_URI);
    assert.equal(connect.mock.callCount(), 0);
    assertSameClient(mongoose.connection.client, client);
  });

  it('concurrent first calls open one connection', async (t) => {
    if (!needsDB(t)) return;
    const connect = t.mock.method(mongoose, 'connect');

    await Promise.all(Array.from({ length: 10 }, () => connectDB(LOCAL_URI)));
    assert.equal(connect.mock.callCount(), 1);
    assert.equal(mongoose.connection.readyState, 1);
  });

  it('gives up on an unreachable server within its limit, then a retry succeeds', async (t) => {
    if (!needsDB(t)) return;
    const started = Date.now();
    await assert.rejects(connectDB(UNREACHABLE_URI), { name: 'MongooseServerSelectionError' });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < CONNECTION_OPTIONS.serverSelectionTimeoutMS + SLACK_MS, `took ${elapsed} ms`);
    assert.equal(mongoose.connection.readyState, 0);

    await connectDB(LOCAL_URI);
    assert.equal(mongoose.connection.readyState, 1);
  });

  it('after mongoose.disconnect() a later call opens a new connection', async (t) => {
    if (!needsDB(t)) return;
    await connectDB(LOCAL_URI);
    const first = mongoose.connection.client;
    await mongoose.disconnect();

    await connectDB(LOCAL_URI);
    assert.equal(mongoose.connection.readyState, 1);
    assert.ok(mongoose.connection.client !== first, 'expected a new client');
  });
});

// Through the proxy, so the database can seem to disappear while MongoDB itself keeps running.
describe('a lost database (through a local proxy)', () => {
  let proxy;
  let uri;

  // Connects, and records whether this client ever gets closed.
  async function connectThroughProxy() {
    await connectDB(uri);
    const client = mongoose.connection.client;
    const seen = { closed: false };
    client.once('topologyClosed', () => { seen.closed = true; });
    return { client, seen };
  }
  const query = () => mongoose.connection.collection('connection_test_absent').find({}).toArray();

  beforeEach(async () => {
    if (!localDB) return;
    proxy = await startMongoProxy(LOCAL_PORT);
    uri = `mongodb://127.0.0.1:${proxy.port}${local.pathname}?directConnection=true`;
  });

  afterEach(async () => {
    if (!proxy) return;
    await proxy.stop();
    proxy = null;
  });

  it('a request during an outage fails within its limit, keeps the client, and the same client recovers', async (t) => {
    if (!needsDB(t)) return;
    const { client, seen } = await connectThroughProxy();
    const connect = t.mock.method(mongoose, 'connect');
    const disconnect = t.mock.method(mongoose, 'disconnect');

    await proxy.refuse();
    assert.ok(await waitFor(() => mongoose.connection.readyState === 0, 20_000), 'the driver noticed the outage');

    const started = Date.now();
    await assert.rejects(connectDB(uri), { name: 'MongoServerSelectionError' });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < RECOVERY_PING_TIMEOUT_MS + SLACK_MS, `took ${elapsed} ms`);

    await proxy.accept();
    await connectDB(uri);
    assert.ok(await waitFor(() => mongoose.connection.readyState === 1, 20_000), 'the same client reconnected');
    assert.deepEqual(await query(), []);

    assertSameClient(mongoose.connection.client, client, 'still the same client');
    assert.equal(seen.closed, false, 'the client was never closed');
    assert.equal(connect.mock.callCount(), 0, 'no replacement client was opened');
    assert.equal(disconnect.mock.callCount(), 0);
  });

  it('concurrent requests during an outage share one check and open no client', async (t) => {
    if (!needsDB(t)) return;
    const { client, seen } = await connectThroughProxy();
    const connect = t.mock.method(mongoose, 'connect');

    await proxy.refuse();
    assert.ok(await waitFor(() => mongoose.connection.readyState === 0, 20_000));
    const ping = t.mock.method(client, 'db');
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => connectDB(uri)));
    assert.ok(results.every((result) => result.status === 'rejected'));
    assert.equal(ping.mock.callCount(), 1, 'one ping, shared by every caller');

    assert.equal(connect.mock.callCount(), 0);
    assertSameClient(mongoose.connection.client, client);
    assert.equal(seen.closed, false);
  });

  it('work in flight is not interrupted when another request finds the connection lost', async (t) => {
    if (!needsDB(t)) return;
    const { client, seen } = await connectThroughProxy();

    proxy.hold();
    const inFlight = query();
    await sleep(50);
    // What Mongoose does when the driver reports the server gone. Before the review this made the
    // next request close the client, and the query failed with MongoClientClosedError.
    mongoose.connection.readyState = 0;
    const recovery = connectDB(uri);
    await sleep(50);
    proxy.release();

    assert.deepEqual(await inFlight, []);
    await recovery;
    assertSameClient(mongoose.connection.client, client);
    assert.equal(seen.closed, false);
  });

  // The query has reached the server and its reply is being held, then the connection is cut, so the
  // reply is lost. Only after that may traffic flow again.
  async function interruptReadInFlight() {
    proxy.hold();
    const inFlight = query();
    assert.ok(await waitFor(() => proxy.heldReplies() > 0, 5_000), 'the query was answered and its reply held');
    proxy.drop();
    proxy.release();
    return inFlight;
  }

  it('a read in flight survives a real network interruption, because the driver retries it', async (t) => {
    if (!needsDB(t)) return;
    const { client, seen } = await connectThroughProxy();

    assert.deepEqual(await interruptReadInFlight(), [], 'the driver retried the read');
    assertSameClient(mongoose.connection.client, client);
    assert.equal(seen.closed, false);
  });

  it('control: with driver retries off, the same interruption fails the read', async (t) => {
    if (!needsDB(t)) return;
    uri += '&retryReads=false';
    await connectThroughProxy();

    // The socket closing, or the pool being cleared because of it, depending on which is seen first.
    await assert.rejects(interruptReadInFlight(), (err) => err instanceof mongoose.mongo.MongoNetworkError);
  });

  it('a first connection that outlasts a caller\'s deadline completes, and later requests use it', async (t) => {
    if (!needsDB(t)) return;
    const connect = t.mock.method(mongoose, 'connect');
    proxy.hold();

    await assert.rejects(connectDB(uri, { deadlineMs: 100 }), /no connection within 100 ms/);
    await assert.rejects(connectDB(uri, { deadlineMs: 100 }), /no connection within 100 ms/);
    assert.equal(connect.mock.callCount(), 1);
    assert.equal(mongoose.connection.readyState, 2, 'still connecting');

    proxy.release();
    await connectDB(uri);
    assert.equal(mongoose.connection.readyState, 1);
    assert.equal(connect.mock.callCount(), 1, 'the original attempt was used');
    assert.deepEqual(await query(), []);
  });

  it('an ordinary query cut off by a silent database gets the fixed 503 and no details', async (t) => {
    if (!needsDB(t)) return;
    await connectThroughProxy();
    const logged = t.mock.method(console, 'error', () => {});
    const mini = express();
    mini.get('/x', async (req, res) => res.json(await query()));
    mini.use(errorHandler);
    proxy.silence();

    const started = Date.now();
    const res = await request(mini).get('/x');
    const elapsed = Date.now() - started;

    proxy.restore();
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, UNAVAILABLE_BODY);
    assert.ok(elapsed < 20_000 + SLACK_MS, `took ${elapsed} ms`);
    assert.ok(logged.mock.calls.some((call) => /^Database error during a request: /.test(call.arguments[0])));
  });

  it('a silent database: a request finding the connection lost is answered within its limit', async (t) => {
    if (!needsDB(t)) return;
    const { client, seen } = await connectThroughProxy();
    proxy.silence();
    mongoose.connection.readyState = 0;

    const started = Date.now();
    await assert.rejects(connectDB(uri), /no answer to a ping within|timed out/);
    const elapsed = Date.now() - started;
    assert.ok(elapsed < RECOVERY_PING_TIMEOUT_MS + SLACK_MS, `took ${elapsed} ms`);

    assertSameClient(mongoose.connection.client, client);
    assert.equal(seen.closed, false);
    proxy.restore();
  });

  it('ordinary requests do not ping: while connected, connectDB sends nothing', async (t) => {
    if (!needsDB(t)) return;
    const { client } = await connectThroughProxy();
    const db = t.mock.method(client, 'db');
    await connectDB(uri);
    assert.equal(db.mock.callCount(), 0);
  });

  describe('GET /api/health (test mode: it only asks the existing client)', () => {
    it('healthy: 200 with the usual body', async (t) => {
      if (!needsDB(t)) return;
      await connectThroughProxy();
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.deepEqual(Object.keys(res.body), ['status', 'database', 'uptimeSeconds', 'timestamp']);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.database, 'connected');
    });

    it('stale readyState: 503 within the ping limit, even though readyState is still 1', async (t) => {
      if (!needsDB(t)) return;
      const { client, seen } = await connectThroughProxy();
      proxy.silence();

      const started = Date.now();
      const res = await request(app).get('/api/health');
      const elapsed = Date.now() - started;

      assert.equal(mongoose.connection.readyState, 1, 'the driver has not noticed yet');
      assert.equal(res.status, 503);
      assert.equal(res.body.status, 'degraded');
      assert.equal(res.body.database, 'disconnected');
      assert.ok(elapsed >= HEALTH_PING_TIMEOUT_MS - 100, `waited for the limit, took ${elapsed} ms`);
      assert.ok(elapsed < HEALTH_PING_TIMEOUT_MS + SLACK_MS, `took ${elapsed} ms`);
      assert.equal(seen.closed, false);
      assertSameClient(mongoose.connection.client, client);
      proxy.restore();
    });

    it('an outage: 503 within the ping limit, then 200 on the same client once it is back', async (t) => {
      if (!needsDB(t)) return;
      const { client, seen } = await connectThroughProxy();

      await proxy.refuse();
      assert.ok(await waitFor(() => mongoose.connection.readyState === 0, 20_000));
      const started = Date.now();
      const down = await request(app).get('/api/health');
      assert.equal(down.status, 503);
      assert.ok(Date.now() - started < HEALTH_PING_TIMEOUT_MS + SLACK_MS);

      await proxy.accept();
      assert.ok(await waitFor(() => mongoose.connection.readyState === 1, 20_000));
      const up = await request(app).get('/api/health');
      assert.equal(up.status, 200);
      assertSameClient(mongoose.connection.client, client);
      assert.equal(seen.closed, false);
    });

    it('pingDB answers false with no client, without contacting anything', async () => {
      assert.equal(await pingDB(), false);
    });
  });
});

describe('ensureDatabase', () => {
  it('resolves when the connection is ready', async () => {
    let ready = false;
    await ensureDatabase(async () => { ready = true; });
    assert.equal(ready, true);
  });

  it('throws 503 without the reason, and logs the reason with credentials masked', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});

    await assert.rejects(
      ensureDatabase(async () => { throw new Error(`failed for ${UNREACHABLE_URI}`); }),
      (err) => {
        assert.equal(err.status, 503);
        assert.equal(err.code, 'DATABASE_UNAVAILABLE');
        assert.equal(err.message, 'The service is temporarily unavailable. Please try again in a moment.');
        return true;
      },
    );

    const line = logged.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
    assert.match(line, /Could not connect to MongoDB: failed for mongodb:\/\/\*\*\*@127\.0\.0\.1:1/);
    assert.ok(!line.includes(SECRET_PASSWORD) && !line.includes(SECRET_USER), line);
  });
});

describe('errorHandler: database connectivity errors', () => {
  const { PoolClearedError } = createRequire(import.meta.url)('mongodb/lib/cmap/errors.js');
  const { MongoServerSelectionError, MongoNetworkError, MongoNetworkTimeoutError } = mongoose.mongo;
  const HOST_TEXT = `cannot reach cluster0.example.test via ${UNREACHABLE_URI}`;

  function answer(err) {
    const mini = express();
    mini.get('/x', () => { throw err; });
    mini.use(errorHandler);
    return request(mini).get('/x');
  }

  const connectivityErrors = {
    MongoServerSelectionError: () => new MongoServerSelectionError(HOST_TEXT, { type: 'Unknown', servers: new Map() }),
    MongoNetworkError: () => new MongoNetworkError(HOST_TEXT),
    MongoNetworkTimeoutError: () => new MongoNetworkTimeoutError(HOST_TEXT),
    'pool cleared (PoolClearedError)': () => new PoolClearedError({ address: '127.0.0.1:1' }, HOST_TEXT),
  };
  for (const [name, make] of Object.entries(connectivityErrors)) {
    it(`${name}: the fixed 503, nothing from the driver, and a masked log line`, async (t) => {
      const logged = t.mock.method(console, 'error', () => {});

      const res = await answer(make());

      assert.equal(res.status, 503);
      assert.deepEqual(res.body, UNAVAILABLE_BODY);
      const line = logged.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
      assert.match(line, /^Database error during a request: /);
      assert.ok(!line.includes(SECRET_PASSWORD) && !line.includes(SECRET_USER), line);
    });
  }

  it('leaves other errors as they were', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});

    const duplicate = await answer(Object.assign(new Error('E11000'), { code: 11000, keyValue: { email: 'a@example.test' } }));
    assert.deepEqual([duplicate.status, duplicate.body.error.code], [409, 'DUPLICATE']);

    const unexpected = await answer(new Error('boom'));
    assert.deepEqual([unexpected.status, unexpected.body], [500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }]);

    const serverError = await answer(new mongoose.mongo.MongoServerError({ message: 'bad command', code: 2 }));
    assert.deepEqual([serverError.status, serverError.body.error.code], [500, 'INTERNAL_ERROR']);
    assert.equal(logged.mock.callCount(), 2, 'unexpected errors are still logged');
  });
});

// Every route that can touch the database must be behind one of the two checks.
describe('every database route has the availability check', () => {
  const handlerNames = (route) => route.stack.map((layer) => layer.name);
  const routesOf = (router) => router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  const usesAuthFirst = (router) => router.stack.some((layer) => !layer.route && layer.name === requireAuth.name);

  const PUBLIC_DATABASE_ROUTES = ['/register', '/login', '/verify-email', '/forgot-password', '/reset-password/check', '/reset-password'];

  it('the six public authentication routes: limiter, then the check, then the controller', () => {
    const guarded = routesOf(authRoutes).filter((route) => handlerNames(route).includes(requireDatabase.name));
    assert.deepEqual(guarded.map((route) => route.path).sort(), [...PUBLIC_DATABASE_ROUTES].sort());
    for (const route of guarded) {
      assert.equal(route.stack.length, 3, route.path);
      assert.equal(route.stack[1].name, requireDatabase.name, `${route.path}: the check comes after the limiter`);
    }
  });

  it('every other route goes through requireAuth, which checks after verifying the token', () => {
    const routers = { authRoutes, adminCategoryRoutes, adminStatsRoutes, adminUserRoutes, agentTicketRoutes, categoryRoutes, customerTicketRoutes, notificationRoutes };
    for (const [name, router] of Object.entries(routers)) {
      for (const route of routesOf(router)) {
        const covered = usesAuthFirst(router) || handlerNames(route).includes(requireAuth.name) || handlerNames(route).includes(requireDatabase.name);
        assert.ok(covered, `${name} ${route.path} has no availability check`);
      }
    }
  });
});

// The real app outside test mode, importing only app.js as a function host would: server.js never
// runs, so nothing has connected before the first request.
describe('the real app connecting on demand (child process)', () => {
  const ORIGIN = 'http://localhost:5173';
  const SECOND_ORIGIN = 'http://localhost:5174';
  const NOT_ALLOWED_ORIGIN = 'https://evil.example';

  function runApp(uri, lines, extraEnv = {}) {
    const script = [
      "const { default: request } = await import('supertest');",
      "const { default: jwt } = await import('jsonwebtoken');",
      "const { default: app } = await import('./src/app.js');",
      "const validToken = jwt.sign({ ver: 0 }, process.env.JWT_SECRET, { subject: '64b000000000000000000000', expiresIn: '1h', algorithm: 'HS256' });",
      'const out = {};',
      // Status, body and the headers these tests care about, plus how long it took.
      'async function see(call) {',
      '  const started = Date.now();',
      '  const res = await call;',
      "  const pick = (name) => res.headers[name] ?? null;",
      "  return { status: res.status, body: res.body, ms: Date.now() - started, cors: pick('access-control-allow-origin'), nosniff: pick('x-content-type-options'), csp: pick('content-security-policy'), frame: pick('x-frame-options'), cache: pick('cache-control'), allow: pick('allow') };",
      '}',
      ...lines,
      'console.log(JSON.stringify(out));',
      'process.exit(0);',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: backendDir,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        MONGODB_URI: uri,
        JWT_SECRET: 'child-process-secret',
        EMAIL_TRANSPORT: 'memory',
        CLIENT_URL: ORIGIN,
        ...extraEnv,
      },
      encoding: 'utf8',
      timeout: 60_000,
    });
    assert.equal(result.status, 0, result.stderr);
    return { out: JSON.parse(result.stdout.trim().split('\n').pop()), output: result.stdout + result.stderr };
  }

  function assertNoCredentials(out, output) {
    const everything = JSON.stringify(out) + output;
    for (const secret of [SECRET_USER, SECRET_PASSWORD, UNREACHABLE_URI]) assert.ok(!everything.includes(secret), everything);
  }

  describe('with the database unavailable', () => {
    it('answers that need no database stay correct, and do not wait for one', () => {
      const { out, output } = runApp(UNREACHABLE_URI, [
        "out.noToken = await see(request(app).get('/api/admin/users'));",
        "out.badToken = await see(request(app).get('/api/tickets').set('Authorization', 'Bearer not-a-token'));",
        "out.noTokenCategories = await see(request(app).get('/api/categories'));",
        "out.unknown = await see(request(app).get('/api/does-not-exist'));",
        "out.unknownUnderPrefix = await see(request(app).get('/api/tickets/a/b/c'));",
        "out.wrongMethod = await see(request(app).delete('/api/auth/login'));",
        "out.healthWrongMethod = await see(request(app).delete('/api/health'));",
        "out.badJson = await see(request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{'));",
        "out.preflight = await see(request(app).options('/api/tickets').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST'));",
      ]);

      assert.deepEqual([out.noToken.status, out.noToken.body.error.code], [401, 'UNAUTHORIZED']);
      assert.deepEqual([out.badToken.status, out.badToken.body.error.code], [401, 'UNAUTHORIZED']);
      assert.deepEqual([out.noTokenCategories.status, out.noTokenCategories.body.error.code], [401, 'UNAUTHORIZED']);
      assert.deepEqual([out.unknown.status, out.unknown.body.error.code], [404, 'NOT_FOUND']);
      assert.deepEqual([out.unknownUnderPrefix.status, out.unknownUnderPrefix.body.error.code], [404, 'NOT_FOUND']);
      assert.deepEqual([out.wrongMethod.status, out.wrongMethod.body.error.code, out.wrongMethod.allow], [405, 'METHOD_NOT_ALLOWED', 'POST, OPTIONS']);
      assert.deepEqual([out.healthWrongMethod.status, out.healthWrongMethod.allow], [405, 'GET, HEAD, OPTIONS']);
      assert.deepEqual([out.badJson.status, out.badJson.body.error.code], [400, 'INVALID_JSON']);
      assert.equal(out.preflight.status, 204);

      // A connection attempt takes about 5 s, so anything well under that did not try one.
      for (const [name, seen] of Object.entries(out)) assert.ok(seen.ms < 3_000, `${name} took ${seen.ms} ms`);
      assert.doesNotMatch(output, /Could not connect to MongoDB/, 'no connection was attempted');
    });

    it('a valid token gets the full 503, with CORS and security headers and no credentials', () => {
      const { out, output } = runApp(UNREACHABLE_URI, [
        "out.protected = await see(request(app).get('/api/tickets').set('Authorization', `Bearer ${validToken}`).set('Origin', 'http://localhost:5173'));",
      ]);
      assert.equal(out.protected.status, 503);
      assert.deepEqual(out.protected.body, UNAVAILABLE_BODY);
      assert.equal(out.protected.cors, ORIGIN);
      assert.equal(out.protected.nosniff, 'nosniff');
      assert.equal(out.protected.frame, 'DENY');
      assert.equal(out.protected.csp, "default-src 'none'; frame-ancestors 'none'");
      assert.equal(out.protected.cache, 'no-store', 'requireAuth has already marked the answer private');
      assert.match(output, /Could not connect to MongoDB/);
      assertNoCredentials(out, output);
    });

    it('all six public database routes answer 503 in full, sharing one attempt', () => {
      const { out, output } = runApp(UNREACHABLE_URI, [
        "const paths = ['register', 'login', 'verify-email', 'forgot-password', 'reset-password/check', 'reset-password'];",
        "const seen = await Promise.all(paths.map((path) => see(request(app).post(`/api/auth/${path}`).set('Origin', 'http://localhost:5173').send({ email: 'a@example.test', password: 'x', token: 'x', name: 'x', newPassword: 'x' }))));",
        'out.routes = Object.fromEntries(paths.map((path, i) => [path, seen[i]]));',
      ]);
      assert.equal(Object.keys(out.routes).length, 6);
      for (const [path, seen] of Object.entries(out.routes)) {
        assert.equal(seen.status, 503, path);
        assert.deepEqual(seen.body, UNAVAILABLE_BODY, path);
        assert.equal(seen.cors, ORIGIN, path);
        assert.equal(seen.nosniff, 'nosniff', path);
      }
      assertNoCredentials(out, output);
    });

    it('the rate limiter runs before the check: over the limit is 429 at once', () => {
      const { out } = runApp(UNREACHABLE_URI, [
        "out.first = await see(request(app).post('/api/auth/login').send({ email: 'a@example.test', password: 'x' }));",
        "out.second = await see(request(app).post('/api/auth/login').send({ email: 'a@example.test', password: 'x' }));",
      ], { AUTH_RATE_LIMIT_MAX: '1' });
      assert.equal(out.first.status, 503);
      assert.equal(out.second.status, 429);
      assert.equal(out.second.body.error.code, 'RATE_LIMITED');
      assert.ok(out.second.ms < 3_000, `took ${out.second.ms} ms`);
    });

    it('with several allowed origins (CORS_ORIGINS): a 503 echoes only a listed origin', () => {
      const { out, output } = runApp(UNREACHABLE_URI, [
        "const call = (origin) => see(request(app).get('/api/tickets').set('Authorization', `Bearer ${validToken}`).set('Origin', origin));",
        "[out.first, out.second, out.other] = await Promise.all([call('http://localhost:5173'), call('http://localhost:5174'), call('https://evil.example')]);",
      ], { CORS_ORIGINS: SECOND_ORIGIN });
      assert.deepEqual([out.first.status, out.first.cors], [503, ORIGIN]);
      assert.deepEqual([out.second.status, out.second.cors], [503, SECOND_ORIGIN]);
      assert.deepEqual([out.other.status, out.other.cors], [503, null], `${NOT_ALLOWED_ORIGIN} gets no CORS header`);
      assertNoCredentials(out, output);
    });

    it('with NODE_ENV=production the same guard runs', () => {
      const { out, output } = runApp(UNREACHABLE_URI, [
        "out.noToken = await see(request(app).get('/api/admin/users'));",
        "out.protected = await see(request(app).get('/api/tickets').set('Authorization', `Bearer ${validToken}`).set('Origin', 'http://localhost:5173'));",
      ], { NODE_ENV: 'production', JWT_SECRET: 'p'.repeat(48), EMAIL_TRANSPORT: 'disabled' });
      assert.equal(out.noToken.status, 401);
      assert.equal(out.protected.status, 503);
      assert.deepEqual(out.protected.body, UNAVAILABLE_BODY);
      assert.equal(out.protected.cors, ORIGIN);
      assertNoCredentials(out, output);
    });

    it('GET /api/health: 503 with the health body, no credentials', () => {
      const { out, output } = runApp(UNREACHABLE_URI, [
        "out.health = await see(request(app).get('/api/health').set('Origin', 'http://localhost:5173'));",
      ]);
      assert.equal(out.health.status, 503);
      assert.deepEqual(Object.keys(out.health.body), ['status', 'database', 'uptimeSeconds', 'timestamp']);
      assert.deepEqual([out.health.body.status, out.health.body.database], ['degraded', 'disconnected']);
      assert.equal(out.health.cors, ORIGIN);
      assert.equal(out.health.nosniff, 'nosniff');
      assertNoCredentials(out, output);
    });
  });

  describe('with the local test database', () => {
    it('concurrent first requests connect once; routes run; no token still stops at 401', (t) => {
      if (!localDB) {
        t.skip('MongoDB is not reachable');
        return;
      }
      const { out, output } = runApp(LOCAL_URI, [
        "out.noToken = await see(request(app).get('/api/admin/users'));",
        "[out.health, out.unknownUser, out.login] = await Promise.all([",
        "  see(request(app).get('/api/health')),",
        "  see(request(app).get('/api/tickets').set('Authorization', `Bearer ${validToken}`)),",
        "  see(request(app).post('/api/auth/login').send({ email: 'nobody-here@example.test', password: 'wrong-password' })),",
        ']);',
      ]);
      assert.equal(out.noToken.status, 401);
      assert.deepEqual([out.health.status, out.health.body.status, out.health.body.database], [200, 'ok', 'connected']);
      assert.deepEqual([out.unknownUser.status, out.unknownUser.body.error.code], [401, 'UNAUTHORIZED'], 'the token is valid, the user does not exist');
      assert.deepEqual([out.login.status, out.login.body.error.code], [401, 'INVALID_CREDENTIALS']);
      assert.equal(output.match(/MongoDB connected:/g)?.length, 1, output);
    });
  });
});

// server.js connects before listening, as it always has.
describe('server.js startup (child process, spare port)', () => {
  it('an unreachable database: clear message, exit 1, never listening, no credentials', async () => {
    const port = await freePort();
    const result = spawnSync(process.execPath, ['src/server.js'], {
      cwd: backendDir,
      env: { ...process.env, PORT: String(port), MONGODB_URI: UNREACHABLE_URI },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Could not connect to MongoDB/);
    assert.doesNotMatch(result.stdout, /API listening/);
    const output = result.stdout + result.stderr;
    assert.ok(!output.includes(SECRET_PASSWORD) && !output.includes(SECRET_USER), output);
  });

  it('a reachable database: connects first, then listens and reports healthy', async (t) => {
    if (!localDB) {
      t.skip('MongoDB is not reachable');
      return;
    }
    const port = await freePort();
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: backendDir,
      env: { ...process.env, PORT: String(port), NODE_ENV: 'development', EMAIL_TRANSPORT: 'memory' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const exited = once(child, 'exit');
    try {
      let out = '';
      const listening = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`server did not start:\n${out}`)), 20_000);
        child.stdout.on('data', (chunk) => {
          out += chunk;
          if (!out.includes(`API listening on http://localhost:${port}`)) return;
          clearTimeout(timer);
          resolve();
        });
      });
      await listening;

      assert.ok(out.indexOf('MongoDB connected:') !== -1, out);
      assert.ok(out.indexOf('MongoDB connected:') < out.indexOf('API listening'), 'connected before listening');
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200);
      assert.equal((await res.json()).database, 'connected');
    } finally {
      child.kill();
      await exited;
    }
  });
});
