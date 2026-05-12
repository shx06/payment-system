function log(level, message, metadata = {}) {
  const method = typeof console[level] === 'function' ? console[level] : console.log;
  method(message, {
    timestamp: new Date().toISOString(),
    ...metadata,
  });
}

function info(message, metadata) {
  log('info', message, metadata);
}

function warn(message, metadata) {
  log('warn', message, metadata);
}

function error(message, metadata) {
  log('error', message, metadata);
}

module.exports = {
  info,
  warn,
  error,
};
