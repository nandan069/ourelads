/**
 * OUREL ADS — Admin API Routes (Protected)
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID: uuidv4 } = require('crypto');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { logger, logActivity, createRevision } = require('../utils/logger');

function adminRoutes(db) {
  const router = express.Router();
  router.use(authMiddleware);

  // ─── UPLOAD CONFIG ───
  const uploadDir = path.join(__dirname, '../../public/uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
    fileFilter: (req, file, cb) => {
      const allowed = /jpeg|jpg|png|gif|webp|svg|mp4|webm|pdf|doc|docx/;
      const ext = allowed.test(path.extname(file.originalname).toLowerCase());
      const mime = allowed.test(file.mimetype);
      if (ext || mime) return cb(null, true);
      cb(new Error('File type not allowed'));
    },
  });

  // ─── HELPER: generic CRUD factory ───
  const PROJECT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  function validateProjectSlugRecord(db, { slugValue, statusValue, excludeId = null }) {
    const slug = String(slugValue == null ? '' : slugValue).trim();
    const status = String(statusValue == null ? '' : statusValue).trim() || 'draft';
    if (!slug) {
      if (status === 'published') return { error: 'Published projects must have a slug' };
      return { slug: null };
    }
    if (slug.length > 200 || !PROJECT_SLUG_RE.test(slug)) {
      return { error: 'Project slug must be lowercase kebab-case (letters, numbers, hyphens only)' };
    }
    const dup = db.prepare(`SELECT id FROM projects WHERE lower(slug) = lower(?)${excludeId ? ' AND id != ?' : ''} LIMIT 1`).get(...(excludeId ? [slug, excludeId] : [slug]));
    if (dup) return { error: 'Project slug already exists. Choose a unique slug.' };
    return { slug };
  }

  function crudRoutes(entityPath, tableName, entityLabel, opts = {}) {
    // LIST
    router.get(`/${entityPath}`, (req, res) => {
      try {
        const { page, limit, search, status } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const perPage = Math.max(1, parseInt(limit, 10) || 50);
        const offset = (pageNum - 1) * perPage;

        const tableCols = db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);

        let sql = `SELECT * FROM ${tableName}`;
        let countSql = `SELECT COUNT(*) as total FROM ${tableName}`;
        const conditions = [];
        const params = [];
        if (search && opts.searchFields) {
          const searchConds = opts.searchFields.filter(f => tableCols.includes(f)).map(f => `${f} LIKE ?`);
          if (searchConds.length) {
            conditions.push(`(${searchConds.join(' OR ')})`);
            searchConds.forEach(() => params.push(`%${search}%`));
          }
        }
        if (status) {
          if (tableCols.includes('status')) {
            conditions.push('status = ?');
            params.push(status);
          } else if (tableCols.includes('is_active')) {
            conditions.push('is_active = ?');
            params.push(status === 'active' || status === '1' || status === 'true' ? 1 : 0);
          }
        }
        if (conditions.length) {
          const where = ' WHERE ' + conditions.join(' AND ');
          sql += where;
          countSql += where;
        }
        const rawOrderCol = (opts.orderBy || 'sort_order').split(' ')[0];
        const orderCol = tableCols.includes(rawOrderCol) ? opts.orderBy : (tableCols.includes('sort_order') ? 'sort_order' : 'id');
        sql += ` ORDER BY ${orderCol} LIMIT ? OFFSET ?`;
        const total = db.prepare(countSql).get(...params).total;
        const rows = db.prepare(sql).all(...params, perPage, offset);
        res.json({ data: rows, total, page: pageNum, totalPages: Math.ceil(total / perPage) || 1 });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET ONE
    router.get(`/${entityPath}/:id`, (req, res) => {
      try {
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ error: `${entityLabel} not found` });
        res.json(row);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // CREATE
    router.post(`/${entityPath}`, (req, res) => {
      try {
        if (tableName === 'case_studies' && !req.body.title) {
          req.body.title = req.body.campaign ? `${req.body.brand ? req.body.brand + ' - ' : ''}${req.body.campaign}` : (req.body.brand ? `${req.body.brand} Case Study` : 'Case Study');
        }
        const tableCols = db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name).filter(c => c !== 'id');
        if (tableName === 'projects') {
          if (Object.prototype.hasOwnProperty.call(req.body, 'slug')) {
            const v = validateProjectSlugRecord(db, { slugValue: req.body.slug, statusValue: req.body.status || 'draft' });
            if (v.error) return res.status(400).json({ error: v.error });
            if (v.slug !== null) req.body.slug = v.slug;
          } else if (tableCols.includes('slug')) {
            // auto-generate only when omitted; ensure unique and lowercase kebab-case
            const rawSlugSource = req.body.title || req.body.name || req.body.brand || entityLabel;
            let generatedSlug = String(rawSlugSource).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `project-${Date.now()}`;
            let candidate = generatedSlug;
            let tries = 0;
            while (db.prepare('SELECT id FROM projects WHERE lower(slug)=lower(?)').get(candidate) && tries < 20) {
              tries += 1;
              candidate = `${generatedSlug}-${tries}`;
            }
            if (db.prepare('SELECT id FROM projects WHERE lower(slug)=lower(?)').get(candidate)) {
              return res.status(400).json({ error: 'Unable to generate a unique project slug. Provide a unique slug.' });
            }
            req.body.slug = candidate;
          }
          if ((req.body.status || 'draft') === 'published' && !(req.body.slug && String(req.body.slug).trim())) {
            return res.status(400).json({ error: 'Published projects must have a slug' });
          }
        } else if (tableCols.includes('slug') && !req.body.slug) {
          const rawSlugSource = req.body.title || req.body.name || req.body.campaign || entityLabel;
          let generatedSlug = String(rawSlugSource).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          if (!generatedSlug) generatedSlug = `${entityPath}-${Date.now()}`;
          const existingSlug = db.prepare(`SELECT id FROM ${tableName} WHERE slug = ?`).get(generatedSlug);
          req.body.slug = existingSlug ? `${generatedSlug}-${Date.now().toString().slice(-4)}` : generatedSlug;
        }
        const safeEntries = Object.entries(req.body).filter(([k]) => tableCols.includes(k));
        if (!safeEntries.length) return res.status(400).json({ error: 'No valid data provided' });

        const cols = safeEntries.map(([k]) => k);
        const vals = safeEntries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);

        const placeholders = cols.map(() => '?').join(', ');
        const result = db.prepare(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
        logActivity(db, req.user.id, 'created', entityLabel, result.lastInsertRowid, `Created ${entityLabel}`, req.ip);
        res.status(201).json({ id: result.lastInsertRowid, message: `${entityLabel} created` });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // UPDATE
    router.put(`/${entityPath}/:id`, (req, res) => {
      try {
        const id = req.params.id;
        const existing = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
        if (!existing) return res.status(404).json({ error: `${entityLabel} not found` });
        createRevision(db, entityLabel, id, existing, req.user.id, `Updated ${entityLabel}`);

        const tableCols = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const validColNames = tableCols.map(c => c.name).filter(c => c !== 'id' && c !== 'created_at' && c !== 'updated_at');

        if (tableName === 'projects') {
          const nextStatus = Object.prototype.hasOwnProperty.call(req.body, 'status') ? req.body.status : existing.status;
          const hasSlugField = Object.prototype.hasOwnProperty.call(req.body, 'slug');
          const nextSlugValue = hasSlugField ? req.body.slug : existing.slug;
          if (hasSlugField) {
            const v = validateProjectSlugRecord(db, { slugValue: nextSlugValue, statusValue: nextStatus, excludeId: id });
            if (v.error) return res.status(400).json({ error: v.error });
            req.body.slug = v.slug == null ? '' : v.slug; // do not rewrite existing unless explicitly provided
          }
          if ((String(nextStatus || '').trim() || 'draft') === 'published') {
            const effectiveSlug = hasSlugField ? String(req.body.slug || '').trim() : String(existing.slug || '').trim();
            if (!effectiveSlug) return res.status(400).json({ error: 'Published projects must have a slug' });
          }
        }

        const safeEntries = Object.entries(req.body).filter(([k]) => validColNames.includes(k));
        if (!safeEntries.length) return res.status(400).json({ error: 'No valid data provided' });

        const cols = safeEntries.map(([k]) => k);
        const vals = safeEntries.map(([, v]) => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
        const sets = cols.map(c => `${c} = ?`).join(', ');

        const hasUpdatedAt = tableCols.some(col => col.name === 'updated_at');
        const setClause = hasUpdatedAt ? `${sets}, updated_at = CURRENT_TIMESTAMP` : sets;

        db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`).run(...vals, id);
        logActivity(db, req.user.id, 'updated', entityLabel, id, `Updated ${entityLabel}`, req.ip);
        res.json({ message: `${entityLabel} updated` });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // DELETE
    router.delete(`/${entityPath}/:id`, requireRole('super_admin', 'admin'), (req, res) => {
      try {
        const existing = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id);
        if (!existing) return res.status(404).json({ error: `${entityLabel} not found` });
        createRevision(db, entityLabel, req.params.id, existing, req.user.id, `Deleted ${entityLabel}`);
        db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(req.params.id);
        logActivity(db, req.user.id, 'deleted', entityLabel, req.params.id, `Deleted ${entityLabel}`, req.ip);
        res.json({ message: `${entityLabel} deleted` });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  // ─── REGISTER ALL CRUD ROUTES ───
  crudRoutes('clients', 'clients', 'client', { searchFields: ['name'], orderBy: 'sort_order' });
  crudRoutes('projects', 'projects', 'project', { searchFields: ['title', 'description'], orderBy: 'sort_order' });
  crudRoutes('project-categories', 'project_categories', 'project_category', { orderBy: 'sort_order' });
  crudRoutes('reels', 'reels', 'reel', { searchFields: ['title', 'brand'], orderBy: 'sort_order' });
  crudRoutes('services', 'services', 'service', { searchFields: ['title', 'short_description'], orderBy: 'sort_order' });
  crudRoutes('cases', 'case_studies', 'case_study', { searchFields: ['brand', 'campaign'], orderBy: 'sort_order' });
  crudRoutes('team', 'team_members', 'team_member', { searchFields: ['name', 'designation'], orderBy: 'sort_order' });
  crudRoutes('blog', 'blog_posts', 'blog_post', { searchFields: ['title', 'excerpt'], orderBy: 'published_at DESC' });
  crudRoutes('blog-categories', 'blog_categories', 'blog_category', { orderBy: 'sort_order' });
  crudRoutes('testimonials', 'testimonials', 'testimonial', { searchFields: ['client_name', 'company'], orderBy: 'sort_order' });
  crudRoutes('philosophy', 'philosophy_items', 'philosophy', { orderBy: 'sort_order' });
  crudRoutes('process', 'process_steps', 'process_step', { orderBy: 'sort_order' });
  crudRoutes('stats', 'stats', 'stat', { orderBy: 'sort_order' });
  crudRoutes('faqs', 'faqs', 'faq', { searchFields: ['question'], orderBy: 'sort_order' });
  crudRoutes('pages', 'pages', 'page', { searchFields: ['title'], orderBy: 'id' });
  crudRoutes('page-sections', 'page_sections', 'page_section', { orderBy: 'sort_order' });
  crudRoutes('navigation', 'navigation_items', 'navigation_item', { searchFields: ['label'], orderBy: 'sort_order' });
  crudRoutes('social', 'social_links', 'social_link', { orderBy: 'sort_order' });

  // ─── HOMEPAGE CONTENT ───
  router.get('/homepage', (req, res) => {
    const rows = db.prepare('SELECT * FROM homepage_content').all();
    const content = {};
    rows.forEach(r => { try { content[r.section] = { id: r.id, ...JSON.parse(r.content) }; } catch { content[r.section] = r.content; } });
    res.json(content);
  });

  router.put('/homepage/:section', (req, res) => {
    const existing = db.prepare('SELECT * FROM homepage_content WHERE section = ?').get(req.params.section);
    if (existing) {
      createRevision(db, 'homepage', existing.id, existing.content, req.user.id, `Updated homepage ${req.params.section}`);
      db.prepare('UPDATE homepage_content SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE section = ?')
        .run(JSON.stringify(req.body), req.params.section);
    } else {
      db.prepare('INSERT INTO homepage_content (section, content) VALUES (?, ?)')
        .run(req.params.section, JSON.stringify(req.body));
    }
    logActivity(db, req.user.id, 'updated', 'homepage', null, `Updated homepage section: ${req.params.section}`, req.ip);
    res.json({ message: 'Section updated' });
  });

  // ─── SITE SETTINGS ───
  router.get('/settings', (req, res) => {
    const rows = db.prepare('SELECT * FROM site_settings ORDER BY setting_group, setting_key').all();
    res.json(rows);
  });

  router.put('/settings', requireRole('super_admin', 'admin'), (req, res) => {
    const entries = Object.entries(req.body);
    const stmt = db.prepare('INSERT OR REPLACE INTO site_settings (setting_key, setting_value, setting_group, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)');
    const txn = db.transaction(() => {
      entries.forEach(([key, val]) => {
        const existing = db.prepare('SELECT setting_group FROM site_settings WHERE setting_key = ?').get(key);
        stmt.run(key, val, existing?.setting_group || 'general');
      });
    });
    txn();
    logActivity(db, req.user.id, 'updated', 'settings', null, 'Updated site settings', req.ip);
    res.json({ message: 'Settings updated' });
  });

  // ─── SEO METADATA ───
  const SUPPORTED_PAGE_SEO_SLUGS = new Set(['home', 'about', 'services', 'work', 'blog', 'testimonials', 'contact']);
  const SUPPORTED_ROBOTS = new Set(['index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow']);
  const SUPPORTED_SEO_ENTITY_TYPES = new Set(['page', 'blog_post', 'project']);

  function hasControlChars(str) {
    return /[\u0000-\u001F\u007F]/.test(str);
  }

  function normalizeSeoField(value) {
    if (value == null) return null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  function isAllowedSeoUrl(value, { allowEmpty = true } = {}) {
    if (value == null || value === '') return !!allowEmpty;
    if (typeof value !== 'string') return false;
    if (hasControlChars(value)) return false;
    const trimmed = value.trim();
    if (!trimmed) return !!allowEmpty;
    let parsed;
    try { parsed = new URL(trimmed); } catch { return false; }
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'https:') return true;
    if (protocol === 'http:') {
      // localhost HTTP exceptions only for development
      const host = parsed.hostname.toLowerCase();
      if (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) return true;
      return false;
    }
    return false; // rejects javascript:, data:, etc.
  }

  function parseStrictPositiveInt(raw, label) {
    const value = String(raw ?? '').trim();
    const id = Number.parseInt(value, 10);
    if (!Number.isInteger(id) || id <= 0 || String(id) !== value) return { error: `Invalid ${label}` };
    return { id };
  }

  function resolveSupportedPage(entityIdRaw) {
    const parsed = parseStrictPositiveInt(entityIdRaw, 'page ID');
    if (parsed.error) return { error: parsed.error };
    const page = db.prepare('SELECT id, slug, title, status FROM pages WHERE id = ?').get(parsed.id);
    if (!page) return { error: 'Page not found' };
    if (!SUPPORTED_PAGE_SEO_SLUGS.has(page.slug)) return { error: 'Page is not supported for per-page SEO' };
    if (page.status !== 'published') return { error: 'Only published pages can be edited for SEO' };
    return { id: parsed.id, entity: page, entityType: 'page', logLabel: `page ${page.slug}` };
  }

  function resolveSupportedBlogPost(entityIdRaw) {
    const parsed = parseStrictPositiveInt(entityIdRaw, 'blog post ID');
    if (parsed.error) return { error: parsed.error };
    const post = db.prepare('SELECT id, slug, title, status FROM blog_posts WHERE id = ?').get(parsed.id);
    if (!post) return { error: 'Blog post not found' };
    if (post.status !== 'published') return { error: 'Only published blog posts can be edited for SEO' };
    return { id: parsed.id, entity: post, entityType: 'blog_post', logLabel: `blog_post ${post.slug}` };
  }

  function resolveSupportedProject(entityIdRaw) {
    const parsed = parseStrictPositiveInt(entityIdRaw, 'project ID');
    if (parsed.error) return { error: parsed.error };
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(parsed.id);
    if (!project) return { error: 'Project not found' };
    if (project.status !== 'published') return { error: 'Only published projects can be edited for SEO' };
    return { id: parsed.id, entity: project, entityType: 'project', logLabel: `project ${project.slug || project.id}` };
  }

  function resolveSeoEntity(type, entityId) {
    if (type === 'page') return resolveSupportedPage(entityId);
    if (type === 'blog_post') return resolveSupportedBlogPost(entityId);
    if (type === 'project') return resolveSupportedProject(entityId);
    return { error: 'Unsupported entity type' };
  }

  function validateSeoPayload(body) {
    const seo_title = normalizeSeoField(body.seo_title);
    const meta_description = normalizeSeoField(body.meta_description);
    const canonical_url = normalizeSeoField(body.canonical_url);
    const og_title = normalizeSeoField(body.og_title);
    const og_description = normalizeSeoField(body.og_description);
    const og_image = normalizeSeoField(body.og_image);
    const robots = normalizeSeoField(body.robots) || 'index, follow';

    if (seo_title && (seo_title.length > 120 || hasControlChars(seo_title))) return { error: 'SEO title is invalid or too long (max 120 characters)' };
    if (meta_description && (meta_description.length > 320 || hasControlChars(meta_description))) return { error: 'Meta description is invalid or too long (max 320 characters)' };
    if (og_title && (og_title.length > 120 || hasControlChars(og_title))) return { error: 'Open Graph title is invalid or too long (max 120 characters)' };
    if (og_description && (og_description.length > 320 || hasControlChars(og_description))) return { error: 'Open Graph description is invalid or too long (max 320 characters)' };
    if (!isAllowedSeoUrl(canonical_url, { allowEmpty: true })) return { error: 'Canonical URL must be a valid https:// URL (or blank to use default)' };
    if (!isAllowedSeoUrl(og_image, { allowEmpty: true })) return { error: 'Open Graph image URL must be a valid https:// URL' };
    if (!SUPPORTED_ROBOTS.has(robots)) return { error: 'Unsupported robots directive' };

    return { seo_title, meta_description, canonical_url, og_title, og_description, og_image, robots };
  }

  router.get('/seo/:type/:entityId', (req, res) => {
    try {
      const { type, entityId } = req.params;
      if (!SUPPORTED_SEO_ENTITY_TYPES.has(type)) return res.status(400).json({ error: 'Unsupported entity type' });
      const resolved = resolveSeoEntity(type, entityId);
      if (resolved.error) return res.status(400).json({ error: resolved.error });
      const row = db.prepare('SELECT * FROM seo_metadata WHERE entity_type = ? AND entity_id = ?').get(type, resolved.id) || {};
      if (type === 'project') {
        const { hasMeaningfulProjectContent } = require('../utils/seoRenderer');
        const isMeaningful = !!hasMeaningfulProjectContent(resolved.entity);
        row._entity = {
          id: resolved.entity.id,
          slug: resolved.entity.slug || '',
          title: resolved.entity.title || '',
          brand: resolved.entity.brand || '',
          status: resolved.entity.status,
          publicUrl: `/work/${resolved.entity.slug || ''}`,
          isMeaningful,
          isThin: !isMeaningful,
          inheritedRobots: isMeaningful ? 'index, follow' : 'noindex, follow',
        };
      }
      return res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/seo/:type/:entityId', requireRole('super_admin', 'admin'), (req, res) => {
    try {
      const { type, entityId } = req.params;
      if (!SUPPORTED_SEO_ENTITY_TYPES.has(type)) return res.status(400).json({ error: 'Unsupported entity type' });
      const resolved = resolveSeoEntity(type, entityId);
      if (resolved.error) return res.status(400).json({ error: resolved.error });

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const validated = validateSeoPayload(body);
      if (validated.error) return res.status(400).json({ error: validated.error });
      const { seo_title, meta_description, canonical_url, og_title, og_description, og_image, robots } = validated;

      // keywords/schema_markup not editable in this phase; preserve existing values if present
      const existing = db.prepare('SELECT id, keywords, schema_markup FROM seo_metadata WHERE entity_type = ? AND entity_id = ?').get(type, resolved.id);
      const keywords = existing ? (existing.keywords ?? null) : null;
      const schema_markup = existing ? (existing.schema_markup ?? null) : null;

      // Keep only meaningful overrides; all-empty => remove override to restore renderer fallbacks
      const hasAnyOverride = [seo_title, meta_description, canonical_url, og_title, og_description, og_image].some(v => v != null) || robots !== 'index, follow' || (keywords != null && String(keywords).trim() !== '') || (schema_markup != null && String(schema_markup).trim() !== '');

      if (existing) {
        if (!hasAnyOverride) {
          db.prepare('DELETE FROM seo_metadata WHERE id = ?').run(existing.id);
          logActivity(db, req.user.id, 'deleted', 'seo_metadata', existing.id, `Removed SEO override for ${resolved.logLabel}`, req.ip);
          return res.json({ message: 'SEO override removed; defaults restored' });
        }
        db.prepare('UPDATE seo_metadata SET seo_title=?, meta_description=?, keywords=?, canonical_url=?, og_title=?, og_description=?, og_image=?, robots=?, schema_markup=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .run(seo_title, meta_description, keywords, canonical_url, og_title, og_description, og_image, robots, schema_markup, existing.id);
      } else {
        if (!hasAnyOverride) {
          return res.json({ message: 'No SEO overrides to save; defaults in use' });
        }
        db.prepare('INSERT INTO seo_metadata (entity_type, entity_id, seo_title, meta_description, keywords, canonical_url, og_title, og_description, og_image, robots, schema_markup) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(type, resolved.id, seo_title, meta_description, keywords, canonical_url, og_title, og_description, og_image, robots, schema_markup);
      }
      logActivity(db, req.user.id, 'updated', 'seo_metadata', resolved.id, `Updated SEO for ${resolved.logLabel}`, req.ip);
      res.json({ message: 'SEO updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/seo/:type/:entityId', requireRole('super_admin', 'admin'), (req, res) => {
    try {
      const { type, entityId } = req.params;
      if (!SUPPORTED_SEO_ENTITY_TYPES.has(type)) return res.status(400).json({ error: 'Unsupported entity type' });
      const resolved = resolveSeoEntity(type, entityId);
      if (resolved.error) return res.status(400).json({ error: resolved.error });
      const result = db.prepare('DELETE FROM seo_metadata WHERE entity_type = ? AND entity_id = ?').run(type, resolved.id);
      if (result.changes > 0) {
        logActivity(db, req.user.id, 'deleted', 'seo_metadata', resolved.id, `Restored default SEO for ${resolved.logLabel}`, req.ip);
      }
      res.json({ message: 'SEO defaults restored' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── CONTACT SUBMISSIONS / LEADS ───
  router.get('/leads', (req, res) => {
    const { page, limit, status, search } = req.query;
    const pageNum = parseInt(page) || 1;
    const perPage = parseInt(limit) || 25;
    const offset = (pageNum - 1) * perPage;
    let sql = 'SELECT * FROM contact_submissions';
    let countSql = 'SELECT COUNT(*) as total FROM contact_submissions';
    const conditions = [];
    const params = [];
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (search) { conditions.push('(name LIKE ? OR email LIKE ? OR company LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (conditions.length) { const w = ' WHERE ' + conditions.join(' AND '); sql += w; countSql += w; }
    const total = db.prepare(countSql).get(...params).total;
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const rows = db.prepare(sql).all(...params, perPage, offset);
    res.json({ data: rows, total, page: pageNum, totalPages: Math.ceil(total / perPage) || 1 });
  });

  router.get('/leads/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });

  router.put('/leads/:id', (req, res) => {
    const { status, notes } = req.body;
    db.prepare('UPDATE contact_submissions SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, notes, req.params.id);
    logActivity(db, req.user.id, 'updated', 'lead', req.params.id, `Updated lead status to ${status}`, req.ip);
    res.json({ message: 'Lead updated' });
  });

  router.delete('/leads/:id', requireRole('super_admin', 'admin'), (req, res) => {
    db.prepare('DELETE FROM contact_submissions WHERE id = ?').run(req.params.id);
    res.json({ message: 'Lead deleted' });
  });

  router.get('/leads-export', requireRole('super_admin', 'admin'), (req, res) => {
    const rows = db.prepare('SELECT * FROM contact_submissions ORDER BY created_at DESC').all();
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Company', 'Service', 'Budget', 'Message', 'Status', 'Created'];
    const sanitizeCsvCell = (value) => {
      let s = value == null ? '' : String(value);
      // Prevent spreadsheet formula injection when opened in Excel/Sheets
      if (/^[\t\r\n ]*[=+\-@]/.test(s)) s = "'" + s;
      return s.replace(/"/g, '""');
    };
    const csvEscape = (value) => `"${sanitizeCsvCell(value)}"`;
    const csv = [
      headers.join(','),
      ...rows.map(r => [
        r.id,
        csvEscape(r.name),
        csvEscape(r.email),
        csvEscape(r.phone),
        csvEscape(r.company || ''),
        csvEscape(r.service || ''),
        csvEscape(r.budget),
        csvEscape(r.message || ''),
        csvEscape(r.status),
        csvEscape(r.created_at)
      ].join(','))
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
    res.send('\uFEFF' + csv);
  });

  // ─── FORM SUBMISSIONS ───
  router.get('/form-submissions', (req, res) => {
    const { form_id, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const perPage = parseInt(limit) || 25;
    const offset = (pageNum - 1) * perPage;
    let sql = 'SELECT fs.*, f.name as form_name FROM form_submissions fs JOIN forms f ON fs.form_id = f.id';
    let countSql = 'SELECT COUNT(*) as total FROM form_submissions';
    const params = [];
    if (form_id) { sql += ' WHERE fs.form_id = ?'; countSql += ' WHERE form_id = ?'; params.push(parseInt(form_id)); }
    const total = db.prepare(countSql).get(...params).total;
    sql += ' ORDER BY fs.created_at DESC LIMIT ? OFFSET ?';
    const rows = db.prepare(sql).all(...params, perPage, offset);
    res.json({ data: rows, total, page: pageNum, totalPages: Math.ceil(total / perPage) || 1 });
  });

  // ─── FORMS (custom forms) ───
  crudRoutes('forms', 'forms', 'form', { searchFields: ['name'], orderBy: 'id' });

  router.get('/forms/:id/fields', (req, res) => {
    const fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ? ORDER BY sort_order').all(req.params.id);
    res.json(fields);
  });

  router.post('/forms/:id/fields', (req, res) => {
    const { label, field_type, name, placeholder, options, is_required, validation, sort_order } = req.body;
    const result = db.prepare('INSERT INTO form_fields (form_id, label, field_type, name, placeholder, options, is_required, validation, sort_order) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(req.params.id, label, field_type || 'text', name, placeholder, options, is_required ? 1 : 0, validation, sort_order || 0);
    res.status(201).json({ id: result.lastInsertRowid });
  });

  router.delete('/forms/:formId/fields/:id', (req, res) => {
    db.prepare('DELETE FROM form_fields WHERE id = ? AND form_id = ?').run(req.params.id, req.params.formId);
    res.json({ message: 'Field deleted' });
  });

  // ─── MEDIA UPLOAD ───
  router.post('/media', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = db.prepare('INSERT INTO media (filename, original_name, file_path, file_type, mime_type, file_size, alt_text, title, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(req.file.filename, req.file.originalname, `/uploads/${req.file.filename}`, path.extname(req.file.originalname).slice(1), req.file.mimetype, req.file.size, req.body.alt_text || '', req.body.title || req.file.originalname, req.user.id);
    logActivity(db, req.user.id, 'uploaded', 'media', result.lastInsertRowid, `Uploaded ${req.file.originalname}`, req.ip);
    res.status(201).json({ id: result.lastInsertRowid, url: `/uploads/${req.file.filename}`, file_path: `/uploads/${req.file.filename}`, filename: req.file.filename });
  });

  router.get('/media', (req, res) => {
    const { page, limit, type, search } = req.query;
    const pageNum = parseInt(page) || 1;
    const perPage = parseInt(limit) || 30;
    const offset = (pageNum - 1) * perPage;
    let sql = 'SELECT * FROM media';
    let countSql = 'SELECT COUNT(*) as total FROM media';
    const conds = [];
    const params = [];
    if (type) { conds.push('file_type = ?'); params.push(type); }
    if (search) { conds.push('(original_name LIKE ? OR title LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (conds.length) { const w = ' WHERE ' + conds.join(' AND '); sql += w; countSql += w; }
    const total = db.prepare(countSql).get(...params).total;
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    res.json({ data: db.prepare(sql).all(...params, perPage, offset), total, page: pageNum, totalPages: Math.ceil(total / perPage) || 1 });
  });

  router.delete('/media/:id', requireRole('super_admin', 'admin'), (req, res) => {
    const file = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(uploadDir, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
    res.json({ message: 'File deleted' });
  });

  router.put('/media/:id', (req, res) => {
    const { alt_text, title, caption } = req.body;
    db.prepare('UPDATE media SET alt_text = COALESCE(?, alt_text), title = COALESCE(?, title), caption = COALESCE(?, caption) WHERE id = ?')
      .run(alt_text, title, caption, req.params.id);
    res.json({ message: 'Media updated' });
  });

  // ─── ACTIVITY LOGS ───
  router.get('/activity', (req, res) => {
    const { page, limit, user_id } = req.query;
    const pageNum = parseInt(page) || 1;
    const perPage = parseInt(limit) || 50;
    const offset = (pageNum - 1) * perPage;
    let sql = 'SELECT al.*, u.full_name, u.username FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id';
    let countSql = 'SELECT COUNT(*) as total FROM activity_logs';
    const params = [];
    if (user_id) { sql += ' WHERE al.user_id = ?'; countSql += ' WHERE user_id = ?'; params.push(parseInt(user_id)); }
    const total = db.prepare(countSql).get(...params).total;
    sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    res.json({ data: db.prepare(sql).all(...params, perPage, offset), total, page: pageNum, totalPages: Math.ceil(total / perPage) || 1 });
  });

  // ─── REVISIONS ───
  router.get('/revisions/:type/:entityId', (req, res) => {
    const rows = db.prepare('SELECT r.*, u.full_name, u.username FROM revisions r LEFT JOIN users u ON r.changed_by = u.id WHERE r.entity_type = ? AND r.entity_id = ? ORDER BY r.created_at DESC')
      .all(req.params.type, req.params.entityId);
    res.json(rows);
  });

  router.post('/revisions/:id/restore', requireRole('super_admin', 'admin'), (req, res) => {
    const rev = db.prepare('SELECT * FROM revisions WHERE id = ?').get(req.params.id);
    if (!rev) return res.status(404).json({ error: 'Revision not found' });
    res.json({ data: JSON.parse(rev.data), message: 'Revision data returned for restore' });
  });


  // ─── ANALYTICS OVERVIEW ───
  router.get("/analytics/overview", (req, res) => {
    try {
      const totalViews = db.prepare("SELECT COUNT(*) as c FROM page_analytics").get().c;
      const todayViews = db.prepare("SELECT COUNT(*) as c FROM page_analytics WHERE date(created_at) = date('now')").get().c;
      const uniqueVisitors = db.prepare("SELECT COUNT(DISTINCT ip_address) as c FROM page_analytics").get().c;
      const totalLeads = db.prepare("SELECT COUNT(*) as c FROM contact_submissions").get().c;

      const dailyStats = db.prepare(`
        SELECT date(created_at) as date, COUNT(*) as views, COUNT(DISTINCT ip_address) as visitors
        FROM page_analytics
        WHERE created_at >= date('now', '-14 days')
        GROUP BY date(created_at)
        ORDER BY date(created_at) ASC
      `).all();

      const topPages = db.prepare(`
        SELECT page_path, COUNT(*) as views
        FROM page_analytics
        GROUP BY page_path
        ORDER BY views DESC
        LIMIT 10
      `).all();

      const leadsByStatus = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM contact_submissions
        GROUP BY status
      `).all();

      res.json({
        summary: {
          total_views: totalViews,
          today_views: todayViews,
          unique_visitors: uniqueVisitors,
          total_leads: totalLeads
        },
        dailyStats,
        topPages,
        leadsByStatus,
        ga_id: process.env.GOOGLE_ANALYTICS_ID || "G-D2VRBPMM23"
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch analytics: " + err.message });
    }
  });

  // ─── DASHBOARD STATS ───
  router.get('/dashboard', (req, res) => {
    const totalLeads = db.prepare('SELECT COUNT(*) as c FROM contact_submissions').get().c;
    const newLeads = db.prepare("SELECT COUNT(*) as c FROM contact_submissions WHERE status = 'new'").get().c;
    const contactedLeads = db.prepare("SELECT COUNT(*) as c FROM contact_submissions WHERE status = 'contacted'").get().c;
    const qualifiedLeads = db.prepare("SELECT COUNT(*) as c FROM contact_submissions WHERE status = 'qualified'").get().c;
    const convertedLeads = db.prepare("SELECT COUNT(*) as c FROM contact_submissions WHERE status = 'converted'").get().c;
    const publishedPages = db.prepare("SELECT COUNT(*) as c FROM pages WHERE status = 'published'").get().c;
    const draftPages = db.prepare("SELECT COUNT(*) as c FROM pages WHERE status = 'draft'").get().c;
    const totalProjects = db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'published'").get().c;
    const totalServices = db.prepare("SELECT COUNT(*) as c FROM services WHERE status = 'published'").get().c;
const totalBlog = db.prepare("SELECT COUNT(*) as c FROM blog_posts WHERE status = 'published'").get().c;
    const totalTestimonials = db.prepare("SELECT COUNT(*) as c FROM testimonials WHERE status = 'published'").get().c;
    const totalTeam = db.prepare('SELECT COUNT(*) as c FROM team_members WHERE is_active = 1').get().c;
    const totalClients = db.prepare('SELECT COUNT(*) as c FROM clients WHERE is_active = 1').get().c;
    const totalMedia = db.prepare('SELECT COUNT(*) as c FROM media').get().c;
    const recentActivity = db.prepare('SELECT al.*, u.full_name, u.username FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT 10').all();
    const recentLeads = db.prepare("SELECT name, email, service, status, created_at FROM contact_submissions ORDER BY created_at DESC LIMIT 5").all();

    res.json({
      leads: { total: totalLeads, new: newLeads, contacted: contactedLeads, qualified: qualifiedLeads, converted: convertedLeads },
      content: { pages: publishedPages, drafts: draftPages, projects: totalProjects, services: totalServices, blog: totalBlog, testimonials: totalTestimonials, team: totalTeam, clients: totalClients, media: totalMedia },
      recentActivity,
      recentLeads,
      analytics: { configured: !!process.env.GOOGLE_ANALYTICS_ID, id: process.env.GOOGLE_ANALYTICS_ID || null },
    });
  });

  // ─── BACKUP ───
  router.get('/backup', requireRole('super_admin'), (req, res) => {
    try {
      const backupDir = path.join(__dirname, '../../server/database/backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupName = `ourelads_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      const backupPath = path.join(backupDir, backupName);
      db.backup(backupPath).then(() => {
        logActivity(db, req.user.id, 'backup', 'system', null, `Created backup: ${backupName}`, req.ip);
        res.json({ message: 'Backup created', filename: backupName });
      }).catch(err => res.status(500).json({ error: 'Backup failed: ' + err.message }));
    } catch (err) {
      res.status(500).json({ error: 'Backup failed' });
    }
  });

  return router;
}

module.exports = adminRoutes;
