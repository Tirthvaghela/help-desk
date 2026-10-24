import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
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
