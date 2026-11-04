import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiUrlFor, LOCAL_API_URL, normalizeApiUrl, requireProductionApiUrl } from '../src/api/apiUrl.js';
import { apiRequest } from '../src/api/client.js';

// VITE_API_URL handling (src/api/apiUrl.js), used by the app and by vite.config.js.

describe('normalizeApiUrl', () => {
  it('keeps a URL without a trailing slash as it is', () => {
    assert.equal(normalizeApiUrl('https://api.example.com'), 'https://api.example.com');
    assert.equal(normalizeApiUrl('http://localhost:4000'), 'http://localhost:4000');
  });

  it('removes one or several trailing slashes, and surrounding spaces', () => {
    for (const value of ['https://api.example.com/', 'https://api.example.com//', 'https://api.example.com///', ' https://api.example.com/ ']) {
      assert.equal(normalizeApiUrl(value), 'https://api.example.com', JSON.stringify(value));
    }
    assert.equal(normalizeApiUrl('https://example.com/backend/'), 'https://example.com/backend');
  });

  it('gives "" for a missing or blank value', () => {
    for (const value of [undefined, null, '', '   ', '/']) assert.equal(normalizeApiUrl(value), '', JSON.stringify(value));
  });
});

describe('apiUrlFor', () => {
  it('joins base and path with exactly one slash', () => {
    for (const path of ['/api/tickets', 'api/tickets', '//api/tickets']) {
      assert.equal(apiUrlFor('https://api.example.com', path), 'https://api.example.com/api/tickets', path);
    }
    assert.equal(apiUrlFor(normalizeApiUrl('https://api.example.com//'), '/api/health'), 'https://api.example.com/api/health');
    assert.equal(apiUrlFor('https://example.com/backend', '/api/x?a=1'), 'https://example.com/backend/api/x?a=1');
  });
});

describe('requireProductionApiUrl (production builds)', () => {
  it('a missing value stops the build with a message saying what to set', () => {
    assert.throws(() => requireProductionApiUrl(undefined), /VITE_API_URL must be set for a production build/);
  });

  it('an empty or blank value stops the build too', () => {
    for (const value of ['', '   ', '/']) {
      assert.throws(() => requireProductionApiUrl(value), /VITE_API_URL must be set for a production build/, JSON.stringify(value));
    }
  });

  it('accepts an http(s) URL and returns it without trailing slashes', () => {
    assert.equal(requireProductionApiUrl('https://api.example.com/'), 'https://api.example.com');
    assert.equal(requireProductionApiUrl('http://localhost:4000'), 'http://localhost:4000', 'a local production build may still use localhost');
  });

  it('refuses non-URLs, other schemes, queries, fragments and credentials', () => {
    for (const value of ['api.example.com', 'localhost:4000', 'ftp://api.example.com', 'https://api.example.com/?x=1', 'https://api.example.com/#x', 'https://user:pass@api.example.com']) {
      assert.throws(() => requireProductionApiUrl(value), /VITE_API_URL must be an http\(s\) URL/, value);
    }
  });
});

describe('apiRequest endpoint (no VITE_API_URL outside Vite: local fallback)', () => {
  const realFetch = globalThis.fetch;
  let urls;
  beforeEach(() => {
    urls = [];
    globalThis.fetch = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('uses the local API and never produces a double slash', async () => {
    assert.equal(LOCAL_API_URL, 'http://localhost:4000');
    await apiRequest('/api/health');
    await apiRequest('/api/tickets?status=open');
    assert.deepEqual(urls, ['http://localhost:4000/api/health', 'http://localhost:4000/api/tickets?status=open']);
  });
});
