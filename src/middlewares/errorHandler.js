function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, error: 'Route not found.' });
}

function errorHandler(err, _req, res, _next) {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Request body must be valid JSON.' });
  }

  const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const message = statusCode >= 500 ? 'Internal server error.' : err.message;

  return res.status(statusCode).json({ success: false, error: message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
