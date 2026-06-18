import env from '../config/env.js';

// 404 for unmatched routes.
export function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Central error handler.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  const body = { error: err.message || 'Server error' };
  if (err.details) body.details = err.details;
  if (env.nodeEnv !== 'production' && status >= 500) body.stack = err.stack;
  res.status(status).json(body);
}
