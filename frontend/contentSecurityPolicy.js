// Content Security Policy for the built frontend.
//
// It is written into index.html at build time (a <meta> tag), because connect-src must name the
// backend API, and that is only known from VITE_API_URL when the site is built: vercel.json cannot
// read environment variables. A <meta> policy cannot set frame-ancestors, so vercel.json sends that
// part as a header; the browser enforces both policies.
//
// What the app needs, checked against the source and the built files:
//   scripts  only the built bundle from this site (no inline scripts, no eval)
//   styles   the built stylesheet and the Google Fonts stylesheet; React's style={{…}} props set
//            styles through the DOM, which CSP does not block, so no 'unsafe-inline'
//   fonts    Google Fonts files
//   images   only this site (the favicon)
//   fetch    this site and the backend API
// The CSV report is saved through a temporary blob: link, which CSP does not restrict.

export function contentSecurityPolicy(apiUrl) {
  const apiOrigin = new URL(apiUrl).origin;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

// Vite plugin, for builds only: puts the policy first in <head>, before any stylesheet or script.
// The development server is left alone (its live reload needs inline scripts and a websocket).
export function cspMetaTag(policy) {
  return {
    name: 'help-desk-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }];
    },
  };
}
