// A service says WHAT went wrong in its own words. It does not know about HTTP status
// codes: the route layer translates a kind into a status (src/routes/http-errors.js),
// and the MCP server translates it into a tool result with isError.
class AppError extends Error {
  /**
   * @param {'invalid'|'unauthenticated'|'forbidden'|'not_found'|'conflict'} kind
   * @param {string} message a sentence a person can read
   */
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

const invalid = (message) => new AppError('invalid', message);
const unauthenticated = (message = 'Please sign in first.') => new AppError('unauthenticated', message);
const forbidden = (message = 'You are not allowed to do that.') => new AppError('forbidden', message);
const notFound = (message = 'Not found.') => new AppError('not_found', message);
const conflict = (message) => new AppError('conflict', message);

/** every service that needs a signed-in person starts with this */
function requireUser(user) {
  if (!user) throw unauthenticated();
  return user;
}

module.exports = { AppError, invalid, unauthenticated, forbidden, notFound, conflict, requireUser };
