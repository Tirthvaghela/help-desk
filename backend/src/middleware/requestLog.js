import morgan from 'morgan';

// Request logs: method, path, status and timing, without query strings. A query can hold personal
// data (GET /api/admin/users?q=<email>, ticket searches), and a Referer header can hold a one-time
// link (/reset-password?token=…), so both are cut at the "?".
export function redactUrl(url) {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : `${url.slice(0, cut)}?[redacted]`;
}

// Morgan's own formats read these two tokens, so both formats below use the redacted values.
morgan.token('url', (req) => redactUrl(req.originalUrl || req.url));
morgan.token('referrer', (req) => {
  const referrer = req.headers.referer || req.headers.referrer;
  return referrer ? redactUrl(referrer) : undefined;
});

// `options` is passed to morgan (tests use `stream` to capture the lines).
export function requestLogger(nodeEnv, options) {
  return morgan(nodeEnv === 'production' ? 'combined' : 'dev', options);
}
