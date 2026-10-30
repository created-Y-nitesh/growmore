const logger = require('../utils/logger');

// Centralized error handling middleware with structured logging & redaction
const errorHandler = (err, req, res, next) => {
  // Log error internally with stack trace for debugging via structured logger
  logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    statusCode: err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500),
    error: err
  });

  // Default response status and sanitized message
  const statusCode = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);
  
  // Never expose internal database errors or full stack traces to clients
  let clientMessage = err.message || 'An internal server error occurred';
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    clientMessage = 'An unexpected server error occurred. Please try again later.';
  }

  res.status(statusCode).json({
    success: false,
    requestId: req.id,
    message: clientMessage,
    ...(process.env.NODE_ENV === 'development' && err.details ? { details: err.details } : {})
  });
};

module.exports = errorHandler;
