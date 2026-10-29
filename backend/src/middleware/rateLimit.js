import { ApiError } from '../utils/ApiError.js';

// Fixed-window rate limiter kept in memory, per client IP and per limiter. Enough for a
// single API process; several processes would each keep their own counts.
//   max: requests allowed per window (0 turns the limiter off)
//   windowMs: window length in milliseconds
// Over the limit: 429 RATE_LIMITED with a Retry-After header (seconds).
// Behind a reverse proxy, set Express "trust proxy" so req.ip is the real client.
export function createRateLimiter({ max, windowMs, name = 'requests', now = Date.now }) {
  if (!max) {
    return (req, res, next) => next();
  }

  const windows = new Map(); // ip -> { count, resetAt }

  function prune(time) {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= time) windows.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const time = now();
    const key = req.ip ?? 'unknown';
    let entry = windows.get(key);
    if (!entry || entry.resetAt <= time) {
      if (windows.size >= 10_000) prune(time);
      entry = { count: 0, resetAt: time + windowMs };
      windows.set(key, entry);
    }
    entry.count += 1;

    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - time) / 1000)));
      throw new ApiError(429, 'RATE_LIMITED', `Too many ${name}. Please wait a few minutes and try again.`);
    }
    next();
  };
}
