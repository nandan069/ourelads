/**
 * OUREL ADS — Route Tests
 */
const request = require('supertest');
const express = require('express');
const { initDatabase, seedDatabase } = require('../server/database/init');
const publicRoutes = require('../server/routes/public');
const authRoutes = require('../server/routes/auth');
const adminRoutes = require('../server/routes/admin');
const { authMiddleware, requireRole } = require('../server/middleware/auth');
const Database = require('better-sqlite3');

// Create test app with in-memory database
function createTestApp() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initDatabase(db);
  seedDatabase(db);

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mock CSRF for tests
  app.use((req, res, next) => {
    req.csrfToken = () => 'test-csrf-token';
    res.locals.csrfToken = 'test-csrf-token';
    next();
  });

  // Mount routes
  app.use('/api', publicRoutes(db));
  app.use('/api/auth', authRoutes(db));
  app.use('/api/admin', authMiddleware, adminRoutes(db));

  return { app, db };
}

describe('Public API Endpoints', () => {
  let app, db;

  beforeAll(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
  });

  afterAll(() => {
    db.close();
  });

  test('GET /api/clients returns array', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/services returns array', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/projects returns array', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/blog returns paginated results', async () => {
    const res = await request(app).get('/api/blog');
    expect(res.status).toBe(200);
    expect(res.body.posts).toBeDefined();
    expect(res.body.total).toBeDefined();
    expect(res.body.page).toBeDefined();
    expect(res.body.totalPages).toBeDefined();
  });

  test('GET /api/settings returns object', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
    expect(res.body.site_name).toBe('Ourel Ads');
  });

  test('GET /api/reels returns array', async () => {
    const res = await request(app).get('/api/reels');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/testimonials returns array', async () => {
    const res = await request(app).get('/api/testimonials');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/team returns array', async () => {
    const res = await request(app).get('/api/team');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/stats returns array', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/cases returns array', async () => {
    const res = await request(app).get('/api/cases');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/homepage returns content object', async () => {
    const res = await request(app).get('/api/homepage');
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});

describe('Auth Endpoints', () => {
  let app, db;

  beforeAll(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
  });

  afterAll(() => {
    db.close();
  });

  test('POST /api/auth/login with valid credentials returns token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.username).toBe('admin');
  });

  test('POST /api/auth/login with invalid credentials returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'invalid', password: 'invalid' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('POST /api/auth/login with missing fields returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Username and password required');
  });

  test('GET /api/auth/me with valid token returns user', async () => {
    // First login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
  });

  test('GET /api/auth/me without token returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });
});

describe('Contact Form', () => {
  let app, db;

  beforeAll(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
  });

  afterAll(() => {
    db.close();
  });

  test('POST /api/contact with valid data returns 201', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        message: 'Test message',
      });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Thank you! We will be in touch shortly.');
    expect(res.body.id).toBeDefined();
  });

  test('POST /api/contact with missing fields returns 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({ name: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name, email, and message are required');
  });

  test('POST /api/contact with invalid email returns 400', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Test User',
        email: 'invalid-email',
        message: 'Test message',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid email address');
  });
});

describe('Admin Endpoints (with auth)', () => {
  let app, db, adminToken;

  beforeAll(async () => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;

    // Login as admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;
  });

  afterAll(() => {
    db.close();
  });

  test('GET /api/admin/dashboard with admin token returns stats', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.leads).toBeDefined();
    expect(res.body.content).toBeDefined();
    expect(res.body.recentActivity).toBeDefined();
  });

  test('GET /api/admin/dashboard without token returns 401', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/clients with admin token returns list', async () => {
    const res = await request(app)
      .get('/api/admin/clients')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('POST, PUT, and DELETE /api/admin/clients creates, updates, and deletes', async () => {
    // Create
    const createRes = await request(app)
      .post('/api/admin/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Jest Test Brand', logo: '/assets/test.jpeg', is_active: 1 });
    expect(createRes.status).toBe(201);
    const clientId = createRes.body.id;
    expect(clientId).toBeDefined();

    // Update
    const updateRes = await request(app)
      .put(`/api/admin/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Jest Test Brand Updated' });
    expect(updateRes.status).toBe(200);

    // Verify
    const getRes = await request(app)
      .get(`/api/admin/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe('Jest Test Brand Updated');

    // Delete
    const delRes = await request(app)
      .delete(`/api/admin/clients/${clientId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
  });

  test('GET /api/admin/leads-export returns CSV', async () => {
    const res = await request(app)
      .get('/api/admin/leads-export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  test('GET /api/admin/dashboard with query token works', async () => {
    const res = await request(app)
      .get(`/api/admin/dashboard?token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.leads).toBeDefined();
  });

  test('POST /api/admin/cases auto-generates title if omitted', async () => {
    const res = await request(app)
      .post('/api/admin/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ brand: 'Acme Brand', campaign: 'Viral Campaign' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();

    const getRes = await request(app)
      .get(`/api/admin/cases/${res.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toContain('Acme Brand');
    expect(getRes.body.slug).toBeDefined();

    // Clean up
    await request(app)
      .delete(`/api/admin/cases/${res.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });

  test('POST /api/admin/projects creates project with brand and auto-generated slug', async () => {
    const res = await request(app)
      .post('/api/admin/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New Launch', brand: 'SuperBrand', description: 'Desc' });
    expect(res.status).toBe(201);

    const getRes = await request(app)
      .get(`/api/admin/projects/${res.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.brand).toBe('SuperBrand');
    expect(getRes.body.slug).toBe('new-launch');

    // Clean up
    await request(app)
      .delete(`/api/admin/projects/${res.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });
});

describe('Database', () => {
  let db;

  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDatabase(db);
    seedDatabase(db);
  });

  afterAll(() => {
    db.close();
  });

  test('Database tables exist', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('roles');
    expect(tableNames).toContain('clients');
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('services');
    expect(tableNames).toContain('blog_posts');
    expect(tableNames).toContain('contact_submissions');
  });

  test('Seed data inserted', () => {
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const clientCount = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
    const serviceCount = db.prepare('SELECT COUNT(*) as c FROM services').get().c;
    
    expect(userCount).toBeGreaterThan(0);
    expect(clientCount).toBe(14);
    expect(serviceCount).toBe(8);
  });

  test('Roles seeded correctly', () => {
    const roles = db.prepare('SELECT name FROM roles ORDER BY id').all();
    const roleNames = roles.map(r => r.name);
    expect(roleNames).toEqual(['super_admin', 'admin', 'editor', 'viewer']);
  });
});