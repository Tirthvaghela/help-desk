// The backend API's base URL (VITE_API_URL), shared by the app (client.js) and the build
// (vite.config.js). Vite writes the value into the built files, so a production build must be
// given it; the development server falls back to the local API.

export const LOCAL_API_URL = 'http://localhost:4000';

// "https://api.example.com//" → "https://api.example.com"; missing or blank → "".
export function normalizeApiUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

// The full URL for an API path, with exactly one "/" between base and path.
export function apiUrlFor(base, path) {
  return `${base}/${String(path).replace(/^\/+/, '')}`;
}

// For production builds: the normalised URL, or an Error saying what to set. An http(s) URL with
// no query, fragment or credentials (it ends up in the public JavaScript).
export function requireProductionApiUrl(value) {
  const url = normalizeApiUrl(value);
  if (!url) {
    throw new Error(
      'VITE_API_URL must be set for a production build: the backend API URL, e.g. https://api.example.com. ' +
        'Vite writes it into the built files, so set it before `npm run build` (on Vercel, in the frontend project\'s environment variables).',
    );
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error(`VITE_API_URL must be an http(s) URL with no query, fragment or credentials, e.g. https://api.example.com (got "${url}")`);
  }
  return url;
}
