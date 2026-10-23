// Throw this from controllers to send a consistent JSON error:
// { "error": { "code": "VALIDATION_ERROR", "message": "Subject is required" } }
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
