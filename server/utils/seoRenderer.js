const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// Static public routes mapped to existing templates and `pages` slugs (numeric page IDs resolved from DB).
// includeInSitemap=false for non-indexable confirmation/utility pages (e.g. /thank-you).
const PAGE_CONFIG = {
  '/': { file: 'index.html', entityType: 'page', pageSlug: 'home' },
  '/about': { file: 'about.html', entityType: 'page', pageSlug: 'about' },
  '/services': { file: 'services.html', entityType: 'page', pageSlug: 'services' },
  '/work': { file: 'work.html', entityType: 'page', pageSlug: 'work' },
  '/blog': { file: 'blog.html', entityType: 'page', pageSlug: 'blog' },
  '/testimonials': { file: 'testimonials.html', entityType: 'page', pageSlug: 'testimonials' },
  '/contact': { file: 'contact.html', entityType: 'page', pageSlug: 'contact' },
  '/thank-you': { file: 'thank-you.html', entityType: 'static', includeInSitemap: false },
};

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripTag(html, regex) {
  return html.replace(regex, '');
}

function upsertHeadTag(html, { pattern, tag }) {
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

const DEFAULT_CANONICAL_ORIGIN = 'https://ourelads.com';

function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getCanonicalOrigin(req) {
  // Prefer explicitly configured public site origin (verified config). Do not invent domains.
  const configured = normalizeOrigin(process.env.SITE_URL || process.env.PUBLIC_SITE_URL || process.env.CANONICAL_ORIGIN);
  if (configured) return configured;
  // Fallback: use the verified production/public origin from existing sitemap/domain config
  // instead of blindly trusting arbitrary request Host headers.
  return DEFAULT_CANONICAL_ORIGIN;
}

function normalizePath(p) {
  if (!p) return '/';
  if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1);
  return p;
}

function getOrganizationId(origin) {
  return `${origin}/#organization`;
}

function buildOrganization(origin) {
  // Verified-only business identity (no fabricated address/location/hours/coordinates)
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': getOrganizationId(origin),
    name: 'Ourel Ads',
    url: origin,
    logo: `${origin}/logo.jpeg`,
    email: 'info@ourelads.com',
    telephone: '+91-8076292036',
    sameAs: [
      'https://www.instagram.com/ourelads',
      'https://www.linkedin.com/company/ourel-ads'
    ]
  };
}

function readTemplate(fileName) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  return fs.readFileSync(filePath, 'utf8');
}

function extractStaticTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}

function extractStaticMetaContent(html, attr, value) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*>`, 'i');
  const m = html.match(re);
  if (!m) return '';
  const tag = m[0];
  const dq = tag.match(/content="([\s\S]*?)"/i);
  if (dq) return dq[1].trim();
  const sq = tag.match(/content='([\s\S]*?)'/i);
  return sq ? sq[1].trim() : '';
}

function resolvePageEntityId(db, config) {
  if (!config || config.entityType !== 'page' || !config.pageSlug) return null;
  const row = db.prepare('SELECT id FROM pages WHERE slug = ?').get(config.pageSlug);
  return row ? row.id : null;
}

function resolveMetadata({ db, req, routePath, is404 }) {
  const settingsRows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.setting_key] = r.setting_value; });

  const config = PAGE_CONFIG[routePath] || null;
  let seoRow = null;
  let entityId = null;
  let pageRecord = null;
  if (config) {
    if (config.entityType === 'page' && config.pageSlug) {
      pageRecord = db.prepare('SELECT id, slug, status, updated_at, published_at, created_at FROM pages WHERE slug = ?').get(config.pageSlug) || null;
      entityId = pageRecord ? pageRecord.id : null;
    } else if (config.entityType === 'page') {
      entityId = resolvePageEntityId(db, config);
    }
    if (config.entityType === 'page' && entityId != null) {
      seoRow = db.prepare('SELECT * FROM seo_metadata WHERE entity_type = ? AND entity_id = ?')
        .get(config.entityType, entityId) || null;
    }
  }

  const template = readTemplate(is404 ? '404.html' : (config ? config.file : '404.html'));
  const staticTitle = extractStaticTitle(template);
  const staticDesc = extractStaticMetaContent(template, 'name', 'description');
  const staticOgTitle = extractStaticMetaContent(template, 'property', 'og:title');
  const staticOgDesc = extractStaticMetaContent(template, 'property', 'og:description');
  const staticOgImage = extractStaticMetaContent(template, 'property', 'og:image');
  const staticRobots = extractStaticMetaContent(template, 'name', 'robots');

  const canonicalOrigin = getCanonicalOrigin(req);
  const cleanPath = is404 ? normalizePath(req.path || '/') : (routePath === '/' ? '/' : routePath);
  const defaultCanonical = `${canonicalOrigin}${cleanPath === '/' ? '/' : cleanPath}`;
  const canonical = (seoRow && seoRow.canonical_url) ? seoRow.canonical_url : defaultCanonical;

  if (is404) {
    return {
      template,
      title: staticTitle || 'Page not found — Ourel Ads',
      description: staticDesc || 'The page you are looking for does not exist.',
      canonical,
      robots: staticRobots || 'noindex, nofollow',
      ogTitle: staticOgTitle || staticTitle || 'Page not found — Ourel Ads',
      ogDescription: staticOgDesc || staticDesc || 'The page you are looking for does not exist.',
      ogImage: staticOgImage || '',
      ogType: 'website',
      twitterCard: 'summary',
    };
  }

  // Non-indexable confirmation/utility pages: preserve page-specific static metadata only.
  // No DB SEO overrides, no global title/description fallback, no schema injection.
  if (routePath === '/thank-you' || (config && config.entityType === 'static')) {
    const thanksTitle = staticTitle || 'Thank you — Ourel Ads';
    const thanksDesc = staticDesc || 'Your enquiry has been received.';
    return {
      template,
      title: thanksTitle,
      description: thanksDesc,
      canonical,
      robots: staticRobots || 'noindex, follow',
      ogTitle: staticOgTitle || thanksTitle,
      ogDescription: staticOgDesc || thanksDesc,
      ogImage: staticOgImage || '',
      ogType: 'website',
      twitterCard: staticOgImage ? 'summary_large_image' : 'summary',
      entityId: null,
      pageRecord: null,
      stripJsonLd: true,
    };
  }

  // Resolution rules (server-side, preserves existing intent):
  // - Home: global seo_title/seo_description preferred as before (layout.js behavior), per-page seo_metadata can override if present.
  // - Other pages: page/static title/description preferred; seo_metadata can override; global settings only fill missing values.
  let title = staticTitle;
  let description = staticDesc;
  if (routePath === '/') {
    title = (seoRow && seoRow.seo_title) || settings.seo_title || staticTitle;
    description = (seoRow && seoRow.meta_description) || settings.seo_description || staticDesc;
  } else {
    title = (seoRow && seoRow.seo_title) || staticTitle || settings.seo_title || 'Ourel Ads';
    description = (seoRow && seoRow.meta_description) || staticDesc || settings.seo_description || '';
  }

  const robots = (seoRow && seoRow.robots) ? seoRow.robots : (staticRobots || 'index, follow');
  const ogTitle = (seoRow && seoRow.og_title) || staticOgTitle || title;
  const ogDescription = (seoRow && seoRow.og_description) || staticOgDesc || description;
  const ogImage = (seoRow && seoRow.og_image) || staticOgImage || '';
  const twitterCard = ogImage ? 'summary_large_image' : 'summary';

  return { template, title, description, canonical, robots, ogTitle, ogDescription, ogImage, ogType: 'website', twitterCard, entityId, pageRecord };
}

function resolvePageSeo(db, req, routePath) {
  const config = PAGE_CONFIG[routePath] || null;
  if (!config || is404Route(routePath)) return null;
  const meta = resolveMetadata({ db, req, routePath, is404: false });
  return meta;
}

function is404Route(routePath) {
  return routePath === '/__404__';
}

function resolveBlogSeo(db, req, post) {
  const settingsRows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  const canonicalOrigin = getCanonicalOrigin(req);
  const slug = encodeURIComponent(post.slug);
  const defaultCanonical = `${canonicalOrigin}/blog/${slug}`;
  const seoRow = db.prepare('SELECT * FROM seo_metadata WHERE entity_type = ? AND entity_id = ?')
    .get('blog_post', post.id) || null;
  const fallbackDescSource = post.excerpt || stripHtmlToText(post.content) || settings.seo_description || '';
  const fallbackDescription = truncateText(fallbackDescSource, 160);
  const baseTitle = post.title ? `${post.title} — Ourel Ads` : (settings.seo_title || 'Ourel Ads');
  const title = (seoRow && seoRow.seo_title) || baseTitle;
  const description = (seoRow && seoRow.meta_description) || fallbackDescription;
  const canonical = (seoRow && seoRow.canonical_url) || defaultCanonical;
  const robots = (seoRow && seoRow.robots) || 'index, follow';
  return { title, description, canonical, robots, defaultCanonical, seoRow };
}

function resolveProjectSeo(db, req, project) {
  const settingsRows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  const canonicalOrigin = getCanonicalOrigin(req);
  const slug = encodeURIComponent(String(project.slug || '').trim());
  const defaultCanonical = `${canonicalOrigin}/work/${slug}`;
  const seoRow = db.prepare('SELECT * FROM seo_metadata WHERE entity_type = ? AND entity_id = ?')
    .get('project', project.id) || null;
  const shortDesc = stripHtmlToText(project.description || '');
  const fullDescText = stripHtmlToText(project.full_description || '');
  const fallbackDescSource = shortDesc || fullDescText || settings.seo_description || '';
  const fallbackDescription = truncateText(fallbackDescSource, 160);
  const baseTitle = project.title ? `${project.title} — Ourel Ads` : (settings.seo_title || 'Ourel Ads');
  const meaningful = hasMeaningfulProjectContent(project);
  const title = (seoRow && seoRow.seo_title) || baseTitle;
  const description = (seoRow && seoRow.meta_description) || fallbackDescription;
  const canonical = (seoRow && seoRow.canonical_url) || defaultCanonical;
  const robots = (seoRow && seoRow.robots) || (meaningful ? 'index, follow' : 'noindex, follow');
  return { title, description, canonical, robots, defaultCanonical, meaningful, seoRow };
}

function renderSeoHtml(meta) {
  let html = meta.template;

  // Title
  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);
  } else {
    html = html.replace(/<\/head>/i, `  <title>${escapeHtml(meta.title)}</title>\n</head>`);
  }

  // Remove existing managed tags to prevent duplicates
  html = stripTag(html, /<meta[^>]+name=["']description["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+name=["']robots["'][^>]*>\s*/gi);
  html = stripTag(html, /<link[^>]+rel=["']canonical["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+property=["']og:title["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+property=["']og:description["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+property=["']og:type["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+property=["']og:url["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+property=["']og:image["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+name=["']twitter:card["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+name=["']twitter:title["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+name=["']twitter:description["'][^>]*>\s*/gi);
  html = stripTag(html, /<meta[^>]+name=["']twitter:image["'][^>]*>\s*/gi);
  if (meta.stripJsonLd) {
    html = stripTag(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi);
  }

  const tags = [];
  if (meta.description) tags.push(`<meta name="description" content="${escapeHtml(meta.description)}" />`);
  if (meta.robots) tags.push(`<meta name="robots" content="${escapeHtml(meta.robots)}" />`);
  if (meta.canonical) tags.push(`<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`);
  tags.push(`<meta property="og:title" content="${escapeHtml(meta.ogTitle || meta.title)}" />`);
  if (meta.ogDescription || meta.description) tags.push(`<meta property="og:description" content="${escapeHtml(meta.ogDescription || meta.description)}" />`);
  tags.push(`<meta property="og:type" content="${escapeHtml(meta.ogType || 'website')}" />`);
  if (meta.canonical) tags.push(`<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`);
  if (meta.ogImage) tags.push(`<meta property="og:image" content="${escapeHtml(meta.ogImage)}" />`);
  tags.push(`<meta name="twitter:card" content="${escapeHtml(meta.twitterCard || 'summary')}" />`);
  tags.push(`<meta name="twitter:title" content="${escapeHtml(meta.ogTitle || meta.title)}" />`);
  if (meta.ogDescription || meta.description) tags.push(`<meta name="twitter:description" content="${escapeHtml(meta.ogDescription || meta.description)}" />`);
  if (meta.ogImage) tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.ogImage)}" />`);
  if (meta.jsonLd) {
    const safeJsonLd = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');
    tags.push(`<script type="application/ld+json">${safeJsonLd}</script>`);
  }

  html = html.replace(/<\/head>/i, `  ${tags.join('\n  ')}\n</head>`);
  return html;
}

function renderPage(db, req, routePath, options = {}) {
  const is404 = !!options.is404;
  const meta = resolveMetadata({ db, req, routePath, is404 });
  if (!is404) {
    const origin = getCanonicalOrigin(req);
    if (routePath === '/' && !meta.jsonLd) {
      meta.jsonLd = buildOrganization(origin);
      meta.stripJsonLd = true; // replace static Organization with authoritative server-rendered definition
    } else if (routePath === '/services' && !meta.jsonLd) {
      meta.jsonLd = buildServicesHubJsonLd({ req, template: meta.template, canonical: meta.canonical });
      // preserve existing behavior: services template has no static JSON-LD
    } else if (routePath === '/blog' && !meta.jsonLd) {
      meta.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'Ourel Ads Blog',
        description: 'Insights, trends, and thoughts on advertising and creative production.',
        url: `${origin}/blog`,
        publisher: { '@id': getOrganizationId(origin) }
      };
      meta.stripJsonLd = true; // correct static .html URL and reference canonical Organization @id
    } else if (routePath === '/testimonials' && !meta.jsonLd) {
      meta.jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Testimonials - Ourel Ads',
        description: 'Client reviews and testimonials for Ourel Ads',
        url: `${origin}/testimonials`
      };
      meta.stripJsonLd = true; // correct static .html URL
    }
  }
  return renderSeoHtml(meta);
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text, maxLen) {
  const t = String(text || '').trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
}

function toAbsoluteUrl(origin, value) {
  if (!value || typeof value !== 'string') return '';
  const v = value.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('//')) return `https:${v}`;
  if (v.startsWith('/')) return `${origin}${v}`;
  return `${origin}/${v.replace(/^\.?\//, '')}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toIsoDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function renderBlogPost(db, req, post) {
  const settingsRows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.setting_key] = r.setting_value; });

  const canonicalOrigin = getCanonicalOrigin(req);
  const seoRow = db.prepare('SELECT * FROM seo_metadata WHERE entity_type = ? AND entity_id = ?')
    .get('blog_post', post.id) || null;
  const effective = resolveBlogSeo(db, req, post);

  const fallbackDescSource = post.excerpt || stripHtmlToText(post.content) || settings.seo_description || '';
  const fallbackDescription = truncateText(fallbackDescSource, 160);
  const baseTitle = post.title ? `${post.title} — Ourel Ads` : (settings.seo_title || 'Ourel Ads');

  const title = effective.title || ((seoRow && seoRow.seo_title) || baseTitle);
  const description = effective.description || ((seoRow && seoRow.meta_description) || fallbackDescription);
  const canonical = effective.canonical;
  const robots = effective.robots;
  const ogTitle = (seoRow && seoRow.og_title) || title;
  const ogDescription = (seoRow && seoRow.og_description) || description;
  const postImageAbs = toAbsoluteUrl(canonicalOrigin, post.featured_image || '');
  const ogImage = (seoRow && seoRow.og_image) || postImageAbs || '';
  const ogType = 'article';
  const twitterCard = ogImage ? 'summary_large_image' : 'summary';

  const template = readTemplate('blog.html');
  const { sanitizeRichHtml } = require('./htmlSanitizer');
  const safeBody = sanitizeRichHtml(post.content || '') || `<p>${escapeHtml(fallbackDescription || 'Article details coming soon.')}</p>`;
  const author = (post.author && String(post.author).trim()) ? String(post.author).trim() : '';
  const publishedIso = toIsoDate(post.published_at);
  const modifiedIso = toIsoDate(post.updated_at || post.created_at || post.published_at);
  const publishedDisplay = formatDisplayDate(post.published_at);

  const metaParts = [];
  if (author) metaParts.push(escapeHtml(author));
  if (publishedDisplay) metaParts.push(`<time datetime="${escapeHtml(publishedIso || '')}">${escapeHtml(publishedDisplay)}</time>`);

  const heroImageHtml = post.featured_image
    ? `<div style="margin-top:1.5rem"><img src="${escapeHtml(post.featured_image)}" alt="${escapeHtml(post.title || 'Blog article image')}" style="width:100%;max-height:420px;object-fit:cover;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.12)" loading="eager" decoding="async"></div>`
    : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: String(post.title || '').trim() || undefined,
    description: description || undefined,
    image: ogImage ? [ogImage] : undefined,
    datePublished: publishedIso || undefined,
    dateModified: modifiedIso || undefined,
    author: author ? { '@type': 'Person', name: author } : undefined,
    publisher: { '@id': getOrganizationId(canonicalOrigin) },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical
    },
    url: canonical
  };
  Object.keys(jsonLd).forEach(k => jsonLd[k] === undefined && delete jsonLd[k]);

  const articleMain = `
  <main id="main-content">
    <section class="page-hero">
      <div class="page-hero-bg">
        <picture>
          <source srcset="/hero_bg.webp" type="image/webp" />
          <img src="/hero_bg.jpg" alt="" width="1376" height="768" decoding="async" fetchpriority="high" />
        </picture>
        <div class="page-hero-overlay"></div>
      </div>
      <div class="page-hero-content container">
        <div class="hero-eyebrow">
          <span class="hero-eyebrow-line"></span>
          <span class="hero-eyebrow-text"><a href="/blog" style="color:inherit;text-decoration:none">Blog</a></span>
        </div>
        <h1>${escapeHtml(post.title || 'Article')}</h1>
        ${description ? `<p class="page-lead">${escapeHtml(description)}</p>` : ''}
      </div>
    </section>
    <section class="page-section" style="background:#fff">
      <div class="container article-wrap">
        <p style="margin-bottom:1rem"><a href="/blog" class="btn btn-outline-dark" style="display:inline-flex;align-items:center;gap:8px">← Back to blog</a></p>
        ${metaParts.length ? `<div class="article-meta">${metaParts.join(' · ')}</div>` : ''}
        ${heroImageHtml}
        <article class="article-body" style="margin-top:1.75rem">
          ${safeBody}
        </article>
      </div>
    </section>
  </main>`;

  let html = template;
  // Replace main content of blog listing with article detail view
  html = html.replace(/<main id="main-content">[\s\S]*<\/main>/i, articleMain);
  html = html.replace(/<body([^>]*)data-page="[^"]*"([^>]*)>/i, '<body$1data-page="blog-post"$2>');

  const meta = {
    template: html,
    title,
    description,
    canonical,
    robots,
    ogTitle,
    ogDescription,
    ogImage,
    ogType,
    twitterCard,
    jsonLd,
    stripJsonLd: true,
  };
  return renderSeoHtml(meta);
}


function hasMeaningfulProjectContent(project) {
  const desc = stripHtmlToText(project.description || '');
  const full = stripHtmlToText(project.full_description || '');
  const combinedLen = (desc + ' ' + full).trim().length;
  let imageCount = 0;
  if (project.thumbnail) imageCount += 1;
  if (project.images) {
    try {
      const parsed = JSON.parse(project.images);
      if (Array.isArray(parsed)) imageCount += parsed.filter(Boolean).length;
      else if (String(project.images).trim()) imageCount += 1;
    } catch {
      imageCount += String(project.images).split(',').map(s => s.trim()).filter(Boolean).length;
    }
  }
  const hasVideo = !!(project.video_url && String(project.video_url).trim());
  // Thin label-only records (e.g. "Brand Film") should default to noindex.
  if (full.length >= 40) return true;
  if (combinedLen >= 80) return true;
  if (combinedLen >= 40 && (imageCount > 1 || hasVideo)) return true;
  return false;
}

function isSafeExternalUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    const p = u.protocol.toLowerCase();
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

function renderProject(db, req, project) {
  const settingsRows = db.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.setting_key] = r.setting_value; });

  const canonicalOrigin = getCanonicalOrigin(req);
  const seoRow = db.prepare('SELECT * FROM seo_metadata WHERE entity_type = ? AND entity_id = ?')
    .get('project', project.id) || null;
  const effective = resolveProjectSeo(db, req, project);

  const shortDesc = stripHtmlToText(project.description || '');
  const fullDescText = stripHtmlToText(project.full_description || '');
  const fallbackDescSource = shortDesc || fullDescText || settings.seo_description || '';
  const fallbackDescription = truncateText(fallbackDescSource, 160);
  const baseTitle = project.title ? `${project.title} — Ourel Ads` : (settings.seo_title || 'Ourel Ads');

  const title = effective.title || ((seoRow && seoRow.seo_title) || baseTitle);
  const description = effective.description || ((seoRow && seoRow.meta_description) || fallbackDescription);
  const canonical = effective.canonical;
  const robots = effective.robots;
  const ogTitle = (seoRow && seoRow.og_title) || title;
  const ogDescription = (seoRow && seoRow.og_description) || description;
  const projectImage = project.thumbnail || '';
  const ogImage = (seoRow && seoRow.og_image) || toAbsoluteUrl(canonicalOrigin, projectImage) || '';
  const ogType = 'website';
  const twitterCard = ogImage ? 'summary_large_image' : 'summary';

  const template = readTemplate('work.html');
  const { sanitizeRichHtml } = require('./htmlSanitizer');
  const brand = (project.brand && String(project.brand).trim()) ? String(project.brand).trim() : (project.client_name || '');
  const categoryLabel = (project.category_slug || '').toString().replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const year = (project.year && String(project.year).trim()) ? String(project.year).trim() : '';
  const safeLead = shortDesc ? `<p class="page-lead">${escapeHtml(shortDesc)}</p>` : (description ? `<p class="page-lead">${escapeHtml(description)}</p>` : '');
  const safeFull = sanitizeRichHtml(project.full_description || '');
  const fullSection = safeFull ? `<section style="margin-top:1.5rem"><h2 style="margin-bottom:.75rem">Project Overview</h2><div class="article-body">${safeFull}</div></section>` : '';

  const metaBits = [];
  if (brand) metaBits.push(`<span><strong>Brand:</strong> ${escapeHtml(String(brand))}</span>`);
  if (categoryLabel) metaBits.push(`<span><strong>Category:</strong> ${escapeHtml(categoryLabel)}</span>`);
  if (year) metaBits.push(`<span><strong>Year:</strong> ${escapeHtml(year)}</span>`);
  const metaLine = metaBits.length ? `<div class="article-meta" style="display:flex;flex-wrap:wrap;gap:12px 18px;margin-top:1rem">${metaBits.join('')}</div>` : '';

  const mediaParts = [];
  if (project.thumbnail) {
    mediaParts.push(`<div style="margin-top:1.5rem"><img src="${escapeHtml(project.thumbnail)}" alt="${escapeHtml(project.title || 'Project image')}" style="width:100%;max-height:460px;object-fit:cover;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.12)" loading="eager" decoding="async"></div>`);
  }
  if (project.images) {
    let imgs = [];
    try {
      const parsed = JSON.parse(project.images);
      if (Array.isArray(parsed)) imgs = parsed;
    } catch {
      imgs = String(project.images).split(',').map(s => s.trim()).filter(Boolean);
    }
    imgs = imgs.map(u => String(u || '').trim()).filter(u => u && u !== project.thumbnail && isSafeExternalUrl(u) || (u && u !== project.thumbnail && (u.startsWith('/') || u.startsWith('./') || u.startsWith('../'))));
    // keep only safe-looking urls
    imgs = imgs.filter(u => isSafeExternalUrl(u) || u.startsWith('/') || u.startsWith('assets/') || u.startsWith('./') || u.startsWith('../'));
    if (imgs.length) {
      const grid = imgs.slice(0, 8).map(u => `<img src="${escapeHtml(u)}" alt="${escapeHtml((project.title || 'Project') + ' image')}" style="width:100%;height:220px;object-fit:cover;border-radius:12px" loading="lazy" decoding="async">`).join('');
      mediaParts.push(`<section style="margin-top:1.75rem"><h2 style="margin-bottom:.75rem">Gallery</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">${grid}</div></section>`);
    }
  }
  if (project.video_url && isSafeExternalUrl(project.video_url)) {
    const v = escapeHtml(project.video_url);
    mediaParts.push(`<section style="margin-top:1.75rem"><h2 style="margin-bottom:.75rem">Video</h2><p><a href="${v}" class="btn btn-outline-dark" target="_blank" rel="noopener noreferrer">Watch video</a></p></section>`);
  }
  const externalUrl = (project.project_url && isSafeExternalUrl(project.project_url)) ? String(project.project_url).trim() : '';
  const ctaRow = externalUrl ? `<div style="margin-top:1.25rem;display:flex;gap:10px;flex-wrap:wrap"><a href="${escapeHtml(externalUrl)}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Visit Project</a></div>` : '';

  const emptyNote = (!safeFull && !shortDesc && !project.thumbnail && !externalUrl && !project.video_url) ? '<p style="margin-top:1.25rem;color:var(--text-muted,#666)">Project details will be added soon.</p>' : '';

  const articleMain = `
  <main id="main-content">
    <section class="page-hero">
      <div class="page-hero-bg">
        <picture>
          <source srcset="/hero_bg.webp" type="image/webp" />
          <img src="/hero_bg.jpg" alt="" width="1376" height="768" decoding="async" fetchpriority="high" />
        </picture>
        <div class="page-hero-overlay"></div>
      </div>
      <div class="page-hero-content container">
        <div class="hero-eyebrow">
          <span class="hero-eyebrow-line"></span>
          <span class="hero-eyebrow-text"><a href="/work" style="color:inherit;text-decoration:none">Work</a></span>
        </div>
        <h1>${escapeHtml(project.title || 'Project')}</h1>
        ${safeLead}
      </div>
    </section>
    <section class="page-section" style="background:#fff">
      <div class="container article-wrap">
        <p style="margin-bottom:1rem"><a href="/work" class="btn btn-outline-dark" style="display:inline-flex;align-items:center;gap:8px">← Back to work</a></p>
        ${metaLine}
        ${ctaRow}
        ${mediaParts.join('\n')}
        ${fullSection}
        ${emptyNote}
      </div>
    </section>
  </main>`;

  let html = template;
  html = html.replace(/<main id="main-content">[\s\S]*<\/main>/i, articleMain);
  html = html.replace(/<body([^>]*)data-page="[^"]*"([^>]*)>/i, '<body$1data-page="project-detail"$2>');

  const meta = {
    template: html,
    title,
    description,
    canonical,
    robots,
    ogTitle,
    ogDescription,
    ogImage,
    ogType,
    twitterCard,
    stripJsonLd: true,
  };
  return renderSeoHtml(meta);
}

function buildServicesHubJsonLd({ req, template, canonical }) {
  try {
    const origin = getCanonicalOrigin(req);
    const pageUrl = canonical || `${origin}/services`;
    const list = [];
    const re = /<div[^>]*class="service-card-pro"[^>]*id="(service-[^"]+)"[^>]*>[\s\S]*?<h3 class="service-card-pro-title">([\s\S]*?)<\/h3>[\s\S]*?<p class="service-card-pro-desc">([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = re.exec(template)) !== null) {
      const id = (m[1] || '').trim();
      const name = stripHtmlToText(m[2] || '');
      const desc = stripHtmlToText(m[3] || '');
      if (!id || !name) continue;
      list.push({
        '@type': 'ListItem',
        position: list.length + 1,
        item: {
          '@type': 'Service',
          name,
          description: desc || undefined,
          url: `${origin}/services#${id}`
        }
      });
    }
    if (!list.length) return null;
    const graph = [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Services', item: pageUrl }
        ]
      },
      {
        '@type': 'ItemList',
        name: 'Ourel Ads Services',
        itemListElement: list
      }
    ];
    // remove undefined description fields
    graph[1].itemListElement.forEach(li => {
      if (li.item && li.item.description === undefined) delete li.item.description;
    });
    return { '@context': 'https://schema.org', '@graph': graph };
  } catch {
    return null;
  }
}

function xmlEscape(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeCanonicalForCompare(origin, urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const originUrl = new URL(origin);
    const u = new URL(urlStr, origin);
    // must be same scheme/host (trusted origin)
    if (u.protocol !== originUrl.protocol) return null;
    if (u.host !== originUrl.host) return null;
    // no query or hash in canonical self URL for sitemap eligibility
    if (u.search) return null;
    if (u.hash) return null;
    // normalize path: remove trailing slash except root
    let p = u.pathname || '/';
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    // ensure encoded consistently via URL pathname
    return `${u.protocol}//${u.host}${p}`;
  } catch {
    return null;
  }
}

function isRobotsIndexable(robots) {
  if (!robots) return true;
  const parts = String(robots).toLowerCase().split(',').map(s => s.trim());
  return !parts.includes('noindex');
}

function isValidBlogSlug(slug) {
  const s = String(slug || '').trim();
  return !!s && s.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(s);
}

function isValidProjectSlug(slug) {
  const s = String(slug || '').trim();
  return !!s && s.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

function toW3CDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  // content timestamps: use date part only to avoid fabricated precision/timezone confusion
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (!y || y < 1970) return null;
  return `${y}-${m}-${day}`;
}

function pickLastmod(...candidates) {
  for (const c of candidates) {
    const v = toW3CDate(c);
    if (v) return v;
  }
  return null;
}

function buildSitemapEntries(db, req) {
  const origin = getCanonicalOrigin(req);
  const entries = [];
  const seenLoc = new Set();

  function addEntry(loc, lastmod) {
    if (!loc || seenLoc.has(loc)) return;
    seenLoc.add(loc);
    entries.push({ loc, lastmod: lastmod || null });
  }

  // Static public pages from PAGE_CONFIG allowlist only (indexable page entities only)
  for (const routePath of Object.keys(PAGE_CONFIG)) {
    const config = PAGE_CONFIG[routePath];
    if (!config || config.includeInSitemap === false) continue;
    if (!config || config.entityType !== 'page') continue;
    const page = db.prepare('SELECT id, slug, status, updated_at, published_at, created_at FROM pages WHERE slug = ?').get(config.pageSlug);
    if (!page || page.status !== 'published') continue;
    const meta = resolveMetadata({ db, req, routePath, is404: false });
    if (!meta) continue;
    if (!isRobotsIndexable(meta.robots)) continue;
    const defaultCanonical = `${origin}${routePath === '/' ? '/' : routePath}`;
    const normalizedCanonical = normalizeCanonicalForCompare(origin, meta.canonical);
    const normalizedExpected = normalizeCanonicalForCompare(origin, defaultCanonical);
    if (!normalizedCanonical || !normalizedExpected || normalizedCanonical !== normalizedExpected) continue;
    const lastmod = pickLastmod(page.updated_at, page.published_at, page.created_at);
    addEntry(normalizedExpected, lastmod);
  }

  // Blog posts
  const blogs = db.prepare('SELECT id, slug, status, updated_at, published_at, created_at FROM blog_posts WHERE status = ?').all('published');
  for (const post of blogs) {
    if (!isValidBlogSlug(post.slug)) continue;
    // ambiguity guard: ensure single published match for slug
    const matches = db.prepare('SELECT id FROM blog_posts WHERE slug = ? AND status = ?').all(post.slug, 'published');
    if (matches.length !== 1) continue;
    const effective = resolveBlogSeo(db, req, post);
    if (!isRobotsIndexable(effective.robots)) continue;
    const expected = `${origin}/blog/${encodeURIComponent(post.slug)}`;
    const normalizedCanonical = normalizeCanonicalForCompare(origin, effective.canonical);
    const normalizedExpected = normalizeCanonicalForCompare(origin, expected);
    if (!normalizedCanonical || !normalizedExpected || normalizedCanonical !== normalizedExpected) continue;
    const lastmod = pickLastmod(post.updated_at, post.published_at, post.created_at);
    addEntry(normalizedExpected, lastmod);
  }

  // Projects
  const projects = db.prepare('SELECT id, slug, status, description, full_description, thumbnail, images, video_url, updated_at, created_at FROM projects WHERE status = ?').all('published');
  for (const project of projects) {
    if (!isValidProjectSlug(project.slug)) continue;
    const rawSlug = String(project.slug).trim();
    const matches = db.prepare('SELECT id FROM projects WHERE lower(slug) = lower(?) AND status = ?').all(rawSlug, 'published');
    if (matches.length !== 1) continue;
    const effective = resolveProjectSeo(db, req, project);
    if (!isRobotsIndexable(effective.robots)) continue;
    const expected = `${origin}/work/${encodeURIComponent(rawSlug)}`;
    const normalizedCanonical = normalizeCanonicalForCompare(origin, effective.canonical);
    const normalizedExpected = normalizeCanonicalForCompare(origin, expected);
    if (!normalizedCanonical || !normalizedExpected || normalizedCanonical !== normalizedExpected) continue;
    const lastmod = pickLastmod(project.updated_at, project.created_at);
    addEntry(normalizedExpected, lastmod);
  }

  // deterministic ordering
  entries.sort((a, b) => a.loc.localeCompare(b.loc));
  return entries;
}

function renderSitemapXml(db, req) {
  const entries = buildSitemapEntries(db, req);
  const body = entries.map(e => {
    const lastmod = e.lastmod ? `\n    <lastmod>${xmlEscape(e.lastmod)}</lastmod>` : '';
    return `  <url>\n    <loc>${xmlEscape(e.loc)}</loc>${lastmod}\n  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}${body ? '\n' : ''}</urlset>\n`;
}

function renderRobotsTxt(req) {
  const origin = getCanonicalOrigin(req);
  return `User-agent: *\nDisallow: /admin/\nDisallow: /api/\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

module.exports = {
  PAGE_CONFIG,
  renderPage,
  renderBlogPost,
  renderProject,
  escapeHtml,
  getCanonicalOrigin,
  isSafeExternalUrl,
  hasMeaningfulProjectContent,
  resolveMetadata,
  resolvePageSeo,
  resolveBlogSeo,
  resolveProjectSeo,
  toIsoDate,
  renderSitemapXml,
  renderRobotsTxt,
};

