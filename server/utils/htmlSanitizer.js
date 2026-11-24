/**
 * Minimal allowlist-based HTML sanitizer for stored blog content.
 * No external dependencies. Strips dangerous tags/attributes/URL schemes.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img',
  'span', 'div', 'figure', 'figcaption'
]);

const VOID_TAGS = new Set(['br', 'hr', 'img']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'meta', 'link', 'base']);

const GLOBAL_ATTRS = new Set(['class']);
const TAG_ATTRS = {
  a: new Set(['href', 'title', 'target', 'rel', 'class']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'class']),
};

function isSafeHref(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (v.startsWith('#') || v.startsWith('/') || v.startsWith('./') || v.startsWith('../')) return true;
  try {
    const u = new URL(v, 'https://ourelads.com');
    const p = u.protocol.toLowerCase();
    return p === 'http:' || p === 'https:' || p === 'mailto:' || p === 'tel:';
  } catch {
    return false;
  }
}

function isSafeSrc(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (v.startsWith('/') || v.startsWith('./') || v.startsWith('../')) return true;
  try {
    const u = new URL(v, 'https://ourelads.com');
    const p = u.protocol.toLowerCase();
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeAttributes(tag, attrsRaw) {
  const allowed = TAG_ATTRS[tag] || new Set();
  const attrs = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = attrRe.exec(attrsRaw || '')) !== null) {
    const name = m[1].toLowerCase();
    const value = (m[3] ?? m[4] ?? m[5] ?? '').trim();
    if (name.startsWith('on')) continue;
    if (!(GLOBAL_ATTRS.has(name) || allowed.has(name))) continue;
    if (name === 'href' && !isSafeHref(value)) continue;
    if (name === 'src' && !isSafeSrc(value)) continue;
    if (name === 'target') {
      if (value !== '_blank') continue;
      attrs.push('target="_blank"');
      // ensure rel safety
      continue;
    }
    if (name === 'rel') {
      const safeRel = value.split(/\s+/).filter(x => ['noopener', 'noreferrer', 'nofollow', 'ugc'].includes(x.toLowerCase())).join(' ');
      if (safeRel) attrs.push(`rel="${escapeHtml(safeRel)}"`);
      continue;
    }
    if ((name === 'width' || name === 'height') && !/^\d{1,4}$/.test(value)) continue;
    if (name === 'loading' && !['lazy', 'eager'].includes(value.toLowerCase())) continue;
    if (name === 'decoding' && !['async', 'sync', 'auto'].includes(value.toLowerCase())) continue;
    attrs.push(`${name}="${escapeHtml(value)}"`);
  }
  if (tag === 'a' && /target="_blank"/.test(attrs.join(' ')) && !/rel=/.test(attrs.join(' '))) {
    attrs.push('rel="noopener noreferrer"');
  }
  return attrs.length ? ' ' + attrs.join(' ') : '';
}

function sanitizeRichHtml(input) {
  if (input == null) return '';
  let html = String(input);
  if (!html.trim()) return '';

  // Remove comments
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Drop dangerous elements with their content
  for (const tag of DROP_WITH_CONTENT) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    html = html.replace(re, '');
    const self = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    html = html.replace(self, '');
  }

  // Tokenize tags
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { out += escapeHtml(html.slice(i)); break; }
    if (lt > i) out += escapeHtml(html.slice(i, lt));

    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) { out += escapeHtml(html.slice(lt)); break; }

    const raw = html.slice(lt + 1, gt).trim();
    // Ignore processing instructions/doctype weirdness
    if (!raw || raw.startsWith('!') || raw.startsWith('?')) { i = gt + 1; continue; }

    const isClosing = raw.startsWith('/');
    const body = isClosing ? raw.slice(1).trim() : raw;
    const selfClosing = /\/$/.test(body);
    const nameMatch = body.match(/^([a-zA-Z0-9:-]+)/);
    if (!nameMatch) { out += escapeHtml(html.slice(lt, gt + 1)); i = gt + 1; continue; }
    const tag = nameMatch[1].toLowerCase();
    const attrsRaw = body.slice(nameMatch[1].length).replace(/\/$/, '');

    if (!ALLOWED_TAGS.has(tag)) {
      // drop tag, keep inner content (already handled by walking string)
      i = gt + 1;
      continue;
    }

    if (isClosing) {
      if (!VOID_TAGS.has(tag)) out += `</${tag}>`;
    } else {
      const safeAttrs = sanitizeAttributes(tag, attrsRaw);
      if (VOID_TAGS.has(tag) || selfClosing) out += `<${tag}${safeAttrs} />`;
      else out += `<${tag}${safeAttrs}>`;
    }
    i = gt + 1;
  }

  // Basic cleanup: collapse excessive blank lines produced by dropped tags
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { sanitizeRichHtml, escapeHtml };
