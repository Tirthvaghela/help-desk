import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Converts known library errors into the standard ApiError shape.
function toApiError(err) {
  if (err instanceof ApiError) return err;

  if (err.type === 'entity.parse.failed') {
    return new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
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
