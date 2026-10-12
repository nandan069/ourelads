/**
 * OUREL ADS — Test Setup
 */
require('dotenv').config({ path: '.env.test' });

process.env.JWT_SECRET = 'test-secret-key-for-testing-min-32-chars-long';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';
process.env.NOTIFY_EMAIL = '';
process.env.GOOGLE_ANALYTICS_ID = '';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';

const Database = require('better-sqlite3');
const { initDatabase, seedDatabase } = require('../server/database/init');

global.testDb = new Database(':memory:');
global.testDb.pragma('journal_mode = WAL');
global.testDb.pragma('foreign_keys = ON');

// Initialize schema only (skip seeding for tests)
const db = new Database(':memory:');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
initDatabase(db);
seedDatabase(db);

global.testDb = db;

afterAll(() => {
  global.testDb.close();
});