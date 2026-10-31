import mongoose from 'mongoose';
import { describeDBError } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

const METHOD_ORDER = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

// "/api/tickets" + "/:id/assign" → a case-insensitive regex for the full path (trailing slash
// optional, as Express matches). Only literal and :param segments are used in this API; any
// other syntax fails at startup instead of being matched wrongly.
function routePattern(prefix, path) {
  const full = `${prefix}${path === '/' ? '' : path}`;
  if (/[*?{}()]/.test(full)) throw new Error(`methodNotAllowed: unsupported route syntax in ${full}`);
  const source = full
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.+^$|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${source}/?$`, 'i');
}

// 405 METHOD_NOT_ALLOWED with an accurate Allow header when the path exists but not for this
// method; unknown paths still reach notFound (404). `mounts` is the [prefix, router] list from
// app.js; the routes are read once, after the routers are defined. HEAD is allowed wherever GET
// is (Express answers it), and OPTIONS everywhere (the CORS middleware answers it).
export function methodNotAllowed(mounts) {
  const routes = mounts.flatMap(([prefix, router]) =>
    router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        pattern: routePattern(prefix, layer.route.path),
        methods: Object.keys(layer.route.methods).filter((m) => m !== '_all').map((m) => m.toUpperCase()),
      })),
  );

  return (req, res, next) => {
    const allowed = new Set(routes.filter((route) => route.pattern.test(req.path)).flatMap((route) => route.methods));
    if (allowed.size === 0) return next();
    if (allowed.has('GET')) allowed.add('HEAD');
    allowed.add('OPTIONS');
    const list = METHOD_ORDER.filter((method) => allowed.has(method)).join(', ');
    res.set('Allow', list);
    next(new ApiError(405, 'METHOD_NOT_ALLOWED', `${req.method} is not supported for ${req.path}. Allowed: ${list}`));
  };
}

// Codes zlib gives a gzip, deflate, Brotli or zstd body it cannot decompress. body-parser passes them
// on with status 400 and no `type`. Only codes caused by the body are listed, so a fault on the server
// such as running out of memory still gives a 500.
const DECOMPRESSION_ERROR = /^(?:Z_DATA_ERROR|Z_BUF_ERROR|Z_NEED_DICT|ERR__ERROR_FORMAT_\w+|ZSTD_error_(?:prefix_unknown|version_unsupported|frameParameter_unsupported|frameParameter_windowTooLarge|corruption_detected|checksum_wrong|dictionary_wrong|literals_headerWrong))$/;

// Converts known library errors into the standard ApiError shape. Parser errors are recognised by
// the markers the parser sets, so a SyntaxError or URIError from application code still gives a 500.
function toApiError(err) {
  if (err instanceof ApiError) return err;

  if (err.type === 'entity.parse.failed') {
    return new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (err.type === 'charset.unsupported') {
    return new ApiError(415, 'UNSUPPORTED_CHARSET', 'Request body uses an unsupported character set');
  }
  if (err.type === 'encoding.unsupported') {
    return new ApiError(415, 'UNSUPPORTED_ENCODING', 'Request body uses an unsupported content encoding');
  }
  if (err.status === 400 && DECOMPRESSION_ERROR.test(err.code)) {
    return new ApiError(400, 'INVALID_BODY_ENCODING', 'Request body could not be decoded');
  }
  // The router sets status 400 on a URL parameter it cannot decode.
  if (err instanceof URIError && err.status === 400) {
    return new ApiError(400, 'INVALID_URL', 'Request URL is not correctly encoded');
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return ApiError.badRequest(first?.message || 'Invalid data');
  }
  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid ${err.path}`, 'INVALID_ID');
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    return ApiError.conflict(`${field} already exists`, 'DUPLICATE');
  }
  // The database became unreachable while the request was running (a cleared connection pool is a
  // MongoNetworkError too). The driver's text can name hosts, so it is only logged.
  if (err instanceof mongoose.mongo.MongoServerSelectionError || err instanceof mongoose.mongo.MongoNetworkError) {
    console.error(`Database error during a request: ${describeDBError(err)}`);
    return ApiError.databaseUnavailable();
  }
  return null;
}

// Never sends stack traces to the client; logs unexpected errors on the server.
// Express recognises error handlers by their four arguments, so `next` must stay.
export function errorHandler(err, req, res, next) {
  const apiError = toApiError(err);

  if (apiError) {
    return res
      .status(apiError.status)
      .json({ error: { code: apiError.code, message: apiError.message } });
  }

  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
