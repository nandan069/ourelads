#!/usr/bin/env node
/**
 * OUREL ADS — Automated Backup Script
 * Creates SQLite backup and optionally uploads to cloud storage
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { logger } = require('../server/utils/logger');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../server/database/ourelads.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../server/database/backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS, 10) || 7;
const UPLOAD_TO_S3 = process.env.BACKUP_S3_BUCKET ? true : false;

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `ourelads_backup_${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    logger.info('Starting database backup', { backupPath });
    
    db.backup(backupPath);
    
    const stats = fs.statSync(backupPath);
    logger.info('Backup completed', { 
      backupName, 
      size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
      path: backupPath 
    });
    
    cleanupOldBackups();
    
    if (UPLOAD_TO_S3) {
      uploadToS3(backupPath, backupName);
    }
    
    return backupPath;
  } catch (err) {
    logger.error('Backup failed', { error: err.message });
    throw err;
  } finally {
    db.close();
  }
}

function cleanupOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('ourelads_backup_') && f.endsWith('.db'))
    .map(f => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(MAX_BACKUPS);
    for (const file of toDelete) {
      fs.unlinkSync(file.path);
      logger.info('Deleted old backup', { file: file.name });
    }
  }
}

function uploadToS3(filePath, fileName) {
  // Optional: Upload to S3/GCS/Azure Blob
  // Requires: npm install @aws-sdk/client-s3
  logger.info('S3 upload not implemented - set BACKUP_S3_BUCKET and configure AWS credentials');
}

if (require.main === module) {
  try {
    createBackup();
    logger.info('Backup script completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error('Backup script failed', { error: err.message });
    process.exit(1);
  }
}

module.exports = { createBackup, cleanupOldBackups };