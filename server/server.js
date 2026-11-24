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
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const { initDatabase, seedDatabase } = require('./database/init');
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { logger } = require('./utils/logger');

function createApp(testDb = null) {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.set('trust proxy', 1);

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    logger.error('FATAL: JWT_SECRET must be set to a secure random string (min 32 chars)');
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }

  // ─── DATABASE ───
  // Idempotency schema is additive and requires explicit opt-in to prevent accidental active-DB migration.
  // Tests/disposable environments must opt in via allowContactIdempotencySchema env/option on init.
  const db = testDb || initDatabase(process.env.DATABASE_PATH || path.join(__dirname, 'database', 'ourelads.db'), {
    allowContactIdempotencySchema: process.env.ALLOW_CONTACT_IDEMPOTENCY_SCHEMA === '1',
  });
  if (!testDb) seedDatabase(db);

app.use(cookieParser());

// ─── REQUEST LOGGING ───
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http('HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });
  next();
});

// ─── SECURITY HEADERS ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://www.google-analytics.com", "https://www.googletagmanager.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://www.google-analytics.com", "https://region1.google-analytics.com"],
      frameSrc: ["https://www.google.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

// ─── CSRF PROTECTION ───
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  },
});

// Apply CSRF only to admin panel form submissions (not API)
// API endpoints use JWT auth which is sufficient
app.use((req, res, next) => {
  // Exempt API routes from CSRF
  if (req.path.startsWith('/api/')) return next();
  // Apply CSRF to admin panel HTML routes
  if (req.path.startsWith('/admin')) {
    return csrfProtection(req, res, next);
  }
  next();
});

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken?.();
  next();
});

  // ─── RATE LIMITING ───
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many login attempts. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Too many submissions. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  const contactConfirmationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { valid: false, state: 'unavailable', error: 'Too many confirmation checks. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many admin requests. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
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
        const cleanPath = (req.path === "" || req.path === "/index.html") ? "/" : req.path;
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
const { renderPage, PAGE_CONFIG, renderSitemapXml, renderRobotsTxt } = require('./utils/seoRenderer');

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

// Server-rendered SEO for known public pages (initial HTML response contains metadata)
const seoPagePaths = new Set(Object.keys(PAGE_CONFIG));
app.get(Array.from(seoPagePaths), (req, res, next) => {
  try {
    const routePath = req.path.length > 1 && req.path.endsWith('/') ? req.path.slice(0, -1) : req.path;
    if (!seoPagePaths.has(routePath)) return next();
    const html = renderPage(db, req, routePath);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    logger.error('SEO render error', { path: req.path, error: err.message });
    return next();
  }
});

// ─── PUBLIC BLOG DETAIL (server-rendered, published-only) ───
app.get('/blog/:slug', (req, res, next) => {
  try {
    const rawSlug = String(req.params.slug || '').trim();
    // Strict slug validation to prevent injection/path confusion
    if (!rawSlug || rawSlug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(rawSlug)) {
      const { renderPage: render404 } = require('./utils/seoRenderer');
      const html = render404(db, req, '/__404__', { is404: true });
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }
    // Normalize clean URL (no trailing slash variants)
    if (req.path !== `/blog/${rawSlug}`) {
      return res.redirect(301, `/blog/${rawSlug}`);
    }
    const post = db.prepare('SELECT * FROM blog_posts WHERE slug = ? AND status = ?').get(rawSlug, 'published');
    if (!post) {
      const { renderPage: render404 } = require('./utils/seoRenderer');
      const html = render404(db, req, '/__404__', { is404: true });
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }
    const { renderBlogPost } = require('./utils/seoRenderer');
    const html = renderBlogPost(db, req, post);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    logger.error('Blog detail render error', { slug: req.params.slug, error: err.message });
    return next();
  }
});

// ─── PUBLIC PROJECT DETAIL (server-rendered, published-only) ───
app.get('/work/:slug', (req, res, next) => {
  try {
    const rawSlug = String(req.params.slug || '').trim();
    // Strict lowercase kebab-case slug validation
    if (!rawSlug || rawSlug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug)) {
      const { renderPage: render404 } = require('./utils/seoRenderer');
      const html = render404(db, req, '/__404__', { is404: true });
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }
    // Normalize clean canonical URL (no trailing slash / variant path)
    if (req.path !== `/work/${rawSlug}`) {
      return res.redirect(301, `/work/${rawSlug}`);
    }
    const matches = db.prepare(`
      SELECT p.*, c.name as client_name, c.logo as client_logo
      FROM projects p LEFT JOIN clients c ON p.client_id = c.id
      WHERE lower(p.slug) = lower(?) AND p.status = ?
    `).all(rawSlug, 'published');
    if (matches.length > 1) {
      logger.error('Project slug integrity error: duplicate published slug detected', { slug: rawSlug, count: matches.length });
      const { renderPage: render404 } = require('./utils/seoRenderer');
      const html = render404(db, req, '/__404__', { is404: true });
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }
    const project = matches[0];
    if (!project) {
      const { renderPage: render404 } = require('./utils/seoRenderer');
      const html = render404(db, req, '/__404__', { is404: true });
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(html);
    }
    const { renderProject } = require('./utils/seoRenderer');
    const html = renderProject(db, req, project);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    logger.error('Project detail render error', { slug: req.params.slug, error: err.message });
    return next();
  }
});

// ─── DYNAMIC SITEMAP & ROBOTS (must precede static public files) ───
app.get('/sitemap.xml', (req, res) => {
  try {
    const xml = renderSitemapXml(db, req);
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).send(xml);
  } catch (err) {
    logger.error('Sitemap generation error', { error: err && err.message ? err.message : 'unknown' });
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    return res.status(503).send('<?xml version="1.0" encoding="UTF-8"?>\n<!-- sitemap temporarily unavailable -->\n');
  }
});

app.get('/robots.txt', (req, res) => {
  try {
    const txt = renderRobotsTxt(req);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    return res.status(200).send(txt);
  } catch (err) {
    logger.error('Robots generation error', { error: err && err.message ? err.message : 'unknown' });
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    return res.status(503).send('User-agent: *\nDisallow: /\n');
  }
});

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1d', extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads'), { maxAge: '7d' }));

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    
    const checks = {
      database: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || 'development',
    };
    
    res.json({ status: 'ok', ...checks });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'Database health check failed', timestamp: new Date().toISOString() });
  }
});

app.get('/api/health/ready', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: 'Database not ready' });
  }
});

app.get('/api/health/live', (req, res) => {
  res.json({ alive: true });
});

  // ─── API ROUTES ───
  app.use('/api/auth', authLimiter, authRoutes(db));
  app.use('/api', apiLimiter, publicRoutes(db, { contactLimiter, contactConfirmationLimiter, apiLimiter }));
  app.use('/api/admin', adminLimiter, adminRoutes(db));

// ─── ADMIN PANEL ───
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.get(/^\/admin($|\/.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

// ─── 404 ───
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  try {
    const html = renderPage(db, req, '/__404__', { is404: true });
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(html);
  } catch (err) {
    logger.error('404 render error', { path: req.path, error: err.message });
    return res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
  }
});

  // ─── ERROR HANDLER ───
  app.use((err, req, res, next) => {
    logger.error('Server error', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid request format. Please check your submission and try again.' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, db };
}

// ─── START ───
function startServer() {
  const { app, db } = createApp();
  const PORT = process.env.PORT || 3000;
  
  const server = app.listen(PORT, () => {
    logger.info('Server started', {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      website: `http://localhost:${PORT}`,
      admin: `http://localhost:${PORT}/admin`,
      api: `http://localhost:${PORT}/api`,
    });
  });

  // ─── GRACEFUL SHUTDOWN & PROCESS HARDENING ───
  function gracefulShutdown(signal) {
    logger.info(`[${signal}] Gracefully closing HTTP server & SQLite connection...`);
    server.close(() => {
      try {
        db.close();
        logger.info('Database connection closed cleanly.');
      } catch (e) {
        logger.error('Error closing database', { error: e.message });
      }
      process.exit(0);
    });
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', { reason });
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
