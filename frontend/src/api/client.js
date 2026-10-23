const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Small fetch wrapper. Throws an Error carrying the backend's
// { error: { code, message } } shape so pages can show a clear message.
export async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const headers = {};
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
    throw Object.assign(new Error(message), {
      status: response.status,
      code: data?.error?.code,
      data,
    });
  }

  return data;
}
