import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contentSecurityPolicy, cspMetaTag } from '../contentSecurityPolicy.js';

// frontend/vercel.json (SPA rewrite, headers) and the build-time Content Security Policy.

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

// Vercel matches `source` with path-to-regexp; for the plain patterns used here that is the same as
// an anchored regular expression. Static files are served before rewrites are considered.
const matches = (source, path) => new RegExp(`^${source}$`).test(path);

describe('vercel.json: SPA rewrite', () => {
  const [rewrite] = config.rewrites;

  it('has one rewrite, to /index.html', () => {
    assert.equal(config.rewrites.length, 1);
    assert.equal(rewrite.destination, '/index.html');
  });

  it('application routes, including nested ones and query strings, load the app', () => {
    for (const path of ['/', '/login', '/tickets', '/tickets/new', '/tickets/665f1c2ab3c4d5e6f7a8b9c0', '/agent/dashboard', '/admin/dashboard', '/staff/login', '/reset-password', '/verify-email', '/no/such/page']) {
      assert.ok(matches(rewrite.source, path), path);
    }
  });

  it('built assets are never rewritten, so a missing file is a 404, not the app\'s HTML', () => {
    for (const path of ['/assets/index-abc123.js', '/assets/index-abc123.css', '/assets/missing.js']) {
      assert.ok(!matches(rewrite.source, path), path);
    }
  });

  it('does not route anything to the API (it is a separate Vercel project)', () => {
    assert.ok(config.rewrites.every((rule) => !/^https?:/.test(rule.destination)));
  });
});

describe('vercel.json: security headers', () => {
  const rule = config.headers.find((entry) => entry.source === '/(.*)');
  const header = (key) => rule.headers.find((entry) => entry.key === key)?.value;

  it('apply to every path', () => {
    assert.ok(rule);
    assert.ok(matches(rule.source, '/tickets') && matches(rule.source, '/assets/x.js') && matches(rule.source, '/'));
  });

  it('nosniff, no framing, no referrer, and no camera, microphone or location', () => {
    assert.equal(header('X-Content-Type-Options'), 'nosniff');
    assert.equal(header('X-Frame-Options'), 'DENY');
    assert.equal(header('Referrer-Policy'), 'no-referrer', 'reset links carry a token in the URL');
    assert.equal(header('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');
  });

  it('the header CSP covers only what a <meta> policy cannot, and never relaxes it', () => {
    const csp = header('Content-Security-Policy');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.doesNotMatch(csp, /connect-src|script-src|unsafe|\*/);
  });
});

describe('build-time Content Security Policy', () => {
  const policy = contentSecurityPolicy('https://api.example.com/');
  const directives = Object.fromEntries(policy.split('; ').map((part) => {
    const [name, ...sources] = part.split(' ');
    return [name, sources];
  }));

  it('allows the API origin (from VITE_API_URL) for fetches, and nothing else outside the site', () => {
    assert.deepEqual(directives['connect-src'], ["'self'", 'https://api.example.com']);
    assert.deepEqual(contentSecurityPolicy('https://example.com/backend')
      .split('; ').find((part) => part.startsWith('connect-src')), "connect-src 'self' https://example.com");
  });

  it('only the built bundle runs; styles and fonts allow Google Fonts only', () => {
    assert.deepEqual(directives['default-src'], ["'self'"]);
    assert.deepEqual(directives['script-src'], ["'self'"]);
    assert.deepEqual(directives['style-src'], ["'self'", 'https://fonts.googleapis.com']);
    assert.deepEqual(directives['font-src'], ['https://fonts.gstatic.com']);
    assert.deepEqual(directives['img-src'], ["'self'"]);
    assert.deepEqual(directives['object-src'], ["'none'"]);
    assert.deepEqual(directives['base-uri'], ["'self'"]);
    assert.deepEqual(directives['form-action'], ["'self'"]);
  });

  it('has no unsafe-inline, unsafe-eval, wildcards or data: sources', () => {
    assert.doesNotMatch(policy, /unsafe-|\*|data:|blob:/);
  });

  it('the Vite plugin puts it first in <head>, for builds only', () => {
    const plugin = cspMetaTag(policy);
    assert.equal(plugin.apply, 'build');
    assert.deepEqual(plugin.transformIndexHtml(), [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ]);
  });
});
