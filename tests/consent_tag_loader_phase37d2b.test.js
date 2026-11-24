/**
 * Phase 3.7D-2B: consent UI and safe GTM/GA4 tag-loader static/integration checks.
 * No browser/runtime analytics execution in this Jest suite.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('3.7D-2B consent + tag loader (static)', () => {
  test('public HTML pages do not hardcode GTM noscript iframe to GTM-WR9QLGC5', () => {
    const pages = [
      'public/index.html','public/about.html','public/services.html','public/work.html',
      'public/blog.html','public/testimonials.html','public/contact.html','public/thank-you.html','public/404.html'
    ];
    for (const p of pages) {
      const html = read(p);
      expect(html).not.toMatch(/googletagmanager\.com\/ns\.html\?id=GTM-WR9QLGC5/);
      expect(html).toMatch(/optional tracking must not load without an approved JS-disabled consent mechanism/i);
    }
  });

  test('layout.js includes consent storage, safe defaults, and single-loader guards', () => {
    const js = read('public/layout.js');
    expect(js).toContain("ourelads.consent.v1");
    expect(js).toContain('analytics_storage');
    expect(js).toContain("ad_storage: 'denied'");
    expect(js).toContain("analytics_storage: 'denied'");
    expect(js).toContain('window.__ourelads_gtm_loaded');
    expect(js).toContain('window.__ourelads_ga4_loaded');
    expect(js).toContain('/^GTM-[A-Z0-9]+$/i');
    expect(js).toContain('/^G-[A-Z0-9]+$/i');
    expect(js).toContain('cookie-preferences-btn');
    expect(js).toContain('Cookie preferences');
    expect(js).toContain('openPreferences');
    expect(js).toContain('Manage preferences');
    expect(js).toContain('Reject optional');
    expect(js).toContain('Accept');
    expect(js).toContain('window.location.reload');
    // No Ads conversion enablement
    expect(js).not.toMatch(/ads_conversion_Contact_Us_1/);
  });

  test('consent CSS present and responsive hooks exist', () => {
    const css = read('public/style.css');
    expect(css).toContain('.consent-banner');
    expect(css).toContain('.consent-modal');
    expect(css).toContain('.consent-overlay');
    expect(css).toContain('@media (max-width: 768px)');
    expect(css).toContain('.footer-cookie-link');
  });
});
