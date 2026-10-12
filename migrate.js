#!/usr/bin/env node
/**
 * OUREL ADS — Migration CLI Runner
 */
require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const { migrate, createMigration } = require('./server/database/migrate');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'server/database/ourelads.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const command = process.argv[2];
const arg = process.argv[3];

async function main() {
  try {
    switch (command) {
      case 'run':
      case 'migrate':
        console.log('Running migrations...');
        const result = migrate(db);
        console.log(`Migrations applied: ${result.applied}, Skipped: ${result.skipped}`);
        break;

      case 'create':
        if (!arg) {
          console.error('Usage: npm run migrate create "migration name"');
          process.exit(1);
        }
        const filepath = createMigration(arg);
        console.log(`Created migration: ${filepath}`);
        break;

      case 'status':
        const { getPendingMigrations, getAppliedMigrations } = require('./database/migrate');
        const pending = getPendingMigrations(db);
        const applied = getAppliedMigrations(db);
        console.log('Applied migrations:', [...applied].join(', ') || 'none');
        console.log('Pending migrations:', pending.join(', ') || 'none');
        break;

      default:
        console.log(`
Usage: node migrate.js <command> [args]

Commands:
  run, migrate     Run all pending migrations
  create "name"    Create a new migration file
  status           Show migration status
        `);
        break;
    }
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();