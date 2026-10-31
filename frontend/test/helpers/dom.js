import { JSDOM } from 'jsdom';

// A real DOM (jsdom) for the render tests. It must be imported before React DOM or Testing Library,
// so renderApp.js imports it first. `node --test` runs each test file in its own process, so these
// globals never reach the older test files.

export const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  // A real origin, or sessionStorage throws.
  url: 'http://localhost/',
  // NotificationBell only polls while document.visibilityState is "visible".
  pretendToBeVisual: true,
});

const { window } = dom;

// Everything the window has that Node does not, without replacing Node's own fetch, timers or crypto.
for (const name of Object.getOwnPropertyNames(window)) {
  if (name.startsWith('_') || name in globalThis) continue;
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] });
}

// These exist in Node too, but DOM code needs jsdom's own.
for (const name of ['window', 'document', 'navigator', 'Event', 'EventTarget', 'CustomEvent']) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? window : window[name] });
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
