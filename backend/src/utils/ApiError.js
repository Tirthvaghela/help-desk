// Throw this from controllers to send a consistent JSON error:
// { "error": { "code": "VALIDATION_ERROR", "message": "Subject is required" } }
//
// Prefer the helpers for common cases, e.g.
//   throw ApiError.badRequest('Subject is required');
//   throw ApiError.notFound('Ticket not found');
// Express 5 forwards errors thrown in async handlers to the error middleware automatically.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  static badRequest(message = 'Invalid request', code = 'VALIDATION_ERROR') {
    return new ApiError(400, code, message);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message = 'Resource already exists', code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  // Always this text: the reason, which can name hosts, is only logged.
  static databaseUnavailable() {
    return new ApiError(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable. Please try again in a moment.');
  }
}
