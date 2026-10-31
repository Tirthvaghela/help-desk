import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib, { deflateSync, gzipSync } from 'node:zlib';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import realApp from '../src/app.js';
import { ApiError } from '../src/utils/ApiError.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';

// Builds a throwaway app with one route, wired to the real error middleware.
function appWithRoute(handler, { jsonLimit } = {}) {
  const app = express();
  app.use(express.json(jsonLimit ? { limit: jsonLimit } : undefined));
  app.all('/test', handler);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('ApiError helpers', () => {
  const cases = [
    ['badRequest', 400, 'VALIDATION_ERROR'],
    ['unauthorized', 401, 'UNAUTHORIZED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['notFound', 404, 'NOT_FOUND'],
    ['conflict', 409, 'CONFLICT'],
  ];

  for (const [helper, status, code] of cases) {
    it(`${helper}() creates a ${status} ${code} error with a default message`, () => {
      const err = ApiError[helper]();
      assert.ok(err instanceof ApiError);
      assert.ok(err instanceof Error);
      assert.equal(err.status, status);
      assert.equal(err.code, code);
      assert.ok(err.message.length > 0);
    });
  }

  it('accepts a custom message and code', () => {
    const err = ApiError.conflict('Email is already registered', 'EMAIL_TAKEN');
    assert.equal(err.status, 409);
    assert.equal(err.code, 'EMAIL_TAKEN');
    assert.equal(err.message, 'Email is already registered');
  });
});

describe('errorHandler middleware', () => {
  it('sends a thrown ApiError in the standard envelope', async () => {
    const app = appWithRoute(() => {
      throw ApiError.forbidden('Not your ticket');
    });
    const res = await request(app).get('/test');

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: { code: 'FORBIDDEN', message: 'Not your ticket' } });
  });

  it('handles errors rejected from async handlers', async () => {
    const app = appWithRoute(async () => {
      throw ApiError.unauthorized();
    });
    const res = await request(app).get('/test');

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns 500 without leaking internal details', async (t) => {
    t.mock.method(console, 'error', () => {});
    const app = appWithRoute(() => {
      throw new Error('database password is hunter2');
    });
    const res = await request(app).get('/test');

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
    assert.ok(!JSON.stringify(res.body).includes('hunter2'));
    assert.equal(console.error.mock.callCount(), 1);
  });

  it('returns 400 INVALID_JSON for malformed JSON bodies', async () => {
    const app = appWithRoute((req, res) => res.json({ ok: true }));
    const res = await request(app)
      .post('/test')
      .set('Content-Type', 'application/json')
      .send('{bad json');

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  it('returns 413 PAYLOAD_TOO_LARGE for oversized bodies', async () => {
    const app = appWithRoute((req, res) => res.json({ ok: true }), { jsonLimit: '10b' });
    const res = await request(app).post('/test').send({ message: 'this is longer than ten bytes' });

    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  });

  it('maps Mongoose validation errors to 400 VALIDATION_ERROR', async () => {
    const schema = new mongoose.Schema({ subject: { type: String, required: [true, 'Subject is required'] } });
    const Model = mongoose.model('ErrorTestTicket', schema);
    const app = appWithRoute(async () => {
      await new Model({}).validate();
    });
    const res = await request(app).get('/test');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: { code: 'VALIDATION_ERROR', message: 'Subject is required' } });
  });

  it('maps invalid ObjectIds to 400 INVALID_ID', async () => {
    const app = appWithRoute(() => {
      throw new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
    });
    const res = await request(app).get('/test');

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: { code: 'INVALID_ID', message: 'Invalid _id' } });
  });

  it('maps MongoDB duplicate key errors to 409 DUPLICATE', async () => {
    const app = appWithRoute(() => {
      throw Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
        keyValue: { email: 'a@example.com' },
      });
    });
    const res = await request(app).get('/test');

    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { error: { code: 'DUPLICATE', message: 'email already exists' } });
  });

  it('returns 404 NOT_FOUND for unmatched routes', async () => {
    const app = appWithRoute((req, res) => res.json({ ok: true }));
    const res = await request(app).get('/missing');

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});

describe('malformed requests', () => {
  const echo = (req, res) => res.json({ ok: true, body: req.body });
  const app = appWithRoute(echo);
  const paramApp = express().get('/item/:id', echo).use(errorHandler);
  const post = (headers, body, { target = app, path = '/test' } = {}) => {
    const pending = request(target).post(path).set('Content-Type', 'application/json');
    for (const [name, value] of Object.entries(headers)) pending.set(name, value);
    // Sent as given: by default a Buffer would be JSON-encoded, and never arrive as gzip.
    return pending.serialize((data) => data).send(body);
  };

  // No stack, parser wording, or anything from the request in the answer.
  function assertSafe(res, status, code, ...secrets) {
    assert.equal(res.status, status);
    assert.equal(res.body.error.code, code);
    assert.deepEqual(Object.keys(res.body), ['error']);
    assert.deepEqual(Object.keys(res.body.error), ['code', 'message']);
    const text = JSON.stringify(res.body);
    assert.doesNotMatch(text, /\bat .*:\d+:\d+|stack|node_modules|header check|Failed to decode|Missing dictionary|frame descriptor|Data corruption|checksum|too much memory|end of file/i);
    for (const secret of secrets) assert.ok(!text.includes(secret), `the answer repeats ${secret}`);
  }

  it('malformed JSON is 400 INVALID_JSON and does not repeat the body', async () => {
    assertSafe(await post({}, '{"password":"hunter2"'), 400, 'INVALID_JSON', 'hunter2');
  });

  for (const charset of ['koi8-r', 'not-a-charset']) {
    it(`charset ${charset} is 415 UNSUPPORTED_CHARSET`, async () => {
      assertSafe(await post({ 'Content-Type': `application/json; charset=${charset}` }, '{}'), 415, 'UNSUPPORTED_CHARSET', charset, charset.toUpperCase());
    });
  }

  // Passes the parser's first check, which only looks for "utf-", and fails later in the decoder.
  it('charset utf-99 is 415 UNSUPPORTED_CHARSET', async () => {
    assertSafe(await post({ 'Content-Type': 'application/json; charset=utf-99' }, '{}'), 415, 'UNSUPPORTED_CHARSET', 'utf-99', 'UTF-99');
  });

  it('an unsupported Content-Encoding is 415 UNSUPPORTED_ENCODING', async () => {
    assertSafe(await post({ 'Content-Encoding': 'bogus-coding' }, '{}'), 415, 'UNSUPPORTED_ENCODING', 'bogus-coding');
  });

  for (const encoding of ['gzip', 'deflate', 'br']) {
    it(`a ${encoding} body that is not ${encoding} is 400 INVALID_BODY_ENCODING`, async () => {
      assertSafe(await post({ 'Content-Encoding': encoding }, 'not compressed at all'), 400, 'INVALID_BODY_ENCODING');
    });
  }

  it('a truncated gzip body is 400 INVALID_BODY_ENCODING', async () => {
    const truncated = gzipSync('{"a":1}').subarray(0, 8);
    assertSafe(await post({ 'Content-Encoding': 'gzip' }, truncated), 400, 'INVALID_BODY_ENCODING');
  });

  it('a deflate body that needs a preset dictionary is 400 INVALID_BODY_ENCODING', async () => {
    const body = deflateSync('{"a":1}', { dictionary: Buffer.from('a preset dictionary') });
    assertSafe(await post({ 'Content-Encoding': 'deflate' }, body), 400, 'INVALID_BODY_ENCODING');
  });

  it('gzip that expands past the real 100 kB limit is 413 PAYLOAD_TOO_LARGE', async () => {
    const body = gzipSync(`{"a":"${'x'.repeat(200 * 1024)}"}`);
    assert.ok(body.length < 100 * 1024, 'small enough to arrive under the limit');
    const res = await post({ 'Content-Encoding': 'gzip' }, body, { target: realApp, path: '/api/auth/login' });
    assertSafe(res, 413, 'PAYLOAD_TOO_LARGE');
  });

  // Every listed code gives the same answer, so a code this runtime cannot produce is still checked.
  const decompressionCodes = [
    'Z_DATA_ERROR',
    'Z_BUF_ERROR',
    'Z_NEED_DICT',
    'ERR__ERROR_FORMAT_PADDING_2',
    'ZSTD_error_prefix_unknown',
    'ZSTD_error_version_unsupported',
    'ZSTD_error_frameParameter_unsupported',
    'ZSTD_error_frameParameter_windowTooLarge',
    'ZSTD_error_corruption_detected',
    'ZSTD_error_checksum_wrong',
    'ZSTD_error_dictionary_wrong',
    'ZSTD_error_literals_headerWrong',
  ];
  for (const code of decompressionCodes) {
    it(`parser code ${code} is 400 INVALID_BODY_ENCODING`, async () => {
      const res = await request(appWithRoute(() => {
        throw Object.assign(new Error('secret internal detail'), { status: 400, code });
      })).get('/test');
      assertSafe(res, 400, 'INVALID_BODY_ENCODING', 'secret internal detail');
    });
  }

  // body-parser decompresses zstd only where Node can: 22.15, 23.8 and later. Elsewhere it refuses
  // the encoding, so each runtime is held to the answer it should give, and the corrupt bodies below
  // really reach the decoder wherever it exists.
  const zstdAvailable = 'createZstdDecompress' in zlib;
  const [major, minor] = process.versions.node.split('.').map(Number);
  const zstdExpected = major >= 24 || (major === 23 && minor >= 8) || (major === 22 && minor >= 15);

  it(`Node ${process.versions.node} ${zstdExpected ? 'has' : 'does not have'} zstd decompression`, () => {
    assert.equal(zstdAvailable, zstdExpected);
  });

  if (zstdAvailable) {
    const zstdFrame = (...bytes) => Buffer.from([0x28, 0xb5, 0x2f, 0xfd, ...bytes]);
    const valid = () => zlib.zstdCompressSync('{"a":3}', { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } });
    const wrongChecksum = () => {
      const body = Buffer.from(valid());
      body[body.length - 1] ^= 0xff;
      return body;
    };
    const corruptBodies = [
      ['text that is not zstd', () => Buffer.from('not compressed at all')],
      ['a reserved frame bit set', () => zstdFrame(0x08, 0x00, 0x01, 0x00, 0x00)],
      ['a window too large to decode', () => zstdFrame(0x00, 0xff, 0x01, 0x00, 0x00)],
      ['a corrupt block', () => zstdFrame(0x20, 0x00, 0x07, 0x00, 0x00)],
      ['a dictionary this server does not have', () => zstdFrame(0x01, 0x00, 0x07, 0x01, 0x00, 0x00)],
      ['a wrong checksum', wrongChecksum],
      ['the end cut off', () => valid().subarray(0, 6)],
    ];

    for (const [name, body] of corruptBodies) {
      it(`a zstd body with ${name} is 400 INVALID_BODY_ENCODING`, async () => {
        assertSafe(await post({ 'Content-Encoding': 'zstd' }, body()), 400, 'INVALID_BODY_ENCODING');
      });
    }

    it('still accepts a valid zstd body', async () => {
      const res = await post({ 'Content-Encoding': 'zstd' }, valid());
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.body, { a: 3 });
    });
  } else {
    it(`zstd cannot be decompressed on Node ${process.versions.node}, so it is 415 UNSUPPORTED_ENCODING`, async () => {
      assertSafe(await post({ 'Content-Encoding': 'zstd' }, 'not compressed at all'), 415, 'UNSUPPORTED_ENCODING', 'zstd');
    });
  }

  it('bad URL encoding in a route parameter is 400 INVALID_URL', async () => {
    assertSafe(await request(paramApp).get('/item/%E0%A4%A'), 400, 'INVALID_URL', '%E0%A4%A');
  });

  it('still accepts valid bodies: UTF-8 and gzip', async () => {
    const utf8 = await post({ 'Content-Type': 'application/json; charset=utf-8' }, '{"a":1}');
    assert.equal(utf8.status, 200);
    assert.deepEqual(utf8.body.body, { a: 1 });

    const gzip = await post({ 'Content-Encoding': 'gzip' }, gzipSync('{"a":2}'));
    assert.equal(gzip.status, 200);
    assert.deepEqual(gzip.body.body, { a: 2 });
  });

  it('applies to the real app, which still sets its security headers', async () => {
    const res = await request(realApp).post('/api/auth/login').set('Content-Type', 'application/json; charset=koi8-r').send('{}');
    assertSafe(res, 415, 'UNSUPPORTED_CHARSET', 'koi8-r');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
  });

  it('bad URL encoding on a real ticket route is 400 INVALID_URL', async () => {
    assertSafe(await request(realApp).get('/api/tickets/%E0%A4%A'), 400, 'INVALID_URL', '%E0%A4%A');
  });
});

describe('errors that only look like parser errors stay 500', () => {
  const lookalikes = [
    ['an application SyntaxError', () => new SyntaxError('secret internal detail')],
    ['JSON.parse failing in application code', () => { try { JSON.parse('{secret internal detail'); } catch (err) { return err; } }],
    ['a SyntaxError with status 400 but no parser type', () => Object.assign(new SyntaxError('secret internal detail'), { status: 400 })],
    ['an application URIError', () => { try { decodeURIComponent('%E0%A4%A'); } catch (err) { return Object.assign(err, { message: 'secret internal detail' }); } }],
    ['a zlib error from application code', () => Object.assign(new Error('secret internal detail'), { code: 'Z_DATA_ERROR' })],
    ['a zstd error from application code', () => Object.assign(new Error('secret internal detail'), { code: 'ZSTD_error_prefix_unknown' })],
    ['zlib out of memory', () => Object.assign(new Error('secret internal detail'), { status: 400, code: 'Z_MEM_ERROR' })],
    ['Brotli out of memory', () => Object.assign(new Error('secret internal detail'), { status: 400, code: 'ERR__ERROR_ALLOC_CONTEXT_MODES' })],
    ['zstd out of memory', () => Object.assign(new Error('secret internal detail'), { status: 400, code: 'ZSTD_error_memory_allocation' })],
    ['a code that only begins like a listed one', () => Object.assign(new Error('secret internal detail'), { status: 400, code: 'Z_DATA_ERROR_OTHER' })],
    ['status 400 alone', () => Object.assign(new Error('secret internal detail'), { status: 400 })],
    ['a status 400 parser error that is not mapped', () => Object.assign(new Error('secret internal detail'), { status: 400, type: 'request.aborted' })],
  ];

  for (const [name, create] of lookalikes) {
    it(name, async (t) => {
      t.mock.method(console, 'error', () => {});
      const res = await request(appWithRoute(() => { throw create(); })).get('/test');

      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
      assert.equal(console.error.mock.callCount(), 1, 'logged on the server');
    });
  }

  it('a thrown rate-limit ApiError keeps its status and message', async () => {
    const res = await request(appWithRoute(() => {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts');
    })).get('/test');

    assert.equal(res.status, 429);
    assert.deepEqual(res.body, { error: { code: 'RATE_LIMITED', message: 'Too many attempts' } });
  });
});
