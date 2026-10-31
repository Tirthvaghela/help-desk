import { dom } from './dom.js';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { before, after, afterEach } from 'node:test';
import { createElement, StrictMode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { cleanup, configure, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createServer } from 'vite';

// Renders the real application with real React into a real (jsdom) DOM, as main.jsx does:
// MemoryRouter → AuthProvider → App. Only fetch is faked, so no database, server or email is involved.
// These are DOM tests, not browser tests: there is no layout, CSS or real navigation.

const TOKEN_KEY = 'helpdesk_auth_token';

// Test files take these from here: `screen` binds to the document when Testing Library is first
// imported, so importing it before this file's DOM setup leaves it with no document.
export { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

// Slower machines need longer than the default 1 s: role queries are slow on the large dashboards.
configure({ asyncUtilTimeout: 5000 });

export const tokenFor = (user) => `token-${user.id}`;

// ---- Fake API ----

class Reply {
  constructor(status, body) {
    this.status = status;
    this.body = body;
  }
}

export const reply = (status, body) => new Reply(status, body);
export const failure = (status, code, message) => new Reply(status, { error: { code, message } });
export const serverError = () => failure(500, 'INTERNAL_ERROR', 'Something went wrong');
export const expired = () => failure(401, 'UNAUTHORIZED', 'Invalid or expired token');

// A response the test releases itself, to see loading states and double submits.
export function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function matchRoute(routes, method, path) {
  if (routes.has(`${method} ${path}`)) return routes.get(`${method} ${path}`);
  const parts = path.split('/');
  for (const [key, handler] of routes) {
    const [routeMethod, routePath] = key.split(' ');
    const routeParts = routePath.split('/');
    if (routeMethod !== method || routeParts.length !== parts.length || !routePath.includes(':')) continue;
    const params = {};
    if (routeParts.every((part, index) => (part.startsWith(':') ? ((params[part.slice(1)] = parts[index]), true) : part === parts[index]))) {
      return (request) => handler({ ...request, params });
    }
  }
  return null;
}

// Routes are "METHOD /path" (":id" allowed) → a function returning a body, reply(...) or a promise of
// either. A function that throws is a lost connection. Any other request is recorded in `unmatched`,
// which fails the test afterwards: the app turns a thrown fetch into a "cannot reach the server"
// message, so throwing alone could not.
export function createApi(initialRoutes = {}) {
  const routes = new Map(Object.entries(initialRoutes));
  const api = {
    requests: [],
    unmatched: [],
    on(key, handler) {
      routes.set(key, handler);
      return api;
    },
    calls(method, path) {
      return api.requests.filter((request) => request.method === method && (typeof path === 'string' ? request.path === path : path.test(request.path)));
    },
    fetch: async (url, init = {}) => {
      const { pathname, searchParams } = new URL(url);
      const method = init.method ?? 'GET';
      const authorization = init.headers?.Authorization;
      const request = {
        method,
        path: pathname,
        query: Object.fromEntries(searchParams),
        body: init.body === undefined ? undefined : JSON.parse(init.body),
        token: authorization?.replace(/^Bearer /, ''),
        headers: init.headers ?? {},
      };
      api.requests.push(request);

      const handler = matchRoute(routes, method, pathname);
      if (!handler) {
        api.unmatched.push(`${method} ${pathname}`);
        throw new Error(`Unexpected request: ${method} ${pathname}`);
      }
      const result = await handler(request);
      const { status, body } = result instanceof Reply ? result : { status: 200, body: result };
      // Through JSON, as a real answer would be, so a test never shares objects with the app.
      const parsed = body === undefined ? null : JSON.parse(JSON.stringify(body));
      return { ok: status < 300, status, json: async () => parsed };
    },
  };
  return api;
}

// ---- Rendering ----

let vite;
let AuthProvider;
let App;
let activeApi = null;
let consoleProblems = [];
let allowedConsole = [];
const realFetch = globalThis.fetch;
const realConsole = { error: console.error, warn: console.warn };

function Location({ onChange }) {
  const location = useLocation();
  onChange(`${location.pathname}${location.search}`);
  return null;
}

// Call once at the top of each test file. Starts Vite in process (no port is opened), and after each
// test unmounts everything, clears storage and checks that nothing unexpected happened.
export function setupRenderTests() {
  before(async () => {
    vite = await createServer({
      root: join(import.meta.dirname, '../..'),
      // No .env here: the tests must not depend on a developer's frontend/.env.
      envDir: import.meta.dirname,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
      oxc: { jsx: { runtime: 'automatic' } },
    });
    AuthProvider = (await vite.ssrLoadModule('/src/auth/AuthProvider.jsx')).default;
    App = (await vite.ssrLoadModule('/src/App.jsx')).default;
    for (const level of ['error', 'warn']) {
      console[level] = (...args) => consoleProblems.push(args.map(String).join(' '));
    }
  });

  after(async () => {
    Object.assign(console, realConsole);
    await vite.close();
    dom.window.close();
  });

  afterEach(() => {
    cleanup();
    dom.window.sessionStorage.clear();
    globalThis.fetch = realFetch;

    const unmatched = activeApi?.unmatched ?? [];
    const problems = consoleProblems.filter((text) => !allowedConsole.some((pattern) => pattern.test(text)));
    activeApi = null;
    consoleProblems = [];
    allowedConsole = [];
    assert.deepEqual(unmatched, [], 'requests no route answered');
    assert.deepEqual(problems, [], 'unexpected console output');
  });
}

// `as`: the signed-in user, or nothing for a visitor. `routes` are added to the session's own.
export function renderApp(path, { as, routes = {}, strict = false } = {}) {
  const sessionRoutes = as
    ? {
        'GET /api/auth/me': (request) => (request.token === tokenFor(as) ? { user: as } : expired()),
        'GET /api/notifications/unread-count': () => ({ unreadCount: 0 }),
      }
    : {};
  const api = createApi({ ...sessionRoutes, ...routes });
  activeApi = api;
  globalThis.fetch = api.fetch;
  if (as) dom.window.sessionStorage.setItem(TOKEN_KEY, tokenFor(as));

  const current = { path };
  const tree = createElement(
    MemoryRouter,
    { initialEntries: [path] },
    createElement(AuthProvider, null, createElement(App)),
    createElement(Location, { onChange: (next) => (current.path = next) }),
  );
  render(strict ? createElement(StrictMode, null, tree) : tree);

  return {
    api,
    // No stylesheets load here, so there is nothing for its pointer-events check to read.
    user: userEvent.setup({ pointerEventsCheck: 0 }),
    path: () => current.path,
  };
}

export const storedToken = () => dom.window.sessionStorage.getItem(TOKEN_KEY);

// For a test that expects the app or a library to log something.
export function allowConsole(pattern) {
  allowedConsole.push(pattern);
}
