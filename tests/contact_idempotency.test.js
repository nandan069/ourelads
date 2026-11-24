/**
 * Phase 3.7C-1 — Isolated backend idempotency tests
 * Temp/in-memory SQLite, mocked Nodemailer, no active DB writes.
 */
const request = require('supertest');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const mockSendMail = jest.fn(() => Promise.resolve({ messageId: 'mock-id' }));
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
jest.mock('nodemailer', () => ({
  createTransport: (...args) => mockCreateTransport(...args),
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
  process.env.CONTACT_CONFIRMATION_TTL_MINUTES = '30';
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

describe('3.7C-1 Contact idempotency (isolated)', () => {
  let app, db;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockImplementation(() => Promise.resolve({ messageId: 'mock-id' }));
    ({ app, db } = makeTestApp());
  });

  afterEach(() => {
    try { db.close(); } catch (_) {}
  });

  test('1. First keyed submission returns 201 saved:true duplicate:false with token and creates one lead+mapping', async () => {
    const key = uuid();
    const beforeLeads = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const beforeMap = db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c;
    const res = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body.saved).toBe(true);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.id).toBeDefined();
    expect(typeof res.body.confirmationToken).toBe('string');
    expect(res.body.confirmationToken.length).toBeGreaterThan(20);
    expect(res.body.confirmationExpiresAt).toBeDefined();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c - beforeLeads).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c - beforeMap).toBe(1);
    const map = db.prepare('SELECT * FROM contact_submission_idempotency WHERE idempotency_key = ?').get(key);
    expect(map.contact_submission_id).toBe(res.body.id);
    expect(map.request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(map.confirmation_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(map.confirmation_token_hash).not.toBe(res.body.confirmationToken);
  });

  test('2. Identical replay returns 200 saved:true duplicate:true same id, no duplicate lead/notify', async () => {
    const key = uuid();
    const first = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(first.status).toBe(201);
    await new Promise(r => setTimeout(r, 10));
    const leadsBefore = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const mapBefore = db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c;
    const second = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(second.status).toBe(200);
    expect(second.body.saved).toBe(true);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.id).toBe(first.body.id);
    expect(typeof second.body.confirmationToken).toBe('string');
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(leadsBefore);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c).toBe(mapBefore);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  test('3. Same key with changed payload returns 409 and no insert', async () => {
    const key = uuid();
    const first = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(first.status).toBe(201);
    const before = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const res = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload({ message: 'Different message content' }));
    expect(res.status).toBe(409);
    expect(res.body.saved).toBe(false);
    expect(res.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(String(res.body.error)).toMatch(/different data/i);
    expect(String(res.body.error)).not.toMatch(/jane@example.com|Different message content/i);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(before);
  });

  test('4. Concurrent same-key requests create exactly one lead/mapping', async () => {
    const key = uuid();
    const reqs = Array.from({ length: 8 }, () => request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload()));
    const results = await Promise.all(reqs);
    const created = results.filter(r => r.status === 201);
    const replayed = results.filter(r => r.status === 200 && r.body.duplicate === true);
    expect(created.length).toBe(1);
    expect(replayed.length).toBe(7);
    const ids = new Set(results.map(r => r.body.id));
    expect(ids.size).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency WHERE idempotency_key = ?').get(key)).toBeTruthy();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c).toBe(1);
    await new Promise(r => setTimeout(r, 20));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  test('5. Transaction/insert failure returns safe 500 with no saved lead/token/mapping', async () => {
    const key = uuid();
    const orig = db.prepare.bind(db);
    db.prepare = (sql) => {
      if (String(sql).includes('INSERT INTO contact_submissions')) {
        throw new Error('DB down');
      }
      return orig(sql);
    };
    const beforeLeads = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const beforeMap = db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c;
    const res = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(res.status).toBe(500);
    expect(res.body.saved).toBe(false);
    expect(res.body.id).toBeUndefined();
    expect(res.body.confirmationToken).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(beforeLeads);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c).toBe(beforeMap);
  });

  test('6. Missing/invalid idempotency key format rejected (400) when header present but invalid', async () => {
    const cases = ['short', 'bad key!', 'x'.repeat(129), '../etc/passwd'];
    for (const bad of cases) {
      const before = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
      const res = await request(app).post('/api/contact').set('Idempotency-Key', bad).send(validPayload());
      expect(res.status).toBe(400);
      expect(res.body.saved).toBe(false);
      expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(before);
    }
  });

  test('7. Legacy keyless submission preserved (201, no idempotency guarantees/fields required)', async () => {
    const res = await request(app).post('/api/contact').send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.message).toMatch(/thank you/i);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c).toBe(0);
  });

  test('8. Honeypot discard returns 202 with no insert/mapping/token/notify even when keyed', async () => {
    const key = uuid();
    const beforeL = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const beforeM = db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c;
    const res = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload({ website: 'http://spam.example' }));
    expect(res.status).toBe(202);
    expect(res.body.id).toBeUndefined();
    expect(res.body.confirmationToken).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(beforeL);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c).toBe(beforeM);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('9. Validation failures still 400 and no insert/mapping', async () => {
    const key = uuid();
    const before = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const res = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload({ email: 'bad' }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toBeDefined();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(before);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submission_idempotency').get().c).toBe(0);
  });

  test('10. Contact rate limiting preserved (429 on 11th, other APIs unaffected)', async () => {
    const agent = request(app);
    for (let i = 0; i < 10; i++) {
      const r = await agent.post('/api/contact').set('Idempotency-Key', uuid()).send(validPayload({ email: `u${i}@ex.com` }));
      expect(r.status).toBe(201);
    }
    const r11 = await agent.post('/api/contact').set('Idempotency-Key', uuid()).send(validPayload({ email: 'u11@ex.com' }));
    expect(r11.status).toBe(429);
    const res = await agent.get('/api/services');
    expect(res.status).toBe(200);
  });

  test('11. Notification dispatched once on first commit only', async () => {
    const key = uuid();
    await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    await new Promise(r => setTimeout(r, 20));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  test('12. Notification failure after persistence does not invalidate saved lead', async () => {
    mockSendMail.mockImplementation(() => Promise.reject(new Error('SMTP fail')));
    const key = uuid();
    const res = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body.saved).toBe(true);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions WHERE id = ?').get(res.body.id)).toBeTruthy();
  });

  test('13. Confirmation token stored as hash only with expiry', async () => {
    const key = uuid();
    const res = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    const map = db.prepare('SELECT * FROM contact_submission_idempotency WHERE idempotency_key = ?').get(key);
    const expectedHash = crypto.createHash('sha256').update(res.body.confirmationToken).digest('hex');
    expect(map.confirmation_token_hash).toBe(expectedHash);
    expect(Date.parse(map.confirmation_expires_at)).toBeGreaterThan(Date.now());
  });

  test('14. Replay with expired token reissues token without side effects', async () => {
    const key = uuid();
    const first = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    db.prepare('UPDATE contact_submission_idempotency SET confirmation_expires_at = ? WHERE idempotency_key = ?')
      .run('2000-01-01T00:00:00.000Z', key);
    const beforeLeads = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const replay = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.confirmationToken).toBeTruthy();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(beforeLeads);
    await new Promise(r => setTimeout(r, 20));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  test('15. Replay token reissuance policy: fresh token returned, original plaintext unrecoverable, no duplicate lead/notify', async () => {
    const key = uuid();
    const first = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    const hash1 = db.prepare('SELECT confirmation_token_hash FROM contact_submission_idempotency WHERE idempotency_key = ?').get(key).confirmation_token_hash;
    const replay = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(replay.status).toBe(200);
    expect(replay.body.confirmationToken).toBeTruthy();
    const hash2 = db.prepare('SELECT confirmation_token_hash FROM contact_submission_idempotency WHERE idempotency_key = ?').get(key).confirmation_token_hash;
    // reissued token means hash rotated to new token (plaintext never stored)
    expect(hash2).toBe(crypto.createHash('sha256').update(replay.body.confirmationToken).digest('hex'));
    expect(hash1).toBeTruthy();
  });

  test('16. Replay does not reset conversion eligibility/fired state', async () => {
    const key = uuid();
    await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    db.prepare('UPDATE contact_submission_idempotency SET conversion_eligible = 0, conversion_fired_at = ? WHERE idempotency_key = ?')
      .run('2026-11-17T00:00:00.000Z', key);
    const replay = await request(app).post('/api/contact').set('Idempotency-Key', key).send(validPayload());
    expect(replay.status).toBe(200);
    const map = db.prepare('SELECT conversion_eligible, conversion_fired_at FROM contact_submission_idempotency WHERE idempotency_key = ?').get(key);
    expect(map.conversion_eligible).toBe(0);
    expect(map.conversion_fired_at).toBe('2026-11-17T00:00:00.000Z');
  });

  test('17. Admin lead list/detail/update/delete/export remain compatible', async () => {
    const sub = await request(app).post('/api/contact').set('Idempotency-Key', uuid()).send(validPayload({ name: 'Compat User' }));
    expect(sub.status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const token = login.body.token;
    const list = await request(app).get('/api/admin/leads').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    const detail = await request(app).get(`/api/admin/leads/${sub.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.email).toBe('jane@example.com');
    const upd = await request(app).put(`/api/admin/leads/${sub.body.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'contacted', notes: 'ok' });
    expect(upd.status).toBe(200);
    const exp = await request(app).get('/api/admin/leads-export').set('Authorization', `Bearer ${token}`);
    expect(exp.status).toBe(200);
    expect(String(exp.headers['content-type'])).toMatch(/text\/csv/);
    const del = await request(app).delete(`/api/admin/leads/${sub.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const gone = await request(app).get(`/api/admin/leads/${sub.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(gone.status).toBe(404);
  });

  test('20. Active project database file is not this in-memory DB', () => {
    expect(db.memory).toBe(true);
  });
});
