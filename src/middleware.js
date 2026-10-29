import { HttpError, notFound, unauthorized } from './errors.js';

/**
 * Resolves the tenant from the X-Tenant header and attaches it to the request.
 */
export function requireTenant(repository) {
  return (req, res, next) => {
    const tenantId = req.get('X-Tenant')?.trim().toLowerCase();
    if (!tenantId) {
      return next(unauthorized('Missing X-Tenant header'));
    }
    const tenant = repository.findTenant(tenantId);
    if (!tenant) {
      return next(unauthorized(`Unknown tenant "${tenantId}"`));
    }
    req.tenant = tenant;
    return next();
  };
}

export function apiNotFound(req, res, next) {
  next(notFound(`No route for ${req.method} ${req.path}`));
}

/**
 * Turns every error into the same JSON shape: { error: { code, message, details? } }.
 * Unexpected errors are logged and never leak internals to the client.
 */
// Express only treats a function as an error handler when it declares 4 arguments.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
}
