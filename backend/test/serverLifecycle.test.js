import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import app from '../src/app.js';
import { startServer, SHUTDOWN_TIMEOUT_MS } from '../src/startServer.js';

// Startup errors and graceful shutdown (src/startServer.js). Everything runs in this process on
// spare ports (port 0), with fake signals, database and exit: no real signal is sent and no
// running server is touched. No database is needed.

const started = [];

// Starts the server with recorded side effects. Resolves once it is listening or has failed.
async function start(target, options = {}) {
  const calls = { exit: [], log: [], error: [], disconnect: 0 };
  const signals = new EventEmitter();
  let settle;
  const settled = new Promise((resolve) => { settle = resolve; });
  const handle = startServer(target, {
    port: 0,
    signals,
    disconnect: async () => { calls.disconnect += 1; },
    exit: (code) => { calls.exit.push(code); settle(); },
    log: (line) => { calls.log.push(line); if (line.startsWith('API listening')) settle(); },
    logError: (line) => { calls.error.push(line); },
    ...options,
  });
  started.push(handle.server);
  await settled;
  return { ...handle, calls, signals, port: handle.server.address()?.port };
}

afterEach(() => {
  for (const server of started.splice(0)) {
    server.closeAllConnections();
    if (server.listening) server.close();
  }
});

// GET over a fresh connection; resolves with { status, body }.
function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ port, path, agent: false }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

// An app whose /slow route answers only when `release()` is called.
function slowApp() {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let arrived;
  const inFlight = new Promise((resolve) => { arrived = resolve; });
  const slow = express();
  slow.get('/slow', async (req, res) => {
    arrived();
    await gate;
    res.json({ done: true });
  });
  slow.get('/fast', (req, res) => res.json({ ok: true }));
  return { slow, release: () => release(), inFlight };
}

describe('startServer: startup', () => {
  it('starts as before: logs the listening address and serves the real app', async () => {
    const { calls, port } = await start(app);
    assert.deepEqual(calls.log, [`API listening on http://localhost:${port}`]);
    assert.deepEqual(calls.exit, []);
    const res = await get(port, '/api/health');
    assert.ok([200, 503].includes(res.status), 'the real health route answers (no database needed)');
    assert.match(JSON.parse(res.body).status, /^(ok|degraded)$/);
  });

  it('an occupied port gives a clear error and exit status 1, never "listening"', async () => {
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(0, resolve));
    const busyPort = blocker.address().port;
    try {
      const { calls } = await start(app, { port: busyPort });
      assert.deepEqual(calls.exit, [1]);
      assert.equal(calls.error.length, 1);
      assert.match(calls.error[0], new RegExp(`port ${busyPort} is already in use`));
      assert.ok(!calls.log.some((line) => line.startsWith('API listening')), 'no false "listening" line');
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it('the startup error message never includes secrets or stack traces', async () => {
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(0, resolve));
    try {
      const { calls } = await start(app, { port: blocker.address().port });
      assert.doesNotMatch(calls.error[0], /mongodb|JWT|secret|\n\s+at /i);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});

describe('startServer: graceful shutdown', () => {
  it('SIGTERM lets a request in progress finish, then closes the server and exits 0', async () => {
    const { slow, release, inFlight } = slowApp();
    const { server, signals, calls, port } = await start(slow);

    const pending = get(port, '/slow');
    await inFlight;
    signals.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(server.listening, false, 'no new connections accepted');
    await assert.rejects(get(port, '/fast'), 'new requests are refused while shutting down');
    assert.deepEqual(calls.exit, [], 'waits for the request in progress');

    release();
    const res = await pending;
    assert.deepEqual([res.status, JSON.parse(res.body)], [200, { done: true }], 'the in-flight request completed');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(calls.exit, [0]);
    assert.equal(calls.disconnect, 1);
    assert.ok(calls.log.some((line) => line.startsWith('SIGTERM received')));
    assert.ok(calls.log.includes('API stopped.'));
  });

  it('idle keep-alive connections do not hold the shutdown open', async () => {
    const { slow } = slowApp();
    const { signals, calls, port } = await start(slow);
    const agent = new http.Agent({ keepAlive: true });
    await new Promise((resolve, reject) => {
      http.get({ port, path: '/fast', agent }, (res) => { res.resume(); res.on('end', resolve); }).on('error', reject);
    });
    const shutdown = Date.now();
    signals.emit('SIGINT', 'SIGINT');
    while (calls.exit.length === 0 && Date.now() - shutdown < 2000) await new Promise((resolve) => setTimeout(resolve, 10));
    agent.destroy();
    assert.deepEqual(calls.exit, [0]);
    assert.ok(Date.now() - shutdown < 1000, 'closed promptly, not after a keep-alive timeout');
  });

  it('repeated or mixed signals shut down once: one disconnect, one exit', async () => {
    const { shutdown, signals, calls } = await start(express());
    signals.emit('SIGTERM', 'SIGTERM');
    signals.emit('SIGTERM', 'SIGTERM');
    signals.emit('SIGINT', 'SIGINT');
    await shutdown('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls.disconnect, 1);
    assert.deepEqual(calls.exit, [0]);
    assert.equal(calls.log.filter((line) => line.includes('received')).length, 1);
    assert.equal(signals.listenerCount('SIGTERM') + signals.listenerCount('SIGINT'), 0, 'signal listeners removed');
  });

  it('a request that never finishes hits the timeout: logged, connections closed, exit 1', async () => {
    const { slow, inFlight } = slowApp();
    const { signals, calls, port } = await start(slow, { shutdownTimeoutMs: 100 });
    const pending = get(port, '/slow').catch((err) => err);
    await inFlight;
    signals.emit('SIGTERM', 'SIGTERM');
    const outcome = await pending;
    assert.ok(outcome instanceof Error, 'the stuck connection is closed by the timeout');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(calls.exit, [1], 'exactly one exit, with status 1');
    assert.match(calls.error[0], /did not finish within 0\.1 s/);
    assert.equal(calls.disconnect, 0, 'nothing runs after the timeout decided the exit');
    assert.ok(!calls.log.includes('API stopped.'));
  });

  it('a failing database disconnect is reported and exits 1', async () => {
    const { signals, calls } = await start(express(), {
      disconnect: async () => { throw new Error('disconnect failed'); },
    });
    signals.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(calls.exit, [1]);
    assert.match(calls.error[0], /Shutdown failed: disconnect failed/);
  });

  it('pending background work (e.g. emails) is drained after the server closes and before the database disconnects', async () => {
    const order = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { server, signals, calls } = await start(express(), {
      drain: async () => { order.push(`drain (listening: ${server.listening})`); await gate; order.push('drained'); },
      disconnect: async () => { order.push('disconnect'); calls.disconnect += 1; },
    });
    signals.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(order, ['drain (listening: false)'], 'waits for the drain');
    assert.deepEqual(calls.exit, []);
    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(order, ['drain (listening: false)', 'drained', 'disconnect']);
    assert.deepEqual(calls.exit, [0]);
  });

  it('a drain that never finishes is cut off by the shutdown limit (exit 1, no disconnect)', async () => {
    const { signals, calls } = await start(express(), {
      shutdownTimeoutMs: 80,
      drain: () => new Promise(() => {}),
    });
    signals.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(calls.exit, [1]);
    assert.equal(calls.disconnect, 0);
    assert.match(calls.error[0], /did not finish within 0\.08 s/);
  });

  it('the default timeout is 10 seconds', () => {
    assert.equal(SHUTDOWN_TIMEOUT_MS, 10_000);
  });
});

// The real entry point (src/server.js) in a child process, with this process's test settings
// (test/setup.js: local helpdesk_test, test secret, in-memory email) and a spare port.
describe('server.js in a separate process', () => {
  const backendDir = fileURLToPath(new URL('..', import.meta.url));

  function reachable() {
    return new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: 27017 }, () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
      socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
    });
  }
  async function requireDB(t) {
    assert.match(process.env.MONGODB_URI, /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[^/?]+_test$/, 'local *_test database only');
    if (await reachable()) return true;
    if (process.env.REQUIRE_TEST_DB === '1') assert.fail('REQUIRE_TEST_DB=1 but MongoDB is not reachable');
    t.skip('MongoDB is not reachable');
    return false;
  }

  // Runs `node src/server.js`; `onOutput(text, child)` sees stdout as it arrives.
  function runServer(port, onOutput = () => {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['src/server.js'], {
        cwd: backendDir,
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error(`server did not exit:\n${out}\n${err}`)); }, 20000);
      child.stdout.on('data', (chunk) => { out += chunk; onOutput(out, child); });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    });
  }

  it('an occupied port: clear message on stderr, exit status 1, no "listening" line', async (t) => {
    if (!(await requireDB(t))) return;
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(0, resolve));
    const busyPort = blocker.address().port;
    try {
      const { code, out, err } = await runServer(busyPort);
      assert.equal(code, 1, `${out}\n${err}`);
      assert.match(err, new RegExp(`port ${busyPort} is already in use`));
      assert.doesNotMatch(out, /API listening/);
      assert.match(out, /Database: "helpdesk_test"/, 'the startup summary still prints first');
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  // Windows cannot deliver SIGTERM to another process (Node terminates it instead), so this runs
  // where the API is deployed and in CI (Linux).
  it('a real SIGTERM: serves, then stops cleanly with exit status 0', { skip: process.platform === 'win32' && 'SIGTERM cannot be delivered on Windows' }, async (t) => {
    if (!(await requireDB(t))) return;
    let signalled = false;
    const { code, out, err } = await runServer(0, (text, child) => {
      const match = text.match(/API listening on http:\/\/localhost:(\d+)/);
      if (match && !signalled) {
        signalled = true;
        get(Number(match[1]), '/api/health').then(
          (res) => { assert.equal(res.status, 200); child.kill('SIGTERM'); },
          () => child.kill('SIGTERM'),
        );
      }
    });
    assert.equal(code, 0, `${out}\n${err}`);
    assert.match(out, /SIGTERM received/);
    assert.match(out, /API stopped\./);
  });
});
