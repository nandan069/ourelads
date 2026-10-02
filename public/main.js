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
  const header        = document.getElementById('header');
  const hamburger     = document.getElementById('hamburger');
  const navMenu       = document.getElementById('nav-menu');
  const scrollProgress= document.getElementById('scroll-progress');

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
          const el    = entry.target;
          const target = parseInt(el.dataset.target, 10);
          const duration = 1800;
          const step   = Math.ceil(target / (duration / 20));
          let current  = 0;
          const timer  = setInterval(() => {
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
    { name: 'Jar', logo: 'assets/jar.jpeg', bg_color: '#16132a' }
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
    { brand: 'Infinix',      title: 'Product Launch Campaign', category: 'brand',       type: 'Brand Film', logo: 'assets/infinix.jpeg', href: 'work.html' },
    { brand: 'GoodScore',   title: 'Financial Wellbeing Ad',  category: 'performance', type: 'Performance', logo: 'assets/goodscore.jpeg', href: 'work.html' },
    { brand: 'Seekho',      title: 'Learning Platform Reel',  category: 'performance', type: 'Performance', logo: 'assets/seekho.jpeg', href: 'work.html' },
    { brand: 'Brands.live', title: 'Creator Economy Film',    category: 'brand',       type: 'Brand Film', logo: 'assets/brands-live.jpeg', href: 'work.html' },
    { brand: 'GoCredit',    title: 'Credit Score Micro-Drama',category: 'micro-drama', type: 'Micro-Drama', logo: 'assets/gocredit.jpeg', href: 'work.html' },
    { brand: 'Vyapar',      title: 'SME Storytelling Series', category: 'social',      type: 'Social', logo: 'assets/vyapar.jpeg', href: 'work.html' },
    { brand: 'Bansal Group',title: 'Brand Identity Film',     category: 'brand',       type: 'Brand Film', logo: 'assets/bansal-group.jpeg', href: 'work.html' },
    { brand: 'FatakPay',    title: 'BNPL Awareness Campaign', category: 'performance', type: 'Performance', logo: 'assets/fatakpay.jpeg', href: 'work.html' },
    { brand: 'Bachatt',     title: 'Social Media Content',    category: 'social',      type: 'Social', logo: 'assets/bachatt.jpeg', href: 'work.html' },
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
  function renderPortfolio(filter = 'all') {
    if (!portfolioGrid) return;
    const filtered = filter === 'all' ? portfolioData : portfolioData.filter(p => (p.category || p.category_slug) === filter);
    portfolioGrid.innerHTML = filtered.map((p, i) => {
      const clientBg = clients.find(c => (c.name || c.brand) === p.brand)?.bg_color;
      return `
      <a href="${p.href || p.project_url || 'work.html'}" class="portfolio-card" data-category="${p.category || p.category_slug}" data-animate="fade-up" data-delay="${(i % 3) * 80}">
        <div class="portfolio-card-thumb" style="background:${clientBg || bgColors[i % bgColors.length]}">
          <span class="portfolio-thumb-label">${p.type || p.category || 'Case Study'}</span>
          <img class="portfolio-logo" src="${p.logo || p.thumbnail}" alt="${p.brand || p.title} logo" />
        </div>
        <div class="portfolio-card-info">
          <div class="portfolio-card-brand">${p.brand || 'Ourel Ads'}</div>
          <div class="portfolio-card-title">${p.title}</div>
          <div class="portfolio-card-desc">View work →</div>
        </div>
      </a>
    `;}).join('');
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
    { brand: 'Infinix',      title: 'Product Launch Campaign', category: 'Brand Film', logo: 'assets/infinix.jpeg' },
    { brand: 'GoodScore',    title: 'Financial Wellbeing Reel', category: 'Performance', logo: 'assets/goodscore.jpeg' },
    { brand: 'Seekho',       title: 'Learning Platform Reel', category: 'Social Ad', logo: 'assets/seekho.jpeg' },
    { brand: 'Brands.live',  title: 'Creator Economy Film', category: 'Creative', logo: 'assets/brands-live.jpeg' },
    { brand: 'GoCredit',     title: 'Credit Score Campaign', category: 'Micro-Drama', logo: 'assets/gocredit.jpeg' },
    { brand: 'Vyapar',       title: 'SME Business Story', category: 'Storytelling', logo: 'assets/vyapar.jpeg' },
    { brand: 'Bansal Group', title: 'Brand Identity Reel', category: 'Brand Film', logo: 'assets/bansal-group.jpeg' },
    { brand: 'FatakPay',     title: 'BNPL Awareness Series', category: 'FinTech', logo: 'assets/fatakpay.jpeg' },
    { brand: 'Bachatt',      title: 'Social Content Showcase', category: 'Social', logo: 'assets/bachatt.jpeg' },
  ];

  const reelsData = await fetchApiData('/reels', fallbackReels);

  const reelsTrack = document.getElementById('reels-track');
  const allReels = [...reelsData, ...reelsData];
  if (reelsTrack) {
    reelsTrack.innerHTML = allReels.map((r, i) => {
      const clientBg = clients.find(c => (c.name || c.brand) === r.brand)?.bg_color;
      return `
      <div class="reel-card" data-brand="${r.brand}">
        <div class="reel-thumb" style="background:${clientBg || bgColors[i % bgColors.length]}">
          <div class="reel-top-bar">
            <span class="reel-brand-pill">${r.brand}</span>
            <span class="reel-badge">${r.category}</span>
          </div>
          <img class="reel-logo" src="${r.logo || r.thumbnail}" alt="${r.brand}" />
          <div class="reel-play-icon">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div class="reel-overlay-info">
            <span class="reel-brand-sub">${r.brand}</span>
            <div class="reel-title">${r.title}</div>
          </div>
        </div>
      </div>
    `;}).join('');
  }

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
     CASE STUDIES DATA + RENDERING
  ══════════════════════════════════════════ */
  const fallbackCases = [
    { brand: 'Infinix',      campaign: 'Product Launch Campaign',  color: '#111111', logo: 'assets/infinix.jpeg' },
    { brand: 'GoodScore',    campaign: 'Financial Wellbeing',      color: '#0A66C2', logo: 'assets/goodscore.jpeg' },
    { brand: 'Seekho',       campaign: 'EdTech Awareness Series',  color: '#1a1520', logo: 'assets/seekho.jpeg' },
    { brand: 'GoCredit',     campaign: 'Credit Score Micro-Drama', color: '#1a0848', logo: 'assets/gocredit.jpeg' },
    { brand: 'Vyapar',       campaign: 'SME Communication Film',   color: '#9b1c1c', logo: 'assets/vyapar.jpeg' },
    { brand: 'FatakPay',     campaign: 'BNPL Awareness Campaign',  color: '#4c1d95', logo: 'assets/fatakpay.jpeg' },
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
    `;}).join('');
    teamGrid.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
  }

  /* ══════════════════════════════════════════
     INSIGHTS DATA + RENDERING
  ══════════════════════════════════════════ */
  const fallbackInsights = [
    {
      tag: 'Brand Strategy', category: 'Brand Strategy',
      title: 'Why Storytelling Is the Most Underrated Marketing Tool',
      desc: 'Brands that invest in narrative consistently outperform those focused purely on product messaging. Here\'s why.', excerpt: 'Brands that invest in narrative consistently outperform those focused purely on product messaging.',
      color: '#2d0a50',
      href: 'insight-storytelling.html'
    },
    {
      tag: 'Performance Marketing', category: 'Performance Marketing',
      title: 'The First 3 Seconds: How Attention Defines Ad Performance',
      desc: 'In a world of infinite scroll, your creative has 3 seconds to earn a view. We break down what makes the difference.', excerpt: 'In a world of infinite scroll, your creative has 3 seconds to earn a view.',
      color: '#0a1628',
      href: 'insight-attention.html'
    },
    {
      tag: 'Creative Thinking', category: 'Creative Thinking',
      title: 'From Brief to Screen: How We Build a Brand Film',
      desc: 'A behind-the-scenes look at Ourel Ads\' complete creative production process — from the first call to final delivery.', excerpt: 'A behind-the-scenes look at Ourel Ads\' complete creative production process.',
      color: '#1a0a2e',
      href: 'insight-process.html'
    },
    {
      tag: 'Advertising', category: 'Advertising',
      title: 'Micro-Dramas: The New Language of Brand Communication',
      desc: 'Short-form narrative content is redefining how brands connect with audiences. Why Ourel Ads is leading this shift.', excerpt: 'Short-form narrative content is redefining how brands connect with audiences.',
      color: '#0d1f0d',
      href: 'insight-micro-dramas.html'
    },
    {
      tag: 'AI & Advertising', category: 'AI & Advertising',
      title: 'Human Creativity in the Age of AI-Generated Content',
      desc: 'AI can generate. But it can\'t understand. Here\'s why human-led creative will always win in brand communication.', excerpt: 'AI can generate. But it can\'t understand.',
      color: '#1f0d0d',
      href: 'insight-ai.html'
    },
    {
      tag: 'Consumer Behaviour', category: 'Consumer Behaviour',
      title: 'Why Indian Consumers Respond to Emotional Advertising',
      desc: 'Understanding the emotional triggers that drive brand loyalty in Indian markets — and how to use them responsibly.', excerpt: 'Understanding the emotional triggers that drive brand loyalty in Indian markets.',
      color: '#1a1f0d',
      href: 'insight-emotion.html'
    },
  ];

  const insightsData = await fetchApiData('/insights', fallbackInsights);

  const insightsGrid = document.getElementById('insights-grid');
  if (insightsGrid) {
    insightsGrid.innerHTML = insightsData.map(ins => `
      <a href="${ins.href || `/insight-${ins.slug}.html` || '#'}" class="insight-card" data-animate="fade-up">
        <div class="insight-img" style="background:${ins.color || '#2d0a50'}">
          <div class="insight-img-placeholder">${(ins.category || ins.tag || 'IN').slice(0,2).toUpperCase()}</div>
        </div>
        <div class="insight-body">
          <div class="insight-tag">${ins.category || ins.tag}</div>
          <div class="insight-title">${ins.title}</div>
          <div class="insight-desc">${ins.excerpt || ins.desc || ''}</div>
          <span class="insight-read">Read More →</span>
        </div>
      </a>
    `).join('');
    insightsGrid.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
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
  const testiDots  = document.getElementById('testi-dots');
  let testiCurrent = 0;
  const testiVisible = window.innerWidth < 768 ? 1 : 2;

  if (testiTrack) {
    testiTrack.innerHTML = testimonialsData.map(t => `
      <div class="testi-card">
        <div class="testi-quote-mark">"</div>
        <div class="testi-text">${t.testimonial || t.text}</div>
        <div class="testi-author">
          <div class="testi-avatar">${(t.company || 'Ourel').slice(0,2).toUpperCase()}</div>
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
     CONTACT FORM — CONNECTED TO CMS BACKEND API
  ══════════════════════════════════════════ */
  const form    = document.getElementById('contact-form');
  const success = document.getElementById('form-success');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('form-name');
    const emailInput = document.getElementById('form-email');
    const name  = nameInput.value.trim();
    const email = emailInput.value.trim();
    const errorDiv = document.getElementById('form-error');

    if (!name || !email) {
      if (!name) nameInput.setAttribute('aria-invalid', 'true');
      if (!email) emailInput.setAttribute('aria-invalid', 'true');
      if (errorDiv) {
        errorDiv.textContent = 'Please fill in your name and email.';
        errorDiv.hidden = false;
      }
      return;
    }

    nameInput.removeAttribute('aria-invalid');
    emailInput.removeAttribute('aria-invalid');
    if (errorDiv) errorDiv.hidden = true;

    const submit = document.getElementById('form-submit');
    const origText = submit.textContent;
    submit.textContent = 'Sending...';
    submit.disabled = true;

    const company = document.getElementById('form-company')?.value.trim() || '';
    const phone = document.getElementById('form-phone')?.value.trim() || '';
    const service = document.getElementById('form-need')?.value || '';
    const budget = document.getElementById('form-budget')?.value || '';
    const message = document.getElementById('form-message')?.value.trim() || '';

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, company, phone, service, budget, message,
          source_page: window.location.pathname
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit form');
      }

      form.reset();
      if (success) {
        success.hidden = false;
        success.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      setTimeout(() => { if (success) success.hidden = true; }, 6000);
    } catch (err) {
      console.warn('Form API submit failed, falling back to mailto:', err);
      const subject = encodeURIComponent(`New project enquiry from ${name}`);
      const body = encodeURIComponent(
        `Name: ${name}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone}\nService: ${service}\nBudget: ${budget}\n\n${message}`
      );
      window.location.href = `mailto:officialourelads@gmail.com?subject=${subject}&body=${body}`;
      form.reset();
      if (success) success.hidden = false;
      setTimeout(() => { if (success) success.hidden = true; }, 5000);
    } finally {
      submit.textContent = origText;
      submit.disabled = false;
    }
  });

  /* ══════════════════════════════════════════
     SMOOTH ACTIVE NAV HIGHLIGHT ON SCROLL
  ══════════════════════════════════════════ */
  if (document.body.getAttribute('data-page') === 'home') {
    const sections = document.querySelectorAll('section[id]');
    const navLinks  = document.querySelectorAll('.nav-link');
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
