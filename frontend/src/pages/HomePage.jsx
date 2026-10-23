import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api/client.js';

// Setup check: confirms the frontend can reach the backend and database.
export default function HomePage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await apiRequest('/api/health'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Customer Support Ticket System</h1>
      <p className="text-slate-600">
        Project setup is running. Login and ticket screens will appear here as modules are built.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">System status</h2>
        {loading && <p className="text-slate-500">Checking API…</p>}
        {!loading && error && (
          <div className="space-y-2">
            <p className="text-red-700">{error}</p>
            <button
              type="button"
              onClick={checkHealth}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && health && (
          <ul className="text-sm">
            <li>
              API: <span className="font-medium text-green-700">{health.status}</span>
            </li>
            <li>
              Database: <span className="font-medium text-green-700">{health.database}</span>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}
