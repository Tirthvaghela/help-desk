import net from 'node:net';

// A port nothing is using right now, for a child process that takes its port from PORT. PORT=0
// cannot ask for one: readEnv treats it as unset and uses the default, 4000.
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}
