/**
 * OUREL ADS — Database Migration Runner
 * Simple migration system for SQLite schema changes
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { logger } = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getAppliedMigrations(db) {
  const rows = db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY applied_at`).all();
  return new Set(rows.map(r => r.name));
}

function getPendingMigrations(db) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }

  const applied = getAppliedMigrations(db);
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js') || f.endsWith('.sql'))
    .sort();

  return files.filter(f => !applied.has(f));
}

function runMigration(db, migrationName) {
  const migrationPath = path.join(MIGRATIONS_DIR, migrationName);
  const ext = path.extname(migrationName);

  if (ext === '.js') {
    const migration = require(migrationPath);
    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${migrationName} must export an 'up' function`);
    }
    return migration.up(db);
  } else if (ext === '.sql') {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    return db.exec(sql);
  }
  throw new Error(`Unknown migration file type: ${ext}`);
}

function migrate(db) {
  ensureMigrationsTable(db);
  const pending = getPendingMigrations(db);

  if (pending.length === 0) {
    logger.info('No pending migrations');
    return { applied: 0, skipped: 0 };
  }

  logger.info('Running migrations', { count: pending.length, migrations: pending });

  const results = { applied: 0, skipped: 0 };

  for (const migration of pending) {
    try {
      db.transaction(() => {
        runMigration(db, migration);
        db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES (?)`).run(migration);
      })();
      logger.info('Migration applied', { migration });
      results.applied++;
    } catch (err) {
      logger.error('Migration failed', { migration, error: err.message });
      throw err;
    }
  }

  logger.info('All migrations completed', { applied: results.applied });
  return results;
}

function createMigration(name) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const filename = `${timestamp}_${safeName}.js`;
  const filepath = path.join(MIGRATIONS_DIR, filename);

  const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

function up(db) {
  // Add your migration SQL here
  // Example:
  // db.exec(\`
  //   ALTER TABLE users ADD COLUMN phone TEXT;
  // \`);
}

function down(db) {
  // Add rollback SQL here (optional)
  // Example:
  // db.exec(\`
  //   ALTER TABLE users DROP COLUMN phone;
  // \`);
}

module.exports = { up, down };
`;

  fs.writeFileSync(filepath, template);
  logger.info('Migration file created', { filepath });
  return filepath;
}

module.exports = { migrate, createMigration, getPendingMigrations, getAppliedMigrations };