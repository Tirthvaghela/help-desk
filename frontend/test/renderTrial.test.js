import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Phase 1 trial: the real application under real React and a real (jsdom) DOM, with only fetch faked.
// It keeps its setup in one place on purpose, so a failure here is about the tools and not the helpers.

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
for (const name of ['HTMLElement', 'Element', 'Node', 'Event', 'MutationObserver', 'DocumentFragment', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  globalThis[name] = window[name];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const realFetch = globalThis.fetch;
let vite;
let render;
let cleanup;
let screen;
let createElement;
let MemoryRouter;
let AuthProvider;
let App;
let requests;

before(async () => {
  ({ createElement } = await import('react'));
  ({ MemoryRouter } = await import('react-router'));
  ({ render, cleanup, screen } = await import('@testing-library/react'));
  vite = await createServer({
    root: join(import.meta.dirname, '..'),
    // No .env here: the trial must not depend on a developer's frontend/.env.
    envDir: join(import.meta.dirname, 'helpers'),
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    oxc: { jsx: { runtime: 'automatic' } },
  });
  AuthProvider = (await vite.ssrLoadModule('/src/auth/AuthProvider.jsx')).default;
  App = (await vite.ssrLoadModule('/src/App.jsx')).default;
});

after(async () => {
  await vite.close();
  window.close();
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  globalThis.fetch = realFetch;
});

describe('render trial', () => {
  it('a signed-out visitor to /tickets sees the customer sign-in page, with no request sent', async () => {
    requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push(`${init?.method ?? 'GET'} ${url}`);
      throw new Error(`unexpected request: ${init?.method ?? 'GET'} ${url}`);
    };

    render(
      createElement(MemoryRouter, { initialEntries: ['/tickets'] }, createElement(AuthProvider, null, createElement(App))),
    );

    assert.ok(await screen.findByRole('heading', { name: 'Welcome back' }));
    assert.ok(screen.getByLabelText('Email address'));
    assert.ok(screen.getByRole('button', { name: /sign in/i }));
    assert.equal(screen.queryByText(/here are your tickets/i), null, 'the protected page is not shown');
    assert.deepEqual(requests, [], 'a signed-out visitor sends no API request');
    assert.equal(window.location.href, 'http://localhost/', 'MemoryRouter does not touch the address bar');
    assert.ok(window.document.body.children.length > 0, 'the app is in the real DOM');
  });

  it('cleanup leaves nothing behind for the next test', () => {
    assert.equal(window.document.body.children.length, 0, 'the previous render was unmounted');
    assert.equal(window.sessionStorage.length, 0);
    assert.equal(globalThis.fetch, realFetch);
    assert.equal(screen.queryByRole('heading', { name: 'Welcome back' }), null);
  });
});
