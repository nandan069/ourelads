/**
 * OUREL ADS — Public API Routes (Frontend consumption)
 */
const express = require('express');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getIdempotencyKey(req) {
  const header = req.get('Idempotency-Key') || req.get('idempotency-key');
  if (header == null || header === '') return { key: null };
  if (typeof header !== 'string') return { error: 'Idempotency-Key header must be a valid string.' };
  const key = header.trim();
  if (!key) return { error: 'Idempotency-Key header must be a valid string.' };
  if (key.length > 128) return { error: 'Idempotency-Key is invalid.' };
  // Primary accepted format: UUID v4 (browser crypto.randomUUID). Strict bounded format for other opaque keys.
  if (!(UUID_V4_RE.test(key) || IDEMPOTENCY_KEY_RE.test(key))) {
    return { error: 'Idempotency-Key must be a valid UUID v4 or a 16-128 character URL-safe key.' };
  }
  return { key };
}

function computeContactFingerprint(value) {
  const payload = {
    budget: value.budget || '',
    company: value.company || '',
    email: value.email || '',
    message: value.message || '',
    name: value.name || '',
    phone: value.phone || '',
    service: value.service || '',
    source_page: 'contact'
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

function generateConfirmationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashConfirmationToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function getConfirmationTtlMinutes() {
  const raw = parseInt(process.env.CONTACT_CONFIRMATION_TTL_MINUTES, 10);
  if (Number.isFinite(raw) && raw >= 5 && raw <= 1440) return raw;
  return 30;
}

function confirmationExpiresAtIso(ttlMinutes) {
  return new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
}

function safeNowIso() {
  return new Date().toISOString();
}

function escapeHtmlText(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dispatchLeadNotification({ db, lead, leadId, mappingId }) {
  // Minimal non-blocking dispatch (outside DB transaction). No queue/worker/retries.
  try {
    const nodemailer = require('nodemailer');
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
    const notifyEmail = process.env.NOTIFY_EMAIL;
    const port = parseInt(process.env.SMTP_PORT, 10) || 465;

    const mark = (state, errMsg) => {
      if (!mappingId) return;
      try {
        db.prepare('UPDATE contact_submission_idempotency SET notify_email_state = ?, notify_email_attempted_at = ?, notify_email_sent_at = CASE WHEN ? = \'sent\' THEN ? ELSE notify_email_sent_at END, notify_email_last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(state, safeNowIso(), state, safeNowIso(), errMsg ? String(errMsg).slice(0, 500) : null, mappingId);
      } catch (_) { /* best-effort state update */ }
    };

    if (host && user && pass && notifyEmail) {
      mark('pending', null);
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
      });
      transporter.sendMail({
        from: `"Ourel Ads Website" <${user}>`,
        to: notifyEmail,
        subject: `New Lead Inquiry from ${lead.name}`,
        html: `
          <h2>New Project Lead Received on Ourel Ads</h2>
          <p><strong>Name:</strong> ${escapeHtmlText(lead.name)}</p>
          <p><strong>Email:</strong> <a href="mailto:${escapeHtmlText(lead.email)}">${escapeHtmlText(lead.email)}</a></p>
          <p><strong>Phone:</strong> ${lead.phone ? escapeHtmlText(lead.phone) : 'N/A'}</p>
          <p><strong>Company:</strong> ${lead.company ? escapeHtmlText(lead.company) : 'N/A'}</p>
          <p><strong>Service Needed:</strong> ${lead.service ? escapeHtmlText(lead.service) : 'N/A'}</p>
          <p><strong>Estimated Budget:</strong> ${lead.budget ? escapeHtmlText(lead.budget) : 'N/A'}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="background:#f4f4f4;padding:12px;border-left:4px solid #6B21A8;white-space:pre-wrap">${escapeHtmlText(lead.message)}</blockquote>
          <p><small>Received on ${new Date().toISOString()}</small></p>
        `
      }).then(info => {
        logger.info('Lead mail sent successfully', { messageId: info.messageId, leadId });
        mark('sent', null);
      }).catch(err => {
        logger.error('Lead mail error', { error: err.message, leadId });
        mark('failed', err && err.message ? err.message : 'send failed');
      });
    } else {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('SMTP not configured - lead notification email not sent', { leadId });
      }
      if (mappingId) {
        try {
          db.prepare('UPDATE contact_submission_idempotency SET notify_email_state = ?, notify_email_attempted_at = ?, notify_email_last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('skipped', safeNowIso(), host && user && pass && notifyEmail ? null : 'SMTP not configured', mappingId);
        } catch (_) { /* best-effort */ }
      }
    }
  } catch (e) {
    logger.error('Nodemailer error', { error: e.message, leadId });
    if (mappingId) {
      try {
        db.prepare('UPDATE contact_submission_idempotency SET notify_email_state = ?, notify_email_attempted_at = ?, notify_email_last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run('failed', safeNowIso(), e && e.message ? String(e.message).slice(0, 500) : 'error', mappingId);
      } catch (_) { /* best-effort */ }
    }
  }
}

function hasIdempotencyTable(db) {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_submission_idempotency'").get();
    return !!row;
  } catch (_) {
    return false;
  }
}


function validateConfirmationTokenValue(token) {
  if (token == null) return { error: 'Confirmation token is required.' };
  if (typeof token !== 'string') return { error: 'Confirmation token must be a valid string.' };
  const t = token.trim();
  if (!t) return { error: 'Confirmation token is required.' };
  if (t.length < 20 || t.length > 512 || !/^[A-Za-z0-9_-]+$/.test(t)) {
    return { error: 'Confirmation token is invalid.' };
  }
  return { token: t };
}

function createContactConfirmationStatusHandler(db) {
  return (req, res) => {
    try {
      if (!hasIdempotencyTable(db)) {
        return res.status(200).json({ valid: false, state: 'unavailable' });
      }
      const tokenResult = validateConfirmationTokenValue(req && req.body ? req.body.token : null);
      if (tokenResult.error) {
        return res.status(400).json({ valid: false, state: 'invalid_request', error: tokenResult.error });
      }
      const tokenHash = hashConfirmationToken(tokenResult.token);
      const row = db.prepare('SELECT confirmation_expires_at FROM contact_submission_idempotency WHERE confirmation_token_hash = ?').get(tokenHash);
      if (!row) {
        // Generic/non-enumerating: unknown, rotated, or already-invalidated token
        return res.status(200).json({ valid: false, state: 'invalid' });
      }
      const expiresAt = row.confirmation_expires_at || null;
      const expired = expiresAt ? (Date.parse(expiresAt) <= Date.now()) : true;
      if (expired) {
        return res.status(200).json({ valid: false, state: 'expired', confirmationExpiresAt: expiresAt });
      }
      // Read-only validation only: no lead mutation, no token rotation, no notification, no analytics/conversion side effects.
      return res.status(200).json({ valid: true, state: 'confirmed', confirmationExpiresAt: expiresAt });
    } catch (err) {
      logger.error('Contact confirmation validation error', { error: err && err.message ? err.message : 'unknown' });
      return res.status(200).json({ valid: false, state: 'unavailable' });
    }
  };
}

function publicRoutes(db, options = {}) {
  const router = express.Router();
  const { contactLimiter, contactConfirmationLimiter } = options;

  const CONTACT_SERVICE_VALUES = new Set([
    '', 'brand-film', 'performance', 'micro-drama', 'social', 'motion', 'digital', 'full', 'other'
  ]);
  const CONTACT_BUDGET_VALUES = new Set([
    '', 'under-1l', '1-5l', '5-15l', '15-50l', '50l-plus'
  ]);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^[0-9+()\-\s.]{7,30}$/;

  function normalizeString(value) {
    if (value == null) return '';
    if (typeof value !== 'string') return null;
    return value.trim();
  }

  function normalizeOptional(value) {
    const v = normalizeString(value);
    if (v === null) return null;
    return v === '' ? '' : v;
  }

  function validateContactPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { error: 'Invalid request format. Please check your submission and try again.', fieldErrors: {} };
    }

    const allowedKeys = new Set(['name', 'email', 'phone', 'company', 'service', 'budget', 'message', 'source_page', 'website']);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        // ignore unknown keys for compatibility (e.g. legacy/source extras), but reject dangerous non-string types below per field
      }
    }

    const fieldErrors = {};
    const name = normalizeString(body.name);
    const emailRaw = normalizeString(body.email);
    const message = normalizeString(body.message);
    const company = normalizeOptional(body.company);
    const phone = normalizeOptional(body.phone);
    const service = normalizeOptional(body.service);
    const budget = normalizeOptional(body.budget);
    const website = normalizeString(body.website); // honeypot

    if (name === null) fieldErrors.name = 'Name must be valid text.';
    else if (!name) fieldErrors.name = 'Name is required.';
    else if (name.length > 120) fieldErrors.name = 'Name must be 120 characters or fewer.';

    if (emailRaw === null) fieldErrors.email = 'Email must be valid text.';
    else if (!emailRaw) fieldErrors.email = 'Email is required.';
    else if (emailRaw.length > 254 || !EMAIL_RE.test(emailRaw)) fieldErrors.email = 'Enter a valid email address.';

    if (message === null) fieldErrors.message = 'Message must be valid text.';
    else if (!message) fieldErrors.message = 'Message is required.';
    else if (message.length > 5000) fieldErrors.message = 'Message must be 5000 characters or fewer.';

    if (company === null) fieldErrors.company = 'Company must be valid text.';
    else if (company.length > 120) fieldErrors.company = 'Company must be 120 characters or fewer.';

    if (phone === null) fieldErrors.phone = 'Phone must be valid text.';
    else if (phone && (phone.length > 30 || !PHONE_RE.test(phone))) fieldErrors.phone = 'Enter a valid phone number.';

    if (service === null) fieldErrors.service = 'Service selection is invalid.';
    else if (!CONTACT_SERVICE_VALUES.has(service)) fieldErrors.service = 'Please select a valid service option.';

    if (budget === null) fieldErrors.budget = 'Budget selection is invalid.';
    else if (!CONTACT_BUDGET_VALUES.has(budget)) fieldErrors.budget = 'Please select a valid budget range.';

    if (website === null) {
      // treat malformed honeypot as bot-like; caller will discard
      return { honeypot: true };
    }

    const email = emailRaw ? emailRaw.toLowerCase() : '';

    if (Object.keys(fieldErrors).length) {
      return { error: 'Please correct the highlighted fields and try again.', fieldErrors };
    }

    return {
      value: {
        name,
        email,
        message,
        company: company || '',
        phone: phone || '',
        service: service || '',
        budget: budget || '',
        website: website || ''
      }
    };
  }

  function escapeHtmlText(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── CLIENTS ───
  router.get('/clients', (req, res) => {
    const rows = db.prepare('SELECT * FROM clients WHERE is_active = 1 ORDER BY sort_order').all();
    res.json(rows);
  });

  // ─── PROJECTS ───
  router.get('/projects', (req, res) => {
    const { category, featured, limit } = req.query;
    let sql = 'SELECT p.*, c.name as brand, c.logo as logo FROM projects p LEFT JOIN clients c ON p.client_id = c.id WHERE p.status = ?';
    const params = ['published'];
    if (category && category !== 'all') { sql += ' AND p.category_slug = ?'; params.push(category); }
    if (featured) { sql += ' AND p.is_featured = 1'; }
    sql += ' ORDER BY p.sort_order';
    if (limit) {
      const lim = parseInt(limit, 10);
      if (!isNaN(lim) && lim > 0) { sql += ' LIMIT ?'; params.push(lim); }
    }
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/projects/:slug', (req, res) => {
    const row = db.prepare('SELECT p.*, c.name as brand, c.logo as logo FROM projects p LEFT JOIN clients c ON p.client_id = c.id WHERE p.slug = ? AND p.status = ?').get(req.params.slug, 'published');
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  // ─── PROJECT CATEGORIES ───
  router.get('/project-categories', (req, res) => {
    res.json(db.prepare('SELECT * FROM project_categories WHERE is_active = 1 ORDER BY sort_order').all());
  });

  // ─── REELS ───
  router.get('/reels', (req, res) => {
    const { limit } = req.query;
    let sql = 'SELECT * FROM reels WHERE status = ? ORDER BY sort_order';
    const params = ['published'];
    if (limit) {
      const lim = parseInt(limit, 10);
      if (!isNaN(lim) && lim > 0) { sql += ' LIMIT ?'; params.push(lim); }
    }
    res.json(db.prepare(sql).all(...params));
  });

  // ─── SERVICES ───
  router.get('/services', (req, res) => {
    res.json(db.prepare('SELECT * FROM services WHERE status = ? ORDER BY sort_order').all('published'));
  });

  router.get('/services/:slug', (req, res) => {
    const row = db.prepare('SELECT * FROM services WHERE slug = ? AND status = ?').get(req.params.slug, 'published');
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  // ─── CASE STUDIES ───
  router.get('/cases', (req, res) => {
    res.json(db.prepare('SELECT * FROM case_studies WHERE status = ? ORDER BY sort_order').all('published'));
  });

  router.get('/cases/:slug', (req, res) => {
    const row = db.prepare('SELECT * FROM case_studies WHERE slug = ? AND status = ?').get(req.params.slug, 'published');
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  // ─── TEAM ───
  router.get('/team', (req, res) => {
    res.json(db.prepare('SELECT * FROM team_members WHERE is_active = 1 ORDER BY sort_order').all());
  });

  // ─── BLOG ───
  router.get('/blog', (req, res) => {
    const { category, tag, limit, page } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.max(1, parseInt(limit, 10) || 12);
    const offset = (pageNum - 1) * perPage;
    let sql = 'SELECT * FROM blog_posts WHERE status = ?';
    let countSql = 'SELECT COUNT(*) as total FROM blog_posts WHERE status = ?';
    const params = ['published'];
    if (category) {
      const catId = parseInt(category, 10);
      if (!isNaN(catId)) {
        sql += ' AND category_id = ?'; countSql += ' AND category_id = ?'; params.push(catId);
      } else {
        sql += ' AND category_id = (SELECT id FROM blog_categories WHERE slug = ?)';
        countSql += ' AND category_id = (SELECT id FROM blog_categories WHERE slug = ?)';
        params.push(category);
      }
    }
    if (tag) { sql += " AND tags LIKE ?"; countSql += " AND tags LIKE ?"; params.push(`%${tag}%`); }
    const total = db.prepare(countSql).get(...params).total;
    sql += ' ORDER BY published_at DESC LIMIT ? OFFSET ?';
    const posts = db.prepare(sql).all(...params, perPage, offset);
    res.json({ posts, total, page: pageNum, totalPages: Math.ceil(total / perPage) });
  });

  router.get('/blog/:slug', (req, res) => {
    const row = db.prepare('SELECT * FROM blog_posts WHERE slug = ? AND status = ?').get(req.params.slug, 'published');
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.get('/blog-categories', (req, res) => {
    res.json(db.prepare('SELECT * FROM blog_categories ORDER BY sort_order').all());
  });

  // ─── TESTIMONIALS ───
  router.get('/testimonials', (req, res) => {
    const { featured, limit } = req.query;
    let sql = 'SELECT * FROM testimonials WHERE status = ?';
    const params = ['published'];
    if (featured) { sql += ' AND is_featured = 1'; }
    sql += ' ORDER BY sort_order';
    if (limit) {
      const lim = parseInt(limit, 10);
      if (!isNaN(lim) && lim > 0) { sql += ' LIMIT ?'; params.push(lim); }
    }
    res.json(db.prepare(sql).all(...params));
  });

  // ─── STATS ───
  router.get('/stats', (req, res) => {
    res.json(db.prepare('SELECT * FROM stats WHERE is_active = 1 ORDER BY sort_order').all());
  });

  // ─── PHILOSOPHY ───
  router.get('/philosophy', (req, res) => {
    res.json(db.prepare('SELECT * FROM philosophy_items WHERE is_active = 1 ORDER BY sort_order').all());
  });

  // ─── PROCESS STEPS ───
  router.get('/process', (req, res) => {
    res.json(db.prepare('SELECT * FROM process_steps WHERE is_active = 1 ORDER BY sort_order').all());
  });

  // ─── NAVIGATION ───
  router.get('/navigation', (req, res) => {
    const { location } = req.query;
    let sql = 'SELECT * FROM navigation_items WHERE is_active = 1';
    const params = [];
    if (location) { sql += ' AND location = ?'; params.push(location); }
    sql += ' ORDER BY sort_order';
    res.json(db.prepare(sql).all(...params));
  });

  // ─── SOCIAL LINKS ───
  router.get('/social', (req, res) => {
    res.json(db.prepare('SELECT * FROM social_links WHERE is_active = 1 ORDER BY sort_order').all());
  });

  // ─── SITE SETTINGS ───
  router.get('/settings', (req, res) => {
    const rows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
    const settings = {};
    rows.forEach(r => settings[r.setting_key] = r.setting_value);
    res.json(settings);
  });

  // ─── HOMEPAGE ───
  router.get('/homepage', (req, res) => {
    const rows = db.prepare('SELECT section, content FROM homepage_content').all();
    const content = {};
    rows.forEach(r => { try { content[r.section] = JSON.parse(r.content); } catch { content[r.section] = r.content; } });
    res.json(content);
  });

  // ─── FAQS ───
  router.get('/faqs', (req, res) => {
    const { page } = req.query;
    let sql = 'SELECT * FROM faqs WHERE is_active = 1';
    const params = [];
    if (page) { sql += ' AND page = ?'; params.push(page); }
    sql += ' ORDER BY sort_order';
    res.json(db.prepare(sql).all(...params));
  });

  // ─── CONTACT SUBMISSION ───
  const contactHandlers = [
    ...(contactLimiter ? [contactLimiter] : []),
    (req, res) => {
      try {
        const keyResult = getIdempotencyKey(req);
        if (keyResult.error) {
          return res.status(400).json({ error: keyResult.error, fieldErrors: { idempotencyKey: keyResult.error }, saved: false });
        }
        const idempotencyKey = keyResult.key;

        const validated = validateContactPayload(req.body);
        if (validated.honeypot) {
          // Minimal honeypot: silently discard bot-like submission without persisting or notifying.
          return res.status(202).json({ message: 'Thank you! We will be in touch shortly.' });
        }
        if (validated.error) {
          return res.status(400).json({ error: validated.error, fieldErrors: validated.fieldErrors || {} });
        }

        const { name, email, phone, company, service, budget, message, website } = validated.value;
        if (website) {
          return res.status(202).json({ message: 'Thank you! We will be in touch shortly.' });
        }

        const sourcePage = 'contact';
        const ipAddress = req.ip || null;
        const leadForNotify = { name, email, phone, company, service, budget, message };

        // Legacy keyless path (documented): preserves 3.7B behavior without idempotency guarantees.
        if (!idempotencyKey) {
          const result = db.prepare(
            'INSERT INTO contact_submissions (name, email, phone, company, service, budget, message, source_page, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(name, email, phone || null, company || null, service || null, budget || null, message, sourcePage, ipAddress);
          dispatchLeadNotification({ db, lead: leadForNotify, leadId: result.lastInsertRowid, mappingId: null });
          return res.status(201).json({ message: 'Thank you! We will be in touch shortly.', id: result.lastInsertRowid });
        }

        // Keyed path requires additive idempotency table (available in isolated/test DBs after 3.7C-1 init).
        if (!hasIdempotencyTable(db)) {
          logger.error('Idempotency table missing for keyed contact submission', { route: '/api/contact' });
          return res.status(503).json({ error: 'Contact submission is temporarily unavailable. Please try again.', saved: false });
        }

        const fingerprint = computeContactFingerprint(validated.value);
        const ttlMinutes = getConfirmationTtlMinutes();

        const tx = db.transaction(() => {
          const existing = db.prepare('SELECT id, idempotency_key, request_fingerprint, contact_submission_id, confirmation_token_hash, confirmation_expires_at, conversion_eligible, conversion_fired_at FROM contact_submission_idempotency WHERE idempotency_key = ?').get(idempotencyKey);
          if (existing) {
            if (existing.request_fingerprint !== fingerprint) {
              return { type: 'conflict' };
            }
            const lead = db.prepare('SELECT id FROM contact_submissions WHERE id = ?').get(existing.contact_submission_id);
            if (!lead) {
              return { type: 'error' };
            }
            const expired = existing.confirmation_expires_at ? (Date.parse(existing.confirmation_expires_at) <= Date.now()) : false;
            if (!existing.confirmation_token_hash || expired) {
              const token = generateConfirmationToken();
              const tokenHash = hashConfirmationToken(token);
              const tokenExp = confirmationExpiresAtIso(ttlMinutes);
              // Reissue token/hash only for recovery; never create lead, never reset conversion eligibility/fired state, never trigger notification.
              db.prepare('UPDATE contact_submission_idempotency SET confirmation_token_hash = ?, confirmation_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(tokenHash, tokenExp, existing.id);
              return { type: 'replay', leadId: existing.contact_submission_id, confirmationToken: token, confirmationExpiresAt: tokenExp, mappingId: existing.id };
            }
            // Stored token is hash-only; plaintext cannot be recovered. For confirmed replay recovery, issue a fresh token without side effects.
            const token = generateConfirmationToken();
            const tokenHash = hashConfirmationToken(token);
            const tokenExp = confirmationExpiresAtIso(ttlMinutes);
            db.prepare('UPDATE contact_submission_idempotency SET confirmation_token_hash = ?, confirmation_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(tokenHash, tokenExp, existing.id);
            return { type: 'replay', leadId: existing.contact_submission_id, confirmationToken: token, confirmationExpiresAt: tokenExp, mappingId: existing.id };
          }

          const insertLead = db.prepare(
            'INSERT INTO contact_submissions (name, email, phone, company, service, budget, message, source_page, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          );
          const insertMap = db.prepare(
            'INSERT INTO contact_submission_idempotency (idempotency_key, request_fingerprint, contact_submission_id, confirmation_token_hash, confirmation_expires_at, conversion_eligible, notify_email_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
          );

          const leadResult = insertLead.run(name, email, phone || null, company || null, service || null, budget || null, message, sourcePage, ipAddress);
          const token = generateConfirmationToken();
          const tokenHash = hashConfirmationToken(token);
          const tokenExp = confirmationExpiresAtIso(ttlMinutes);
          const mapResult = insertMap.run(idempotencyKey, fingerprint, leadResult.lastInsertRowid, tokenHash, tokenExp, 'pending');
          return { type: 'created', leadId: leadResult.lastInsertRowid, confirmationToken: token, confirmationExpiresAt: tokenExp, mappingId: mapResult.lastInsertRowid };
        });

        let outcome;
        try {
          outcome = tx.immediate();
        } catch (txErr) {
          // Concurrency/race: if another request won with same key, resolve deterministically.
          const msg = txErr && txErr.message ? String(txErr.message) : '';
          if (/UNIQUE|constraint/i.test(msg)) {
            const existing = db.prepare('SELECT id, request_fingerprint, contact_submission_id, confirmation_token_hash, confirmation_expires_at FROM contact_submission_idempotency WHERE idempotency_key = ?').get(idempotencyKey);
            if (existing) {
              if (existing.request_fingerprint !== fingerprint) {
                return res.status(409).json({ error: 'This submission key was already used with different data. Please start a new submission.', saved: false, code: 'IDEMPOTENCY_CONFLICT' });
              }
              const token = generateConfirmationToken();
              const tokenHash = hashConfirmationToken(token);
              const tokenExp = confirmationExpiresAtIso(ttlMinutes);
              db.prepare('UPDATE contact_submission_idempotency SET confirmation_token_hash = ?, confirmation_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(tokenHash, tokenExp, existing.id);
              return res.status(200).json({ message: 'Thank you! We will be in touch shortly.', id: existing.contact_submission_id, saved: true, duplicate: true, confirmationToken: token, confirmationExpiresAt: tokenExp });
            }
          }
          throw txErr;
        }

        if (outcome.type === 'conflict') {
          return res.status(409).json({ error: 'This submission key was already used with different data. Please start a new submission.', saved: false, code: 'IDEMPOTENCY_CONFLICT' });
        }
        if (outcome.type === 'error') {
          return res.status(500).json({ error: 'Something went wrong. Please try again.', saved: false });
        }
        if (outcome.type === 'replay') {
          return res.status(200).json({ message: 'Thank you! We will be in touch shortly.', id: outcome.leadId, saved: true, duplicate: true, confirmationToken: outcome.confirmationToken, confirmationExpiresAt: outcome.confirmationExpiresAt });
        }
        if (outcome.type === 'created') {
          // Notification only on first successful commit, outside transaction, non-blocking.
          dispatchLeadNotification({ db, lead: leadForNotify, leadId: outcome.leadId, mappingId: outcome.mappingId });
          return res.status(201).json({ message: 'Thank you! We will be in touch shortly.', id: outcome.leadId, saved: true, duplicate: false, confirmationToken: outcome.confirmationToken, confirmationExpiresAt: outcome.confirmationExpiresAt });
        }

        return res.status(500).json({ error: 'Something went wrong. Please try again.', saved: false });
      } catch (err) {
        logger.error('Contact submission error', { error: err.message });
        return res.status(500).json({ error: 'Something went wrong. Please try again.', saved: false });
      }
    }
  ];

  router.post('/contact', ...contactHandlers);

  // ─── CONTACT CONFIRMATION VALIDATION (read-only, no PII/lead mutation/token rotation/notify/conversion) ───
  const confirmHandlers = [
    ...(contactConfirmationLimiter ? [contactConfirmationLimiter] : []),
    createContactConfirmationStatusHandler(db)
  ];
  router.post('/contact/confirmation-status', ...confirmHandlers);

  // ─── FORM SUBMISSION ───
  router.post('/forms/:slug/submit', (req, res) => {
    try {
      const form = db.prepare('SELECT * FROM forms WHERE slug = ? AND is_active = 1').get(req.params.slug);
      if (!form) return res.status(404).json({ error: 'Form not found' });

      db.prepare('INSERT INTO form_submissions (form_id, data, source_page, ip_address) VALUES (?, ?, ?, ?)')
        .run(form.id, JSON.stringify(req.body), req.headers.referer, req.ip);

      res.status(201).json({ message: form.success_message || 'Submitted successfully!' });
    } catch (err) {
      res.status(500).json({ error: 'Submission failed' });
    }
  });

  // ─── SEO METADATA ───
  router.get('/seo/:type/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM seo_metadata WHERE entity_type = ? AND entity_id = ?').get(req.params.type, req.params.id);
    res.json(row || {});
  });

  return router;
}

module.exports = publicRoutes;
