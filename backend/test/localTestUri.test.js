import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import mongoose from 'mongoose';
import { assertLocalTestUri, localTestUriProblem } from './helpers/localTestUri.js';
import { connectTestDB } from './helpers/db.js';

// Tests may only use a local MongoDB and a *_test database. Nothing here connects anywhere: every
// remote host below is refused before a connection is tried.

const SECRET = 'not-a-real-password';
const REMOTE_URIS = [
  `mongodb+srv://user:${SECRET}@cluster0.example.mongodb.net/helpdesk_test`,
  `mongodb://user:${SECRET}@cluster0-shard-00-00.example.mongodb.net:27017/helpdesk_test`,
  'mongodb://db.example.com:27017/helpdesk_test',
  'mongodb://10.0.0.5:27017/helpdesk_test',
  'mongodb://192.168.1.20/helpdesk_test',
  'mongodb://8.8.8.8/helpdesk_test',
  'mongodb://0.0.0.0/helpdesk_test',
  // Made to look local.
  'mongodb://127.0.0.1.example.com/helpdesk_test',
  'mongodb://localhost.example.com/helpdesk_test',
  `mongodb://127.0.0.1:${SECRET}@db.example.com/helpdesk_test`,
  'mongodb://127.0.0.1,db.example.com/helpdesk_test',
  'mongodb://[::2]/helpdesk_test',
  'mongodb://127.0.0.1/helpdesk_test?proxyHost=db.example.com',
  'mongodb://127.0.0.1/helpdesk_test?PROXYHOST=db.example.com',
  'mongodb://127.0.0.1/helpdesk_test?proxy%48ost=db.example.com',
  'mongodb://127.0.0.1/helpdesk_test?%70roxyHost=db.example.com',
  'mongodb://127.0.0.1/helpdesk_test?%70%72%6F%78%79%48%6F%73%74=db.example.com',
  'mongodb://127.0.0.1/helpdesk_test?directConnection=true&proxy%48ost=db.example.com',
  // Not valid addresses: the driver would treat them as hostnames.
  'mongodb://127.999.999.999/helpdesk_test',
  'mongodb://127.0.0.256/helpdesk_test',
];
const NOT_TEST_DATABASES = [
  'mongodb://127.0.0.1:27017/helpdesk',
  'mongodb://127.0.0.1:27017/',
  'mongodb://127.0.0.1:27017/test',
  'mongodb://127.0.0.1:27017/x_test@db.example.com/y_test',
];
const NOT_URIS = [undefined, '', 'localhost', 'http://127.0.0.1/helpdesk_test', 'mongodb://127.0.0.1'];

describe('localTestUriProblem', () => {
  it('accepts a local MongoDB with a *_test database', () => {
    for (const uri of [
      'mongodb://127.0.0.1:27017/helpdesk_test',
      'mongodb://127.0.0.1/helpdesk_test',
      'mongodb://localhost:27017/helpdesk_test',
      'mongodb://LOCALHOST/helpdesk_test',
      'mongodb://[::1]:27017/helpdesk_test',
      'mongodb://127.0.0.2/x_test',
      'mongodb://127.255.255.254:27017/x_test',
      'mongodb://ci-user:pass@127.0.0.1:27017/helpdesk_test',
      'mongodb://127.0.0.1:27017/helpdesk_test?directConnection=true',
      'mongodb://localhost:27017,localhost:27018/helpdesk_test?replicaSet=rs0',
    ]) {
      assert.equal(localTestUriProblem(uri), null, uri);
    }
  });

  it('refuses Atlas, public hosts, other private addresses, and hosts made to look local', () => {
    for (const uri of REMOTE_URIS) assert.ok(localTestUriProblem(uri), uri);
  });

  it('refuses a local database whose name does not end in _test', () => {
    for (const uri of NOT_TEST_DATABASES) assert.ok(localTestUriProblem(uri), uri);
  });

  it('refuses anything that is not a mongodb:// URI', () => {
    for (const uri of NOT_URIS) assert.ok(localTestUriProblem(uri), String(uri));
  });

  it('never repeats credentials or hosts in its message', () => {
    for (const uri of REMOTE_URIS) {
      const problem = localTestUriProblem(uri);
      for (const text of [SECRET, 'user', 'example', '10.0.0.5', '8.8.8.8']) assert.ok(!problem.includes(text), problem);
    }
  });

  it('assertLocalTestUri throws the problem, and accepts a good URI', () => {
    assert.throws(() => assertLocalTestUri('mongodb://db.example.com/x_test'), /not on this machine/);
    assert.doesNotThrow(() => assertLocalTestUri('mongodb://127.0.0.1/x_test'));
  });
});

describe('connectTestDB refuses before connecting', () => {
  const original = process.env.MONGODB_URI;
  afterEach(() => {
    process.env.MONGODB_URI = original;
  });

  for (const [index, uri] of REMOTE_URIS.entries()) {
    it(`a remote host is never contacted (${index + 1})`, async (t) => {
      const connect = t.mock.method(mongoose, 'connect', async () => {});
      process.env.MONGODB_URI = uri;

      await assert.rejects(connectTestDB(), /Refusing to use/);
      assert.equal(connect.mock.callCount(), 0);
    });
  }

  it('without REQUIRE_TEST_DB the refusal is still an error, not a skip', async (t) => {
    t.mock.method(mongoose, 'connect', async () => {});
    const required = process.env.REQUIRE_TEST_DB;
    delete process.env.REQUIRE_TEST_DB;
    process.env.MONGODB_URI = REMOTE_URIS[0];
    try {
      await assert.rejects(connectTestDB(), /Refusing to use/);
    } finally {
      if (required !== undefined) process.env.REQUIRE_TEST_DB = required;
    }
  });
});

// The real preload, as `npm test` uses it. The process stops before any test could run.
describe('test/setup.js with MONGODB_URI_TEST', () => {
  const backendDir = new URL('..', import.meta.url);
  function runSetup(uri) {
    return spawnSync(process.execPath, ['--import', './test/setup.js', '--input-type=module', '-e', 'console.log(process.env.MONGODB_URI === process.env.MONGODB_URI_TEST ? "uses it" : "ignores it")'], {
      cwd: backendDir,
      env: { ...process.env, MONGODB_URI_TEST: uri },
      encoding: 'utf8',
      timeout: 30_000,
    });
  }

  it('cannot point the tests at a remote database, and prints no URI or credentials', () => {
    for (const uri of [REMOTE_URIS[0], REMOTE_URIS[3]]) {
      const result = runSetup(uri);
      assert.notEqual(result.status, 0);
      const output = result.stdout + result.stderr;
      assert.match(output, /Refusing to use/);
      assert.doesNotMatch(output, /uses it|ignores it/);
      for (const text of [SECRET, 'mongodb.net', '10.0.0.5']) assert.ok(!output.includes(text), output);
    }
  });

  it('accepts a local one', () => {
    const result = runSetup('mongodb://127.0.0.1:27017/another_test');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /uses it/);
  });
});
