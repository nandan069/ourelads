/**
 * OUREL ADS — Auth Routes
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'ourelads-default-secret-key-change-in-prod';

function authRoutes(db) {
  const router = express.Router();

  // POST /api/auth/login
  router.post('/login', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

      const user = db.prepare(`SELECT u.*, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = ? OR u.email = ?`).get(username, username);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      if (!user.is_active) return res.status(403).json({ error: 'Account disabled' });
      if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });

      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email, role: user.role, full_name: user.full_name },
        JWT_SECRET,
        { expiresIn: process.env.SESSION_EXPIRY || '24h' }
      );

      logActivity(db, user.id, 'login', 'user', user.id, null, req.ip);
      res.json({ token, user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role } });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/auth/me
  router.get('/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, username, email, full_name, role_id, last_login FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const role = db.prepare('SELECT name FROM roles WHERE id = ?').get(user.role_id);
    res.json({ ...user, role: role?.name });
  });

  // PUT /api/auth/password
  router.put('/password', authMiddleware, (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password_hash)) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, req.user.id);
    logActivity(db, req.user.id, 'password_changed', 'user', req.user.id, null, req.ip);
    res.json({ message: 'Password updated' });
  });

  // GET /api/auth/users (admin only)
  router.get('/users', authMiddleware, requireRole('super_admin', 'admin'), (req, res) => {
    const users = db.prepare('SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.last_login, u.created_at, r.name as role FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.id').all();
    res.json(users);
  });

  // POST /api/auth/users
  router.post('/users', authMiddleware, requireRole('super_admin'), (req, res) => {
    try {
      const { username, email, password, full_name, role_id } = req.body;
      if (!username || !email || !password) return res.status(400).json({ error: 'Required fields missing' });

      const hash = bcrypt.hashSync(password, 12);
      const result = db.prepare('INSERT INTO users (username, email, password_hash, full_name, role_id) VALUES (?, ?, ?, ?, ?)').run(username, email, hash, full_name, role_id || 3);
      logActivity(db, req.user.id, 'created', 'user', result.lastInsertRowid, `Created user: ${username}`, req.ip);
      res.status(201).json({ id: result.lastInsertRowid, message: 'User created' });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username or email already exists' });
      res.status(500).json({ error: 'Server error' });
    }
  });

  // PUT /api/auth/users/:id
  router.put('/users/:id', authMiddleware, requireRole('super_admin'), (req, res) => {
    const { full_name, email, role_id, is_active } = req.body;
    db.prepare('UPDATE users SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), role_id = COALESCE(?, role_id), is_active = COALESCE(?, is_active), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(full_name, email, role_id, is_active, req.params.id);
    logActivity(db, req.user.id, 'updated', 'user', req.params.id, null, req.ip);
    res.json({ message: 'User updated' });
  });

  // GET /api/auth/roles
  router.get('/roles', authMiddleware, (req, res) => {
    res.json(db.prepare('SELECT * FROM roles').all());
  });

  return router;
}

module.exports = authRoutes;
