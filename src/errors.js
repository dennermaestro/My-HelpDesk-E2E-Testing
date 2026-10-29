/**
 * An error that maps directly to an HTTP response.
 * Anything thrown that is not an HttpError becomes a 500.
 */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message) => new HttpError(401, 'TENANT_REQUIRED', message);
export const authRequired = (message) => new HttpError(401, 'AUTH_REQUIRED', message);
export const invalidCredentials = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
export const notFound = (message) => new HttpError(404, 'NOT_FOUND', message);
export const forbidden = (message) => new HttpError(403, 'FORBIDDEN', message);
