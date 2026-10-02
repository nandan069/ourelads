/**
 * OUREL ADS — Non-Technical Friendly Admin Panel JavaScript
 * Features: Visual Page Builder, Image Pickers, Friendly Labels, Helpful Hints
 */

// ─── GLOBAL STATE ─── 
let token = localStorage.getItem('admin_token');
let currentUser = null;
let currentPage = 'dashboard';
let activeMediaPickerInput = null;

// ─── API HELPER ─── 
async function api(endpoint, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const cfg = { headers, ...opts };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    cfg.body = JSON.stringify(opts.body);
  }
  if (opts.body instanceof FormData) {
    delete headers['Content-Type'];
  }
  const res = await fetch(`/api${endpoint}`, cfg);
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── TOAST NOTIFICATIONS ─── 
function toast(msg, type = 'success') {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ─── CONFIRMATION MODAL ─── 
function confirmAction(title, msg) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = msg;
    modal.style.display = 'flex';
    document.getElementById('confirmOk').onclick = () => { modal.style.display = 'none'; resolve(true); };
    document.getElementById('confirmCancel').onclick = () => { modal.style.display = 'none'; resolve(false); };
    modal.querySelector('.modal-overlay').onclick = () => { modal.style.display = 'none'; resolve(false); };
  });
}

// ─── EDITOR MODAL ─── 
function openEditorModal(title, html, onSave) {
  const m = document.getElementById('editorModal');
  document.getElementById('editorTitle').textContent = title;
  document.getElementById('editorBody').innerHTML = html;
  document.getElementById('editorSave').onclick = onSave;
  m.style.display = 'flex';
}
function closeEditorModal() { document.getElementById('editorModal').style.display = 'none'; }

// ─── MEDIA PICKER MODAL ─── 
async function openMediaPicker(targetInputName) {
  activeMediaPickerInput = targetInputName;
  const modal = document.getElementById('mediaPickerModal');
  const grid = document.getElementById('mediaPickerGrid');
  modal.style.display = 'flex';
  grid.innerHTML = '<div class="loading-state">Loading library images...</div>';
  
  try {
    const res = await api('/admin/media?limit=100');
    if (!res.data || !res.data.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>No images in media library yet. Upload one above!</p></div>';
      return;
    }
    grid.innerHTML = res.data.map(m => `
      <div class="media-picker-item" onclick="selectMediaForInput('${m.file_path}')">
        <img src="${m.file_path}" alt="${m.alt_text || m.original_name}">
        <div class="picker-name">${m.original_name || m.filename}</div>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Error loading media: ${e.message}</p></div>`;
  }
}

function selectMediaForInput(filePath) {
  if (activeMediaPickerInput) {
    const input = document.querySelector(`[name="${activeMediaPickerInput}"]`);
    if (input) {
      input.value = filePath;
      // Trigger change to update preview thumbnail if present
      const event = new Event('input', { bubbles: true });
      input.dispatchEvent(event);
    }
  }
  closeMediaPickerModal();
}

function closeMediaPickerModal() {
  document.getElementById('mediaPickerModal').style.display = 'none';
  activeMediaPickerInput = null;
}

async function uploadDirectFromPicker(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api/admin/media', { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Image uploaded successfully!');
    const filePath = data.file_path || data.url;
    if (activeMediaPickerInput && filePath) {
      selectMediaForInput(filePath);
    } else {
      closeMediaPickerModal();
    }
  } catch (e) { toast(e.message, 'error'); }
}

// ─── TIME FORMAT ─── 
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

// ─── AUTH ─── 
async function login(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  err.style.display = 'none';
  try {
    const data = await api('/auth/login', { method: 'POST', body: { username: document.getElementById('loginUsername').value, password: document.getElementById('loginPassword').value } });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('admin_token', token);
    showAdmin();
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  }
  btn.disabled = false;
  btn.textContent = 'Sign In';
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('admin_token');
  document.getElementById('adminLayout').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

async function checkAuth() {
  if (!token) return showLogin();
  try {
    currentUser = await api('/auth/me');
    showAdmin();
  } catch { showLogin(); }
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminLayout').style.display = 'none';
}

async function showAdmin() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminLayout').style.display = 'flex';
  buildSidebar();
  navigate('dashboard');
}

// ─── SIDEBAR NAVIGATION (NON-TECHNICAL LABELS) ─── 
const NAV_ITEMS = [
  { section: 'DASHBOARD', items: [
    { id: 'dashboard', icon: '📊', label: 'Overview' },
    { id: 'analytics', icon: '📈', label: 'Traffic & Analytics' },
  ]},
  { section: 'PAGES & WEBSITE', items: [
    { id: 'homepage', icon: '🏠', label: 'Homepage Content' },
    { id: 'pages', icon: '📄', label: 'Website Pages' },
    { id: 'navigation', icon: '🧭', label: 'Menu & Navigation' },
    { id: 'settings', icon: '⚙️', label: 'Contact Info & Details' },
    { id: 'seo', icon: '🔍', label: 'SEO & Search Engine' },
  ]},
  { section: 'CONTENT MANAGER', items: [
    { id: 'projects', icon: '🎨', label: 'Portfolio Projects' },
    { id: 'clients', icon: '🏢', label: 'Client Logos' },
    { id: 'reels', icon: '🎬', label: 'Video Reels' },
    { id: 'services', icon: '💼', label: 'Agency Services' },
    { id: 'cases', icon: '📋', label: 'Case Studies' },
    { id: 'insights', icon: '💡', label: 'Insights & Articles' },
    { id: 'blog', icon: '✍️', label: 'Blog Posts' },
    { id: 'testimonials', icon: '⭐', label: 'Client Reviews' },
    { id: 'team', icon: '👥', label: 'Team Profiles' },
    { id: 'faqs', icon: '❓', label: 'FAQs' },
    { id: 'media', icon: '🖼️', label: 'Media Library' },
  ]},
  { section: 'INQUIRIES & LEADS', items: [
    { id: 'leads', icon: '📬', label: 'Contact Messages' },
  ]},
  { section: 'SETTINGS & TOOLS', items: [
    { id: 'users', icon: '👤', label: 'Admin Users' },
    { id: 'activity', icon: '📜', label: 'Audit Logs' },
    { id: 'backup', icon: '💾', label: 'Database Backup' },
  ]},
];

function buildSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = NAV_ITEMS.map(sec => `
    <div class="nav-section">
      <div class="nav-section-label">${sec.section}</div>
      ${sec.items.map(item => `
        <div class="nav-item ${currentPage === item.id ? 'active' : ''}" onclick="navigate('${item.id}')">
          <span class="nav-icon">${item.icon}</span>
          ${item.label}
        </div>
      `).join('')}
    </div>
  `).join('');

  document.getElementById('sidebarUser').innerHTML = `
    <div class="user-avatar">${(currentUser?.full_name || 'A').charAt(0).toUpperCase()}</div>
    <div class="user-info">
      <div class="name">${currentUser?.full_name || currentUser?.username || 'Admin'}</div>
      <div class="role">${currentUser?.role || 'admin'}</div>
    </div>
  `;
}

// ─── NAVIGATE ─── 
async function navigate(page) {
  currentPage = page;
  buildSidebar();
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div class="loading-state">Loading...</div>';

  const friendlyNames = {
    dashboard: 'Dashboard Overview',
    analytics: 'Traffic & Website Analytics',
    homepage: 'Homepage Sections',
    pages: 'Pages',
    navigation: 'Menu & Navigation',
    settings: 'Site Settings & Contact Info',
    seo: 'SEO & Analytics',
    projects: 'Portfolio Projects',
    clients: 'Client Logos',
    reels: 'Video Reels',
    services: 'Services',
    cases: 'Case Studies',
    insights: 'Insights',
    blog: 'Blog',
    testimonials: 'Client Reviews',
    team: 'Team Members',
    faqs: 'FAQs',
    media: 'Media Library',
    leads: 'Contact Submissions (Leads)',
    users: 'Admin Users',
    activity: 'Activity Logs',
    backup: 'Backup & Export'
  };

  document.getElementById('breadcrumbs').innerHTML = `Admin / <span>${friendlyNames[page] || page}</span>`;

  document.getElementById('sidebar').classList.remove('open');

  try {
    switch (page) {
      case 'dashboard': await renderDashboard(content); break;
      case 'analytics': await renderAnalyticsPage(content); break;
      case 'clients': await renderCrudPage(content, 'clients', 'Client Logos', clientFields()); break;
      case 'projects': await renderCrudPage(content, 'projects', 'Portfolio Projects', projectFields()); break;
      case 'reels': await renderCrudPage(content, 'reels', 'Video Reels', reelFields()); break;
      case 'services': await renderCrudPage(content, 'services', 'Agency Services', serviceFields()); break;
      case 'cases': await renderCrudPage(content, 'cases', 'Case Studies', caseFields()); break;
      case 'team': await renderCrudPage(content, 'team', 'Team Profiles', teamFields()); break;
      case 'insights': await renderCrudPage(content, 'insights', 'Insights & Articles', insightFields()); break;
      case 'blog': await renderCrudPage(content, 'blog', 'Blog Posts', blogFields()); break;
      case 'testimonials': await renderCrudPage(content, 'testimonials', 'Client Reviews', testimonialFields()); break;
      case 'faqs': await renderCrudPage(content, 'faqs', 'FAQs', faqFields()); break;
      case 'pages': await renderCrudPage(content, 'pages', 'Website Pages', pageFields()); break;
      case 'navigation': await renderCrudPage(content, 'navigation', 'Menu Links', navFields()); break;
      case 'leads': await renderLeads(content); break;
      case 'homepage': await renderHomepage(content); break;
      case 'settings': await renderSettings(content); break;
      case 'users': await renderUsers(content); break;
      case 'activity': await renderActivity(content); break;
      case 'media': await renderMedia(content); break;
      case 'seo': await renderSEO(content); break;
      case 'backup': await renderBackup(content); break;
      default: content.innerHTML = '<div class="empty-state"><div class="empty-icon">🚧</div><h3>Coming Soon</h3></div>';
    }
  } catch (e) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

// ═══════════════════════════════════════════
// DASHBOARD (HUMAN-FRIENDLY OVERVIEW)
// ═══════════════════════════════════════════
async function renderDashboard(el) {
  const data = await api('/admin/dashboard');
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Welcome back, ${currentUser?.full_name || currentUser?.username}! 👋</h1>
        <p class="page-subtitle">Here is what is happening on your website today</p>
      </div>
      <a href="/" target="_blank" class="btn btn-ghost">View Live Website ↗</a>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card stat-accent">
        <div class="stat-label">Total Inquiries</div>
        <div class="stat-value">${data.leads.total}</div>
        <small style="color:var(--text-muted)">Contact form submissions</small>
      </div>
      <div class="stat-card stat-success">
        <div class="stat-label">New Leads</div>
        <div class="stat-value">${data.leads.new}</div>
        <small style="color:var(--success)">Awaiting your response</small>
      </div>
      <div class="stat-card stat-info">
        <div class="stat-label">Contacted</div>
        <div class="stat-value">${data.leads.contacted}</div>
        <small style="color:var(--info)">In conversation</small>
      </div>
      <div class="stat-card stat-warning">
        <div class="stat-label">Qualified Leads</div>
        <div class="stat-value">${data.leads.qualified}</div>
        <small style="color:var(--warning)">High potential clients</small>
      </div>
    </div>

    <!-- QUICK ACTIONS FOR NON-TECHNICAL USERS -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h3>⚡ Quick Actions</h3></div>
      <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="navigate('homepage')">✏️ Edit Homepage Content</button>
        <button class="btn btn-ghost" onclick="crudCreate('projects', 'Portfolio Projects')">+ Add New Project</button>
        <button class="btn btn-ghost" onclick="crudCreate('reels', 'Video Reels')">+ Add New Reel</button>
        <button class="btn btn-ghost" onclick="crudCreate('clients', 'Client Logos')">+ Add Client Logo</button>
        <button class="btn btn-ghost" onclick="navigate('leads')">📬 View Contact Messages</button>
      </div>
    </div>
    
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <h3>📬 Recent Inquiries (Leads)</h3>
          <button class="btn btn-ghost btn-xs" onclick="navigate('leads')">View All →</button>
        </div>
        <div class="card-body">
          ${data.recentLeads.length ? `<div class="table-wrapper"><table class="data-table">
            <thead><tr><th>Name</th><th>Service Needed</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>${data.recentLeads.map(l => `<tr>
              <td><strong>${l.name}</strong><br><small style="color:var(--text-muted)">${l.email}</small></td>
              <td>${l.service || 'General'}</td>
              <td><span class="badge badge-${l.status}">${l.status}</span></td>
              <td>${timeAgo(l.created_at)}</td>
            </tr>`).join('')}</tbody>
          </table></div>` : '<div class="empty-state"><p>No messages received yet</p></div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>📊 Website Content Summary</h3></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div style="background:var(--bg-input);padding:12px;border-radius:8px"><strong>${data.content.projects}</strong> Portfolio Projects</div>
            <div style="background:var(--bg-input);padding:12px;border-radius:8px"><strong>${data.content.clients}</strong> Client Logos</div>
            <div style="background:var(--bg-input);padding:12px;border-radius:8px"><strong>${data.content.services}</strong> Agency Services</div>
            <div style="background:var(--bg-input);padding:12px;border-radius:8px"><strong>${data.content.testimonials}</strong> Client Reviews</div>
            <div style="background:var(--bg-input);padding:12px;border-radius:8px"><strong>${data.content.blog}</strong> Blog Posts</div>
            <div style="background:var(--bg-input);padding:12px;border-radius:8px"><strong>${data.content.team}</strong> Team Members</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════
// FRIENDLY FORM FIELD DEFINITIONS
// ═══════════════════════════════════════════
function clientFields() { return [
  { name: 'name', label: 'Client / Brand Name', type: 'text', required: true, tableShow: true, help: 'e.g. Infinix, Vyapar, GoCredit' },
  { name: 'logo', label: 'Logo Image', type: 'image', required: true, tableShow: true, help: 'Click Pick Image to choose from media library or upload a logo' },
  { name: 'bg_color', label: 'Brand Background Color', type: 'text', help: 'Hex color code e.g. #111111 or #0A66C2' },
  { name: 'url', label: 'Website Link', type: 'text', help: 'Optional link to client website' },
  { name: 'sort_order', label: 'Display Order', type: 'number', help: 'Lower numbers appear first' },
  { name: 'is_active', label: 'Show on Website', type: 'checkbox', tableShow: true },
]; }

function projectFields() { return [
  { name: 'title', label: 'Project Title', type: 'text', required: true, tableShow: true, help: 'e.g. Product Launch Campaign' },
  { name: 'brand', label: 'Client / Brand Name', type: 'text', required: true, tableShow: true, help: 'e.g. Infinix' },
  { name: 'category_slug', label: 'Category', type: 'select', options: ['brand', 'performance', 'micro-drama', 'social'], tableShow: true, help: 'Category tag for filter buttons' },
  { name: 'thumbnail', label: 'Cover Image / Logo', type: 'image', help: 'Main cover image for the project card' },
  { name: 'description', label: 'Short Summary', type: 'textarea', tableShow: true, help: '1-2 sentence overview of the project' },
  { name: 'full_description', label: 'Detailed Description', type: 'textarea', help: 'Full story and details' },
  { name: 'project_url', label: 'Project Video / Web Link', type: 'text', help: 'Link to full work or YouTube/Vimeo video' },
  { name: 'year', label: 'Year', type: 'text', help: 'e.g. 2026' },
  { name: 'is_featured', label: 'Show on Homepage', type: 'checkbox' },
  { name: 'status', label: 'Publication Status', type: 'select', options: ['published', 'draft'], tableShow: true },
]; }

function reelFields() { return [
  { name: 'title', label: 'Reel Title', type: 'text', required: true, tableShow: true, help: 'Title of the reel video' },
  { name: 'brand', label: 'Brand Name', type: 'text', required: true, tableShow: true, help: 'e.g. Infinix' },
  { name: 'category', label: 'Category Badge', type: 'text', tableShow: true, help: 'e.g. Brand Film, Performance, Micro-Drama' },
  { name: 'logo', label: 'Brand Logo Image', type: 'image', help: 'Client logo shown on reel card' },
  { name: 'thumbnail', label: 'Video Thumbnail / Preview Image', type: 'image' },
  { name: 'video_url', label: 'Video Link (YouTube / Vimeo / Direct MP4)', type: 'text' },
  { name: 'sort_order', label: 'Order', type: 'number' },
  { name: 'status', label: 'Publication Status', type: 'select', options: ['published', 'draft'], tableShow: true },
]; }

function serviceFields() { return [
  { name: 'num', label: 'Service Number', type: 'text', help: 'e.g. 01, 02, 03' },
  { name: 'title', label: 'Service Title', type: 'text', required: true, tableShow: true, help: 'e.g. Performance Marketing Videos' },
  { name: 'short_description', label: 'Short Description', type: 'textarea', required: true, tableShow: true, help: 'Summary shown on the main grid' },
  { name: 'pills', label: 'Key Features (comma separated)', type: 'text', help: 'e.g. Hooks, Product Demos, Lead Gen' },
  { name: 'icon', label: 'SVG Icon Code', type: 'textarea', help: 'Optional SVG icon code' },
  { name: 'sort_order', label: 'Order', type: 'number' },
  { name: 'status', label: 'Status', type: 'select', options: ['published', 'draft'], tableShow: true },
]; }

function caseFields() { return [
  { name: 'brand', label: 'Client Brand', type: 'text', required: true, tableShow: true },
  { name: 'campaign', label: 'Campaign Title', type: 'text', required: true, tableShow: true },
  { name: 'color', label: 'Card Color', type: 'text', help: 'Hex color code e.g. #111111' },
  { name: 'logo', label: 'Brand Logo', type: 'image' },
  { name: 'challenge', label: 'The Challenge', type: 'textarea' },
  { name: 'solution', label: 'Our Solution', type: 'textarea' },
  { name: 'results', label: 'Results Achieved', type: 'textarea' },
  { name: 'status', label: 'Status', type: 'select', options: ['published', 'draft'], tableShow: true },
]; }

function teamFields() { return [
  { name: 'name', label: 'Member Name', type: 'text', required: true, tableShow: true },
  { name: 'designation', label: 'Role / Designation', type: 'text', required: true, tableShow: true, help: 'e.g. Head of Content' },
  { name: 'bio', label: 'Short Bio', type: 'textarea', help: '1-2 sentence description' },
  { name: 'initials', label: 'Initials Badge', type: 'text', tableShow: true, help: 'e.g. AR, VS' },
  { name: 'photo', label: 'Photo Image', type: 'image' },
  { name: 'sort_order', label: 'Order', type: 'number' },
  { name: 'is_active', label: 'Show on Site', type: 'checkbox', tableShow: true },
]; }

function insightFields() { return [
  { name: 'title', label: 'Article Title', type: 'text', required: true, tableShow: true },
  { name: 'category', label: 'Category / Tag', type: 'text', tableShow: true, help: 'e.g. Brand Strategy, Performance Marketing' },
  { name: 'excerpt', label: 'Short Excerpt', type: 'textarea', help: 'Summary shown on card previews' },
  { name: 'content', label: 'Full Article Content (HTML)', type: 'textarea' },
  { name: 'color', label: 'Card Color Accent', type: 'text', help: 'Hex color code e.g. #2d0a50' },
  { name: 'featured_image', label: 'Cover Image', type: 'image' },
  { name: 'status', label: 'Status', type: 'select', options: ['published', 'draft'], tableShow: true },
]; }

function blogFields() { return [
  { name: 'title', label: 'Post Title', type: 'text', required: true, tableShow: true },
  { name: 'excerpt', label: 'Short Summary', type: 'textarea' },
  { name: 'content', label: 'Post Content (HTML)', type: 'textarea' },
  { name: 'featured_image', label: 'Featured Cover Image', type: 'image' },
  { name: 'author', label: 'Author Name', type: 'text' },
  { name: 'status', label: 'Status', type: 'select', options: ['published', 'draft'], tableShow: true },
]; }

function testimonialFields() { return [
  { name: 'company', label: 'Client Company', type: 'text', required: true, tableShow: true, help: 'e.g. Infinix, Vyapar' },
  { name: 'client_name', label: 'Person Name', type: 'text', required: true, tableShow: true, help: 'e.g. Brand Partner, CMO' },
  { name: 'designation', label: 'Person Designation', type: 'text', help: 'e.g. Marketing Head' },
  { name: 'testimonial', label: 'Client Review / Quote', type: 'textarea', required: true, help: 'The testimonial statement' },
  { name: 'photo', label: 'Client Avatar Photo', type: 'image' },
  { name: 'status', label: 'Status', type: 'select', options: ['published', 'draft'], tableShow: true },
]; }

function faqFields() { return [
  { name: 'question', label: 'Question', type: 'text', required: true, tableShow: true },
  { name: 'answer', label: 'Answer', type: 'textarea', required: true },
  { name: 'category', label: 'Category', type: 'text', tableShow: true },
  { name: 'is_active', label: 'Active', type: 'checkbox', tableShow: true },
]; }

function pageFields() { return [
  { name: 'title', label: 'Page Title', type: 'text', required: true, tableShow: true },
  { name: 'slug', label: 'URL Slug', type: 'text', required: true, tableShow: true, help: 'e.g. home, about, services' },
  { name: 'template', label: 'Page Template', type: 'text', tableShow: true },
  { name: 'status', label: 'Publication Status', type: 'select', options: ['published', 'draft'], tableShow: true },
]; }

function navFields() { return [
  { name: 'label', label: 'Link Title', type: 'text', required: true, tableShow: true, help: 'e.g. Home, Work, Services' },
  { name: 'url', label: 'URL Target', type: 'text', required: true, tableShow: true, help: 'e.g. index.html, about.html, #contact' },
  { name: 'location', label: 'Placement', type: 'select', options: ['header', 'footer_company', 'footer_services'], tableShow: true },
  { name: 'sort_order', label: 'Order', type: 'number', tableShow: true },
  { name: 'is_active', label: 'Visible', type: 'checkbox', tableShow: true },
]; }

// ─── NON-TECHNICAL FORM BUILDER (WITH IMAGE PICKERS & HELPER TEXT) ─── 
function buildFormHtml(fields, data = {}) {
  return fields.map(f => {
    const val = data[f.name] ?? '';
    const helpHtml = f.help ? `<div class="form-help">${f.help}</div>` : '';

    if (f.type === 'image') {
      return `
        <div class="form-group">
          <label>${f.label}</label>
          <div class="image-input-container">
            <div class="image-preview-thumb" id="preview_${f.name}">
              ${val ? `<img src="${val}" style="width:100%;height:100%;object-fit:cover;border-radius:4px">` : '🖼️'}
            </div>
            <div class="image-input-controls">
              <input type="text" name="${f.name}" value="${String(val).replace(/"/g, '&quot;')}" 
                oninput="document.getElementById('preview_${f.name}').innerHTML = this.value ? '<img src=\x27' + this.value + '\x27 style=\x27width:100%;height:100%;object-fit:cover;border-radius:4px\x27>' : '🖼️'">
              <div class="btn-picker-group">
                <button type="button" class="btn btn-ghost btn-xs" onclick="openMediaPicker('${f.name}')">📷 Choose from Library</button>
              </div>
            </div>
          </div>
          ${helpHtml}
        </div>
      `;
    }

    if (f.type === 'textarea') {
      return `<div class="form-group"><label>${f.label}</label><textarea name="${f.name}" ${f.required ? 'required' : ''} rows="4">${val}</textarea>${helpHtml}</div>`;
    }

    if (f.type === 'select') {
      return `<div class="form-group"><label>${f.label}</label><select name="${f.name}">${(f.options || []).map(o => `<option value="${o}" ${val == o ? 'selected' : ''}>${o || '-- Select --'}</option>`).join('')}</select>${helpHtml}</div>`;
    }

    if (f.type === 'checkbox') {
      return `<div class="form-group"><div class="form-check"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}><label>${f.label}</label></div>${helpHtml}</div>`;
    }

    return `<div class="form-group"><label>${f.label}</label><input type="${f.type || 'text'}" name="${f.name}" value="${String(val).replace(/"/g, '&quot;')}" ${f.required ? 'required' : ''}>${helpHtml}</div>`;
  }).join('');
}

function collectFormData(fields) {
  const data = {};
  fields.forEach(f => {
    const el = document.querySelector(`#editorBody [name="${f.name}"]`);
    if (!el) return;
    if (f.type === 'checkbox') { data[f.name] = el.checked ? 1 : 0; }
    else if (f.type === 'number') { data[f.name] = el.value ? parseInt(el.value) : 0; }
    else { data[f.name] = el.value; }
  });
  return data;
}

function projectCategoriesFields() { return [
  { name: 'name', label: 'Category Name', type: 'text', required: true, tableShow: true },
  { name: 'slug', label: 'URL Slug', type: 'text', required: true, tableShow: true },
  { name: 'sort_order', label: 'Order', type: 'number', tableShow: true },
  { name: 'is_active', label: 'Active', type: 'checkbox', tableShow: true },
]; }

function blogCategoriesFields() { return [
  { name: 'name', label: 'Category Name', type: 'text', required: true, tableShow: true },
  { name: 'slug', label: 'URL Slug', type: 'text', required: true, tableShow: true },
  { name: 'sort_order', label: 'Order', type: 'number', tableShow: true },
]; }

// ─── GENERIC CRUD PAGE RENDERER ─── 
async function renderCrudPage(el, endpoint, title, fields = null, pg = 1) {
  if (!fields) {
    const fn = window[`${endpoint}Fields`] || window[`${endpoint.replace(/-/g, '')}Fields`];
    fields = fn ? fn() : [];
  }
  const res = await api(`/admin/${endpoint}?page=${pg}&limit=25`);
  const tableFields = fields.filter(f => f.tableShow);

  el.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">${title}</h1><p class="page-subtitle">${res.total} item(s) on website</p></div>
      <button class="btn btn-primary" onclick="crudCreate('${endpoint}', '${title}')">+ Add New ${title.replace(/s$/, '')}</button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0">
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Preview</th>${tableFields.map(f => `<th>${f.label}</th>`).join('')}<th>Actions</th></tr></thead>
            <tbody>
              ${res.data.length ? res.data.map(row => {
                const imgCol = row.logo || row.thumbnail || row.photo || row.featured_image;
                return `<tr>
                <td>${imgCol ? `<img src="${imgCol}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">` : '📄'}</td>
                ${tableFields.map(f => {
                  const v = row[f.name];
                  if (f.type === 'checkbox') return `<td><span class="badge ${v ? 'badge-active' : 'badge-draft'}">${v ? 'Visible' : 'Hidden'}</span></td>`;
                  if (f.name === 'status') return `<td><span class="badge badge-${v}">${v}</span></td>`;
                  const sv = String(v || '');
                  return `<td>${sv.length > 50 ? sv.substring(0, 50) + '...' : sv}</td>`;
                }).join('')}
                <td>
                  <div class="btn-group">
                    <button class="btn btn-ghost btn-xs" onclick="crudEdit('${endpoint}', ${row.id}, '${title}')">✏️ Edit</button>
                    <button class="btn btn-danger btn-xs" onclick="crudDelete('${endpoint}', ${row.id}, '${title}')">🗑️ Delete</button>
                  </div>
                </td>
              </tr>`;}).join('') : `<tr><td colspan="${tableFields.length + 2}"><div class="empty-state"><p>No items added yet. Click "+ Add New" to create one.</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ${res.totalPages > 1 ? `<div class="pagination">
      <span>Page ${res.page} of ${res.totalPages}</span>
      <div class="pagination-btns">
        <button ${res.page <= 1 ? 'disabled' : ''} onclick="renderCrudPage(document.getElementById('pageContent'), '${endpoint}', '${title}', null, ${res.page - 1})">← Prev</button>
        <button ${res.page >= res.totalPages ? 'disabled' : ''} onclick="renderCrudPage(document.getElementById('pageContent'), '${endpoint}', '${title}', null, ${res.page + 1})">Next →</button>
      </div>
    </div>` : ''}
  `;
}

// Field definition mappings
window.clientsFields = clientFields;
window.projectsFields = projectFields;
window['project-categoriesFields'] = projectCategoriesFields;
window.projectcategoriesFields = projectCategoriesFields;
window.reelsFields = reelFields;
window.servicesFields = serviceFields;
window.casesFields = caseFields;
window.teamFields = teamFields;
window.insightsFields = insightFields;
window.blogFields = blogFields;
window['blog-categoriesFields'] = blogCategoriesFields;
window.blogcategoriesFields = blogCategoriesFields;
window.testimonialsFields = testimonialFields;
window.faqsFields = faqFields;
window.pagesFields = pageFields;
window.navigationFields = navFields;

async function crudCreate(endpoint, title) {
  const fn = window[`${endpoint}Fields`] || window[`${endpoint.replace(/-/g, '')}Fields`];
  const fields = fn ? fn() : [];
  openEditorModal(`Add New ${title.replace(/s$/, '')}`, buildFormHtml(fields), async () => {
    try {
      const body = collectFormData(fields);
      await api(`/admin/${endpoint}`, { method: 'POST', body });
      toast(`${title.replace(/s$/, '')} created!`);
      closeEditorModal();
      navigate(currentPage);
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function crudEdit(endpoint, id, title) {
  const fn = window[`${endpoint}Fields`] || window[`${endpoint.replace(/-/g, '')}Fields`];
  const fields = fn ? fn() : [];
  const data = await api(`/admin/${endpoint}/${id}`);
  openEditorModal(`Edit ${title.replace(/s$/, '')}`, buildFormHtml(fields, data), async () => {
    try {
      const body = collectFormData(fields);
      await api(`/admin/${endpoint}/${id}`, { method: 'PUT', body });
      toast(`${title.replace(/s$/, '')} updated!`);
      closeEditorModal();
      navigate(currentPage);
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function crudDelete(endpoint, id, title) {
  const ok = await confirmAction('Delete Confirmation', `Are you sure you want to delete this ${title.replace(/s$/, '').toLowerCase()}?`);
  if (!ok) return;
  try {
    await api(`/admin/${endpoint}/${id}`, { method: 'DELETE' });
    toast(`${title.replace(/s$/, '')} deleted!`);
    navigate(currentPage);
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════
// VISUAL HOMEPAGE EDITOR (NON-TECHNICAL SECTION CARDS)
// ═══════════════════════════════════════════
async function renderHomepage(el) {
  const data = await api('/admin/homepage');

  const SECTION_CONFIG = {
    hero_section: { title: '✨ Hero Header Section', desc: 'Main title, subheadline, call-to-action button, and hero background at top of homepage.' },
    clients_section: { title: '🏢 Client Logos Section', desc: 'Heading and brand marquee showcase.' },
    services_section: { title: '💼 Agency Services Section', desc: 'Services section titles and description.' },
    portfolio_section: { title: '🎨 Portfolio Showcase Section', desc: 'Work gallery heading and filters.' },
    reels_section: { title: '🎬 Video Reels Ribbon', desc: 'Autoscrolling video showcase ribbon.' },
    cases_section: { title: '📋 Case Studies Section', desc: 'Case studies section titles.' },
    team_section: { title: '👥 Our Team Section', desc: 'Team section headline and subtext.' },
    insights_section: { title: '💡 Insights & Articles Section', desc: 'Articles section header.' },
    testimonials_section: { title: '💬 Client Reviews Section', desc: 'Testimonials carousel section title.' },
    contact_section: { title: '📬 Contact Us Section', desc: 'Contact section headline and call to action.' },
  };

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Homepage Visual Editor</h1>
        <p class="page-subtitle">Click "Edit Content" on any section below to update what visitors see on the homepage</p>
      </div>
      <a href="/" target="_blank" class="btn btn-ghost">Preview Live Site ↗</a>
    </div>

    ${Object.keys(SECTION_CONFIG).map(sec => {
      const config = SECTION_CONFIG[sec];
      const secData = data[sec] || {};
      const previewText = secData.headline || secData.title || secData.tag || 'Configured section';

      return `
        <div class="page-section-card">
          <div class="page-section-header">
            <div>
              <div class="page-section-title">
                ${config.title}
                <span class="page-section-badge">Live Section</span>
              </div>
              <p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px">${config.desc}</p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="editFriendlyHomepageSection('${sec}', '${config.title.replace(/'/g, "\\'")}')">✏️ Edit Content</button>
          </div>
          <div class="page-section-body" style="background:var(--bg-input);font-size:0.9rem">
            <strong>Current Headline / Preview:</strong>
            <p style="color:var(--text-primary);margin-top:4px">${String(previewText).replace(/<br\s*\/?>/gi, ' ')}</p>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

async function editFriendlyHomepageSection(sectionKey, sectionTitle) {
  const all = await api('/admin/homepage');
  const data = all[sectionKey] || {};

  const FRIENDLY_LABELS = {
    tag: 'Badge / Tagline Above Headline',
    headline: 'Main Section Headline (use <br /> for line breaks)',
    subtext: 'Subheadline / Explanation Text',
    desc: 'Description Text',
    cta_text: 'Button Text Label',
    cta_url: 'Button Target Link',
    bg_image: 'Background Image'
  };

  const keys = Object.keys(data).filter(k => k !== 'id');
  const html = keys.map(k => {
    const label = FRIENDLY_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const v = typeof data[k] === 'object' ? JSON.stringify(data[k]) : (data[k] || '');

    if (k.includes('image') || k.includes('logo') || k.includes('photo')) {
      return `
        <div class="form-group">
          <label>${label}</label>
          <div class="image-input-container">
            <div class="image-preview-thumb" id="preview_hp_${k}">${v ? `<img src="${v}" style="width:100%;height:100%;object-fit:cover;border-radius:4px">` : '🖼️'}</div>
            <div class="image-input-controls">
              <input type="text" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">
              <button type="button" class="btn btn-ghost btn-xs" onclick="openMediaPicker('${k}')">📷 Choose Image</button>
            </div>
          </div>
        </div>
      `;
    }

    if (String(v).length > 80 || k === 'headline' || k === 'desc' || k === 'subtext') {
      return `<div class="form-group"><label>${label}</label><textarea name="${k}" rows="3">${v}</textarea></div>`;
    }

    return `<div class="form-group"><label>${label}</label><input type="text" name="${k}" value="${String(v).replace(/"/g, '&quot;')}"></div>`;
  }).join('');

  openEditorModal(`Edit ${sectionTitle}`, html, async () => {
    const body = {};
    keys.forEach(k => {
      const el = document.querySelector(`#editorBody [name="${k}"]`);
      if (el) {
        const val = el.value.trim();
        if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
          try { body[k] = JSON.parse(val); } catch { body[k] = el.value; }
        } else {
          body[k] = el.value;
        }
      }
    });
    await api(`/admin/homepage/${sectionKey}`, { method: 'PUT', body });
    toast('Section updated live!');
    closeEditorModal();
    navigate('homepage');
  });
}

// ═══════════════════════════════════════════
// INQUIRIES & LEADS
// ═══════════════════════════════════════════
async function renderLeads(el, pg = 1, status = '', search = '') {
  let url = `/admin/leads?page=${pg}&limit=25`;
  if (status) url += `&status=${status}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  const res = await api(url);
  
  el.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">Contact Messages & Leads</h1><p class="page-subtitle">${res.total} total inquiries</p></div>
      <a href="/api/admin/leads-export" class="btn btn-ghost" target="_blank">📥 Export CSV File ↗</a>
    </div>
    
    <div class="toolbar">
      <input type="text" class="search-input" placeholder="🔍 Search by name, email, company..." value="${search}" onkeyup="if(event.key==='Enter') renderLeads(document.getElementById('pageContent'), 1, '${status}', this.value)">
      <select onchange="renderLeads(document.getElementById('pageContent'), 1, this.value, '${search}')">
        <option value="">All Status Filter</option>
        <option value="new" ${status==='new'?'selected':''}>New</option>
        <option value="contacted" ${status==='contacted'?'selected':''}>Contacted</option>
        <option value="qualified" ${status==='qualified'?'selected':''}>Qualified</option>
        <option value="converted" ${status==='converted'?'selected':''}>Converted</option>
        <option value="closed" ${status==='closed'?'selected':''}>Closed</option>
        <option value="spam" ${status==='spam'?'selected':''}>Spam</option>
      </select>
    </div>
    
    <div class="card">
      <div class="card-body" style="padding:0">
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Service Needed</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
            <tbody>
              ${res.data.length ? res.data.map(l => `<tr>
                <td><strong>${l.name}</strong>${l.company ? `<br><small style="color:var(--text-muted)">${l.company}</small>` : ''}</td>
                <td>${l.email}</td>
                <td>${l.service || '-'}</td>
                <td><span class="badge badge-${l.status}">${l.status}</span></td>
                <td>${timeAgo(l.created_at)}</td>
                <td><div class="btn-group">
                  <button class="btn btn-ghost btn-xs" onclick="viewLead(${l.id})">👁️ View Message</button>
                  <button class="btn btn-danger btn-xs" onclick="deleteLead(${l.id})">🗑️ Delete</button>
                </div></td>
              </tr>`).join('') : '<tr><td colspan="6"><div class="empty-state"><p>No lead messages found</p></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    ${res.totalPages > 1 ? `<div class="pagination">
      <span>Page ${res.page} of ${res.totalPages}</span>
      <div class="pagination-btns">
        <button ${res.page<=1?'disabled':''} onclick="renderLeads(document.getElementById('pageContent'), ${res.page-1}, '${status}', '${search}')">← Prev</button>
        <button ${res.page>=res.totalPages?'disabled':''} onclick="renderLeads(document.getElementById('pageContent'), ${res.page+1}, '${status}', '${search}')">Next →</button>
      </div>
    </div>` : ''}
  `;
}

async function viewLead(id) {
  const l = await api(`/admin/leads/${id}`);
  openEditorModal('Lead Inquiries Details', `
    <div class="detail-grid">
      <div class="detail-item"><label>Name</label><p><strong>${l.name}</strong></p></div>
      <div class="detail-item"><label>Email</label><p>${l.email}</p></div>
      <div class="detail-item"><label>Phone</label><p>${l.phone || '-'}</p></div>
      <div class="detail-item"><label>Company</label><p>${l.company || '-'}</p></div>
      <div class="detail-item"><label>Service Needed</label><p>${l.service || '-'}</p></div>
      <div class="detail-item"><label>Estimated Budget</label><p>${l.budget || '-'}</p></div>
    </div>
    <div class="form-group" style="margin-top:16px">
      <label>Client Message</label>
      <div style="background:var(--bg-input);padding:14px;border-radius:6px;font-size:0.95rem;line-height:1.5;border:1px solid var(--border)">
        ${l.message || 'No written message attached.'}
      </div>
    </div>
    <div class="form-row" style="margin-top:16px">
      <div class="form-group"><label>Inquiry Status</label><select name="status">
        ${['new','contacted','qualified','converted','closed','spam'].map(s => `<option value="${s}" ${l.status===s?'selected':''}>${s.toUpperCase()}</option>`).join('')}
      </select></div>
    </div>
    <div class="form-group"><label>Internal Notes</label><textarea name="notes" rows="3" placeholder="Add internal follow-up notes here...">${l.notes || ''}</textarea></div>
  `, async () => {
    const status = document.querySelector('#editorBody [name="status"]').value;
    const notes = document.querySelector('#editorBody [name="notes"]').value;
    await api(`/admin/leads/${id}`, { method: 'PUT', body: { status, notes } });
    toast('Lead updated successfully!');
    closeEditorModal();
    navigate('leads');
  });
}

async function deleteLead(id) {
  if (await confirmAction('Delete Lead', 'Are you sure you want to delete this inquiry?')) {
    await api(`/admin/leads/${id}`, { method: 'DELETE' });
    toast('Lead deleted');
    navigate('leads');
  }
}

// ═══════════════════════════════════════════
// SITE SETTINGS & CONTACT INFO
// ═══════════════════════════════════════════
async function renderSettings(el) {
  const settings = await api('/admin/settings');
  const groups = {};
  settings.forEach(s => {
    const g = s.setting_group || 'general';
    if (!groups[g]) groups[g] = [];
    groups[g].push(s);
  });

  const GROUP_TITLES = {
    general: '🌐 General Agency Information',
    contact: '📞 Contact Details & Addresses',
    seo: '🔍 Search Engine & Analytics',
    maps: '🗺️ Google Maps Embeds',
    notifications: '📬 Lead Email Notifications'
  };

  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Site Details & Settings</h1>
        <p class="page-subtitle">Update agency phone numbers, email address, locations, and site defaults</p>
      </div>
    </div>
    <form id="settingsForm">
      ${Object.keys(groups).map(g => `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><h3>${GROUP_TITLES[g] || g.toUpperCase()}</h3></div>
          <div class="card-body">
            ${groups[g].map(s => {
              const label = s.setting_key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              if (s.setting_key.includes('logo') || s.setting_key.includes('favicon')) {
                return `
                  <div class="form-group">
                    <label>${label}</label>
                    <div class="image-input-container">
                      <div class="image-preview-thumb" id="prev_set_${s.setting_key}">${s.setting_value ? `<img src="${s.setting_value}" style="width:100%;height:100%;object-fit:cover">` : '🖼️'}</div>
                      <div class="image-input-controls">
                        <input type="text" name="${s.setting_key}" value="${(s.setting_value || '').replace(/"/g, '&quot;')}">
                        <button type="button" class="btn btn-ghost btn-xs" onclick="openMediaPicker('${s.setting_key}')">📷 Choose Image</button>
                      </div>
                    </div>
                  </div>
                `;
              }
              return `<div class="form-group">
                <label>${label}</label>
                ${s.setting_value && s.setting_value.length > 100 
                  ? `<textarea name="${s.setting_key}" rows="3">${s.setting_value}</textarea>`
                  : `<input type="text" name="${s.setting_key}" value="${(s.setting_value || '').replace(/"/g, '&quot;')}">`}
              </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
      <button type="submit" class="btn btn-primary btn-lg">💾 Save All Settings</button>
    </form>
  `;

  document.getElementById('settingsForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = {};
    settings.forEach(s => {
      const el = document.querySelector(`#settingsForm [name="${s.setting_key}"]`);
      if (el) body[s.setting_key] = el.value;
    });
    await api('/admin/settings', { method: 'PUT', body });
    toast('Site details saved successfully!');
  };
}

// ═══════════════════════════════════════════
// MEDIA LIBRARY
// ═══════════════════════════════════════════
async function renderMedia(el, pg = 1) {
  const res = await api(`/admin/media?page=${pg}&limit=30`);
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Media Library</h1>
        <p class="page-subtitle">Upload and manage images, logos, and videos</p>
      </div>
      <label class="btn btn-primary" style="cursor:pointer">
        📤 Upload Image File
        <input type="file" id="mediaUpload" style="display:none" accept="image/*,video/*,.pdf" onchange="uploadMedia(this)">
      </label>
    </div>
    <div class="media-grid">
      ${res.data.map(m => {
        const isImg = /jpeg|jpg|png|gif|webp|svg/.test(m.file_type || m.mime_type || '');
        return `<div class="media-item" onclick="viewMediaItem(${m.id})">
          ${isImg ? `<img src="${m.file_path}" alt="${m.alt_text || m.original_name}" loading="lazy">` : `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:2rem;background:var(--bg-input)">📄</div>`}
          <div class="media-info">${m.original_name || m.filename}</div>
        </div>`;
      }).join('')}
      ${!res.data.length ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🖼️</div><h3>No image files yet</h3><p>Click Upload Image File above to add your first image</p></div>' : ''}
    </div>
    ${res.totalPages > 1 ? `<div class="pagination"><span>Page ${res.page} of ${res.totalPages}</span><div class="pagination-btns">
      <button ${res.page<=1?'disabled':''} onclick="renderMedia(document.getElementById('pageContent'), ${res.page-1})">← Prev</button>
      <button ${res.page>=res.totalPages?'disabled':''} onclick="renderMedia(document.getElementById('pageContent'), ${res.page+1})">Next →</button>
    </div></div>` : ''}
  `;
}

async function uploadMedia(input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api/admin/media', { method: 'POST', headers, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Image uploaded successfully!');
    navigate('media');
  } catch (e) { toast(e.message, 'error'); }
}

async function viewMediaItem(id) {
  const items = (await api('/admin/media?limit=999')).data;
  const m = items.find(x => x.id === id);
  if (!m) return;
  const isImg = /jpeg|jpg|png|gif|webp|svg/.test(m.file_type || m.mime_type || '');
  openEditorModal('Media Details', `
    ${isImg ? `<img src="${m.file_path}" style="max-width:100%;max-height:260px;object-fit:contain;border-radius:8px;margin-bottom:16px;background:var(--bg-input)">` : ''}
    <div class="detail-grid">
      <div class="detail-item"><label>Filename</label><p>${m.original_name}</p></div>
      <div class="detail-item"><label>File Size</label><p>${(m.file_size / 1024).toFixed(1)} KB</p></div>
      <div class="detail-item"><label>Image URL</label><p><input type="text" value="${m.file_path}" readonly style="width:100%;background:var(--bg-input);border:1px solid var(--border);padding:6px 10px;border-radius:4px;color:var(--text-primary);font-size:0.8rem" onclick="this.select()"></p></div>
    </div>
    <div class="form-group" style="margin-top:16px"><label>Alt Description Text</label><input type="text" name="alt_text" value="${m.alt_text || ''}"></div>
    <div style="margin-top:16px"><button class="btn btn-danger btn-sm" onclick="deleteMedia(${m.id})">🗑️ Delete Image File</button></div>
  `, async () => {
    const alt_text = document.querySelector('#editorBody [name="alt_text"]').value;
    await api(`/admin/media/${id}`, { method: 'PUT', body: { alt_text } });
    toast('Media details updated!');
    closeEditorModal();
  });
}

async function deleteMedia(id) {
  if (await confirmAction('Delete Image', 'Are you sure you want to permanently delete this image file?')) {
    await api(`/admin/media/${id}`, { method: 'DELETE' });
    toast('Image deleted');
    closeEditorModal();
    navigate('media');
  }
}

// ═══════════════════════════════════════════
// SEO & ANALYTICS
// ═══════════════════════════════════════════
async function renderSEO(el) {
  const settings = await api('/settings');
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">SEO & Analytics Settings</h1>
        <p class="page-subtitle">Configure search engine titles, descriptions, and Google Analytics</p>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <form id="seoForm">
          <div class="form-group"><label>Website Search Title (Meta Title)</label><input type="text" name="seo_title" value="${settings.seo_title || ''}"><div class="form-help">Appears in Google search result headers</div></div>
          <div class="form-group"><label>Search Engine Description (Meta Description)</label><textarea name="seo_description" rows="3">${settings.seo_description || ''}</textarea><div class="form-help">1-2 sentence description shown in Google search snippets</div></div>
          <div class="form-group"><label>Google Analytics ID (GA4)</label><input type="text" name="google_analytics_id" value="${settings.google_analytics_id || ''}" placeholder="G-XXXXXXXXXX"><div class="form-help">e.g. G-123456789</div></div>
          <div class="form-group"><label>Google Tag Manager ID (GTM)</label><input type="text" name="google_tag_manager_id" value="${settings.google_tag_manager_id || ''}" placeholder="GTM-XXXXXXX"><div class="form-help">e.g. GTM-ABC1234</div></div>
          <button type="submit" class="btn btn-primary">💾 Save SEO Settings</button>
        </form>
      </div>
    </div>
  `;
  document.getElementById('seoForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = {};
    ['seo_title', 'seo_description', 'google_analytics_id', 'google_tag_manager_id'].forEach(k => {
      body[k] = document.querySelector(`#seoForm [name="${k}"]`).value;
    });
    await api('/admin/settings', { method: 'PUT', body });
    toast('SEO settings saved!');
  };
}

// ═══════════════════════════════════════════
// USERS & BACKUP
// ═══════════════════════════════════════════
async function renderUsers(el) {
  const users = await api('/auth/users');
  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Admin Users</h1>
      <button class="btn btn-primary" onclick="createUser()">+ Add Admin User</button>
    </div>
    <div class="card"><div class="card-body" style="padding:0">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
        <tbody>${users.map(u => `<tr>
          <td>${u.full_name || '-'}</td><td>${u.username}</td><td>${u.email}</td>
          <td><span class="badge badge-${u.role}">${u.role}</span></td>
          <td><span class="badge ${u.is_active ? 'badge-active' : 'badge-closed'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
          <td>${u.last_login ? timeAgo(u.last_login) : 'Never'}</td>
          <td><button class="btn btn-ghost btn-xs" onclick="editUser(${u.id})">✏️ Edit</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div></div>
  `;
}

function createUser() {
  openEditorModal('Add Admin User', `
    <div class="form-group"><label>Username</label><input type="text" name="username" required></div>
    <div class="form-group"><label>Email</label><input type="email" name="email" required></div>
    <div class="form-group"><label>Full Name</label><input type="text" name="full_name"></div>
    <div class="form-group"><label>Password</label><input type="password" name="password" required></div>
    <div class="form-group"><label>Role</label><select name="role_id"><option value="2">Admin</option><option value="3">Editor</option></select></div>
  `, async () => {
    const body = {};
    ['username','email','full_name','password','role_id'].forEach(k => { body[k] = document.querySelector(`#editorBody [name="${k}"]`).value; });
    body.role_id = parseInt(body.role_id);
    await api('/auth/users', { method: 'POST', body });
    toast('User created!');
    closeEditorModal();
    navigate('users');
  });
}

async function editUser(id) {
  const users = await api('/auth/users');
  const u = users.find(x => x.id === id);
  if (!u) return;
  openEditorModal('Edit Admin User', `
    <div class="form-group"><label>Full Name</label><input type="text" name="full_name" value="${u.full_name || ''}"></div>
    <div class="form-group"><label>Email</label><input type="email" name="email" value="${u.email}"></div>
    <div class="form-group"><div class="form-check"><input type="checkbox" name="is_active" ${u.is_active?'checked':''}><label>Active Account</label></div></div>
  `, async () => {
    const body = {
      full_name: document.querySelector('#editorBody [name="full_name"]').value,
      email: document.querySelector('#editorBody [name="email"]').value,
      is_active: document.querySelector('#editorBody [name="is_active"]').checked ? 1 : 0,
    };
    await api(`/auth/users/${id}`, { method: 'PUT', body });
    toast('User updated!');
    closeEditorModal();
    navigate('users');
  });
}

async function renderActivity(el, pg = 1) {
  const res = await api(`/admin/activity?page=${pg}&limit=50`);
  el.innerHTML = `
    <div class="page-header"><h1 class="page-title">Activity Audit Logs</h1><p class="page-subtitle">${res.total} recorded system events</p></div>
    <div class="card"><div class="card-body" style="padding:0">
      <div class="table-wrapper"><table class="data-table">
        <thead><tr><th>User</th><th>Action</th><th>Target</th><th>Time</th></tr></thead>
        <tbody>${res.data.length ? res.data.map(a => `<tr>
          <td>${a.full_name || a.username || 'System'}</td>
          <td><span class="badge badge-${a.action === 'login' ? 'active' : a.action === 'deleted' ? 'closed' : 'new'}">${a.action}</span></td>
          <td>${a.entity_type || '-'}</td>
          <td>${timeAgo(a.created_at)}</td>
        </tr>`).join('') : '<tr><td colspan="4"><div class="empty-state"><p>No activity recorded yet</p></div></td></tr>'}</tbody>
      </table></div>
    </div></div>
  `;
}

async function renderBackup(el) {
  el.innerHTML = `
    <div class="page-header"><h1 class="page-title">Database Backup & Lead Export</h1></div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h3>💾 Create Database Backup</h3></div>
        <div class="card-body">
          <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px">Generates a complete, downloadable SQLite snapshot of all website data and content.</p>
          <button class="btn btn-primary" onclick="createBackup()">Create Snapshot Backup</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>📥 Export Contact Submissions</h3></div>
        <div class="card-body">
          <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:16px">Download all inquiry form messages as a clean Excel/CSV file.</p>
          <a href="/api/admin/leads-export" class="btn btn-ghost" target="_blank">Download CSV File ↗</a>
        </div>
      </div>
    </div>
  `;
}

async function createBackup() {
  try {
    const res = await api('/admin/backup');
    toast(`Backup created: ${res.filename}`);
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════
// INIT & EVENT LISTENERS
// ═══════════════════════════════════════════
document.getElementById('loginForm').addEventListener('submit', login);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});
document.getElementById('sidebarClose').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
});

// Make functions global for inline onclick
window.navigate = navigate;
window.crudCreate = crudCreate;
window.crudEdit = crudEdit;
window.crudDelete = crudDelete;
window.viewLead = viewLead;
window.deleteLead = deleteLead;
window.editFriendlyHomepageSection = editFriendlyHomepageSection;
window.createUser = createUser;
window.editUser = editUser;
window.uploadMedia = uploadMedia;
window.viewMediaItem = viewMediaItem;
window.deleteMedia = deleteMedia;
window.createBackup = createBackup;
window.renderLeads = renderLeads;
window.renderActivity = renderActivity;
window.renderMedia = renderMedia;
window.closeEditorModal = closeEditorModal;
window.renderCrudPage = renderCrudPage;
window.openMediaPicker = openMediaPicker;
window.closeMediaPickerModal = closeMediaPickerModal;
window.selectMediaForInput = selectMediaForInput;
window.uploadDirectFromPicker = uploadDirectFromPicker;

// Check authentication status on startup
checkAuth();


// ═══════════════════════════════════════════
// ANALYTICS & TRAFFIC DASHBOARD WITH GRAPHS
// ═══════════════════════════════════════════
async function renderAnalyticsPage(container) {
  container.innerHTML = '<div class="loading-state">Loading real-time website analytics...</div>';
  try {
    const data = await api('/admin/analytics/overview');

    const summary = data.summary || { total_views: 0, today_views: 0, unique_visitors: 0, total_leads: 0 };
    const dailyStats = data.dailyStats || [];
    const topPages = data.topPages || [];

    const labels = dailyStats.length ? dailyStats.map(d => d.date) : ['Today'];
    const viewsData = dailyStats.length ? dailyStats.map(d => d.views) : [summary.today_views];
    const visitorsData = dailyStats.length ? dailyStats.map(d => d.visitors) : [summary.unique_visitors];

    container.innerHTML = `
      <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px">
        <div class="stat-card stat-primary" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border-color)">
          <div class="stat-label" style="color:var(--text-muted);font-size:13px;font-weight:600">👁️ Total Page Views</div>
          <div class="stat-value" style="font-size:28px;font-weight:800;color:var(--text-primary);margin:6px 0">${summary.total_views}</div>
          <small style="color:var(--accent)">All time page impressions</small>
        </div>
        <div class="stat-card stat-success" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border-color)">
          <div class="stat-label" style="color:var(--text-muted);font-size:13px;font-weight:600">⚡ Today's Views</div>
          <div class="stat-value" style="font-size:28px;font-weight:800;color:var(--success);margin:6px 0">${summary.today_views}</div>
          <small style="color:var(--success)">Live visits today</small>
        </div>
        <div class="stat-card stat-info" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border-color)">
          <div class="stat-label" style="color:var(--text-muted);font-size:13px;font-weight:600">👤 Unique Visitors</div>
          <div class="stat-value" style="font-size:28px;font-weight:800;color:var(--info);margin:6px 0">${summary.unique_visitors}</div>
          <small style="color:var(--info)">Distinct IP devices</small>
        </div>
        <div class="stat-card stat-warning" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border-color)">
          <div class="stat-label" style="color:var(--text-muted);font-size:13px;font-weight:600">📬 Total Inquiries</div>
          <div class="stat-value" style="font-size:28px;font-weight:800;color:var(--warning);margin:6px 0">${summary.total_leads}</div>
          <small style="color:var(--warning)">Leads from contact form</small>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-bottom:24px">
        <div class="card" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border-color)">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="font-size:16px;font-weight:700">📈 Traffic & Visitor Trend (Last 14 Days)</h3>
            <a href="https://analytics.google.com" target="_blank" class="btn btn-ghost btn-xs">Open Google Analytics ↗</a>
          </div>
          <div style="position:relative;height:280px">
            <canvas id="trafficTrendChart"></canvas>
          </div>
        </div>

        <div class="card" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border-color)">
          <div class="card-header" style="margin-bottom:16px">
            <h3 style="font-size:16px;font-weight:700">🔥 Most Visited Pages</h3>
          </div>
          <div style="position:relative;height:280px">
            <canvas id="topPagesChart"></canvas>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div class="card" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border-color)">
          <div class="card-header" style="margin-bottom:16px"><h3 style="font-size:16px;font-weight:700">📊 Page Views Breakdown</h3></div>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Page URL Path</th><th style="text-align:right">Views Count</th></tr></thead>
              <tbody>
                ${topPages.length ? topPages.map(p => `
                  <tr>
                    <td><code>${p.page_path}</code></td>
                    <td style="text-align:right"><strong>${p.views}</strong></td>
                  </tr>
                `).join('') : '<tr><td colspan="2">No page views recorded yet. Visit website pages to test!</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border-color)">
          <div class="card-header" style="margin-bottom:12px"><h3 style="font-size:16px;font-weight:700">🔗 Google Analytics Integration</h3></div>
          <p style="color:var(--text-muted);font-size:14px;line-height:1.6;margin-bottom:16px">
            Google Analytics (GA4) Tag <code>${data.ga_id}</code> is active across all website pages. You can view real-time live users, demography, and traffic acquisition channels on Google Analytics.
          </p>
          <a href="https://analytics.google.com" target="_blank" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px">
            <span>📊 Open Full Google Analytics Dashboard</span> ↗
          </a>
        </div>
      </div>
    `;

    if (typeof Chart !== 'undefined') {
      const ctx1 = document.getElementById('trafficTrendChart');
      if (ctx1) {
        new Chart(ctx1, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Page Views',
                data: viewsData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3
              },
              {
                label: 'Unique Visitors',
                data: visitorsData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
          }
        });
      }

      const ctx2 = document.getElementById('topPagesChart');
      if (ctx2) {
        new Chart(ctx2, {
          type: 'bar',
          data: {
            labels: topPages.map(p => p.page_path.replace('.html', '').replace('/', '') || 'home'),
            datasets: [{
              label: 'Views',
              data: topPages.map(p => p.views),
              backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#64748b']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
          }
        });
      }
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>${err.message}</h3></div>`;
  }
}
