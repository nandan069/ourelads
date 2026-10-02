/**
 * OUREL ADS — Database Schema & Migration
 * Creates all tables and seeds existing hardcoded data
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

function initDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ─── CREATE TABLES ───
  db.exec(`
    -- Users & Auth
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role_id INTEGER DEFAULT 2,
      is_active INTEGER DEFAULT 1,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    -- Site Settings
    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT,
      setting_group TEXT DEFAULT 'general',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Navigation
    CREATE TABLE IF NOT EXISTS navigation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      parent_id INTEGER,
      location TEXT DEFAULT 'header',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_external INTEGER DEFAULT 0,
      css_class TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES navigation_items(id)
    );

    -- Social Links
    CREATE TABLE IF NOT EXISTS social_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Pages
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'published',
      template TEXT DEFAULT 'default',
      content TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Page Sections
    CREATE TABLE IF NOT EXISTS page_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      section_type TEXT NOT NULL,
      title TEXT,
      content TEXT,
      settings TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    -- SEO Metadata
    CREATE TABLE IF NOT EXISTS seo_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      seo_title TEXT,
      meta_description TEXT,
      keywords TEXT,
      canonical_url TEXT,
      og_title TEXT,
      og_description TEXT,
      og_image TEXT,
      robots TEXT DEFAULT 'index, follow',
      schema_markup TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id)
    );

    -- Clients / Brands
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo TEXT,
      url TEXT,
      bg_color TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Project Categories
    CREATE TABLE IF NOT EXISTS project_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Projects / Portfolio
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT,
      client_id INTEGER,
      category_id INTEGER,
      category_slug TEXT,
      description TEXT,
      full_description TEXT,
      thumbnail TEXT,
      images TEXT,
      video_url TEXT,
      project_url TEXT,
      technologies TEXT,
      services TEXT,
      year TEXT,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (category_id) REFERENCES project_categories(id)
    );

    -- Reels
    CREATE TABLE IF NOT EXISTS reels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      brand TEXT,
      category TEXT,
      thumbnail TEXT,
      video_url TEXT,
      platform TEXT,
      description TEXT,
      client_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    -- Services
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE,
      num TEXT,
      short_description TEXT,
      full_description TEXT,
      icon TEXT,
      image TEXT,
      features TEXT,
      benefits TEXT,
      pills TEXT,
      cta_text TEXT,
      cta_url TEXT,
      sort_order INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Case Studies
    CREATE TABLE IF NOT EXISTS case_studies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE,
      client_id INTEGER,
      brand TEXT,
      campaign TEXT,
      category TEXT,
      challenge TEXT,
      strategy TEXT,
      solution TEXT,
      results TEXT,
      metrics TEXT,
      images TEXT,
      video_url TEXT,
      color TEXT,
      logo TEXT,
      services TEXT,
      testimonial TEXT,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    -- Team Members
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      designation TEXT,
      bio TEXT,
      photo TEXT,
      initials TEXT,
      skills TEXT,
      email TEXT,
      instagram TEXT,
      linkedin TEXT,
      other_social TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insight Categories
    CREATE TABLE IF NOT EXISTS insight_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insights
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE,
      excerpt TEXT,
      content TEXT,
      featured_image TEXT,
      author TEXT,
      category TEXT,
      category_id INTEGER,
      tags TEXT,
      color TEXT,
      read_time INTEGER,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES insight_categories(id)
    );

    -- Blog Categories
    CREATE TABLE IF NOT EXISTS blog_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Blog Tags
    CREATE TABLE IF NOT EXISTS blog_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Blog Posts
    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE,
      excerpt TEXT,
      content TEXT,
      featured_image TEXT,
      author TEXT,
      category_id INTEGER,
      tags TEXT,
      status TEXT DEFAULT 'draft',
      is_featured INTEGER DEFAULT 0,
      published_at DATETIME,
      scheduled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES blog_categories(id)
    );

    -- Testimonials
    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      designation TEXT,
      company TEXT,
      photo TEXT,
      testimonial TEXT NOT NULL,
      rating INTEGER DEFAULT 5,
      video_url TEXT,
      is_featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Philosophy Items (O-U-R-E-L)
    CREATE TABLE IF NOT EXISTS philosophy_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      letter TEXT NOT NULL,
      word TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Process Steps
    CREATE TABLE IF NOT EXISTS process_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_number TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Stats
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      suffix TEXT DEFAULT '+',
      is_counter INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- FAQs
    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT,
      page TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Contact Submissions
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      company TEXT,
      service TEXT,
      budget TEXT,
      message TEXT,
      source_page TEXT DEFAULT 'contact',
      status TEXT DEFAULT 'new',
      notes TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Forms
    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      description TEXT,
      success_message TEXT DEFAULT 'Thank you! We will be in touch shortly.',
      notification_email TEXT,
      redirect_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Form Fields
    CREATE TABLE IF NOT EXISTS form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT DEFAULT 'text',
      name TEXT NOT NULL,
      placeholder TEXT,
      options TEXT,
      is_required INTEGER DEFAULT 0,
      validation TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
    );

    -- Form Submissions
    CREATE TABLE IF NOT EXISTS form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      source_page TEXT,
      ip_address TEXT,
      status TEXT DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (form_id) REFERENCES forms(id)
    );

    -- Media Library
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT,
      file_path TEXT NOT NULL,
      file_type TEXT,
      mime_type TEXT,
      file_size INTEGER,
      alt_text TEXT,
      title TEXT,
      caption TEXT,
      width INTEGER,
      height INTEGER,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    -- Activity Logs
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Revisions
    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      changed_by INTEGER,
      change_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    -- Homepage Content
    
    CREATE TABLE IF NOT EXISTS page_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_path TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS homepage_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category_slug);
    CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
    CREATE INDEX IF NOT EXISTS idx_insights_status ON insights(status);
    CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_revisions_entity ON revisions(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_seo_entity ON seo_metadata(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_nav_location ON navigation_items(location);
  `);

  return db;
}

function seedDatabase(db) {
  // ─── SEED INITIAL ANALYTICS IF EMPTY ───
  try {
    const analyticsCount = db.prepare("SELECT COUNT(*) as c FROM page_analytics").get().c;
    if (analyticsCount === 0) {
      const seedPages = ["/index.html", "/about.html", "/services.html", "/work.html", "/insights.html", "/blog.html", "/contact.html"];
      const stmt = db.prepare("INSERT INTO page_analytics (page_path, ip_address) VALUES (?, ?)");
      seedPages.forEach(p => stmt.run(p, "127.0.0.1"));
    }
  } catch(e) {}

  // Check if already seeded
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count > 0) return;

  console.log('Seeding database with existing content...');

  // ─── ROLES ───
  const insertRole = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)');
  insertRole.run('super_admin', 'Full system access');
  insertRole.run('admin', 'Content and lead management');
  insertRole.run('editor', 'Content management only');
  insertRole.run('viewer', 'Read-only access');

  // ─── DEFAULT ADMIN USER ───
  const hashedPassword = bcrypt.hashSync('admin123', 12);
  db.prepare(`INSERT INTO users (username, email, password_hash, full_name, role_id) VALUES (?, ?, ?, ?, ?)`).run(
    'admin', 'admin@ourelads.com', hashedPassword, 'Ourel Admin', 1
  );

  // ─── SITE SETTINGS ───
  const insertSetting = db.prepare('INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)');
  const settings = [
    ['site_name', 'Ourel Ads', 'general'],
    ['site_tagline', 'Advertising · Creative · Production', 'general'],
    ['logo', 'logo.jpeg', 'general'],
    ['favicon', 'logo.jpeg', 'general'],
    ['email', 'info@ourelads.com', 'contact'],
    ['phone', '+91 80762 92036', 'contact'],
    ['whatsapp', '918076292036', 'contact'],
    ['address_hq', 'New Delhi, India, PIN 110034', 'contact'],
    ['address_branch', 'MP Nagar, Bhopal, Madhya Pradesh', 'contact'],
    ['copyright', '© 2026 Ourel Ads. All Rights Reserved.', 'general'],
    ['footer_tagline', 'Ideas / Content / Impact', 'general'],
    ['seo_title', 'Ourel Ads — Advertising & Creative Production Agency', 'seo'],
    ['seo_description', 'Ourel Ads is an advertising and creative production agency helping brands turn ideas into content that connects, engages and drives action.', 'seo'],
    [google_analytics_id, G-D2VRBPMM23, seo],
    ['google_tag_manager_id', '', 'seo'],
    ['map_delhi', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d224345.83923192776!2d77.06889754725782!3d28.52758200617607!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390cfd5b347eb62d%3A0x37205b715389640!2sNew%20Delhi%2C%20Delhi!5e0!3m2!1sen!2sin!4v1695000000000!5m2!1sen!2sin', 'maps'],
    ['map_bhopal', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d58827.63847454887!2d77.3630782!3d23.2110688!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x397c4296aa060e41%3A0xe5d39bfed03d0b70!2sMP%20Nagar%2C%20Bhopal%2C%20Madhya%20Pradesh!5e0!3m2!1sen!2sin!4v1695000000001!5m2!1sen!2sin', 'maps'],
    ['notification_email', 'info@ourelads.com', 'notifications'],
  ];
  settings.forEach(s => insertSetting.run(s[0], s[1], s[2]));

  // ─── SOCIAL LINKS ───
  const insertSocial = db.prepare('INSERT INTO social_links (platform, url, icon, sort_order, is_active) VALUES (?, ?, ?, ?, 1)');
  insertSocial.run('instagram', 'https://www.instagram.com/ourelads', 'instagram', 1);
  insertSocial.run('linkedin', 'https://www.linkedin.com/company/ourel-ads', 'linkedin', 2);
  insertSocial.run('youtube', '#', 'youtube', 3);
  insertSocial.run('facebook', '#', 'facebook', 4);

  // ─── NAVIGATION ───
  const insertNav = db.prepare('INSERT INTO navigation_items (label, url, location, sort_order, is_active) VALUES (?, ?, ?, ?, 1)');
  const navItems = [
    ['Home', 'index.html', 'header', 1],
    ['About', 'about.html', 'header', 2],
    ['Work', 'work.html', 'header', 3],
    ['Services', 'services.html', 'header', 4],
    ['Insights', 'insights.html', 'header', 5],
    ['Blog', 'blog.html', 'header', 6],
    ['Testimonials', 'testimonials.html', 'header', 7],
    ['Contact', 'contact.html', 'header', 8],
    // Footer Company
    ['About', 'about.html', 'footer_company', 1],
    ['Work', 'work.html', 'footer_company', 2],
    ['Services', 'services.html', 'footer_company', 3],
    ['Insights', 'insights.html', 'footer_company', 4],
    ['Blog', 'blog.html', 'footer_company', 5],
    ['Testimonials', 'testimonials.html', 'footer_company', 6],
    ['Contact', 'contact.html', 'footer_company', 7],
    // Footer Services
    ['Performance Videos', 'services.html', 'footer_services', 1],
    ['Brand Films & TVCs', 'services.html', 'footer_services', 2],
    ['Micro-Dramas', 'services.html', 'footer_services', 3],
    ['Content Marketing', 'services.html', 'footer_services', 4],
    ['Digital Marketing', 'services.html', 'footer_services', 5],
    ['Motion Graphics', 'services.html', 'footer_services', 6],
  ];
  navItems.forEach(n => insertNav.run(n[0], n[1], n[2], n[3]));

  // ─── CLIENTS ───
  const insertClient = db.prepare('INSERT INTO clients (name, logo, bg_color, sort_order) VALUES (?, ?, ?, ?)');
  const clientsData = [
    ['Infinix', 'assets/infinix.jpeg', '#111111', 1],
    ['GoodScore', 'assets/goodscore.jpeg', '#0A66C2', 2],
    ['Seekho', 'assets/seekho.jpeg', '#1a1520', 3],
    ['Brands.live', 'assets/brands-live.jpeg', '#f4f8fb', 4],
    ['GoCredit', 'assets/gocredit.jpeg', '#1a0848', 5],
    ['Vyapar', 'assets/vyapar.jpeg', '#fff5f5', 6],
    ['Bansal Group', 'assets/bansal-group.jpeg', '#fffaf5', 7],
    ['FatakPay', 'assets/fatakpay.jpeg', '#fff8f2', 8],
    ['Bachatt', 'assets/bachatt.jpeg', '#3b2bd6', 9],
    ['Jar', 'assets/jar.jpeg', '#16132a', 10],
  ];
  clientsData.forEach(c => insertClient.run(c[0], c[1], c[2], c[3]));

  // ─── PROJECT CATEGORIES ───
  const insertCat = db.prepare('INSERT INTO project_categories (name, slug, sort_order) VALUES (?, ?, ?)');
  insertCat.run('Brand Films', 'brand', 1);
  insertCat.run('Performance', 'performance', 2);
  insertCat.run('Micro-Dramas', 'micro-drama', 3);
  insertCat.run('Social', 'social', 4);
  insertCat.run('Motion', 'motion', 5);

  // ─── PROJECTS ───
  const insertProject = db.prepare('INSERT INTO projects (title, slug, client_id, category_slug, description, thumbnail, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const projectsData = [
    ['Product Launch Campaign', 'infinix-product-launch', 1, 'brand', 'Brand Film', 'assets/infinix.jpeg', 1],
    ['Financial Wellbeing Ad', 'goodscore-financial', 2, 'performance', 'Performance', 'assets/goodscore.jpeg', 2],
    ['Learning Platform Reel', 'seekho-learning', 3, 'performance', 'Performance', 'assets/seekho.jpeg', 3],
    ['Creator Economy Film', 'brands-live-creator', 4, 'brand', 'Brand Film', 'assets/brands-live.jpeg', 4],
    ['Credit Score Micro-Drama', 'gocredit-micro-drama', 5, 'micro-drama', 'Micro-Drama', 'assets/gocredit.jpeg', 5],
    ['SME Storytelling Series', 'vyapar-storytelling', 6, 'social', 'Social', 'assets/vyapar.jpeg', 6],
    ['Brand Identity Film', 'bansal-brand-identity', 7, 'brand', 'Brand Film', 'assets/bansal-group.jpeg', 7],
    ['BNPL Awareness Campaign', 'fatakpay-bnpl', 8, 'performance', 'Performance', 'assets/fatakpay.jpeg', 8],
    ['Social Media Content', 'bachatt-social', 9, 'social', 'Social', 'assets/bachatt.jpeg', 9],
  ];
  projectsData.forEach(p => insertProject.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6]));

  // ─── REELS ───
  const insertReel = db.prepare('INSERT INTO reels (title, brand, category, thumbnail, client_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const reelsDataSeed = [
    ['Product Launch Campaign', 'Infinix', 'Brand Film', 'assets/infinix.jpeg', 1, 1],
    ['Financial Wellbeing Reel', 'GoodScore', 'Performance', 'assets/goodscore.jpeg', 2, 2],
    ['Learning Platform Reel', 'Seekho', 'Social Ad', 'assets/seekho.jpeg', 3, 3],
    ['Creator Economy Film', 'Brands.live', 'Creative', 'assets/brands-live.jpeg', 4, 4],
    ['Credit Score Campaign', 'GoCredit', 'Micro-Drama', 'assets/gocredit.jpeg', 5, 5],
    ['SME Business Story', 'Vyapar', 'Storytelling', 'assets/vyapar.jpeg', 6, 6],
    ['Brand Identity Reel', 'Bansal Group', 'Brand Film', 'assets/bansal-group.jpeg', 7, 7],
    ['BNPL Awareness Series', 'FatakPay', 'FinTech', 'assets/fatakpay.jpeg', 8, 8],
    ['Social Content Showcase', 'Bachatt', 'Social', 'assets/bachatt.jpeg', 9, 9],
  ];
  reelsDataSeed.forEach(r => insertReel.run(r[0], r[1], r[2], r[3], r[4], r[5]));

  // ─── SERVICES ───
  const insertService = db.prepare('INSERT INTO services (title, slug, num, short_description, icon, pills, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const servData = [
    ['Performance Marketing Videos', 'performance-marketing-videos', '01', 'Short-form videos designed around attention, conversion, leads and product communication.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>', 'Hooks,Product demos,Lead gen,A/B cuts', 1],
    ['Brand Films & TVCs', 'brand-films-tvcs', '02', 'High-quality brand films, TVCs, product films and campaign films that define identity.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>', 'TVC,Brand film,Product film', 2],
    ['Micro-Dramas & Storytelling', 'micro-dramas-storytelling', '03', 'Short narrative content built around real-life situations, characters and emotional arcs.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 8v4l3 3"/></svg>', 'Scripts,Casting,Series', 3],
    ['Creative Production', 'creative-production', '04', 'Complete production: Research → Concept → Script → Casting → Shoot → Edit → Delivery.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>', 'Direction,Shoot,Post', 4],
    ['Content Marketing', 'content-marketing', '05', 'Strategic content creation for brands across all digital platforms and touchpoints.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', 'Calendars,Campaigns,Series', 5],
    ['Digital Marketing', 'digital-marketing', '06', 'Creative-led digital marketing and brand communication that drives measurable results.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>', 'Media,Creative,Growth', 6],
    ['Social Media Content', 'social-media-content', '07', 'Reels, short-form videos, campaign creatives and social-first storytelling for all platforms.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 2H3v16h5v4l4-4h4l5-5V2zM11 11V7M16 11V7"/></svg>', 'Reels,Creatives,Thumbnails', 7],
    ['Motion Graphics & Visual', 'motion-graphics', '08', 'Motion graphics, explainer videos, product animations and branded visual content.', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>', 'Motion,Explainers,GFX', 8],
  ];
  servData.forEach(s => insertService.run(s[0], s[1], s[2], s[3], s[4], s[5], s[6]));

  // ─── CASE STUDIES ───
  const insertCase = db.prepare('INSERT INTO case_studies (title, brand, campaign, color, logo, client_id, slug, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const casesDataSeed = [
    ['Infinix Product Launch', 'Infinix', 'Product Launch Campaign', '#111111', 'assets/infinix.jpeg', 1, 'infinix-launch', 1],
    ['GoodScore Financial Wellbeing', 'GoodScore', 'Financial Wellbeing', '#0A66C2', 'assets/goodscore.jpeg', 2, 'goodscore-wellbeing', 2],
    ['Seekho EdTech Series', 'Seekho', 'EdTech Awareness Series', '#1a1520', 'assets/seekho.jpeg', 3, 'seekho-edtech', 3],
    ['GoCredit Micro-Drama', 'GoCredit', 'Credit Score Micro-Drama', '#1a0848', 'assets/gocredit.jpeg', 5, 'gocredit-microdrama', 4],
    ['Vyapar SME Film', 'Vyapar', 'SME Communication Film', '#9b1c1c', 'assets/vyapar.jpeg', 6, 'vyapar-sme', 5],
    ['FatakPay BNPL Campaign', 'FatakPay', 'BNPL Awareness Campaign', '#4c1d95', 'assets/fatakpay.jpeg', 8, 'fatakpay-bnpl', 6],
  ];
  casesDataSeed.forEach(c => insertCase.run(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]));

  // ─── TEAM ───
  const insertTeam = db.prepare('INSERT INTO team_members (name, designation, bio, initials, sort_order) VALUES (?, ?, ?, ?, ?)');
  const teamSeed = [
    ['Abhay Raj', 'Head of Content', 'Leads creative direction and performance-driven content strategy.', 'AR', 1],
    ['Vandana Singh', 'Social Media Head', 'Builds brand voice, community and social-first campaigns.', 'VS', 2],
    ['Creative Studio', 'Direction & Production', 'Concepts, storyboards, shoots and on-ground production.', 'CS', 3],
    ['Post Team', 'Editing & Motion', 'Cuts, colour, motion graphics and platform-ready delivery.', 'PT', 4],
    ['Strategy Desk', 'Brand & Performance', 'Audience insight, messaging and campaign planning.', 'SD', 5],
    ['Design Studio', 'GFX & Visuals', 'Social creatives, thumbnails and visual storytelling.', 'DS', 6],
    ['Client Partners', 'Servicing', 'Keeps brand collaborations tight, clear and on time.', 'CP', 7],
    ['Growth Desk', 'Digital Marketing', 'Creative-led digital campaigns built to convert.', 'GD', 8],
  ];
  teamSeed.forEach(t => insertTeam.run(t[0], t[1], t[2], t[3], t[4]));

  // ─── INSIGHTS ───
  const insertInsight = db.prepare('INSERT INTO insights (title, slug, excerpt, category, color, status, published_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
  const insightsSeed = [
    ['Why Storytelling Is the Most Underrated Marketing Tool', 'storytelling-marketing', "Brands that invest in narrative consistently outperform those focused purely on product messaging. Here's why.", 'Brand Strategy', '#2d0a50'],
    ['The First 3 Seconds: How Attention Defines Ad Performance', 'attention-ad-performance', 'In a world of infinite scroll, your creative has 3 seconds to earn a view. We break down what makes the difference.', 'Performance Marketing', '#0a1628'],
    ['From Brief to Screen: How We Build a Brand Film', 'brief-to-screen', "A behind-the-scenes look at Ourel Ads' complete creative production process — from the first call to final delivery.", 'Creative Thinking', '#1a0a2e'],
    ['Micro-Dramas: The New Language of Brand Communication', 'micro-dramas-brand', 'Short-form narrative content is redefining how brands connect with audiences. Why Ourel Ads is leading this shift.', 'Advertising', '#0d1f0d'],
    ['Human Creativity in the Age of AI-Generated Content', 'human-creativity-ai', "AI can generate. But it can't understand. Here's why human-led creative will always win in brand communication.", 'AI & Advertising', '#1f0d0d'],
    ['Why Indian Consumers Respond to Emotional Advertising', 'emotional-advertising-india', 'Understanding the emotional triggers that drive brand loyalty in Indian markets — and how to use them responsibly.', 'Consumer Behaviour', '#1a1f0d'],
  ];
  insightsSeed.forEach(i => insertInsight.run(i[0], i[1], i[2], i[3], i[4], 'published'));

  // ─── TESTIMONIALS ───
  const insertTestimonial = db.prepare('INSERT INTO testimonials (client_name, designation, company, testimonial, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)');
  const testiSeed = [
    ['Brand Partner', 'Marketing Head', 'Infinix', 'Ourel Ads completely transformed how we communicate our product. The team understood our brand inside out and delivered creative that actually performed.', 1, 'published'],
    ['Brand Partner', 'Brand Manager', 'Vyapar', 'Working with Ourel was a different experience — they bring real strategic thinking to the table, not just production. Our campaign exceeded every benchmark.', 2, 'published'],
    ['Brand Partner', 'Co-Founder', 'GoCredit', "The quality of work, the professionalism and the speed — everything was exceptional. Our reel series drove the highest engagement we've seen.", 3, 'published'],
    ['Brand Partner', 'CMO', 'FatakPay', "Ourel Ads doesn't just make ads — they build brand communication. Every piece of content feels intentional and on-brand.", 4, 'published'],
    ['Brand Partner', 'Growth Manager', 'Seekho', "From concept to final delivery, the process was seamless. They understood the brief better than most agencies we've worked with.", 5, 'published'],
    ['Rohit Sharma', 'Marketing Director', 'Infinix', 'Ourel Ads transformed our digital presence. The brand film they produced completely changed how our audience perceives us. Their team is creative, professional, and delivers beyond expectations.', 6, 'published'],
    ['Priya Patel', 'Founder', 'GoodScore', 'Working with Ourel was a breeze. They understood our vision from day one and executed the performance videos perfectly. Our conversion rates have seen a significant bump since we launched the campaign.', 7, 'published'],
    ['Amit Desai', 'CMO', 'Seekho', 'Their understanding of storytelling and modern marketing is unmatched. The micro-dramas they created for our brand went viral within a week. Highly recommend them for any creative production needs.', 8, 'published'],
  ];
  testiSeed.forEach(t => insertTestimonial.run(t[0], t[1], t[2], t[3], t[4], t[5]));

  // ─── PHILOSOPHY ───
  const insertPhilosophy = db.prepare('INSERT INTO philosophy_items (letter, word, description, sort_order) VALUES (?, ?, ?, ?)');
  const philosData = [
    ['O', 'Outreach', 'Building meaningful connections with audiences.', 1],
    ['U', 'Understanding', 'Understanding people, culture, behaviour and context.', 2],
    ['R', 'Reach', 'Taking the right message to the right audience.', 3],
    ['E', 'Engagement', 'Creating communication people want to watch, remember and interact with.', 4],
    ['L', 'Loyalty', 'Turning attention into lasting relationships with brands.', 5],
  ];
  philosData.forEach(p => insertPhilosophy.run(p[0], p[1], p[2], p[3]));

  // ─── PROCESS STEPS ───
  const insertProcess = db.prepare('INSERT INTO process_steps (step_number, title, description, sort_order) VALUES (?, ?, ?, ?)');
  const processData = [
    ['01', 'Understand', 'Brand, audience & objective', 1],
    ['02', 'Strategise', 'Find the communication opportunity', 2],
    ['03', 'Create', 'Concept, script & visual direction', 3],
    ['04', 'Produce', 'Casting, shoot & production', 4],
    ['05', 'Deliver', 'Editing, finishing & platform-ready content', 5],
  ];
  processData.forEach(p => insertProcess.run(p[0], p[1], p[2], p[3]));

  // ─── STATS ───
  const insertStat = db.prepare('INSERT INTO stats (value, title, description, suffix, is_counter, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  insertStat.run('50', 'Brands', "Brands we've worked with", '+', 1, 1);
  insertStat.run('1000', 'Videos', 'Videos produced', '+', 1, 2);
  insertStat.run('Multi', 'Formats', 'Performance · Brand · Storytelling · Social', '', 0, 3);

  // ─── HOMEPAGE CONTENT ───
  const insertHomepage = db.prepare('INSERT INTO homepage_content (section, content) VALUES (?, ?)');
  const heroContent = JSON.stringify({
    eyebrow: 'Advertising · Creative · Production',
    headline_prefix: 'WE BUILD',
    headline_highlight: 'IDEAS',
    headline_suffix: 'THAT BUILD',
    headline_italic: 'Brands.',
    subheading: 'Ourel Ads is an advertising and creative production agency helping brands turn ideas into content that connects, engages and drives action.',
    cta_primary_text: 'View Our Work',
    cta_primary_url: 'work.html',
    cta_secondary_text: 'Start a Project →',
    cta_secondary_url: 'contact.html',
    hero_image: 'hero_bg.jpg',
    location: '📍 New Delhi · Bhopal',
  });
  insertHomepage.run('hero', heroContent);

  const aboutContent = JSON.stringify({
    tag: 'About Us',
    headline: "WE DON'T JUST<br />MAKE ADS.<br /><em>WE BUILD BRAND<br />COMMUNICATION.</em>",
    paragraph1: 'Ourel Ads is an advertising and creative production agency focused on creating meaningful communication for modern brands.',
    paragraph2: 'From research and strategy to concept, scripting, casting, production, editing and delivery — we bring the complete creative process together under one roof.',
    process_steps: ['Research', 'Idea', 'Script', 'Production', 'Edit', 'Impact'],
    cta_text: 'Start a Project →',
    cta_url: 'contact.html',
  });
  insertHomepage.run('about', aboutContent);

  const marqueeContent = JSON.stringify({
    label: 'TRUSTED BY BRANDS',
    count: '9 clients & counting',
  });
  insertHomepage.run('marquee', marqueeContent);

  const workContent = JSON.stringify({
    tag: 'Portfolio',
    title: 'OUR WORK',
    subtitle: 'Ideas brought to life through strategy, storytelling and production.',
    showreel_text: 'SHOWREEL 2024',
    showreel_bg_text: 'OUREL',
  });
  insertHomepage.run('work', workContent);

  const reelsContent = JSON.stringify({
    tag: 'Content',
    title: 'CONTENT THAT MOVES',
    subtitle: 'Real work. Real brands. Real impact.',
  });
  insertHomepage.run('reels', reelsContent);

  const servicesContent = JSON.stringify({
    tag: 'What We Do',
    title: 'WHAT WE DO',
  });
  insertHomepage.run('services_section', servicesContent);

  const processContent = JSON.stringify({
    tag: 'Our Process',
    title: 'HOW WE WORK',
  });
  insertHomepage.run('process_section', processContent);

  const philosophyContent = JSON.stringify({
    tag: 'Our Philosophy',
    title: 'THE OUREL WAY',
    subtitle: 'Building Reach. Creating Engagement. Earning Loyalty.',
  });
  insertHomepage.run('philosophy', philosophyContent);

  const insightsContent = JSON.stringify({
    tag: 'Thinking',
    title: 'IDEAS / INSIGHTS',
    subtitle: 'Perspectives on advertising, brand strategy and creative thinking.',
  });
  insertHomepage.run('insights_section', insightsContent);

  const testimonialsContent = JSON.stringify({
    tag: 'Client Love',
    title: 'WHAT OUR CLIENTS SAY',
  });
  insertHomepage.run('testimonials_section', testimonialsContent);

  const contactContent = JSON.stringify({
    tag: 'Get In Touch',
    headline: "HAVE A BRAND<br />TO BUILD?<br /><em>LET'S TALK.</em>",
  });
  insertHomepage.run('contact_section', contactContent);

  // ─── BLOG POSTS ───
  const insertBlog = db.prepare('INSERT INTO blog_posts (title, slug, excerpt, content, author, status, published_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
  insertBlog.run('The Future of Performance Video', 'future-performance-video', 'Discover how short-form video is dominating performance marketing and what brands need to do to stay ahead.', '<p>Short-form video has become the dominant force in performance marketing...</p>', 'Ourel Ads', 'published');
  insertBlog.run('Why Storytelling Trumps High Production Budgets', 'storytelling-trumps-budgets', 'We break down some of our most successful campaigns to show why a strong narrative will always beat expensive gear.', '<p>In the world of brand communication, story is king...</p>', 'Ourel Ads', 'published');
  insertBlog.run('Behind the Scenes: Our Latest Brand Film', 'behind-scenes-brand-film', 'Take a look at what goes on behind the camera during a three-day ad shoot in New Delhi.', '<p>Step behind the curtain of a full-scale brand film production...</p>', 'Ourel Ads', 'published');

  // ─── BLOG CATEGORIES ───
  const insertBlogCat = db.prepare('INSERT INTO blog_categories (name, slug, sort_order) VALUES (?, ?, ?)');
  insertBlogCat.run('Marketing', 'marketing', 1);
  insertBlogCat.run('Creative', 'creative', 2);
  insertBlogCat.run('Production', 'production', 3);

  // ─── PAGES ───
  const insertPage = db.prepare('INSERT INTO pages (title, slug, status, template) VALUES (?, ?, ?, ?)');
  insertPage.run('Home', 'home', 'published', 'homepage');
  insertPage.run('About', 'about', 'published', 'about');
  insertPage.run('Work', 'work', 'published', 'work');
  insertPage.run('Services', 'services', 'published', 'services');
  insertPage.run('Insights', 'insights', 'published', 'insights');
  insertPage.run('Blog', 'blog', 'published', 'blog');
  insertPage.run('Testimonials', 'testimonials', 'published', 'testimonials');
  insertPage.run('Contact', 'contact', 'published', 'contact');

  console.log('Database seeded successfully!');
}

module.exports = { initDatabase, seedDatabase };
