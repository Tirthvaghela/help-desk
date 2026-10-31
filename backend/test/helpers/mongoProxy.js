import net from 'node:net';

// A small TCP proxy on a spare port in front of the local test MongoDB, so a lost database can be
// simulated without touching MongoDB itself. Modes:
//   pass     traffic flows
//   hold     replies are kept back until release(), like a slow query
//   silent   sockets stay open but nothing gets through, like a frozen network path
// drop() cuts the current connections; refuse() also closes the port, until accept() reopens it.
export async function startMongoProxy(upstreamPort) {
  const pairs = new Set();
  let mode = 'pass';
  let held = [];

  const server = () => net.createServer((client) => {
    const upstream = net.connect(upstreamPort, '127.0.0.1');
    const pair = { client, upstream };
    pairs.add(pair);
    const end = () => {
      client.destroy();
      upstream.destroy();
      pairs.delete(pair);
    };
    for (const socket of [client, upstream]) {
      socket.on('error', end);
      socket.on('close', end);
    }
    client.on('data', (data) => {
      if (mode !== 'silent') upstream.write(data);
    });
    upstream.on('data', (data) => {
      if (mode === 'pass') client.write(data);
      else if (mode === 'hold') held.push([client, data]);
    });
  });

  const listen = (target, onPort) => new Promise((resolve, reject) => {
    target.once('error', reject);
    target.listen(onPort, '127.0.0.1', () => {
      target.off('error', reject);
      resolve();
    });
  });
  const drop = () => {
    for (const { client, upstream } of pairs) {
      client.destroy();
      upstream.destroy();
    }
    pairs.clear();
    held = [];
  };

  let listening = server();
  await listen(listening, 0);
  const { port } = listening.address();

  return {
    port,
    hold() {
      mode = 'hold';
    },
    heldReplies() {
      return held.length;
    },
    silence() {
      mode = 'silent';
    },
    release() {
      mode = 'pass';
      for (const [client, data] of held) {
        if (!client.destroyed) client.write(data);
      }
      held = [];
    },
    // Back to normal after silence(): anything lost in the silence leaves those connections unusable.
    restore() {
      mode = 'pass';
      drop();
    },
    drop,
    async refuse() {
      const closed = new Promise((resolve) => listening.close(resolve));
      drop();
      await closed;
      listening = null;
    },
    async accept() {
      listening = server();
      await listen(listening, port);
    },
    async stop() {
      mode = 'pass';
      if (!listening) return;
      const closed = new Promise((resolve) => listening.close(resolve));
      drop();
      await closed;
      listening = null;
    },
  };
}
