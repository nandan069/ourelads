/**
 * OUREL ADS — Public API Routes (Frontend consumption)
 */
const express = require('express');

function publicRoutes(db) {
  const router = express.Router();

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

  // ─── INSIGHTS ───
  router.get('/insights', (req, res) => {
    const { category, limit } = req.query;
    let sql = 'SELECT * FROM insights WHERE status = ?';
    const params = ['published'];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY published_at DESC';
    if (limit) {
      const lim = parseInt(limit, 10);
      if (!isNaN(lim) && lim > 0) { sql += ' LIMIT ?'; params.push(lim); }
    }
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/insights/:slug', (req, res) => {
    const row = db.prepare('SELECT * FROM insights WHERE slug = ? AND status = ?').get(req.params.slug, 'published');
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
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
  router.post('/contact', (req, res) => {
    try {
      const { name, email, phone, company, service, budget, message } = req.body;
      if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message are required' });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(email).trim())) return res.status(400).json({ error: 'Invalid email address' });

      const sanitize = (str) => typeof str === 'string' ? str.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;') : null;

      const cleanName = sanitize(name);
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanMessage = sanitize(message);

      const cleanPhone = sanitize(phone);
      const cleanCompany = sanitize(company);
      const cleanService = sanitize(service);
      const cleanBudget = sanitize(budget);

      const result = db.prepare('INSERT INTO contact_submissions (name, email, phone, company, service, budget, message, source_page, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(cleanName, cleanEmail, cleanPhone, cleanCompany, cleanService, cleanBudget, cleanMessage, sanitize(req.headers.referer || 'contact'), req.ip);

      try {
        const nodemailer = require("nodemailer");
        const host = process.env.SMTP_HOST || "smtp.titan.email";
        const user = process.env.SMTP_USER || "info@ourelads.com";
        const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "Info@ourelads.com";
        const notifyEmail = process.env.NOTIFY_EMAIL || "info@ourelads.com";
        const port = parseInt(process.env.SMTP_PORT, 10) || 465;

        if (host && user && pass) {
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
          });
          transporter.sendMail({
            from: `"Ourel Ads Website" <${user}>`,
            to: notifyEmail,
            subject: `🔥 New Lead Inquiry from ${cleanName}`,
            html: `
              <h2>New Project Lead Received on Ourel Ads</h2>
              <p><strong>Name:</strong> ${cleanName}</p>
              <p><strong>Email:</strong> <a href="mailto:${cleanEmail}">${cleanEmail}</a></p>
              <p><strong>Phone:</strong> ${cleanPhone || "N/A"}</p>
              <p><strong>Company:</strong> ${cleanCompany || "N/A"}</p>
              <p><strong>Service Needed:</strong> ${cleanService || "N/A"}</p>
              <p><strong>Estimated Budget:</strong> ${cleanBudget || "N/A"}</p>
              <p><strong>Message:</strong></p>
              <blockquote style="background:#f4f4f4;padding:12px;border-left:4px solid #6B21A8">${cleanMessage}</blockquote>
              <p><small>Received on ${new Date().toLocaleString()}</small></p>
            `
          }).then(info => console.log("Lead mail sent successfully:", info.messageId))
            .catch(err => console.error("Lead mail error:", err.message));
        }
      } catch (e) {
        console.error("Nodemailer error:", e.message);
      }

      res.status(201).json({ message: 'Thank you! We will be in touch shortly.', id: result.lastInsertRowid });
    } catch (err) {
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

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
