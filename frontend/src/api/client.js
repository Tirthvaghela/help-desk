// `import.meta.env` only exists under Vite; the fallback also lets plain Node load this
// module in the frontend unit tests.
const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:4000';

// The token each failed request was sent with. Kept here rather than on the error, so it can
// never appear in logs or messages. The auth provider uses it to tell a 401 for the current
// session from a late one for a session that has since ended or been replaced.
const requestTokens = new WeakMap();

// The token `error`'s request was sent with, or undefined (no token, or not an API error).
export function requestTokenOf(error) {
  return error !== null && typeof error === 'object' ? requestTokens.get(error) : undefined;
}

// Small fetch wrapper. Throws an Error carrying the backend's
// { error: { code, message } } shape so pages can show a clear message.
export async function apiRequest(path, { method = 'GET', body, token, headers: extraHeaders } = {}) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), {
      code: 'NETWORK_ERROR',
    });
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || `Request failed with status ${response.status}`;
    const error = Object.assign(new Error(message), {
      status: response.status,
      code: data?.error?.code,
      data,
    });
    if (token) requestTokens.set(error, token);
    throw error;
  }

  return data;
}

// Builds "?a=1&b=2" from an object, skipping empty values ("", null, undefined, "all").
export function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
