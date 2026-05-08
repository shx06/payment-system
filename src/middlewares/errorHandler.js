function notFoundHandler(_req, res) {
  res.status(404).json({ success: false, error: 'Route not found.' });
}

function errorHandler(err, _req, res, _next) {
  const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const message = statusCode >= 500 ? 'Internal server error.' : err.message;

  res.status(statusCode).json({ success: false, error: message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
