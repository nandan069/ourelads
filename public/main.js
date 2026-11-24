/* ─────────────────────────────────────────────
   OUREL ADS — JavaScript (Dynamic API Driven)
   Handles: Nav, Animations, Counters, Marquee,
   Reels scroll, Testimonials, Portfolio filter,
   Contact form (Connected to CMS API)
───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {

  /* ══════════════════════════════════════════
     HEADER — STICKY + HAMBURGER + SCROLL PROGRESS
  ══════════════════════════════════════════ */
  const header = document.getElementById('header');
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-menu');
  const scrollProgress = document.getElementById('scroll-progress');

  window.addEventListener('scroll', () => {
    header?.classList.toggle('scrolled', window.scrollY > 40);

    const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    if (height > 0 && scrollProgress) {
      const scrolled = (winScroll / height) * 100;
      scrollProgress.style.width = `${scrolled}%`;
    }
  }, { passive: true });

  hamburger?.addEventListener('click', (e) => {
    e.stopPropagation();
    hamburger.classList.toggle('open');
    navMenu?.classList.toggle('open');
    document.body.style.overflow = navMenu?.classList.contains('open') ? 'hidden' : '';
  });

  navMenu?.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger?.classList.remove('open');
      navMenu?.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  document.addEventListener('click', (e) => {
    if (navMenu?.classList.contains('open') && !navMenu.contains(e.target) && !hamburger?.contains(e.target)) {
      hamburger?.classList.remove('open');
      navMenu?.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  /* ══════════════════════════════════════════
     INTERSECTION OBSERVER — ENHANCED SCROLL ANIMATIONS
  ══════════════════════════════════════════ */
  const animatedEls = document.querySelectorAll('[data-animate]');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const delay = el.dataset.delay || 0;
          setTimeout(() => el.classList.add('visible'), Number(delay));
          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );
  animatedEls.forEach(el => observer.observe(el));

  /* ══════════════════════════════════════════
     ANIMATED COUNTERS
  ══════════════════════════════════════════ */
  const counters = document.querySelectorAll('.counter');
  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.target, 10);
          const duration = 1800;
          const step = Math.ceil(target / (duration / 20));
          let current = 0;
          const timer = setInterval(() => {
            current = Math.min(current + step, target);
            el.textContent = current.toLocaleString();
            if (current >= target) clearInterval(timer);
          }, 20);
          counterObserver.unobserve(el);
        }
      });
    },
    { threshold: 0.5 }
  );
  counters.forEach(c => counterObserver.observe(c));

  /* ══════════════════════════════════════════
     API FETCH HELPERS WITH FALLBACKS
  ══════════════════════════════════════════ */
  async function fetchApiData(endpoint, fallbackData) {
    try {
      const res = await fetch(`/api${endpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (Array.isArray(json)) return json.length ? json : fallbackData;
      if (json && typeof json === 'object' && Object.keys(json).length) return json;
      return fallbackData;
    } catch (err) {
      console.warn(`CMS API fetch failed for ${endpoint}, using static fallback:`, err);
      return fallbackData;
    }
  }

  /* ══════════════════════════════════════════
     CLIENTS & MARQUEE
  ══════════════════════════════════════════ */
  const fallbackClients = [
    { name: 'Infinix', logo: 'assets/infinix.jpeg', bg_color: '#111111' },
    { name: 'GoodScore', logo: 'assets/goodscore.jpeg', bg_color: '#0A66C2' },
    { name: 'Seekho', logo: 'assets/seekho.jpeg', bg_color: '#1a1520' },
    { name: 'Brands.live', logo: 'assets/brands-live.jpeg', bg_color: '#f4f8fb' },
    { name: 'GoCredit', logo: 'assets/gocredit.jpeg', bg_color: '#1a0848' },
    { name: 'Vyapar', logo: 'assets/vyapar.jpeg', bg_color: '#fff5f5' },
    { name: 'Bansal Group', logo: 'assets/bansal-group.jpeg', bg_color: '#fffaf5' },
    { name: 'FatakPay', logo: 'assets/fatakpay.jpeg', bg_color: '#fff8f2' },
    { name: 'Bachatt', logo: 'assets/bachatt.jpeg', bg_color: '#3b2bd6' },
    { name: 'Jar', logo: 'assets/jar.jpeg', bg_color: '#16132a' },
    { name: 'Oolka', logo: 'assets/IMG_2402.PNG', bg_color: '#1a6fff' },
    { name: 'Dainik Bhaskar', logo: 'assets/IMG_2403.PNG', bg_color: '#ffffff' },
    { name: 'Guru', logo: 'assets/IMG_2404.JPG.jpeg', bg_color: '#f0f0f0' },
    { name: 'HabitGold', logo: 'assets/WhatsApp Image 2026-10-13 at 11.59.18 AM.jpeg', bg_color: '#7b2cbf' }
  ];

  const clients = await fetchApiData('/clients', fallbackClients);

  const marqueeInner = document.querySelector('.marquee-inner');
  if (marqueeInner) {
    const logos = [...clients, ...clients].map((c) =>
      `<img src="${c.logo}" alt="${c.brand || c.name}" class="brand-logo-item" />`
    ).join('');
    marqueeInner.innerHTML = logos;
  }

  const clientGrid = document.getElementById('client-logos-grid');
  if (clientGrid) {
    clientGrid.innerHTML = clients.map((c) => `
      <div class="client-logo-card" data-animate="fade-up">
        <img src="${c.logo}" alt="${c.brand || c.name}" />
      </div>
    `).join('');
    clientGrid.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
  }

  /* ══════════════════════════════════════════
     PORTFOLIO DATA + RENDERING
  ══════════════════════════════════════════ */
  const fallbackPortfolio = [
    { brand: 'Infinix', title: 'Product Launch Campaign', category: 'brand', type: 'Brand Film', logo: 'assets/infinix.jpeg', href: '/work' },
    { brand: 'GoodScore', title: 'Financial Wellbeing Ad', category: 'performance', type: 'Performance', logo: 'assets/goodscore.jpeg', href: '/work' },
    { brand: 'Seekho', title: 'Learning Platform Reel', category: 'performance', type: 'Performance', logo: 'assets/seekho.jpeg', href: '/work' },
    { brand: 'Brands.live', title: 'Creator Economy Film', category: 'brand', type: 'Brand Film', logo: 'assets/brands-live.jpeg', href: '/work' },
    { brand: 'GoCredit', title: 'Credit Score Micro-Drama', category: 'micro-drama', type: 'Micro-Drama', logo: 'assets/gocredit.jpeg', href: '/work' },
    { brand: 'Vyapar', title: 'SME Storytelling Series', category: 'social', type: 'Social', logo: 'assets/vyapar.jpeg', href: '/work' },
    { brand: 'Bansal Group', title: 'Brand Identity Film', category: 'brand', type: 'Brand Film', logo: 'assets/bansal-group.jpeg', href: '/work' },
    { brand: 'FatakPay', title: 'BNPL Awareness Campaign', category: 'performance', type: 'Performance', logo: 'assets/fatakpay.jpeg', href: '/work' },
    { brand: 'Bachatt', title: 'Social Media Content', category: 'social', type: 'Social', logo: 'assets/bachatt.jpeg', href: '/work' },
  ];

  const portfolioData = await fetchApiData('/projects', fallbackPortfolio);

  const bgColors = [
    'linear-gradient(135deg,#2d0a50,#6B21A8)',
    'linear-gradient(135deg,#0a1628,#1e3a5f)',
    'linear-gradient(135deg,#1a0a2e,#4a1572)',
    'linear-gradient(135deg,#0d1f0d,#1a4a1a)',
    'linear-gradient(135deg,#1f0d0d,#4a1a1a)',
    'linear-gradient(135deg,#1a1f0d,#3a4a1a)',
    'linear-gradient(135deg,#0d1a1f,#1a3a4a)',
    'linear-gradient(135deg,#1f1a0d,#4a3a1a)',
    'linear-gradient(135deg,#0d0d1f,#1a1a4a)',
  ];

  const portfolioGrid = document.getElementById('portfolio-grid');
  function isSafeHttpUrl(value) {
    if (!value || typeof value !== 'string') return false;
    const v = value.trim();
    if (!v) return false;
    try {
      const u = new URL(v, window.location.origin);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch { return false; }
  }
  function isSafeSlug(value) {
    return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim());
  }
  function escHtml(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderPortfolio(filter = 'all') {
    if (!portfolioGrid) return;
    const filtered = filter === 'all' ? portfolioData : portfolioData.filter(p => (p.category || p.category_slug) === filter);
    portfolioGrid.innerHTML = filtered.map((p, i) => {
      const clientBg = clients.find(c => (c.name || c.brand) === p.brand)?.bg_color;
      const slug = (p.slug || '').toString().trim();
      const internalHref = isSafeSlug(slug) ? `/work/${encodeURIComponent(slug)}` : '/work';
      const ext = (p.project_url || p.href || '').toString().trim();
      const externalHref = isSafeHttpUrl(ext) ? ext : '';
      const primaryHref = externalHref || internalHref;
      const primaryLabel = externalHref ? 'Visit Project →' : 'View Project →';
      const primaryAttrs = externalHref ? ' target="_blank" rel="noopener noreferrer"' : '';
      const secondaryCta = externalHref ? `<a href="${escHtml(internalHref)}" class="portfolio-card-desc" style="display:inline-block;margin-left:10px;font-size:.9em">Project details</a>` : '';
      const imgSrc = p.logo || p.thumbnail || '';
      return `
      <div class="portfolio-card" data-category="${escHtml(p.category || p.category_slug || '')}" data-animate="fade-up" data-delay="${(i % 3) * 80}">
        <a href="${escHtml(primaryHref)}" aria-label="${escHtml(p.title || 'Project')}"${primaryAttrs} style="display:block;text-decoration:none;color:inherit">
          <div class="portfolio-card-thumb" style="background:${clientBg || bgColors[i % bgColors.length]}">
            <span class="portfolio-thumb-label">${escHtml(p.type || p.category || 'Case Study')}</span>
            ${imgSrc ? `<img class="portfolio-logo" src="${escHtml(imgSrc)}" alt="${escHtml((p.brand || p.title || 'Project') + ' logo')}" />` : ''}
          </div>
        </a>
        <div class="portfolio-card-info">
          <div class="portfolio-card-brand">${escHtml(p.brand || 'Ourel Ads')}</div>
          <div class="portfolio-card-title">${escHtml(p.title || '')}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px">
            <a href="${escHtml(primaryHref)}" class="portfolio-card-desc"${primaryAttrs}>${primaryLabel}</a>
            ${secondaryCta}
          </div>
        </div>
      </div>
    `;
    }).join('');
    portfolioGrid.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
  }
  renderPortfolio();

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPortfolio(btn.dataset.filter);
    });
  });

  /* ══════════════════════════════════════════
     REELS DATA + MINIMAL AUTO-SLIDING
  ══════════════════════════════════════════ */
  const fallbackReels = [
    { brand: 'Infinix', title: 'Product Launch Campaign', category: 'Brand Film', logo: 'assets/infinix.jpeg' },
    { brand: 'GoodScore', title: 'Financial Wellbeing Reel', category: 'Performance', logo: 'assets/goodscore.jpeg' },
    { brand: 'Seekho', title: 'Learning Platform Reel', category: 'Social Ad', logo: 'assets/seekho.jpeg' },
    { brand: 'Brands.live', title: 'Creator Economy Film', category: 'Creative', logo: 'assets/brands-live.jpeg' },
    { brand: 'GoCredit', title: 'Credit Score Campaign', category: 'Micro-Drama', logo: 'assets/gocredit.jpeg' },
    { brand: 'Vyapar', title: 'SME Business Story', category: 'Storytelling', logo: 'assets/vyapar.jpeg' },
    { brand: 'Bansal Group', title: 'Brand Identity Reel', category: 'Brand Film', logo: 'assets/bansal-group.jpeg' },
    { brand: 'FatakPay', title: 'BNPL Awareness Series', category: 'FinTech', logo: 'assets/fatakpay.jpeg' },
    { brand: 'Bachatt', title: 'Social Content Showcase', category: 'Social', logo: 'assets/bachatt.jpeg' },
  ];

  const reelsData = await fetchApiData('/reels', fallbackReels);

  const reelVideoAssets = [
    { brand: 'Bachatt', slug: 'bachatt', title: 'Social Campaign', category: 'Social', logo: 'assets/bachatt.jpeg' },
    { brand: 'Brands.live', slug: 'brand-live', title: 'Creator Economy Film', category: 'Creative', logo: 'assets/brands-live.jpeg' },
    { brand: 'Dainik Bhaskar', slug: 'dainik-bhaskar', title: 'Brand Story', category: 'Brand Film', logo: 'assets/IMG_2403.PNG' },
    { brand: 'FatakPay', slug: 'fatak-pay', title: 'Awareness Campaign', category: 'Performance', logo: 'assets/fatakpay.jpeg' },
    { brand: 'GoCredit', slug: 'go-credit', title: 'Credit Score Campaign', category: 'Micro-Drama', logo: 'assets/gocredit.jpeg' },
    { brand: 'GoodScore', slug: 'good-score', title: 'Financial Wellbeing Reel', category: 'Performance', logo: 'assets/goodscore.jpeg' },
    { brand: 'HabitGold', slug: 'habit-gold', title: 'Social Campaign', category: 'Social', logo: 'assets/WhatsApp Image 2026-10-13 at 11.59.18 AM.jpeg' },
    { brand: 'Jar', slug: 'jar', title: 'Brand Campaign', category: 'Performance', logo: 'assets/jar.jpeg' },
    { brand: 'Seekho', slug: 'seekho', title: 'Learning Platform Reel', category: 'Social Ad', logo: 'assets/seekho.jpeg' },
    { brand: 'Upgrad', slug: 'upgrad', title: 'Education Campaign', category: 'Performance', logo: 'assets/IMG_2402.PNG' },
    { brand: 'Vyapar', slug: 'vyapar', title: 'SME Business Story', category: 'Storytelling', logo: 'assets/vyapar.jpeg' },
  ];
  const reelBrandKey = brand => (brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const reelVideos = reelVideoAssets.map(asset => {
    const configuredReel = reelsData.find(reel => reelBrandKey(reel.brand) === reelBrandKey(asset.brand));
    return {
      ...asset,
      ...configuredReel,
      video: `/assets/reels/${asset.slug}.mp4`,
      poster: `/assets/reels/${asset.slug}.jpg`,
    };
  });

  const reelsTrack = document.getElementById('reels-track');
  const allReels = [...reelVideos, ...reelVideos];
  if (reelsTrack) {
    reelsTrack.innerHTML = allReels.map((r, i) => {
      const clientBg = clients.find(c => (c.name || c.brand) === r.brand)?.bg_color;
      return `
      <article class="reel-card" data-brand="${r.brand}">
        <button class="reel-thumb" type="button" data-video="${r.video}" data-poster="${r.poster}" aria-label="Play ${r.brand}: ${r.title}" style="background-color:${clientBg || bgColors[i % bgColors.length]}">
          <video class="reel-preview" muted loop playsinline preload="none" poster="${r.poster}" data-src="${r.video}" aria-hidden="true"></video>
          <div class="reel-top-bar">
            <span class="reel-brand-pill">${r.brand}</span>
            <span class="reel-badge">${r.category}</span>
          </div>
          <div class="reel-overlay-info">
            <span class="reel-brand-sub">${r.brand}</span>
            <div class="reel-title">${r.title}</div>
          </div>
        </button>
      </article>
    `;
    }).join('');
  }

  let reelPlayerDialog = document.getElementById('reel-player-dialog');
  let reelPlayerVideo = document.getElementById('reel-player-video');
  if (reelsTrack && (!reelPlayerDialog || !reelPlayerVideo)) {
    if (!reelPlayerDialog) {
      reelPlayerDialog = document.createElement('dialog');
      reelPlayerDialog.className = 'reel-player-dialog';
      reelPlayerDialog.id = 'reel-player-dialog';
      reelPlayerDialog.setAttribute('aria-label', 'Featured video');
      reelPlayerDialog.innerHTML = `
        <button class="reel-player-close" id="reel-player-close" type="button" aria-label="Close video">&times;</button>
        <video class="reel-player-video" id="reel-player-video" controls playsinline preload="none"></video>
      `;
      document.body.appendChild(reelPlayerDialog);
    }
    reelPlayerVideo = document.getElementById('reel-player-video');
  }

  const visibleReelPreviews = new Map();
  const releaseReelPreview = video => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
  const updateReelPreviews = () => {
    if (reelPlayerDialog?.open) return;
    visibleReelPreviews.forEach((ratio, video) => {
      if (ratio <= 0) {
        releaseReelPreview(video);
        return;
      }
      if (!video.getAttribute('src')) video.src = video.dataset.src;
      video.play().catch(() => { });
    });
  };
  const reelPreviewObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visibleReelPreviews.set(entry.target, entry.intersectionRatio);
        else visibleReelPreviews.delete(entry.target);
      });
      updateReelPreviews();
      entries.filter(entry => !entry.isIntersecting).forEach(entry => releaseReelPreview(entry.target));
    }, { threshold: [0, 0.2, 1] })
    : null;
  reelsTrack?.querySelectorAll('.reel-preview').forEach(video => reelPreviewObserver?.observe(video));

  const stopReelVideo = () => {
    reelPlayerVideo?.pause();
    if (reelPlayerVideo) {
      reelPlayerVideo.removeAttribute('src');
      reelPlayerVideo.removeAttribute('poster');
      reelPlayerVideo.load();
    }
  };
  const closeReelPlayer = () => {
    stopReelVideo();
    reelPlayerDialog?.close();
  };
  reelsTrack?.addEventListener('click', event => {
    const playButton = event.target.closest('[data-video]');
    if (!playButton || !reelPlayerVideo || !reelPlayerDialog) return;
    visibleReelPreviews.forEach((ratio, video) => releaseReelPreview(video));
    reelPlayerVideo.src = playButton.dataset.video;
    reelPlayerVideo.poster = playButton.dataset.poster;
    reelPlayerDialog.showModal();
    reelPlayerVideo.play().catch(() => { });
  });
  document.getElementById('reel-player-close')?.addEventListener('click', closeReelPlayer);
  reelPlayerDialog?.addEventListener('click', event => {
    if (event.target === reelPlayerDialog) closeReelPlayer();
  });
  reelPlayerDialog?.addEventListener('close', () => {
    stopReelVideo();
    updateReelPreviews();
  });

  const reelsWrapper = document.querySelector('.reels-scroll-wrapper');
  const prevReel = document.getElementById('reel-prev');
  const nextReel = document.getElementById('reel-next');

  if (reelsTrack) {
    reelsTrack.addEventListener('mouseenter', () => {
      reelsTrack.style.animationPlayState = 'paused';
    });
    reelsTrack.addEventListener('mouseleave', () => {
      reelsTrack.style.animationPlayState = 'running';
    });
  }

  nextReel?.addEventListener('click', () => {
    if (reelsTrack) {
      reelsTrack.style.animationPlayState = 'paused';
      setTimeout(() => { reelsTrack.style.animationPlayState = 'running'; }, 2200);
    }
    reelsWrapper?.scrollBy({ left: 260, behavior: 'smooth' });
  });

  prevReel?.addEventListener('click', () => {
    if (reelsTrack) {
      reelsTrack.style.animationPlayState = 'paused';
      setTimeout(() => { reelsTrack.style.animationPlayState = 'running'; }, 2200);
    }
    reelsWrapper?.scrollBy({ left: -260, behavior: 'smooth' });
  });

  /* ══════════════════════════════════════════
     SERVICES DATA + RENDERING
  ══════════════════════════════════════════ */
  const fallbackServices = [
    {
      num: '01', title: 'Performance Marketing Videos',
      short_description: 'Short-form videos designed around attention, conversion, leads and product communication.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`
    },
    {
      num: '02', title: 'Brand Films & TVCs',
      short_description: 'High-quality brand films, TVCs, product films and campaign films that define identity.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`
    },
    {
      num: '03', title: 'Micro-Dramas & Storytelling',
      short_description: 'Short narrative content built around real-life situations, characters and emotional arcs.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 8v4l3 3"/></svg>`
    },
    {
      num: '04', title: 'Creative Production',
      short_description: 'Complete production: Research → Concept → Script → Casting → Shoot → Edit → Delivery.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`
    },
    {
      num: '05', title: 'Content Marketing',
      short_description: 'Strategic content creation for brands across all digital platforms and touchpoints.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
    },
    {
      num: '06', title: 'Digital Marketing',
      short_description: 'Creative-led digital marketing and brand communication that drives measurable results.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`
    },
    {
      num: '07', title: 'Social Media Content',
      short_description: 'Reels, short-form videos, campaign creatives and social-first storytelling for all platforms.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 2H3v16h5v4l4-4h4l5-5V2zM11 11V7M16 11V7"/></svg>`
    },
    {
      num: '08', title: 'Motion Graphics & Visual',
      short_description: 'Motion graphics, explainer videos, product animations and branded visual content.',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
    },
  ];

  const servicesData = await fetchApiData('/services', fallbackServices);

  const servicesGrid = document.getElementById('services-grid');
  if (servicesGrid) {
    servicesGrid.innerHTML = servicesData.map(s => `
      <div class="service-card" data-animate="fade-up">
        <div class="service-num">${s.num || '01'}</div>
        <div class="service-icon">${s.icon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/></svg>'}</div>
        <div class="service-title">${s.title}</div>
        <div class="service-desc">${s.short_description || s.desc || ''}</div>
      </div>
    `).join('');
    servicesGrid.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
  }

  /* ══════════════════════════════════════════
     SERVICES PAGE — INTERACTIVE CATEGORY FILTER
  ══════════════════════════════════════════ */
  const serviceFilterBtns = document.querySelectorAll('.service-filter-btn');
  const serviceCards = document.querySelectorAll('.service-card-pro');
  if (serviceFilterBtns.length && serviceCards.length) {
    serviceFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        serviceFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter || 'all';
        serviceCards.forEach(card => {
          const cardCat = card.dataset.category;
          if (filter === 'all' || cardCat === filter) {
            card.style.display = 'flex';
            card.style.animation = 'cardFadeIn 0.35s ease forwards';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  /* ══════════════════════════════════════════
     CASE STUDIES DATA + RENDERING
  ══════════════════════════════════════════ */
  const fallbackCases = [
    { brand: 'Infinix', campaign: 'Product Launch Campaign', color: '#111111', logo: 'assets/infinix.jpeg' },
    { brand: 'GoodScore', campaign: 'Financial Wellbeing', color: '#0A66C2', logo: 'assets/goodscore.jpeg' },
    { brand: 'Seekho', campaign: 'EdTech Awareness Series', color: '#1a1520', logo: 'assets/seekho.jpeg' },
    { brand: 'GoCredit', campaign: 'Credit Score Micro-Drama', color: '#1a0848', logo: 'assets/gocredit.jpeg' },
    { brand: 'Vyapar', campaign: 'SME Communication Film', color: '#9b1c1c', logo: 'assets/vyapar.jpeg' },
    { brand: 'FatakPay', campaign: 'BNPL Awareness Campaign', color: '#4c1d95', logo: 'assets/fatakpay.jpeg' },
  ];

  const casesData = await fetchApiData('/cases', fallbackCases);

  const casesGrid = document.getElementById('cases-grid');
  if (casesGrid) {
    casesGrid.innerHTML = casesData.map(c => `
      <div class="case-card" data-animate="fade-up">
        <div class="case-header" style="background:${c.color || '#111111'}">
          <div class="case-bg-brand">${c.brand}</div>
          <img class="case-logo" src="${c.logo}" alt="${c.brand}" />
          <div class="case-brand-tag">${c.brand}</div>
          <div class="case-title-text">${c.campaign}</div>
        </div>
        <div class="case-body">
          <div class="case-steps">
            <span class="case-step-pill">Brief</span>
            <span class="case-step-pill">Strategy</span>
            <span class="case-step-pill">Execution</span>
            <span class="case-step-pill">Delivery</span>
          </div>
          <span class="case-link">View Case Study →</span>
        </div>
      </div>
    `).join('');
    casesGrid.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
  }

  /* ══════════════════════════════════════════
     TEAM DATA + RENDERING
  ══════════════════════════════════════════ */
  const fallbackTeam = [
    { name: 'Abhay Raj', role: 'Head of Content', designation: 'Head of Content', bio: 'Leads creative direction and performance-driven content strategy.', initials: 'AR' },
    { name: 'Vandana Singh', role: 'Social Media Head', designation: 'Social Media Head', bio: 'Builds brand voice, community and social-first campaigns.', initials: 'VS' },
    { name: 'Creative Studio', role: 'Direction & Production', designation: 'Direction & Production', bio: 'Concepts, storyboards, shoots and on-ground production.', initials: 'CS' },
    { name: 'Post Team', role: 'Editing & Motion', designation: 'Editing & Motion', bio: 'Cuts, colour, motion graphics and platform-ready delivery.', initials: 'PT' },
    { name: 'Strategy Desk', role: 'Brand & Performance', designation: 'Brand & Performance', bio: 'Audience insight, messaging and campaign planning.', initials: 'SD' },
    { name: 'Design Studio', role: 'GFX & Visuals', designation: 'GFX & Visuals', bio: 'Social creatives, thumbnails and visual storytelling.', initials: 'DS' },
    { name: 'Client Partners', role: 'Servicing', designation: 'Servicing', bio: 'Keeps brand collaborations tight, clear and on time.', initials: 'CP' },
    { name: 'Growth Desk', role: 'Digital Marketing', designation: 'Digital Marketing', bio: 'Creative-led digital campaigns built to convert.', initials: 'GD' },
  ];

  const teamData = await fetchApiData('/team', fallbackTeam);

  const teamGrid = document.getElementById('team-grid');
  if (teamGrid) {
    teamGrid.innerHTML = teamData.map(t => {
      const nameStr = t.name || 'Team Member';
      const initialsStr = t.initials || nameStr.slice(0, 2).toUpperCase();
      return `
      <div class="team-card" data-animate="fade-up">
        <div class="team-avatar initials">${initialsStr}</div>
        <div class="team-name">${nameStr}</div>
        <div class="team-role">${t.designation || t.role || ''}</div>
        <div class="team-bio">${t.bio || ''}</div>
      </div>
    `;
    }).join('');
    teamGrid.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
  }

  /* ══════════════════════════════════════════
     BLOG POSTS DYNAMIC RENDERING (BLOG PAGE)
  ══════════════════════════════════════════ */
  const blogGrid = document.querySelector('.blog-grid');
  if (blogGrid) {
    try {
      const blogData = await fetchApiData('/blog', null);
      const posts = blogData?.posts || (Array.isArray(blogData) ? blogData : null);
      if (posts && posts.length > 0) {
        const catColors = [
          'linear-gradient(135deg, #6D28D9 0%, #A78BFA 100%)',
          'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
          'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
          'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)',
          'linear-gradient(135deg, #06B6D4 0%, #22D3EE 100%)',
          'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)'
        ];
        const escapeAttr = (str) => String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escapeText = (str) => String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        blogGrid.innerHTML = posts.map((post, idx) => {
          const bg = catColors[idx % catColors.length];
          const dateStr = post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
          const author = post.author || 'Ourel Ads';
          const excerpt = post.excerpt || (post.content ? String(post.content).replace(/<[^>]*>/g, '').slice(0, 140) + '...' : '');
          const hasSlug = post.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(String(post.slug));
          const href = hasSlug ? `/blog/${encodeURIComponent(post.slug)}` : '/blog';
          const featuredBg = post.featured_image ? `background-image:url('${escapeAttr(post.featured_image)}');background-size:cover;background-position:center;` : '';
          return `
            <article class="blog-card" style="--card-bg: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);">
              <div class="blog-card-image" style="background: ${bg}; ${featuredBg}">
                <span class="blog-category">${escapeText(post.category_name || post.tags || 'Insights')}</span>
              </div>
              <div class="blog-card-content">
                <div class="blog-meta">${escapeText(dateStr)} · By ${escapeText(author)}</div>
                <h3>${escapeText(post.title || 'Article')}</h3>
                <p>${escapeText(excerpt)}</p>
                <a href="${href}" class="blog-read-more">Read Article <span aria-hidden="true">→</span></a>
              </div>
            </article>
          `;
        }).join('');
      }
    } catch (e) {
      /* Keep static fallback */
    }
  }

  /* ══════════════════════════════════════════
        TESTIMONIALS DATA + RENDERING
     ══════════════════════════════════════════ */
  const fallbackTestimonials = [
    {
      testimonial: 'Ourel Ads completely transformed how we communicate our product. The team understood our brand inside out and delivered creative that actually performed.',
      client_name: 'Brand Partner',
      designation: 'Marketing Head',
      company: 'Infinix'
    },
    {
      testimonial: 'Working with Ourel was a different experience — they bring real strategic thinking to the table, not just production. Our campaign exceeded every benchmark.',
      client_name: 'Brand Partner',
      designation: 'Brand Manager',
      company: 'Vyapar'
    },
    {
      testimonial: 'The quality of work, the professionalism and the speed — everything was exceptional. Our reel series drove the highest engagement we\'ve seen.',
      client_name: 'Brand Partner',
      designation: 'Co-Founder',
      company: 'GoCredit'
    },
    {
      testimonial: 'Ourel Ads doesn\'t just make ads — they build brand communication. Every piece of content feels intentional and on-brand.',
      client_name: 'Brand Partner',
      designation: 'CMO',
      company: 'FatakPay'
    },
    {
      testimonial: 'From concept to final delivery, the process was seamless. They understood the brief better than most agencies we\'ve worked with.',
      client_name: 'Brand Partner',
      designation: 'Growth Manager',
      company: 'Seekho'
    },
  ];

  const testimonialsData = await fetchApiData('/testimonials', fallbackTestimonials);

  const testiTrack = document.getElementById('testi-track');
  const testiDots = document.getElementById('testi-dots');
  let testiCurrent = 0;
  const testiVisible = window.innerWidth < 768 ? 1 : 2;

  if (testiTrack) {
    testiTrack.innerHTML = testimonialsData.map(t => `
      <div class="testi-card">
        <div class="testi-quote-mark">"</div>
        <div class="testi-text">${t.testimonial || t.text}</div>
        <div class="testi-author">
          <div class="testi-avatar">${(t.company || 'Ourel').slice(0, 2).toUpperCase()}</div>
          <div>
            <div class="testi-name">${t.client_name || t.name} — ${t.company}</div>
            <div class="testi-role">${t.designation || t.role}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  const maxTesti = Math.max(0, testimonialsData.length - testiVisible);

  if (testiDots) {
    testiDots.innerHTML = testimonialsData.map((_, i) =>
      `<div class="testi-dot${i === 0 ? ' active' : ''}" data-i="${i}"></div>`
    ).join('');
    testiDots.querySelectorAll('.testi-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        testiCurrent = parseInt(dot.dataset.i);
        updateTesti();
      });
    });
  }

  function updateTesti() {
    const cardW = testiTrack?.querySelector('.testi-card')?.offsetWidth || 0;
    const gap = 24;
    if (testiTrack) testiTrack.style.transform = `translateX(-${(cardW + gap) * testiCurrent}px)`;
    document.querySelectorAll('.testi-dot').forEach((d, i) =>
      d.classList.toggle('active', i === testiCurrent)
    );
  }

  document.getElementById('testi-prev')?.addEventListener('click', () => {
    testiCurrent = Math.max(0, testiCurrent - 1);
    updateTesti();
  });
  document.getElementById('testi-next')?.addEventListener('click', () => {
    testiCurrent = Math.min(maxTesti, testiCurrent + 1);
    updateTesti();
  });

  setInterval(() => {
    testiCurrent = testiCurrent >= maxTesti ? 0 : testiCurrent + 1;
    updateTesti();
  }, 5000);

  /* ══════════════════════════════════════════
     CONTACT FORM — IDEMPOTENCY + CONFIRMED THANK-YOU (3.7C-2)
  ══════════════════════════════════════════ */
  const form = document.getElementById('contact-form');
  const success = document.getElementById('form-success');

  if (form) (function initContactForm() {
    const submit = document.getElementById('form-submit');
    const nameInput = document.getElementById('form-name');
    const emailInput = document.getElementById('form-email');
    const companyInput = document.getElementById('form-company');
    const phoneInput = document.getElementById('form-phone');
    const serviceInput = document.getElementById('form-need');
    const budgetInput = document.getElementById('form-budget');
    const messageInput = document.getElementById('form-message');
    const websiteInput = document.getElementById('form-website');
    const errorDiv = document.getElementById('form-error');
    const manualEmail = document.getElementById('form-manual-email');

    const PENDING_KEY = 'ourelads.contact.pending.v1';
    const CONFIRM_KEY = 'ourelads.contact.confirmation.v1';

    function safeSessionGet(key) {
      try { return window.sessionStorage ? sessionStorage.getItem(key) : null; } catch (_) { return null; }
    }
    function safeSessionSet(key, value) {
      try { if (window.sessionStorage) sessionStorage.setItem(key, value); return true; } catch (_) {}
      return false;
    }
    function safeSessionRemove(key) {
      try { if (window.sessionStorage) sessionStorage.removeItem(key); } catch (_) {}
    }
    function parseJson(raw) {
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (_) { return null; }
    }
    function generateIdempotencyKey() {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
      } catch (_) {}
      // Fallback opaque URL-safe key (best-effort) if randomUUID unavailable.
      try {
        if (window.crypto && window.crypto.getRandomValues) {
          const bytes = new Uint8Array(16);
          window.crypto.getRandomValues(bytes);
          let hex = '';
          for (let i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
          return 'k-' + hex + '-' + Date.now().toString(36);
        }
      } catch (_) {}
      return 'k-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
    function payloadFingerprint(p) {
      // Deterministic client-side comparison fingerprint for attempt lifecycle only.
      // Server remains source of truth for canonical submission fingerprint/conflict detection.
      return JSON.stringify({
        name: p.name || '', email: p.email || '', phone: p.phone || '', company: p.company || '',
        service: p.service || '', budget: p.budget || '', message: p.message || '', source_page: 'contact'
      });
    }
    function clearPending() { safeSessionRemove(PENDING_KEY); }
    function loadPending() { return parseJson(safeSessionGet(PENDING_KEY)); }
    function savePending(state) { safeSessionSet(PENDING_KEY, JSON.stringify(state)); }
    function clearConfirmation() { safeSessionRemove(CONFIRM_KEY); }
    function saveConfirmation(token, expiresAt) {
      safeSessionSet(CONFIRM_KEY, JSON.stringify({ token: token, expiresAt: expiresAt || null, confirmedAt: Date.now() }));
      clearPending();
    }

    function getPayload() {
      return {
        name: (nameInput?.value || '').trim(),
        email: (emailInput?.value || '').trim(),
        company: (companyInput?.value || '').trim(),
        phone: (phoneInput?.value || '').trim(),
        service: serviceInput?.value || '',
        budget: budgetInput?.value || '',
        message: (messageInput?.value || '').trim(),
        website: (websiteInput?.value || '').trim(),
        source_page: window.location.pathname
      };
    }

    function validateClient(p) {
      const serviceAllowed = new Set(['', 'brand-film', 'performance', 'micro-drama', 'social', 'motion', 'digital', 'full', 'other']);
      const budgetAllowed = new Set(['', 'under-1l', '1-5l', '5-15l', '15-50l', '50l-plus']);
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email);
      const phoneOk = !p.phone || /^[0-9+()\-\s.]{7,30}$/.test(p.phone);
      const fieldErrors = {};
      if (!p.name) fieldErrors.name = 'Name is required.';
      else if (p.name.length > 120) fieldErrors.name = 'Name must be 120 characters or fewer.';
      if (!p.email) fieldErrors.email = 'Email is required.';
      else if (p.email.length > 254 || !emailOk) fieldErrors.email = 'Enter a valid email address.';
      if (!p.message) fieldErrors.message = 'Message is required.';
      else if (p.message.length > 5000) fieldErrors.message = 'Message must be 5000 characters or fewer.';
      if (p.company.length > 120) fieldErrors.company = 'Company must be 120 characters or fewer.';
      if (!phoneOk) fieldErrors.phone = 'Enter a valid phone number.';
      if (!serviceAllowed.has(p.service)) fieldErrors.service = 'Please select a valid service option.';
      if (!budgetAllowed.has(p.budget)) fieldErrors.budget = 'Please select a valid budget range.';
      return fieldErrors;
    }

    const inputsByField = { name: nameInput, email: emailInput, message: messageInput, company: companyInput, phone: phoneInput, service: serviceInput, budget: budgetInput };

    function clearFieldErrors() { Object.values(inputsByField).forEach((el) => el && el.removeAttribute('aria-invalid')); }
    function applyFieldErrors(fieldErrors) {
      if (!fieldErrors || typeof fieldErrors !== 'object') return;
      Object.keys(fieldErrors).forEach((f) => { if (inputsByField[f]) inputsByField[f].setAttribute('aria-invalid', 'true'); });
    }
    function showError(msg, fieldErrors) {
      clearFieldErrors();
      if (fieldErrors) applyFieldErrors(fieldErrors);
      if (errorDiv) { errorDiv.textContent = msg || 'We could not submit your message. Please try again.'; errorDiv.hidden = false; }
      if (manualEmail) manualEmail.hidden = !msg; // show only when relevant; refined below
      if (success) success.hidden = true;
    }
    function hideFeedback() {
      if (errorDiv) { errorDiv.textContent = ''; errorDiv.hidden = true; }
      if (manualEmail) manualEmail.hidden = true;
      if (success) success.hidden = true;
    }

    async function submitWithLifecycle(intent) {
      if (!submit || submit.disabled) return;
      clearFieldErrors();
      hideFeedback();

      const payload = getPayload();
      const fieldErrors = validateClient(payload);
      if (Object.keys(fieldErrors).length) {
        applyFieldErrors(fieldErrors);
        if (errorDiv) { errorDiv.textContent = Object.values(fieldErrors).join(' '); errorDiv.hidden = false; }
        if (manualEmail) manualEmail.hidden = true;
        (inputsByField[Object.keys(fieldErrors)[0]] || nameInput)?.focus();
        // validation errors are local; do not create/rotate server submission attempts
        return;
      }

      const fp = payloadFingerprint(payload);
      let pending = loadPending();
      let idemKey = null;

      if (intent === 'retry' && pending && pending.fingerprint === fp && pending.key && pending.outcome === 'retryable') {
        idemKey = pending.key; // reuse same key for same-payload retry/unknown outcome
      } else if (intent === 'new' && pending && pending.fingerprint === fp && pending.outcome === 'retryable' && pending.key) {
        // explicit new attempt with unchanged payload while retryable: keep retryability on same key
        idemKey = pending.key;
      } else {
        // payload changed, or first attempt, or prior terminal/conflict/confirmed -> new key
        idemKey = generateIdempotencyKey();
      }

      // New attempt context: do not let a previously confirmed session token be misattributed to this submission.
      // (Refresh-safe confirmation for the prior submission remains available until user initiates another attempt.)
      if (!(intent === 'retry' && idemKey === (pending && pending.key))) {
        clearConfirmation();
      }

      const attemptState = { key: idemKey, fingerprint: fp, outcome: 'inflight', updatedAt: Date.now() };
      savePending(attemptState);

      const origText = submit.textContent;
      submit.textContent = 'Sending...';
      submit.disabled = true;

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
          body: JSON.stringify(payload)
        });

        let data = {};
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try { data = await res.json(); } catch (_) { data = {}; }
        }

        const savedTrue = data && data.saved === true && (res.status === 200 || res.status === 201);
        if (savedTrue && data.confirmationToken) {
          saveConfirmation(String(data.confirmationToken), data.confirmationExpiresAt || null);
          // Navigate to confirmed thank-you page without sensitive URL params/PII.
          try { window.location.assign('/thank-you'); } catch (_) { window.location.href = '/thank-you'; }
          return;
        }

        // Honeypot/discard: server may return 202 for bot-like submissions. Never claim save, never issue/keep confirmation.
        if (res.status === 202) {
          clearPending();
          clearConfirmation();
          showError('We could not confirm your submission was saved. Please review your message and try again.', null);
          if (manualEmail) manualEmail.hidden = false;
          return;
        }

        // Other non-confirmed responses: do not claim save.
        if (res.status === 409 || (data && data.code === 'IDEMPOTENCY_CONFLICT')) {
          const msg = (data && data.error) ? String(data.error) : 'This submission key was already used with different data. Please start a new submission.';
          clearPending(); // require new key on next intentional attempt
          clearConfirmation();
          showError(msg, null);
          if (manualEmail) manualEmail.hidden = false;
          return;
        }

        if (res.status === 400) {
          const msg = (data && (data.error || data.message)) ? String(data.error || data.message) : 'Please check your details and try again.';
          // invalid request: keep data, do not mark retryable same-key success path; new attempt will issue new key
          if (data && data.fieldErrors && data.fieldErrors.idempotencyKey) {
            clearPending();
          } else {
            // validation errors don't need same-key reuse; clear so next submit gets fresh key unless server says otherwise
            clearPending();
          }
          clearConfirmation();
          showError(msg, data && data.fieldErrors ? data.fieldErrors : null);
          if (manualEmail) manualEmail.hidden = true;
          return;
        }

        if (res.status === 429) {
          savePending({ key: idemKey, fingerprint: fp, outcome: 'retryable', updatedAt: Date.now(), status: 429 });
          showError('Too many submissions. Please wait and try again later.', null);
          if (manualEmail) manualEmail.hidden = false;
          return;
        }

        if (res.status >= 500) {
          savePending({ key: idemKey, fingerprint: fp, outcome: 'retryable', updatedAt: Date.now(), status: res.status });
          showError('Something went wrong on our side. Your message was not confirmed as saved. Please try again.', null);
          if (manualEmail) manualEmail.hidden = false;
          return;
        }

        // Any other unexpected response: preserve data, no confirmed-save claim.
        savePending({ key: idemKey, fingerprint: fp, outcome: 'retryable', updatedAt: Date.now(), status: res.status });
        const generic = (data && (data.error || data.message)) ? String(data.error || data.message) : 'We could not confirm your submission. Please try again.';
        showError(generic, data && data.fieldErrors ? data.fieldErrors : null);
        if (manualEmail) manualEmail.hidden = false;
      } catch (err) {
        // Network/unknown outcome: reuse same key for same-payload retry (idempotent recovery)
        savePending({ key: idemKey, fingerprint: fp, outcome: 'retryable', updatedAt: Date.now(), status: 'network' });
        showError('We could not confirm your submission due to a network issue. Your message was not confirmed as saved. Please try again.', null);
        if (manualEmail) manualEmail.hidden = false;
      } finally {
        if (submit) { submit.textContent = origText; submit.disabled = false; }
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = getPayload();
      const fp = payloadFingerprint(payload);
      const pending = loadPending();
      const intent = (pending && pending.fingerprint === fp && pending.outcome === 'retryable') ? 'retry' : 'new';
      await submitWithLifecycle(intent);
    });
  })();
  /* ══════════════════════════════════════════
     SMOOTH ACTIVE NAV HIGHLIGHT ON SCROLL
  ══════════════════════════════════════════ */
  if (document.body.getAttribute('data-page') === 'home') {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    const scrollSpy = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            navLinks.forEach(l => l.classList.remove('active-nav'));
          }
        });
      },
      { threshold: 0.4 }
    );
    sections.forEach(s => scrollSpy.observe(s));
  }

  /* ══════════════════════════════════════════
     SHOWREEL CLICK
  ══════════════════════════════════════════ */
  document.getElementById('play-showreel')?.addEventListener('click', () => {
    const placeholder = document.getElementById('showreel-placeholder');
    if (placeholder) {
      placeholder.innerHTML = `
        <div style="position:absolute;inset:0;background:#000;display:flex;align-items:center;justify-content:center;">
          <p style="color:rgba(255,255,255,0.4);font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase;">
            [Showreel video embed goes here]
          </p>
        </div>
      `;
    }
  });

  /* ══════════════════════════════════════════
     HERO BG IMAGE FALLBACK
  ══════════════════════════════════════════ */
  const heroImg = document.querySelector('.hero-img');
  if (heroImg) {
    heroImg.onerror = () => {
      heroImg.style.display = 'none';
      const overlay = document.querySelector('.hero-overlay');
      if (overlay) overlay.style.background = 'linear-gradient(135deg, #1E0038 0%, #0A0A0A 100%)';
    };
  }

});
