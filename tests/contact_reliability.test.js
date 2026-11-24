/**
 * Phase 3.7B — Contact form reliability & security (isolated, temp SQLite, mocked email)
 * No real emails, no active DB writes, no WhatsApp/Ads.
 */
const request = require('supertest');
const Database = require('better-sqlite3');

// Mock nodemailer before loading routes that lazy-require it
const mockSendMail = jest.fn(() => Promise.resolve({ messageId: 'mock-id' }));
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
jest.mock('nodemailer', () => ({
  createTransport: (...args) => mockCreateTransport(...args),
}));

const { initDatabase, seedDatabase } = require('../server/database/init');
const { createApp } = require('../server/server');

function makeTestApp(dbOverrides) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initDatabase(db, { allowContactIdempotencySchema: true });
  seedDatabase(db);
  // Ensure predictable env for notification path (no real SMTP used due to mock)
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'noreply@test.local';
  process.env.SMTP_PASSWORD = 'test-pass';
  process.env.NOTIFY_EMAIL = 'notify@test.local';
  process.env.NODE_ENV = 'test';
  const { app } = createApp(db);
  return { app, db };
}

const validPayload = (overrides = {}) => ({
  name: 'Jane Doe',
  email: 'jane@example.com',
  message: 'Hello, I would like to discuss a project.',
  company: 'Acme Co',
  phone: '+91 98765 43210',
  service: 'brand-film',
  budget: '1-5l',
  website: '', // honeypot empty
  ...overrides,
});

describe('3.7B Contact reliability & security', () => {
  let app, db;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockImplementation(() => Promise.resolve({ messageId: 'mock-id' }));
    ({ app, db } = makeTestApp());
  });

  afterEach(() => {
    try { db.close(); } catch (_) {}
  });

  test('1. Valid submission returns 201 and creates exactly one lead', async () => {
    const before = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const res = await request(app).post('/api/contact').send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.message).toMatch(/thank you/i);
    const after = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    expect(after - before).toBe(1);
    const row = db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(res.body.id);
    expect(row.name).toBe('Jane Doe');
    expect(row.email).toBe('jane@example.com');
    expect(row.service).toBe('brand-film');
  });

  test('2. Missing name rejected', async () => {
    const before = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const res = await request(app).post('/api/contact').send(validPayload({ name: '' }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors && res.body.fieldErrors.name).toBeDefined();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(before);
  });

  test('3. Missing email rejected', async () => {
    const res = await request(app).post('/api/contact').send(validPayload({ email: '' }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.email).toBeDefined();
  });

  test('4. Missing message rejected', async () => {
    const res = await request(app).post('/api/contact').send(validPayload({ message: '' }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.message).toBeDefined();
  });

  test('5. Invalid email rejected', async () => {
    const res = await request(app).post('/api/contact').send(validPayload({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.email).toMatch(/valid email/i);
  });

  test('6. Oversized fields rejected', async () => {
    const big = 'a'.repeat(5001);
    const res = await request(app).post('/api/contact').send(validPayload({ message: big }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.message).toMatch(/5000/);
    const res2 = await request(app).post('/api/contact').send(validPayload({ name: 'a'.repeat(121) }));
    expect(res2.status).toBe(400);
    expect(res2.body.fieldErrors.name).toMatch(/120/);
  });

  test('7. Invalid service/budget values rejected', async () => {
    const res = await request(app).post('/api/contact').send(validPayload({ service: 'hacking' }));
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.service).toBeDefined();
    const res2 = await request(app).post('/api/contact').send(validPayload({ budget: '$$$' }));
    expect(res2.status).toBe(400);
    expect(res2.body.fieldErrors.budget).toBeDefined();
  });

  test('8. Optional fields remain optional', async () => {
    const before = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const res = await request(app).post('/api/contact').send({
      name: 'Solo', email: 'solo@example.com', message: 'Hi', website: ''
    });
    expect(res.status).toBe(201);
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(before + 1);
    const row = db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(res.body.id);
    expect(row.company == null || row.company === null || row.company === '').toBeTruthy();
  });

  test('9. Contact-specific rate limiting works (10/hour)', async () => {
    const agent = request(app);
    for (let i = 0; i < 10; i++) {
      const r = await agent.post('/api/contact').send(validPayload({ email: `u${i}@ex.com` }));
      expect([201, 429]).toContain(r.status);
      if (r.status === 429) throw new Error('Hit limit too early at ' + i);
    }
    const r11 = await agent.post('/api/contact').send(validPayload({ email: 'u11@ex.com' }));
    expect(r11.status).toBe(429);
    expect(r11.body.error).toMatch(/too many submissions/i);
  });

  test('10. Other public API routes remain unaffected by contact limiter exhaustion', async () => {
    const agent = request(app);
    for (let i = 0; i < 11; i++) {
      await agent.post('/api/contact').send(validPayload({ email: `x${i}@ex.com` }));
    }
    const res = await agent.get('/api/services');
    expect(res.status).toBe(200);
  });

  test('11. Honeypot submissions are not persisted', async () => {
    const before = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const res = await request(app).post('/api/contact').send(validPayload({ website: 'http://spam.example' }));
    expect([200, 202]).toContain(res.status);
    expect(res.body.id).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(before);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('12. Invalid JSON produces a safe response', async () => {
    const res = await request(app)
      .post('/api/contact')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect([400, 500]).toContain(res.status);
    expect(String(res.body.error || '')).not.toMatch(/SyntaxError|stack/i);
  });

  test('13. Database failure does not produce confirmed success', async () => {
    const orig = db.prepare.bind(db);
    db.prepare = (sql) => {
      if (String(sql).includes('INSERT INTO contact_submissions')) {
        throw new Error('DB down');
      }
      return orig(sql);
    };
    const res = await request(app).post('/api/contact').send(validPayload());
    expect(res.status).toBe(500);
    expect(res.body.id).toBeUndefined();
  });

  test('14. Email failure does not invalidate a saved lead', async () => {
    mockSendMail.mockImplementation(() => Promise.reject(new Error('SMTP fail')));
    const before = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const res = await request(app).post('/api/contact').send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c).toBe(before + 1);
  });

  test('18. Existing admin leads list/detail/export remain compatible', async () => {
    const sub = await request(app).post('/api/contact').send(validPayload({ name: 'Compat User' }));
    expect(sub.status).toBe(201);
    // login
    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(login.status).toBe(200);
    const token = login.body.token;
    const list = await request(app).get('/api/admin/leads').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    const detail = await request(app).get(`/api/admin/leads/${sub.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.email).toBe('jane@example.com');
    const exp = await request(app).get('/api/admin/leads-export').set('Authorization', `Bearer ${token}`);
    expect(exp.status).toBe(200);
    expect(String(exp.headers['content-type'])).toMatch(/text\/csv/);
    expect(exp.text).toMatch(/Compat User|jane@example.com/);
  });

  test('19-20. No real emails sent (mocked) and no active DB writes', async () => {
    // transport/sendMail are jest mocks; no network/provider calls
    await request(app).post('/api/contact').send(validPayload());
    expect(mockCreateTransport).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    // all operations on :memory: DB
    expect(db.memory).toBe(true);
  });
});
