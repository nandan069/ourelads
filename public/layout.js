/* Shared header/footer, consent management, and safe GTM/GA4 loading (3.7D-2B).
 * - Defaults: analytics/advertising denied before any optional tag load.
 * - No optional Google tags/cookies before relevant consent.
 * - Missing consent is treated as denial.
 * - GTM-primary mode when valid GTM ID configured; GA4-fallback when GTM absent and valid GA4 ID configured.
 * - No Ads conversion dispatch/claims; unsafe conversion trigger remains externally managed (not enabled here).
 */
(function () {
  var page = document.body.getAttribute('data-page');
  if (!page) {
    var pathName = window.location.pathname.replace(/^\//, '').replace(/\.html$/, '');
    page = (pathName === '' || pathName === 'index') ? 'home' : pathName;
  }

  /* ─── CONSENT CONFIG (placeholder copy for legal/product review) ─── */
  var CONSENT_KEY = 'ourelads.consent.v1';
  var CONSENT_VERSION = '1';
  var CONSENT_DAYS = 180;
  var GTM_RE = /^GTM-[A-Z0-9]+$/i;
  var GA4_RE = /^G-[A-Z0-9]+$/i;

  function nowIso() { try { return new Date().toISOString(); } catch (_) { return ''; } }
  function safeGet(k) { try { return window.localStorage ? localStorage.getItem(k) : null; } catch (_) { return null; } }
  function safeSet(k, v) { try { if (window.localStorage) { localStorage.setItem(k, v); return true; } } catch (_) {} return false; }
  function readConsent() {
    try {
      var raw = safeGet(CONSENT_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || obj.version !== CONSENT_VERSION) return null;
      if (obj.analytics !== true && obj.analytics !== false) return null;
      if (obj.advertising !== true && obj.advertising !== false) return null;
      return { analytics: !!obj.analytics, advertising: !!obj.advertising, version: String(obj.version), updatedAt: obj.updatedAt || null };
    } catch (_) { return null; }
  }
  function writeConsent(next) {
    var rec = { version: CONSENT_VERSION, analytics: !!next.analytics, advertising: !!next.advertising, updatedAt: nowIso() };
    var stored = safeSet(CONSENT_KEY, JSON.stringify(rec));
    rec._stored = stored;
    return rec;
  }
  function consentState() {
    var c = readConsent();
    if (c) return c;
    // Missing/invalid consent treated as denial (safe default)
    return { analytics: false, advertising: false, version: CONSENT_VERSION, updatedAt: null, missing: true };
  }

  /* ─── Consent Mode (defaults denied before optional tags) ─── */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  function applyConsentMode(c) {
    try {
      var granted = function (v) { return v ? 'granted' : 'denied'; };
      // Conservative defaults; no consent treated as denied.
      window.gtag('consent', 'update', {
        analytics_storage: granted(!!c.analytics),
        ad_storage: granted(!!c.advertising),
        ad_user_data: granted(!!c.advertising),
        ad_personalization: granted(!!c.advertising)
      });
    } catch (_) {}
  }
  // Set defaults immediately (before any optional tag load)
  try {
    window.gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500
    });
  } catch (_) {}

  /* ─── Tag loader state ─── */
  window.__ourelads_gtm_loaded = window.__ourelads_gtm_loaded || false;
  window.__ourelads_ga4_loaded = window.__ourelads_ga4_loaded || false;
  var settingsCache = null;
  var settingsPromise = null;

  function normalizeId(v) { return (v == null ? '' : String(v)).trim(); }
  function isValidGtm(id) { return GTM_RE.test(normalizeId(id)); }
  function isValidGa4(id) { return GA4_RE.test(normalizeId(id)); }

  function fetchSettings() {
    if (settingsCache) return Promise.resolve(settingsCache);
    if (settingsPromise) return settingsPromise;
    settingsPromise = fetch('/api/settings')
      .then(function (res) { return res.json(); })
      .then(function (s) { settingsCache = s || {}; return settingsCache; })
      .catch(function () { settingsCache = {}; return settingsCache; });
    return settingsPromise;
  }

  function loadGtm(gtmId) {
    var id = normalizeId(gtmId);
    if (!isValidGtm(id)) return;
    if (window.__ourelads_gtm_loaded) return;
    if (document.querySelector('script[src*="googletagmanager.com/gtm.js?id="]')) { window.__ourelads_gtm_loaded = true; return; }
    window.__ourelads_gtm_loaded = true;
    (function (w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var f = d.getElementsByTagName(s)[0],
        j = d.createElement(s),
        dl = l !== 'dataLayer' ? '&l=' + l : '';
      j.async = true;
      j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
      f.parentNode.insertBefore(j, f);
    })(window, document, 'script', 'dataLayer', id);
  }

  function loadGa4(ga4Id) {
    var id = normalizeId(ga4Id);
    if (!isValidGa4(id)) return;
    if (window.__ourelads_ga4_loaded) return;
    if (document.querySelector('script[src*="googletagmanager.com/gtag/js?id="]')) { window.__ourelads_ga4_loaded = true; return; }
    window.__ourelads_ga4_loaded = true;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(script);
    window.gtag = window.gtag || gtag;
    window.gtag('js', new Date());
    window.gtag('config', id, { send_page_view: true });
  }

  function maybeLoadTags() {
    var c = consentState();
    applyConsentMode(c);
    // No optional tags before relevant consent
    if (!c.analytics && !c.advertising) return;
    fetchSettings().then(function (s) {
      var gtmId = normalizeId(s && s.google_tag_manager_id);
      var ga4Id = normalizeId(s && s.google_analytics_id);
      // Single authoritative loader: GTM-primary if valid GTM configured; else GA4-fallback
      if (isValidGtm(gtmId)) {
        // GTM manages tags in container; load only after required consent (analytics or advertising as configured by container).
        loadGtm(gtmId);
        return;
      }
      // GA4 fallback mode (no valid GTM): analytics consent only; NO Ads conversion emission.
      if (c.analytics && isValidGa4(ga4Id)) {
        loadGa4(ga4Id);
      }
    });
  }

  /* ─── Consent UI (accessible, responsive, neutral placeholder copy) ─── */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'checked') n.checked = !!v;
      else if (k === 'disabled') n.disabled = !!v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) n.setAttribute(k, v);
    });
    (children || []).forEach(function (ch) { if (ch) n.appendChild(ch); });
    return n;
  }

  var ui = { banner: null, modal: null, lastFocus: null, prefsOpen: false };

  function trapFocus(container, e) {
    if (e.key !== 'Tab') return;
    var focusables = container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function removeBanner() { if (ui.banner && ui.banner.parentNode) ui.banner.parentNode.removeChild(ui.banner); ui.banner = null; }

  function openPreferences(fromBanner) {
    ui.lastFocus = document.activeElement;
    if (ui.modal) return;
    var c = consentState();
    var analyticsToggle = el('input', { type: 'checkbox', id: 'consent-analytics', 'data-consent': 'analytics' });
    analyticsToggle.checked = !!c.analytics;
    var adsToggle = el('input', { type: 'checkbox', id: 'consent-advertising', 'data-consent': 'advertising' });
    adsToggle.checked = !!c.advertising;

    var closeBtn = el('button', { type: 'button', class: 'consent-btn consent-btn-secondary', 'aria-label': 'Close preferences', text: 'Close' });
    var saveBtn = el('button', { type: 'button', class: 'consent-btn consent-btn-primary', text: 'Save preferences' });
    var rejectBtn = el('button', { type: 'button', class: 'consent-btn consent-btn-secondary', text: 'Reject optional' });
    var acceptBtn = el('button', { type: 'button', class: 'consent-btn consent-btn-primary', text: 'Accept all optional' });

    var dialog = el('div', { class: 'consent-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'consent-title', 'aria-describedby': 'consent-desc' }, [
      el('div', { class: 'consent-modal-header' }, [
        el('h2', { id: 'consent-title', class: 'consent-title', text: 'Cookie preferences' }),
        closeBtn
      ]),
      el('p', { id: 'consent-desc', class: 'consent-desc', text: 'We use necessary cookies for core site functionality. Optional cookies help us understand site usage (analytics) and measure advertising effectiveness. You can accept, reject, or choose by category. You can change or withdraw your choices at any time from "Cookie preferences" in the footer. Placeholder copy: final wording subject to legal/product review.' }),
      el('div', { class: 'consent-options' }, [
        el('div', { class: 'consent-option' }, [
          el('div', { class: 'consent-option-text' }, [
            el('div', { class: 'consent-option-title', text: 'Necessary' }),
            el('div', { class: 'consent-option-desc', text: 'Required for basic site and security functionality. Always active.' })
          ]),
          el('span', { class: 'consent-badge', text: 'Always on', 'aria-label': 'Necessary cookies always enabled' })
        ]),
        el('label', { class: 'consent-option', for: 'consent-analytics' }, [
          el('div', { class: 'consent-option-text' }, [
            el('div', { class: 'consent-option-title', text: 'Analytics' }),
            el('div', { class: 'consent-option-desc', text: 'Helps us understand site usage and improve performance (optional).' })
          ]),
          el('span', { class: 'consent-toggle' }, [analyticsToggle, el('span', { class: 'consent-toggle-ui', 'aria-hidden': 'true' })])
        ]),
        el('label', { class: 'consent-option', for: 'consent-advertising' }, [
          el('div', { class: 'consent-option-text' }, [
            el('div', { class: 'consent-option-title', text: 'Advertising' }),
            el('div', { class: 'consent-option-desc', text: 'Supports advertising measurement features when enabled and approved (optional). No advertising conversion tracking is enabled in this build.' })
          ]),
          el('span', { class: 'consent-toggle' }, [adsToggle, el('span', { class: 'consent-toggle-ui', 'aria-hidden': 'true' })])
        ])
      ]),
      el('div', { class: 'consent-actions' }, [rejectBtn, acceptBtn, saveBtn]),
      el('p', { class: 'consent-note', text: 'Note: cookies or data set before this consent experience (or by other systems) may persist until they expire or are cleared in your browser. If optional tags were already loaded, withdrawing consent may trigger a page reload to help stop further same-page measurement; previously transmitted data is not erased. This implementation does not claim legal compliance.' })
    ]);

    var overlay = el('div', { class: 'consent-overlay', 'data-consent-overlay': '1' }, [dialog]);
    function closePrefs() {
      if (!ui.modal) return;
      try { document.removeEventListener('keydown', onKey); } catch (_) {}
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      ui.modal = null;
      ui.prefsOpen = false;
      try { if (ui.lastFocus && ui.lastFocus.focus) ui.lastFocus.focus(); } catch (_) {}
    }
    function commit(next) {
      var prev = consentState();
      var hadLoadedTags = !!(window.__ourelads_gtm_loaded || window.__ourelads_ga4_loaded || document.querySelector('script[src*="googletagmanager.com/gtm.js?id="],script[src*="googletagmanager.com/gtag/js?id="]'));
      var withdrewAny = (!!prev.analytics && !next.analytics) || (!!prev.advertising && !next.advertising);
      writeConsent(next);
      applyConsentMode(consentState());
      removeBanner();
      // Safe withdrawal strategy: if optional tags were already loaded in this page, a reload is the
      // safest way to stop further same-page third-party execution after consent is withdrawn.
      // Previously transmitted data/cookies are not erased by this action.
      if (hadLoadedTags && withdrewAny) {
        try { window.dispatchEvent(new CustomEvent('ourelads:consent-changed', { detail: consentState() })); } catch (_) {}
        closePrefs();
        try { window.location.reload(); } catch (_) {}
        return;
      }
      closePrefs();
      // If consent withdrawn but no tags loaded, reflect choice for future loads without reload.
      if (next.analytics || next.advertising) maybeLoadTags();
      try { window.dispatchEvent(new CustomEvent('ourelads:consent-changed', { detail: consentState() })); } catch (_) {}
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); closePrefs(); return; }
      trapFocus(dialog, e);
    }
    closeBtn.addEventListener('click', closePrefs);
    rejectBtn.addEventListener('click', function () { commit({ analytics: false, advertising: false }); });
    acceptBtn.addEventListener('click', function () { commit({ analytics: true, advertising: true }); });
    saveBtn.addEventListener('click', function () { commit({ analytics: !!analyticsToggle.checked, advertising: !!adsToggle.checked }); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePrefs(); });
    document.addEventListener('keydown', onKey);
    ui.modal = overlay;
    ui.prefsOpen = true;
    document.body.appendChild(overlay);
    setTimeout(function () { try { saveBtn.focus(); } catch (_) {} }, 0);
  }

  function showBannerIfNeeded() {
    var c = readConsent();
    if (c || ui.banner || ui.prefsOpen) return;
    var manageBtn = el('button', { type: 'button', class: 'consent-btn consent-btn-secondary', text: 'Manage preferences' });
    var rejectBtn = el('button', { type: 'button', class: 'consent-btn consent-btn-secondary', text: 'Reject optional' });
    var acceptBtn = el('button', { type: 'button', class: 'consent-btn consent-btn-primary', text: 'Accept optional' });
    var banner = el('div', { class: 'consent-banner', role: 'region', 'aria-label': 'Cookie consent', 'aria-live': 'polite' }, [
      el('div', { class: 'consent-banner-inner' }, [
        el('div', { class: 'consent-banner-text' }, [
          el('strong', { text: 'Cookie choices' }),
          el('span', { text: ' — We use necessary cookies for core functionality. With your choice, we may use analytics and/or advertising cookies. Optional cookies are off unless you allow them. (Placeholder copy for legal/product review.)' })
        ]),
        el('div', { class: 'consent-banner-actions' }, [rejectBtn, manageBtn, acceptBtn])
      ])
    ]);
    manageBtn.addEventListener('click', function () { openPreferences(true); });
    rejectBtn.addEventListener('click', function () {
      var prev = consentState();
      var hadLoadedTags = !!(window.__ourelads_gtm_loaded || window.__ourelads_ga4_loaded || document.querySelector('script[src*="googletagmanager.com/gtm.js?id="],script[src*="googletagmanager.com/gtag/js?id="]'));
      var withdrewAny = !!(prev.analytics || prev.advertising);
      writeConsent({ analytics: false, advertising: false }); applyConsentMode(consentState()); removeBanner();
      if (hadLoadedTags && withdrewAny) { try { window.location.reload(); } catch (_) {} return; }
    });
    acceptBtn.addEventListener('click', function () { writeConsent({ analytics: true, advertising: true }); applyConsentMode(consentState()); removeBanner(); maybeLoadTags(); });
    ui.banner = banner;
    document.body.appendChild(banner);
  }

  window.oureladsConsent = {
    get: consentState,
    openPreferences: function () { openPreferences(false); },
    resetForTest: function () { try { localStorage.removeItem(CONSENT_KEY); } catch (_) {} }
  };

  /* ─── HEADER & FOOTER INJECTION ─── */
  var headerEl = document.getElementById('site-header');
  var footerEl = document.getElementById('site-footer');

  var links = [
    { id: 'home', href: '/', label: 'Home' },
    { id: 'about', href: '/about', label: 'About' },
    { id: 'work', href: '/work', label: 'Work' },
    { id: 'services', href: '/services', label: 'Services' },
    { id: 'blog', href: '/blog', label: 'Blog' },
    { id: 'testimonials', href: '/testimonials', label: 'Testimonials' },
    { id: 'contact', href: '/contact', label: 'Contact' }
  ];

  var navItems = links.map(function (item) {
    var active = item.id === page ? ' active-page' : '';
    var aria = item.id === page ? ' aria-current="page"' : '';
    return '<li><a href="' + item.href + '" class="nav-link' + active + '"' + aria + '>' + item.label + '</a></li>';
  }).join('');

  if (headerEl) {
    headerEl.innerHTML = '\
      <a href="#main-content" class="skip-link">Skip to main content</a>\
      <div class="scroll-progress-bar" id="scroll-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>\
      <header class="header" id="header">\
        <nav class="nav container">\
          <a href="/" class="nav-logo" id="nav-logo">\
            <img src="/logo.webp" alt="Ourel Ads Logo" class="brand-logo-img" width="1254" height="1254" decoding="async" />\
            <span class="logo-text">OUREL<span class="logo-accent"> ADS</span></span>\
          </a>\
          <ul class="nav-menu" id="nav-menu">' + navItems + '</ul>\
          <a href="/contact" class="btn btn-primary nav-cta" id="nav-cta">Start a Project \u2192</a>\
          <button class="hamburger" id="hamburger" aria-expanded="false" aria-label="Toggle menu" aria-controls="nav-menu">\
            <span></span><span></span><span></span>\
          </button>\
        </nav>\
      </header>\
    ';
  }

  var instagram = 'https://www.instagram.com/ourelads';
  var linkedin = 'https://www.linkedin.com/company/ourel-ads';

  if (footerEl) {
    footerEl.innerHTML = '\
      <footer class="footer" id="footer">\
        <div class="container footer-inner">\
          <div class="footer-brand">\
            <div class="footer-logo">\
              <img src="/logo.webp" alt="Ourel Ads Logo" class="footer-logo-img" width="1254" height="1254" loading="lazy" decoding="async" />\
              <span>OUREL<span class="logo-accent"> ADS</span></span>\
            </div>\
            <p class="footer-tagline">Ideas / Content / Impact</p>\
            <div class="footer-social">\
              <a href="' + instagram + '" target="_blank" rel="noopener" aria-label="Instagram" class="footer-social-link">\
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>\
              </a>\
              <a href="' + linkedin + '" target="_blank" rel="noopener" aria-label="LinkedIn" class="footer-social-link">\
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="4"/><path d="M8 11v5M8 8v.01M12 16v-5M12 11a3 3 0 016 0v5"/></svg>\
              </a>\
            </div>\
          </div>\
          <div class="footer-links">\
            <div class="footer-col">\
              <div class="footer-col-title">Company</div>\
              <a href="/about">About</a>\
              <a href="/work">Work</a>\
              <a href="/services">Services</a>\
              <a href="/blog">Blog</a>\
              <a href="/testimonials">Testimonials</a>\
              <a href="/contact">Contact</a>\
            </div>\
            <div class="footer-col">\
              <div class="footer-col-title">Services</div>\
              <a href="/services#service-performance-marketing-videos">Performance Videos</a>\
              <a href="/services#service-brand-films-tvcs">Brand Films &amp; TVCs</a>\
              <a href="/services#service-micro-dramas-storytelling">Micro-Dramas</a>\
              <a href="/services#service-content-marketing">Content Marketing</a>\
              <a href="/services#service-digital-marketing">Digital Marketing</a>\
              <a href="/services#service-motion-graphics">Motion Graphics</a>\
            </div>\
            <div class="footer-col">\
              <div class="footer-col-title">Connect</div>\
              <a href="mailto:info@ourelads.com">info@ourelads.com</a>\
              <a href="tel:+918076292036">+91 80762 92036</a>\
              <a href="https://wa.me/918076292036" target="_blank" rel="noopener">WhatsApp \u2192</a>\
              <a href="' + instagram + '" target="_blank" rel="noopener">Instagram</a>\
              <div class="footer-locations">\
                <span>\uD83D\uDCCD New Delhi 110034</span>\
                <span>\uD83D\uDCCD MP Nagar, Bhopal</span>\
              </div>\
            </div>\
          </div>\
        </div>\
        <div class="footer-bottom container">\
          <span>\u00A9 2026 Ourel Ads. All Rights Reserved.</span>\
          <span>Advertising \u00B7 Creative \u00B7 Marketing \u00B7 Production</span>\
          <button type="button" class="footer-cookie-link" id="cookie-preferences-btn">Cookie preferences</button>\
        </div>\
      </footer>\
      <a href="https://wa.me/918076292036" class="whatsapp-float" target="_blank" rel="noopener" id="whatsapp-float" aria-label="WhatsApp">\
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>\
      </a>\
    ';
  }

  // Wire cookie preferences button (footer may be injected above)
  var prefBtn = document.getElementById('cookie-preferences-btn');
  if (prefBtn) prefBtn.addEventListener('click', function () { openPreferences(false); });

  // Apply current consent state and maybe load tags, then show banner if no choice stored
  applyConsentMode(consentState());
  maybeLoadTags();
  // Show banner after DOM ready enough
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBannerIfNeeded); else showBannerIfNeeded();

  /* ─── SEO META FALLBACK (preserve existing behavior) ─── */
  fetchSettings().then(function (s) {
    try {
      var titleEl = document.querySelector('title');
      var metaDesc = document.querySelector('meta[name="description"]');
      var isHome = page === 'home';
      var is404 = page === '404';
      var isThankYou = page === 'thank-you';
      var hasSpecificTitle = titleEl && titleEl.textContent && titleEl.textContent.trim() !== '';
      var hasSpecificDesc = metaDesc && metaDesc.content && metaDesc.content.trim() !== '';
      if (is404 || isThankYou) return;
      if (!hasSpecificTitle || !hasSpecificDesc) {
        if (isHome) {
          if (!hasSpecificTitle && s.seo_title) document.title = s.seo_title;
          if (!hasSpecificDesc && s.seo_description) {
            if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.name = 'description'; document.head.appendChild(metaDesc); }
            metaDesc.content = s.seo_description;
          }
        } else {
          if (!hasSpecificTitle && s.seo_title) document.title = s.seo_title;
          if (!hasSpecificDesc && s.seo_description) {
            if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.name = 'description'; document.head.appendChild(metaDesc); }
            metaDesc.content = s.seo_description;
          }
        }
      }
    } catch (_) {}
  }).catch(function () {});
})();
