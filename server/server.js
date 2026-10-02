/**
 * OUREL ADS — Express Server
 * Serves existing static website + API + Admin Panel
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initDatabase, seedDatabase } = require('./database/init');
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── DATABASE ───
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database', 'ourelads.db');
const db = initDatabase(dbPath);
seedDatabase(db);

// ─── SECURITY ───
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());

// ─── RATE LIMITING ───
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts. Try again later.' },
});
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions. Try again later.' },
});

// ─── BODY PARSING ───
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// ─── PAGE ANALYTICS TRACKING MIDDLEWARE ───
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/admin")) {
    const isStaticAsset = req.path.match(/\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|map|json)$/i) || req.path.startsWith("/uploads");
    if (!isStaticAsset) {
      try {
        const cleanPath = (req.path === "/" || req.path === "") ? "/index.html" : req.path;
        const ip = req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0].trim() : (req.ip || "");
        db.prepare("INSERT INTO page_analytics (page_path, ip_address, user_agent) VALUES (?, ?, ?)").run(
          cleanPath,
          ip,
          req.headers["user-agent"] || ""
        );
      } catch (e) {}
    }
  }
  next();
});

// ─── CLEAN URL REDIRECTS & STATIC FILES ───
app.get('/index.html', (req, res) => {
  res.redirect(301, '/');
});

app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.endsWith('.html') && !req.path.startsWith('/api') && !req.path.startsWith('/admin') && req.path !== '/404.html') {
    const cleanPath = req.path.slice(0, -5);
    return res.redirect(301, cleanPath === '/index' ? '/' : cleanPath);
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1d', extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads'), { maxAge: '7d' }));

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Database health check failed' });
  }
});

// ─── API ROUTES ───
app.use('/api/auth', authLimiter, authRoutes(db));
app.use('/api', apiLimiter, publicRoutes(db));
app.use('/api/admin', apiLimiter, adminRoutes(db));

// ─── ADMIN PANEL ───
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.get(/^\/admin($|\/.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

// ─── DYNAMIC INSIGHT PAGES (Clean URLs & legacy support) ───
app.get(['/insight-:slug', '/insight-:slug.html'], (req, res) => {
  const filePath = path.join(__dirname, '..', 'public', `insight-${req.params.slug}.html`);
  const fs = require('fs');
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  // Fall back to the insights template
  res.sendFile(path.join(__dirname, '..', 'public', 'insights.html'));
});

// ─── 404 ───
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

// ─── ERROR HANDLER ───
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ───
const server = app.listen(PORT, () => {
  console.log(`\n  ╔═══════════════════════════════════════════╗`);
  console.log(`  ║   OUREL ADS — CMS Server                  ║`);
  console.log(`  ║                                           ║`);
  console.log(`  ║   Website: http://localhost:${PORT}          ║`);
  console.log(`  ║   Admin:   http://localhost:${PORT}/admin    ║`);
  console.log(`  ║   API:     http://localhost:${PORT}/api      ║`);
  console.log(`  ║                                           ║`);
  console.log(`  ║   Default Login:                          ║`);
  console.log(`  ║   Username: admin                         ║`);
  console.log(`  ║   Password: admin123                      ║`);
  console.log(`  ╚═══════════════════════════════════════════╝\n`);
});

// ─── GRACEFUL SHUTDOWN & PROCESS HARDENING ───
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Gracefully closing HTTP server & SQLite connection...`);
  server.close(() => {
    try {
      db.close();
      console.log('Database connection closed cleanly.');
    } catch (e) {
      console.error('Error closing database:', e.message);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
});

module.exports = app;
