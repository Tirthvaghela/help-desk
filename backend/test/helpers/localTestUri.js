// Tests may only ever use a MongoDB on this machine, in a database whose name ends in "_test". The
// host comes from the shell (MONGODB_URI_TEST), so a typo must not be able to reach real data.
// Messages never include the URI, which can hold a password.

const LOOPBACK_HOST = /^(localhost|127(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}|\[::1\])(:\d+)?$/i;
const SAFE_NAME = /^[\w-]+$/;

// The reason this URI may not be used in tests, or null when it may.
export function localTestUriProblem(uri) {
  // A "+srv" URI is a DNS lookup for hosts, so it is never local: only plain mongodb:// passes.
  const match = /^mongodb:\/\/([^/?#]*)\/([^?#]*)(\?[^#]*)?$/.exec(String(uri ?? ''));
  if (!match) return 'Refusing to use this MongoDB URI in tests: it must look like mongodb://127.0.0.1:27017/name_test';

  const [, authority, database, query = ''] = match;
  const hosts = authority.slice(authority.lastIndexOf('@') + 1).split(',');
  // The driver decodes option names, so they are compared decoded: proxy%48ost is proxyHost too.
  const usesProxy = [...new URLSearchParams(query).keys()].some((key) => key.toLowerCase() === 'proxyhost');
  if (!hosts.every((host) => LOOPBACK_HOST.test(host)) || usesProxy) {
    return 'Refusing to use a MongoDB server that is not on this machine in tests: use localhost, 127.0.0.1 or [::1]';
  }
  if (!database.endsWith('_test') || !SAFE_NAME.test(database)) {
    const name = SAFE_NAME.test(database) ? `"${database}"` : 'with this name';
    return `Refusing to use database ${name} in tests: name must end with "_test"`;
  }
  return null;
}

export function assertLocalTestUri(uri) {
  const problem = localTestUriProblem(uri);
  if (problem) throw new Error(problem);
}
