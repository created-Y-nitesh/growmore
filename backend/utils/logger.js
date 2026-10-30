const crypto = require('crypto');

/**
 * Enterprise Structured Logger with Sensitive Field Redaction & Trace Context
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'password_hash',
  'token',
  'authtoken',
  'resettoken',
  'jwt',
  'secret',
  'keysecret',
  'otp',
  'signature',
  'authorization',
  'cookie',
  'growmore_token',
  'apikey'
]);

function redactSensitive(data, depth = 0) {
  if (depth > 6 || data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => redactSensitive(item, depth + 1));
  }

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = redactSensitive(value, depth + 1);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const LOG_LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

const currentLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
const currentLevelVal = LOG_LEVELS[currentLevel] || LOG_LEVELS.INFO;

function formatLog(level, message, meta = {}, reqId = null) {
  const timestamp = new Date().toISOString();
  const sanitizedMeta = redactSensitive(meta);
  
  const logObject = {
    timestamp,
    level,
    message,
    ...(reqId ? { requestId: reqId } : {}),
    ...(sanitizedMeta && Object.keys(sanitizedMeta).length > 0 ? { meta: sanitizedMeta } : {})
  };

  if (meta instanceof Error) {
    logObject.error = {
      name: meta.name,
      message: meta.message,
      stack: meta.stack
    };
  } else if (meta && meta.error instanceof Error) {
    logObject.error = {
      name: meta.error.name,
      message: meta.error.message,
      stack: meta.error.stack
    };
  }

  return JSON.stringify(logObject);
}

const logger = {
  debug(message, meta, reqId) {
    if (currentLevelVal <= LOG_LEVELS.DEBUG) {
      process.stdout.write(formatLog('DEBUG', message, meta, reqId) + '\n');
    }
  },
  info(message, meta, reqId) {
    if (currentLevelVal <= LOG_LEVELS.INFO) {
      process.stdout.write(formatLog('INFO', message, meta, reqId) + '\n');
    }
  },
  warn(message, meta, reqId) {
    if (currentLevelVal <= LOG_LEVELS.WARN) {
      process.stderr.write(formatLog('WARN', message, meta, reqId) + '\n');
    }
  },
  error(message, meta, reqId) {
    if (currentLevelVal <= LOG_LEVELS.ERROR) {
      process.stderr.write(formatLog('ERROR', message, meta, reqId) + '\n');
    }
  },
  redact(obj) {
    return redactSensitive(obj);
  }
};

module.exports = logger;
