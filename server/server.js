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

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    logger.error('FATAL: JWT_SECRET must be set to a secure random string (min 32 chars)');
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }

  // ─── DATABASE ───
  const db = testDb || initDatabase(process.env.DATABASE_PATH || path.join(__dirname, 'database', 'ourelads.db'));
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
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://www.google-analytics.com", "https://www.googletagmanager.com"],
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

app.use((req, res, next) => {
  // Exempt login endpoint from CSRF (needed before user has token)
  if (req.path === '/api/auth/login') return next();
  if (req.path.startsWith('/api/admin') || req.path.startsWith('/api/auth')) {
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
  message: { error: 'Too many submissions. Try again later.' },
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
app.use('/api', apiLimiter, publicRoutes(db));
app.use('/api/admin', adminLimiter, adminRoutes(db));

// ─── CSRF TOKEN ENDPOINT ───
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken?.() });
});

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
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
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
