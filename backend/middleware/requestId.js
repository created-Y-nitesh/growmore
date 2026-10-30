const crypto = require('crypto');
const logger = require('../utils/logger');

function requestIdMiddleware(req, res, next) {
  // Use incoming request ID or generate cryptographically secure UUID
  const reqId = req.headers['x-request-id'] || `req-${crypto.randomUUID()}`;
  req.id = reqId;
  res.setHeader('x-request-id', reqId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    };

    if (res.statusCode >= 500) {
      logger.error('HTTP Request Error', logData, reqId);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP Client Warning', logData, reqId);
    } else {
      logger.info('HTTP Request Handled', logData, reqId);
    }
  });

  next();
}

module.exports = requestIdMiddleware;
