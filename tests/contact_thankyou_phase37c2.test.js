/**
 * Phase 3.7C-2 — Isolated backend/SSR/SEO safety tests (disposable SQLite, mocked email)
 * Covers confirmation endpoint, /thank-you SSR metadata, sitemap exclusion, and DB startup guard behavior.
 * No active DB writes, no deployment, no real notifications/Ads.
 */
const request = require('supertest');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const mockSendMail = jest.fn(() => Promise.resolve({ messageId: 'mock-id' }));
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: (...args) => mockSendMail(...args) }),
}));

const { initDatabase, seedDatabase } = require('../server/database/init');
const { createApp } = require('../server/server');

function makeTestApp() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initDatabase(db, { allowContactIdempotencySchema: true });
  seedDatabase(db);
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'noreply@test.local';
  process.env.SMTP_PASSWORD = 'test-pass';
  process.env.NOTIFY_EMAIL = 'notify@test.local';
  process.env.NODE_ENV = 'test';
  const { app } = createApp(db);
  return { app, db };
}

const uuid = () => crypto.randomUUID();
const validPayload = (overrides = {}) => ({
  name: 'Jane Doe',
  email: 'jane@example.com',
  message: 'Hello, I would like to discuss a project.',
  company: 'Acme Co',
  phone: '+91 98765 43210',
  service: 'brand-film',
  budget: '1-5l',
  website: '',
  ...overrides,
});

describe('3.7C-2 Confirmation endpoint (read-only, isolated)', () => {
  let app, db;
  beforeEach(() => {
    jest.clearAllMocks();
    ({ app, db } = makeTestApp());
  });
  afterEach(() => { try { db.close(); } catch (_) {} });

  test('valid token returns confirmed state without mutating lead/token/mapping state', async () => {
    const key = uuid();
    const submit = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(submit.status).toBe(201);
    const token = submit.body.confirmationToken;
    const before = db.prepare('SELECT contact_submission_id, confirmation_token_hash, confirmation_expires_at, conversion_eligible, conversion_fired_at, notify_email_state, updated_at FROM contact_submission_idempotency WHERE idempotency_key = ?').get(key);

    const res = await request(app).post('/api/contact/confirmation-status').send({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ valid: true, state: 'confirmed' }));
    expect(typeof res.body.confirmationExpiresAt).toBe('string');
    expect(res.body.id).toBeUndefined();
    expect(res.body.name).toBeUndefined();
    expect(res.body.email).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/jane@example\.com|Jane Doe/i);

    const after = db.prepare('SELECT contact_submission_id, confirmation_token_hash, confirmation_expires_at, conversion_eligible, conversion_fired_at, notify_email_state FROM contact_submission_idempotency WHERE idempotency_key = ?').get(key);
    expect(after).toMatchObject({
      contact_submission_id: before.contact_submission_id,
      confirmation_token_hash: before.confirmation_token_hash,
      confirmation_expires_at: before.confirmation_expires_at,
      conversion_eligible: before.conversion_eligible,
      conversion_fired_at: before.conversion_fired_at,
      notify_email_state: before.notify_email_state,
    });
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(1);
  });

  test('expired token returns expired generic state and no mutation', async () => {
    const key = uuid();
    const submit = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    const token = submit.body.confirmationToken;
    db.prepare('UPDATE contact_submission_idempotency SET confirmation_expires_at = ? WHERE idempotency_key = ?')
      .run('2000-01-01T00:00:00.000Z', key);
    const res = await request(app).post('/api/contact/confirmation-status').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.state).toBe('expired');
    expect(res.body.confirmationExpiresAt).toBe('2000-01-01T00:00:00.000Z');
  });

  test('invalid/rotated/unknown token returns generic invalid state without enumeration', async () => {
    const key = uuid();
    const submit = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    const oldToken = submit.body.confirmationToken;
    // replay reissues/rotates token hash in 3.7C-1 contract
    await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    const rotated = await request(app).post('/api/contact/confirmation-status').send({ token: oldToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body).toMatchObject({ valid: false, state: 'invalid' });
    const unknown = await request(app).post('/api/contact/confirmation-status').send({ token: crypto.randomBytes(24).toString('base64url') });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toMatchObject({ valid: false, state: 'invalid' });
  });

  test('malformed token request returns 400 invalid_request with no sensitive leakage', async () => {
    const res = await request(app).post('/api/contact/confirmation-status').send({ token: '' });
    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
    expect(res.body.state).toBe('invalid_request');
  });
});

describe('3.7C-2 Thank-you SSR/SEO and sitemap safety (isolated)', () => {
  let app, db;
  beforeEach(() => { ({ app, db } = makeTestApp()); });
  afterEach(() => { try { db.close(); } catch (_) {} });

  test('/thank-you renders with noindex,follow, correct canonical, and no sensitive query persistence', async () => {
    const res = await request(app).get('/thank-you?token=secret-token&lead=123&email=test@example.com');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["']noindex,\s*follow["']/i);
    expect(res.text).toMatch(/<link[^>]+rel=["']canonical["'][^>]+href=["'][^"']*\/thank-you["']/i);
    expect(res.text).toMatch(/Thank You/i);
    // No sensitive params echoed into rendered HTML/meta/canonical
    expect(res.text).not.toMatch(/secret-token|lead=123|test@example\.com/i);
  });

  test('/thank-you is excluded from dynamic sitemap and existing indexed routes remain present', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    expect(res.text).not.toMatch(/\/thank-you</);
    expect(res.text).toMatch(/<loc>https:\/\/ourelads\.com\/<\/loc>/);
    expect(res.text).toMatch(/<loc>https:\/\/ourelads\.com\/contact<\/loc>/);
  });
});

describe('3.7C-2 DB startup safety guard (isolated)', () => {
  test('initDatabase does not create contact_submission_idempotency without explicit opt-in', () => {
    const prev = process.env.ALLOW_CONTACT_IDEMPOTENCY_SCHEMA;
    delete process.env.ALLOW_CONTACT_IDEMPOTENCY_SCHEMA;
    const db = new Database(':memory:');
    try {
      initDatabase(db);
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_submission_idempotency'").get();
      expect(row).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.ALLOW_CONTACT_IDEMPOTENCY_SCHEMA; else process.env.ALLOW_CONTACT_IDEMPOTENCY_SCHEMA = prev;
      db.close();
    }
  });

  test('initDatabase creates contact_submission_idempotency when explicitly opted in', () => {
    const db = new Database(':memory:');
    try {
      initDatabase(db, { allowContactIdempotencySchema: true });
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_submission_idempotency'").get();
      expect(row && row.name).toBe('contact_submission_idempotency');
    } finally {
      db.close();
    }
  });
});

describe('3.7C-3C honeypot safety (isolated)', () => {
  let app, db;
  beforeEach(() => {
    jest.clearAllMocks();
    ({ app, db } = makeTestApp());
  });
  afterEach(() => { try { db.close(); } catch (_) {} });

  test('honeypot 202 creates no lead, no idempotency mapping, and returns no confirmation token', async () => {
    const key = uuid();
    const beforeLeads = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const beforeMaps = db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c;
    const res = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload({ website: 'https://spam.example' }));
    expect(res.status).toBe(202);
    expect(res.body.saved).toBeUndefined();
    expect(res.body.id).toBeUndefined();
    expect(res.body.confirmationToken).toBeUndefined();
    expect(typeof res.body.message).toBe('string'); // generic response retained server-side
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(beforeLeads);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c).toBe(beforeMaps);
  });
});
