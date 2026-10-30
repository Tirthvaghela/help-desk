// Starts the HTTP server and stops it cleanly. Used by server.js; the options exist so tests
// can run it on a spare port with fake signals, database and exit instead of the real ones.
//
// Startup: a port that cannot be opened is reported (never a silent "listening") and exits 1.
// Shutdown (SIGTERM from a host or `node --watch` restart, SIGINT from Ctrl+C): stop accepting
// connections, let requests in progress finish, close idle keep-alive connections, run `drain`
// (e.g. emails still being sent), disconnect the database once, exit 0. If that takes longer
// than the timeout, exit 1.

export const SHUTDOWN_TIMEOUT_MS = 10_000;
const SIGNALS = ['SIGTERM', 'SIGINT'];

export function startServer(
  app,
  {
    port,
    disconnect,
    drain = async () => {},
    signals = process,
    exit = (code) => process.exit(code),
    log = console.log,
    logError = console.error,
    shutdownTimeoutMs = SHUTDOWN_TIMEOUT_MS,
  },
) {
  let stopping = null;

  // Express 5 passes a listen error (port in use, no permission) to this callback.
  const server = app.listen(port, (err) => {
    if (err) {
      logError(startupErrorMessage(err, port));
      exit(1);
      return;
    }
    log(`API listening on http://localhost:${server.address().port}`);
  });

  function shutdown(signal) {
    if (stopping) return stopping;
    for (const name of SIGNALS) signals.removeListener(name, onSignal);
    log(`${signal} received: closing the API (requests in progress may finish, up to ${shutdownTimeoutMs / 1000} s).`);

    // Whichever comes first, the timeout or the end of shutdown, decides the exit; nothing
    // runs after it (no late disconnect, no second exit).
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      exit(code);
    };
    const timer = setTimeout(() => {
      logError(`Shutdown did not finish within ${shutdownTimeoutMs / 1000} s; exiting.`);
      server.closeAllConnections();
      finish(1);
    }, shutdownTimeoutMs);
    timer.unref?.();

    stopping = (async () => {
      try {
        // Not listening (a signal during startup): nothing to close.
        if (server.listening) {
          await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
            server.closeIdleConnections();
          });
        }
        if (finished) return;
        // Background work started by requests (it may still need the database).
        await drain();
        if (finished) return;
        await disconnect();
        if (finished) return;
        log('API stopped.');
        finish(0);
      } catch (err) {
        if (finished) return;
        logError(`Shutdown failed: ${err.message}`);
        finish(1);
      }
    })();
    return stopping;
  }

  function onSignal(signal) {
    shutdown(signal);
  }
  for (const name of SIGNALS) signals.on(name, onSignal);

  return { server, shutdown };
}

function startupErrorMessage(err, port) {
  if (err.code === 'EADDRINUSE') {
    return `Could not start the API: port ${port} is already in use. Stop the other process or set PORT to a free port.`;
  }
  if (err.code === 'EACCES') {
    return `Could not start the API: no permission to use port ${port}. Choose a port above 1024 with PORT.`;
  }
  return `Could not start the API on port ${port}: ${err.message}`;
}
