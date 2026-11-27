// Small HTTP helpers shared by the route files. Nothing here knows any business rule.
const { AppError } = require('../services/errors');

/** service error kind -> HTTP status. This table is the whole translation. */
const STATUS = { invalid: 400, unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409 };

/** Express 4 does not catch rejected promises by itself; this passes them to the error handler. */
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** the last middleware: a readable sentence for the user, never a stack trace */
function errorHandler(log = console.error) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, next) => {
    if (error instanceof AppError) {
      return res.status(STATUS[error.kind] ?? 400).json({ error: error.message });
    }
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body is not valid JSON.' });
    }
    log(`${req.method} ${req.path} failed: ${error?.stack ?? error}`); // full detail in the server log only
    return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  };
}

// ---- cookies, without a dependency ----

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * HttpOnly: page scripts cannot read it, so an XSS bug cannot steal the session.
 * SameSite=Lax: the browser does not send it on cross-site POSTs, which blocks CSRF.
 * Secure (in production): only ever sent over HTTPS.
 */
function cookie(name, value, { maxAgeSeconds, secure }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = { STATUS, handle, errorHandler, parseCookies, cookie };
