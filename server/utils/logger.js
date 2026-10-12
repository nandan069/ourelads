/**
 * OUREL ADS — Structured Logger (Winston)
 */
const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: { service: 'ourelads-api' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
} else {
  logger.add(new winston.transports.Console({
    format: logFormat,
  }));
}

const logActivity = (db, userId, action, entityType, entityId, details, ip) => {
  try {
    db.prepare(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, action, entityType, entityId, details || null, ip || null);
  } catch (e) {
    logger.error('Activity log error', { error: e.message, userId, action, entityType, entityId });
  }
};

const createRevision = (db, entityType, entityId, data, changedBy, summary) => {
  try {
    db.prepare(
      `INSERT INTO revisions (entity_type, entity_id, data, changed_by, change_summary) VALUES (?, ?, ?, ?, ?)`
    ).run(entityType, entityId, typeof data === 'string' ? data : JSON.stringify(data), changedBy, summary);
  } catch (e) {
    logger.error('Revision error', { error: e.message, entityType, entityId, changedBy });
  }
};

module.exports = { logger, logActivity, createRevision };