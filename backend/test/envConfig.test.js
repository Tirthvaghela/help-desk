import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { databaseNameOf, describeConfig, readEnv } from '../src/config/envRules.js';

// QA ENV-1/ENV-2: the database name must be explicit (warned in development, refused in
// production), the startup log says which database and email transport are used (no secrets),
// and CORS_ORIGINS adds validated extra frontend origins while CLIENT_URL stays the email base.

const base = { JWT_SECRET: 'k'.repeat(48), CLIENT_URL: 'http://localhost:5173', EMAIL_TRANSPORT: 'disabled' };
const SECRET_PASSWORD = 's3cr3t-Pa55';

describe('databaseNameOf', () => {
  it('reads the database from plain, +srv, multi-host and credential URIs', () => {
    const cases = [
      ['mongodb://127.0.0.1:27017/helpdesk', 'helpdesk'],
      ['mongodb://127.0.0.1:27017/helpdesk?retryWrites=true', 'helpdesk'],
      [`mongodb+srv://user:${SECRET_PASSWORD}@cluster0.example.mongodb.net/helpdesk?retryWrites=true&w=majority`, 'helpdesk'],
      ['mongodb://a.example:27017,b.example:27018/team_db?replicaSet=rs0', 'team_db'],
      ['mongodb://us%2Fer:p%40ss%2Fword@host.example/my%20db', 'my db'],
      [`mongodb+srv://user:${SECRET_PASSWORD}@cluster0.example.mongodb.net/?retryWrites=true`, ''],
      ['mongodb+srv://user:pw@cluster0.example.mongodb.net', ''],
      ['mongodb://127.0.0.1:27017/', ''],
    ];
    for (const [uri, expected] of cases) assert.equal(databaseNameOf(uri), expected, uri.replace(SECRET_PASSWORD, '***'));
  });
});

describe('MONGODB_URI without a database name', () => {
  const noName = `mongodb+srv://user:${SECRET_PASSWORD}@cluster0.example.mongodb.net/?retryWrites=true`;

  it('development: a warning (not an error); the database is reported as MongoDB\'s default "test"', () => {
    const { env, errors, warnings } = readEnv({ ...base, NODE_ENV: 'development', MONGODB_URI: noName });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /names no database.*"test"/);
    assert.equal(env.mongodbDatabase, 'test');
    assert.equal(env.mongodbDatabaseExplicit, false);
    assert.ok(!warnings[0].includes(SECRET_PASSWORD) && !warnings[0].includes('cluster0'), 'no URI or secret in the message');
  });

  it('production: refused', () => {
    const { errors } = readEnv({ ...base, NODE_ENV: 'production', MONGODB_URI: noName });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /names no database/);
    assert.ok(!errors[0].includes(SECRET_PASSWORD));
  });

  it('an explicit name (even "test") gives no warning', () => {
    for (const uri of ['mongodb://127.0.0.1:27017/helpdesk', `mongodb+srv://u:${SECRET_PASSWORD}@c.example.net/test?w=majority`]) {
      const { env, errors, warnings } = readEnv({ ...base, NODE_ENV: 'production', MONGODB_URI: uri });
      assert.deepEqual([errors, warnings], [[], []], uri.replace(SECRET_PASSWORD, '***'));
      assert.equal(env.mongodbDatabaseExplicit, true);
    }
  });

  it('the real server refuses to start in production without a database name (no secret printed)', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js')"], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, ...base, NODE_ENV: 'production', MONGODB_URI: noName },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /names no database/);
    assert.ok(!result.stderr.includes(SECRET_PASSWORD));
  });
});

describe('startup summary (describeConfig)', () => {
  it('names the database and email transport without the URI, credentials or SMTP password', () => {
    const { env } = readEnv({
      ...base,
      NODE_ENV: 'development',
      MONGODB_URI: `mongodb+srv://user:${SECRET_PASSWORD}@cluster0.example.mongodb.net/helpdesk`,
      EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PASS: SECRET_PASSWORD,
      EMAIL_FROM: 'Help Desk <hd@example.com>',
    });
    const text = describeConfig(env).join('\n');
    assert.match(text, /Database: "helpdesk"/);
    assert.match(text, /Email: smtp via smtp\.example\.com:587 — real emails will be sent/);
    assert.match(text, /CORS origins: http:\/\/localhost:5173/);
    for (const secret of [SECRET_PASSWORD, 'mongodb', 'cluster0', 'user:']) assert.ok(!text.includes(secret), `leaks ${secret}`);
  });

  it('outbox, memory and disabled transports, and the default-database note', () => {
    const line = (extra) => describeConfig(readEnv({ ...base, MONGODB_URI: 'mongodb://h/' , NODE_ENV: 'development', ...extra }).env).join('\n');
    assert.match(line({ EMAIL_TRANSPORT: 'outbox' }), /Email: outbox → backend\/\.outbox \(nothing is sent\)/);
    assert.match(line({ EMAIL_TRANSPORT: 'memory' }), /Email: memory/);
    assert.match(line({ EMAIL_TRANSPORT: 'disabled' }), /Email: disabled/);
    assert.match(line({}), /Database: "test" \(MongoDB default; MONGODB_URI names no database\)/);
  });
});

describe('CORS_ORIGINS', () => {
  const read = (CORS_ORIGINS, extra = {}) => readEnv({ ...base, MONGODB_URI: 'mongodb://127.0.0.1/helpdesk', CORS_ORIGINS, ...extra });

  it('defaults to CLIENT_URL\'s origin only', () => {
    assert.deepEqual(read(undefined).env.corsOrigins, ['http://localhost:5173']);
    assert.deepEqual(read('').env.corsOrigins, ['http://localhost:5173']);
    assert.deepEqual(read(undefined, { CLIENT_URL: 'http://localhost:5173/' }).env.corsOrigins, ['http://localhost:5173']);
  });

  it('adds trimmed, normalised, de-duplicated origins; CLIENT_URL stays the email base', () => {
    const { env, errors } = read(' http://localhost:5174 , http://127.0.0.1:5173/, http://localhost:5173, https://helpdesk.example.com ');
    assert.deepEqual(errors, []);
    assert.deepEqual(env.corsOrigins, ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'https://helpdesk.example.com']);
    assert.equal(env.clientUrl, 'http://localhost:5173');
  });

  it('rejects wildcards, paths, queries, credentials, other schemes and junk', () => {
    for (const value of ['*', 'localhost:5174', 'http://localhost:5174/app', 'http://localhost:5174?x=1', 'http://u:p@localhost:5174', 'ftp://files.example', 'not a url']) {
      const { errors } = read(value);
      assert.equal(errors.length, 1, `${value} → ${JSON.stringify(errors)}`);
      assert.match(errors[0], /CORS_ORIGINS/);
    }
  });
});

describe('CORS behaviour with CORS_ORIGINS (real app, child process)', () => {
  function corsCheck(extraEnv) {
    const script = [
      "const { default: request } = await import('supertest');",
      "const { default: app } = await import('./src/app.js');",
      'const out = {};',
      "for (const origin of ['http://localhost:5173', 'http://localhost:5174', 'https://evil.example']) {",
      "  const pre = await request(app).options('/api/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');",
      "  const get = await request(app).get('/api/health').set('Origin', origin);",
      "  out[origin] = { preflight: pre.status, preflightAllow: pre.headers['access-control-allow-origin'] ?? null, get: get.headers['access-control-allow-origin'] ?? null, vary: get.headers.vary ?? null };",
      '}',
      "out.noOrigin = (await request(app).get('/api/health')).headers['access-control-allow-origin'] ?? null;",
      'console.log(JSON.stringify(out));',
      'process.exit(0);',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/helpdesk_test', CLIENT_URL: 'http://localhost:5173', JWT_SECRET: 'x', EMAIL_TRANSPORT: 'memory', ...extraEnv },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim().split('\n').pop());
  }

  it('with CORS_ORIGINS: listed origins are echoed (preflight + request); others get none', () => {
    const out = corsCheck({ CORS_ORIGINS: 'http://localhost:5174' });
    assert.deepEqual(out['http://localhost:5173'], { preflight: 204, preflightAllow: 'http://localhost:5173', get: 'http://localhost:5173', vary: 'Origin' });
    assert.deepEqual(out['http://localhost:5174'], { preflight: 204, preflightAllow: 'http://localhost:5174', get: 'http://localhost:5174', vary: 'Origin' });
    assert.equal(out['https://evil.example'].preflightAllow, null);
    assert.equal(out['https://evil.example'].get, null);
    assert.equal(out.noOrigin, null);
  });

  it('without CORS_ORIGINS: unchanged single-origin behaviour', () => {
    const out = corsCheck({ CORS_ORIGINS: '' });
    for (const origin of ['http://localhost:5173', 'http://localhost:5174', 'https://evil.example']) {
      assert.equal(out[origin].get, 'http://localhost:5173', origin);
      assert.equal(out[origin].preflightAllow, 'http://localhost:5173', origin);
    }
    assert.equal(out.noOrigin, 'http://localhost:5173');
  });
});
