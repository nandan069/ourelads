/* Google Analytics (GA4) Tag */
(function() {
  const gaId = "G-D2VRBPMM23";
  if (gaId && !document.querySelector(`script[src*="${gaId}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", gaId);
  }
})();

/* Shared header, footer, WhatsApp button */
(function () {
  let page = document.body.getAttribute('data-page');
  if (!page) {
    const pathName = window.location.pathname.replace(/^\//, '').replace(/\.html$/, '');
    page = (pathName === '' || pathName === 'index') ? 'home' : pathName;
  }
  const headerEl = document.getElementById('site-header');
  const footerEl = document.getElementById('site-footer');

  const links = [
    { id: 'home', href: '/', label: 'Home' },
    { id: 'about', href: '/about', label: 'About' },
    { id: 'work', href: '/work', label: 'Work' },
    { id: 'services', href: '/services', label: 'Services' },
    { id: 'insights', href: '/insights', label: 'Insights' },
    { id: 'blog', href: '/blog', label: 'Blog' },
    { id: 'testimonials', href: '/testimonials', label: 'Testimonials' },
    { id: 'contact', href: '/contact', label: 'Contact' }
  ];

  const navItems = links.map((item) => {
    const active = item.id === page ? ' active-page' : '';
    const aria = item.id === page ? ' aria-current="page"' : '';
    return `<li><a href="${item.href}" class="nav-link${active}"${aria}>${item.label}</a></li>`;
  }).join('');

  if (headerEl) {
    headerEl.innerHTML = `
      <a href="#main-content" class="skip-link">Skip to main content</a>
      <div class="scroll-progress-bar" id="scroll-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
      <header class="header" id="header">
        <nav class="nav container">
          <a href="/" class="nav-logo" id="nav-logo">
            <img src="logo.jpeg" alt="Ourel Ads Logo" class="brand-logo-img" />
            <span class="logo-text">OUREL<span class="logo-accent"> ADS</span></span>
          </a>
          <ul class="nav-menu" id="nav-menu">${navItems}</ul>
          <a href="/contact" class="btn btn-primary nav-cta" id="nav-cta">Start a Project →</a>
          <button class="hamburger" id="hamburger" aria-expanded="false" aria-label="Toggle menu" aria-controls="nav-menu">
            <span></span><span></span><span></span>
          </button>
        </nav>
      </header>
    `;
  }

  const instagram = 'https://www.instagram.com/ourelads';
  const linkedin = 'https://www.linkedin.com/company/ourel-ads';

  if (footerEl) {
    footerEl.innerHTML = `
      <footer class="footer" id="footer">
        <div class="container footer-inner">
          <div class="footer-brand">
            <div class="footer-logo">
              <img src="logo.jpeg" alt="Ourel Ads Logo" class="footer-logo-img" />
              <span>OUREL<span class="logo-accent"> ADS</span></span>
            </div>
            <p class="footer-tagline">Ideas / Content / Impact</p>
            <div class="footer-social">
              <a href="${instagram}" target="_blank" rel="noopener" aria-label="Instagram" class="footer-social-link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>
              </a>
              <a href="${linkedin}" target="_blank" rel="noopener" aria-label="LinkedIn" class="footer-social-link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="4"/><path d="M8 11v5M8 8v.01M12 16v-5M12 11a3 3 0 016 0v5"/></svg>
              </a>
            </div>
          </div>
          <div class="footer-links">
            <div class="footer-col">
              <div class="footer-col-title">Company</div>
              <a href="/about">About</a>
              <a href="/work">Work</a>
              <a href="/services">Services</a>
              <a href="/insights">Insights</a>
              <a href="/blog">Blog</a>
              <a href="/testimonials">Testimonials</a>
              <a href="/contact">Contact</a>
            </div>
            <div class="footer-col">
              <div class="footer-col-title">Services</div>
              <a href="/services">Performance Videos</a>
              <a href="/services">Brand Films &amp; TVCs</a>
              <a href="/services">Micro-Dramas</a>
              <a href="/services">Content Marketing</a>
              <a href="/services">Digital Marketing</a>
              <a href="/services">Motion Graphics</a>
            </div>
            <div class="footer-col">
              <div class="footer-col-title">Connect</div>
              <a href="mailto:info@ourelads.com">info@ourelads.com</a>
              <a href="tel:+918076292036">+91 80762 92036</a>
              <a href="https://wa.me/918076292036" target="_blank" rel="noopener">WhatsApp →</a>
              <a href="${instagram}" target="_blank" rel="noopener">Instagram</a>
              <div class="footer-locations">
                <span>📍 New Delhi 110034</span>
                <span>📍 MP Nagar, Bhopal</span>
              </div>
            </div>
          </div>
        </div>
        <div class="footer-bottom container">
          <span>© 2026 Ourel Ads. All Rights Reserved.</span>
          <span>Advertising · Creative · Marketing · Production</span>
        </div>
      </footer>
      <a href="https://wa.me/918076292036" class="whatsapp-float" target="_blank" rel="noopener" id="whatsapp-float" aria-label="WhatsApp">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>
    `;
  }
})();
