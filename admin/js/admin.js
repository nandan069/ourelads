/**
 * OUREL ADS — Non-Technical Friendly Admin Panel JavaScript
 * Features: Visual Page Builder, Image Pickers, Friendly Labels, Helpful Hints
 */

// ─── GLOBAL STATE ─── 
let token = localStorage.getItem('admin_token');
let currentUser = null;
let currentPage = 'dashboard';
let activeMediaPickerInput = null;
let chartInstances = [];

// ─── API HELPER ─── 
async function api(endpoint, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const cfg = { headers, ...opts, credentials: 'same-origin' };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    cfg.body = JSON.stringify(opts.body);
  }
  if (opts.body instanceof FormData) {
    delete headers['Content-Type'];
  }
  let res;
  try {
    res = await fetch(`/api${endpoint}`, cfg);
  } catch (networkError) {
    throw new Error('Network error: Unable to connect to server');
  }
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed with status ${res.status}`);
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

// ─── HTML ESCAPE (XSS Prevention) ───
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  // Destroy charts when navigating away from analytics
  if (currentPage === 'analytics') {
    chartInstances.forEach(chart => chart.destroy());
    chartInstances = [];
  }
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
  { name: 'title', label: 'Case Study Title', type: 'text', help: 'Optional: defaults to Brand - Campaign' },
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
    hero: { title: '✨ Hero Header Section', desc: 'Main title, subheadline, call-to-action button, and hero background at top of homepage.' },
    about: { title: 'About Section', desc: 'Agency introduction, process summary, and call to action.' },
    marquee: { title: '🏢 Client Logos Section', desc: 'Heading and brand marquee showcase.' },
    work: { title: '🎨 Portfolio Showcase Section', desc: 'Work gallery heading and showreel labels.' },
    reels: { title: '🎬 Video Reels Ribbon', desc: 'Autoscrolling video showcase ribbon.' },
    services_section: { title: '💼 Agency Services Section', desc: 'Services section titles and description.' },
    process_section: { title: 'Our Process Section', desc: 'Process section heading and label.' },
    philosophy: { title: 'Our Philosophy Section', desc: 'The Ourel framework heading and supporting text.' },
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
      const previewText = secData.headline || secData.title || secData.tag || [
        secData.headline_prefix,
        secData.headline_highlight,
        secData.headline_suffix,
        secData.headline_italic,
      ].filter(Boolean).join(' ') || 'Configured section';
      const safePreview = escapeHtml(String(previewText).replace(/<br\s*\/?>/gi, ' ').replace(/<\/?em>/gi, '').replace(/<[^>]*>/g, ''));

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
            <p style="color:var(--text-primary);margin-top:4px">${safePreview}</p>
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
  
  const escapeAttr = (text) => {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  el.innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">Contact Messages & Leads</h1><p class="page-subtitle">${res.total} total inquiries</p></div>
      <button type="button" class="btn btn-ghost" onclick="exportLeadsCsv()">📥 Export CSV File</button>
    </div>
    
    <div class="toolbar">
      <input type="text" class="search-input" placeholder="🔍 Search by name, email, company..." value="${escapeAttr(search)}" onkeyup="if(event.key==='Enter') renderLeads(document.getElementById('pageContent'), 1, '${escapeAttr(status)}', this.value)">
      <select onchange="renderLeads(document.getElementById('pageContent'), 1, this.value, '${escapeAttr(search)}')">
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
                <td><strong>${escapeHtml(l.name)}</strong>${l.company ? `<br><small style="color:var(--text-muted)">${escapeHtml(l.company)}</small>` : ''}</td>
                <td>${escapeHtml(l.email)}</td>
                <td>${escapeHtml(l.service || '-')}</td>
                <td><span class="badge badge-${escapeAttr(l.status || '')}">${escapeHtml(l.status || '')}</span></td>
                <td>${escapeHtml(timeAgo(l.created_at))}</td>
                <td><div class="btn-group">
                  <button class="btn btn-ghost btn-xs" onclick="viewLead(${Number(l.id)})">👁️ View Message</button>
                  <button class="btn btn-danger btn-xs" onclick="deleteLead(${Number(l.id)})">🗑️ Delete</button>
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
        <button ${res.page<=1?'disabled':''} onclick="renderLeads(document.getElementById('pageContent'), ${res.page-1}, '${escapeAttr(status)}', '${escapeAttr(search)}')">← Prev</button>
        <button ${res.page>=res.totalPages?'disabled':''} onclick="renderLeads(document.getElementById('pageContent'), ${res.page+1}, '${escapeAttr(status)}', '${escapeAttr(search)}')">Next →</button>
      </div>
    </div>` : ''}
  `;
}

async function viewLead(id) {
  const l = await api(`/admin/leads/${id}`);
  const safe = (v) => escapeHtml(v == null || v === '' ? '-' : v);
  const safeMsg = escapeHtml(l.message || '').replace(/\n/g, '<br>');
  openEditorModal('Lead Inquiries Details', `
    <div class="detail-grid">
      <div class="detail-item"><label>Name</label><p><strong>${safe(l.name)}</strong></p></div>
      <div class="detail-item"><label>Email</label><p>${safe(l.email)}</p></div>
      <div class="detail-item"><label>Phone</label><p>${safe(l.phone || '-')}</p></div>
      <div class="detail-item"><label>Company</label><p>${safe(l.company || '-')}</p></div>
      <div class="detail-item"><label>Service Needed</label><p>${safe(l.service || '-')}</p></div>
      <div class="detail-item"><label>Estimated Budget</label><p>${safe(l.budget || '-')}</p></div>
    </div>
    <div class="form-group" style="margin-top:16px">
      <label>Client Message</label>
      <div style="background:var(--bg-input);padding:14px;border-radius:6px;font-size:0.95rem;line-height:1.5;border:1px solid var(--border)">
        ${safeMsg || 'No written message attached.'}
      </div>
    </div>
    <div class="form-row" style="margin-top:16px">
      <div class="form-group"><label>Inquiry Status</label><select name="status">
        ${['new','contacted','qualified','converted','closed','spam'].map(s => `<option value="${s}" ${l.status===s?'selected':''}>${escapeHtml(s.toUpperCase())}</option>`).join('')}
      </select></div>
    </div>
    <div class="form-group"><label>Internal Notes</label><textarea name="notes" rows="3" placeholder="Add internal follow-up notes here...">${escapeHtml(l.notes || '')}</textarea></div>
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
  const m = await api(`/admin/media/${id}`);
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
// SEO & ANALYTICS (Global + Per-Page / Blog Posts)
// ═══════════════════════════════════════════
const SUPPORTED_PAGE_SEO = [
  { slug: 'home', label: 'Home', path: '/' },
  { slug: 'about', label: 'About', path: '/about' },
  { slug: 'services', label: 'Services', path: '/services' },
  { slug: 'work', label: 'Work', path: '/work' },
  { slug: 'blog', label: 'Blog', path: '/blog' },
  { slug: 'testimonials', label: 'Testimonials', path: '/testimonials' },
  { slug: 'contact', label: 'Contact', path: '/contact' },
];
const SUPPORTED_PAGE_SEO_SLUGS = new Set(SUPPORTED_PAGE_SEO.map(p => p.slug));
const SUPPORTED_ROBOTS_DIRECTIVES = [
  'index, follow',
  'noindex, follow',
  'index, nofollow',
  'noindex, nofollow',
];
// Static template metadata used to approximate renderer fallbacks in preview (not page IDs).
const PAGE_STATIC_SEO_DEFAULTS = {
  home: { title: 'Ourel Ads — Advertising & Creative Production Agency', description: 'Ourel Ads is an advertising and creative production agency helping brands turn ideas into content that connects, engages and drives action.', ogTitle: 'Ourel Ads — We Build Ideas That Build Brands', ogDescription: 'Advertising • Creative • Marketing • Production. From concept to delivery, we bring the complete creative process under one roof.' },
  about: { title: 'About Ourel Ads — Advertising & Creative Production', description: 'Ourel Ads is a New Delhi and Bhopal advertising agency founded in 2022. Strategy, creativity and production under one roof.', ogTitle: '', ogDescription: '' },
  services: { title: 'Services — Ourel Ads', description: 'Brand films, TVCs, performance videos, micro-dramas, social content, motion graphics and digital marketing.', ogTitle: '', ogDescription: '' },
  work: { title: 'Work — Ourel Ads', description: 'Campaigns and content for Infinix, GoodScore, Seekho, Vyapar, GoCredit, FatakPay, Bachatt, Bansal Group and more.', ogTitle: '', ogDescription: '' },
  blog: { title: 'Blog — Ourel Ads | Advertising & Creative Production', description: 'Read the latest insights, trends, and thoughts on advertising, performance marketing, and creative production from the team at Ourel Ads.', ogTitle: 'Blog — Ourel Ads', ogDescription: 'Read the latest insights, trends, and thoughts on advertising, performance marketing, and creative production from the team at Ourel Ads.' },
  testimonials: { title: 'Testimonials — Ourel Ads | What Our Clients Say', description: 'Read testimonials from brands that trust Ourel Ads for advertising, creative production, and performance marketing.', ogTitle: 'Testimonials — Ourel Ads', ogDescription: 'Read testimonials from brands that trust Ourel Ads for advertising, creative production, and performance marketing.' },
  contact: { title: 'Contact — Ourel Ads', description: 'Start a project with Ourel Ads. Email info@ourelads.com or WhatsApp. New Delhi and Bhopal.', ogTitle: '', ogDescription: '' },
};
const CANONICAL_PREVIEW_ORIGIN = 'https://ourelads.com';

let seoState = {
  settings: {},
  pages: [],
  blogPosts: [],
  projects: [],
  contentType: 'page', // 'page' | 'blog_post' | 'project'
  selectedPageId: null,
  selectedBlogPostId: null,
  selectedProjectId: null,
  loadedRecord: null,
  initialForm: null,
  dirty: false,
  loading: false,
};

function seoEscapeAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function seoGetFormValues() {
  const g = (name) => {
    const el = document.querySelector(`#perPageSeoForm [name="${name}"]`);
    return el ? el.value : '';
  };
  return {
    seo_title: g('seo_title'),
    meta_description: g('meta_description'),
    canonical_url: g('canonical_url'),
    og_title: g('og_title'),
    og_description: g('og_description'),
    og_image: g('og_image'),
    robots: g('robots') || 'index, follow',
  };
}

function seoNormalizeForCompare(values) {
  const trim = (v) => (v == null ? '' : String(v).trim());
  return {
    seo_title: trim(values.seo_title),
    meta_description: trim(values.meta_description),
    canonical_url: trim(values.canonical_url),
    og_title: trim(values.og_title),
    og_description: trim(values.og_description),
    og_image: trim(values.og_image),
    robots: trim(values.robots) || 'index, follow',
  };
}

function seoMarkDirty() {
  if (!seoState.initialForm) return;
  const current = seoNormalizeForCompare(seoGetFormValues());
  seoState.dirty = JSON.stringify(current) !== JSON.stringify(seoNormalizeForCompare(seoState.initialForm));
  const warn = document.getElementById('seoUnsavedWarning');
  if (warn) warn.style.display = seoState.dirty ? 'inline-flex' : 'none';
}

function seoValidateClient(values) {
  const errors = [];
  const hasControl = (s) => /[\u0000-\u001F\u007F]/.test(s || '');
  const isValidUrl = (val, { allowEmpty = true, field }) => {
    const v = (val || '').trim();
    if (!v) return allowEmpty ? null : `${field} is required`;
    if (hasControl(v)) return `${field} contains invalid characters`;
    let u;
    try { u = new URL(v); } catch { return `${field} must be a valid URL`; }
    const proto = u.protocol.toLowerCase();
    if (proto === 'https:') return null;
    if (proto === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1')) return null;
    return `${field} must use https:// (http:// allowed only for localhost in development)`;
  };

  if ((values.seo_title || '').trim().length > 120) errors.push('SEO title should be 120 characters or fewer.');
  if ((values.meta_description || '').trim().length > 320) errors.push('Meta description should be 320 characters or fewer.');
  if ((values.og_title || '').trim().length > 120) errors.push('Open Graph title should be 120 characters or fewer.');
  if ((values.og_description || '').trim().length > 320) errors.push('Open Graph description should be 320 characters or fewer.');
  if (hasControl(values.seo_title) || hasControl(values.meta_description) || hasControl(values.og_title) || hasControl(values.og_description)) errors.push('Fields contain invalid control characters.');
  const canonErr = isValidUrl(values.canonical_url, { allowEmpty: true, field: 'Canonical URL' });
  if (canonErr) errors.push(canonErr);
  const ogImgErr = isValidUrl(values.og_image, { allowEmpty: true, field: 'Open Graph image URL' });
  if (ogImgErr) errors.push(ogImgErr);
  if (!SUPPORTED_ROBOTS_DIRECTIVES.includes(values.robots)) errors.push('Unsupported robots directive.');

  const canon = (values.canonical_url || '').trim();
  if (canon) {
    try {
      const u = new URL(canon);
      if (u.origin !== CANONICAL_PREVIEW_ORIGIN) errors.push('Warning: custom canonical points to a different domain; ensure this is intentional cross-canonicalization.');
    } catch {}
  }
  return errors;
}

function seoStripHtmlToText(input) {
  return String(input == null ? '' : input)
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

function seoTruncate(text, maxLen) {
  const t = String(text || '').trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
}

function seoToAbsoluteUrl(origin, value) {
  if (!value || typeof value !== 'string') return '';
  const v = value.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('//')) return `https:${v}`;
  if (v.startsWith('/')) return `${origin}${v}`;
  return `${origin}/${v.replace(/^\.?\//, '')}`;
}

function getSelectedSeoItem() {
  if (seoState.contentType === 'blog_post') {
    return seoState.blogPosts.find(p => p.id === seoState.selectedBlogPostId) || null;
  }
  if (seoState.contentType === 'project') {
    return seoState.projects.find(p => p.id === seoState.selectedProjectId) || null;
  }
  return seoState.pages.find(p => p.id === seoState.selectedPageId) || null;
}

function seoComputeResolvedPreview(item, formValues) {
  const o = seoNormalizeForCompare(formValues);
  const has = (v) => v != null && String(v).trim() !== '';
  const overrideBadge = '<span class="badge badge-success">Saved override</span>';
  const inheritedBadge = (label) => `<span class="badge">${escapeHtml(label)}</span>`;

  if (seoState.contentType === 'blog_post') {
    const slug = encodeURIComponent(String(item.slug || ''));
    const articlePath = `/blog/${item.slug || ''}`;
    const fallbackDescSource = item.excerpt || seoStripHtmlToText(item.content) || (seoState.settings.seo_description || '') || '';
    const inheritedDescription = seoTruncate(fallbackDescSource, 160);
    const inheritedTitle = item.title ? `${item.title} — Ourel Ads` : ((seoState.settings.seo_title || '').trim() || 'Ourel Ads');
    const defaultCanonical = `${CANONICAL_PREVIEW_ORIGIN}/blog/${slug}`;
    const title = has(o.seo_title) ? o.seo_title : inheritedTitle;
    const description = has(o.meta_description) ? o.meta_description : inheritedDescription;
    const canonical = has(o.canonical_url) ? o.canonical_url : defaultCanonical;
    const ogTitle = has(o.og_title) ? o.og_title : title;
    const ogDescription = has(o.og_description) ? o.og_description : description;
    const inheritedOgImage = seoToAbsoluteUrl(CANONICAL_PREVIEW_ORIGIN, item.featured_image || '');
    const ogImage = has(o.og_image) ? o.og_image : inheritedOgImage;
    const robots = has(o.robots) ? o.robots : 'index, follow';
    return {
      title, description, canonical, ogTitle, ogDescription, ogImage, robots,
      articleUrl: `${CANONICAL_PREVIEW_ORIGIN}${articlePath}`,
      articlePath,
      sources: {
        title: has(o.seo_title) ? overrideBadge : inheritedBadge('Inherited article title/default'),
        description: has(o.meta_description) ? overrideBadge : inheritedBadge('Inherited excerpt/content/site fallback'),
        canonical: has(o.canonical_url) ? overrideBadge : inheritedBadge('Inherited default article canonical'),
        ogTitle: has(o.og_title) ? overrideBadge : inheritedBadge('Inherited title fallback'),
        ogDescription: has(o.og_description) ? overrideBadge : inheritedBadge('Inherited description fallback'),
        ogImage: has(o.og_image) ? overrideBadge : (inheritedOgImage ? inheritedBadge('Inherited featured image') : inheritedBadge('No image (inherited/none)')),
        robots: (o.robots && o.robots !== 'index, follow') ? overrideBadge : inheritedBadge('Inherited default'),
      }
    };
  }

  if (seoState.contentType === 'project') {
    const slug = String(item.slug || '');
    const articlePath = `/work/${slug}`;
    const fallbackDescSource = seoStripHtmlToText(item.description || '') || seoStripHtmlToText(item.full_description || '') || (seoState.settings.seo_description || '') || '';
    const inheritedDescription = seoTruncate(fallbackDescSource, 160);
    const inheritedTitle = item.title ? `${item.title} — Ourel Ads` : ((seoState.settings.seo_title || '').trim() || 'Ourel Ads');
    const defaultCanonical = `${CANONICAL_PREVIEW_ORIGIN}/work/${encodeURIComponent(slug)}`;
    const entityMeta = (seoState.loadedRecord && seoState.loadedRecord._entity && seoState.loadedRecord._entity.id === item.id) ? seoState.loadedRecord._entity : null;
    const isMeaningful = entityMeta ? !!entityMeta.isMeaningful : null;
    const isThin = entityMeta ? !!entityMeta.isThin : null;
    const inheritedRobots = (entityMeta && entityMeta.inheritedRobots) ? entityMeta.inheritedRobots : 'index, follow';
    const title = has(o.seo_title) ? o.seo_title : inheritedTitle;
    const description = has(o.meta_description) ? o.meta_description : inheritedDescription;
    const canonical = has(o.canonical_url) ? o.canonical_url : defaultCanonical;
    const ogTitle = has(o.og_title) ? o.og_title : title;
    const ogDescription = has(o.og_description) ? o.og_description : description;
    const inheritedOgImage = seoToAbsoluteUrl(CANONICAL_PREVIEW_ORIGIN, item.thumbnail || '');
    const ogImage = has(o.og_image) ? o.og_image : inheritedOgImage;
    const robots = has(o.robots) ? o.robots : inheritedRobots;
    return {
      title, description, canonical, ogTitle, ogDescription, ogImage, robots,
      articleUrl: `${CANONICAL_PREVIEW_ORIGIN}${articlePath}`,
      articlePath,
      isMeaningful, isThin, inheritedRobots,
      sources: {
        title: has(o.seo_title) ? overrideBadge : inheritedBadge('Inherited project title/default'),
        description: has(o.meta_description) ? overrideBadge : inheritedBadge('Inherited project/site fallback'),
        canonical: has(o.canonical_url) ? overrideBadge : inheritedBadge('Inherited default project canonical'),
        ogTitle: has(o.og_title) ? overrideBadge : inheritedBadge('Inherited title fallback'),
        ogDescription: has(o.og_description) ? overrideBadge : inheritedBadge('Inherited description fallback'),
        ogImage: has(o.og_image) ? overrideBadge : (inheritedOgImage ? inheritedBadge('Inherited thumbnail image') : inheritedBadge('No image (inherited/none)')),
        robots: has(o.robots) ? overrideBadge : inheritedBadge(isThin ? 'Inherited default (thin content: noindex, follow)' : 'Inherited default'),
      }
    };
  }

  const slug = item.slug;
  const staticMeta = PAGE_STATIC_SEO_DEFAULTS[slug] || { title: item.title || 'Ourel Ads', description: '' };
  const globalTitle = (seoState.settings.seo_title || '').trim();
  const globalDesc = (seoState.settings.seo_description || '').trim();

  let title = staticMeta.title || 'Ourel Ads';
  let description = staticMeta.description || '';
  if (slug === 'home') {
    title = has(o.seo_title) ? o.seo_title : (globalTitle || staticMeta.title || 'Ourel Ads');
    description = has(o.meta_description) ? o.meta_description : (globalDesc || staticMeta.description || '');
  } else {
    title = has(o.seo_title) ? o.seo_title : (staticMeta.title || globalTitle || 'Ourel Ads');
    description = has(o.meta_description) ? o.meta_description : (staticMeta.description || globalDesc || '');
  }

  const robots = has(o.robots) ? o.robots : 'index, follow';
  const canonical = has(o.canonical_url) ? o.canonical_url : `${CANONICAL_PREVIEW_ORIGIN}${item.path === '/' ? '/' : item.path}`;
  const ogTitle = has(o.og_title) ? o.og_title : (staticMeta.ogTitle || title);
  const ogDescription = has(o.og_description) ? o.og_description : (staticMeta.ogDescription || description);
  const ogImage = has(o.og_image) ? o.og_image : '';
  return {
    title, description, canonical, ogTitle, ogDescription, ogImage, robots,
    articleUrl: `${CANONICAL_PREVIEW_ORIGIN}${item.path === '/' ? '/' : item.path}`,
    articlePath: item.path,
    sources: {
      title: slug === 'home' ? (has(o.seo_title) ? overrideBadge : inheritedBadge(has(globalTitle) ? 'Inherited global/title fallback' : 'Inherited static fallback')) : (has(o.seo_title) ? overrideBadge : inheritedBadge('Inherited static/global fallback')),
      description: slug === 'home' ? (has(o.meta_description) ? overrideBadge : inheritedBadge(has(globalDesc) ? 'Inherited global/description fallback' : 'Inherited static fallback')) : (has(o.meta_description) ? overrideBadge : inheritedBadge('Inherited static/global fallback')),
      canonical: has(o.canonical_url) ? overrideBadge : inheritedBadge('Inherited default (trusted origin)'),
      ogTitle: has(o.og_title) ? overrideBadge : inheritedBadge('Inherited title/static fallback'),
      ogDescription: has(o.og_description) ? overrideBadge : inheritedBadge('Inherited description/static fallback'),
      ogImage: has(o.og_image) ? overrideBadge : inheritedBadge('No image (inherited/none)'),
      robots: (o.robots && o.robots !== 'index, follow') ? overrideBadge : inheritedBadge('Inherited default'),
    }
  };
}

function renderSeoPreview() {
  const box = document.getElementById('perPageSeoPreview');
  if (!box) return;
  const item = getSelectedSeoItem();
  if (!item) { box.innerHTML = '<div class="empty-state"><p>Select an item to preview.</p></div>'; return; }
  const values = seoGetFormValues();
  const r = seoComputeResolvedPreview(item, values);
  const imgPreview = r.ogImage
    ? `<div style="margin-top:8px"><img src="${seoEscapeAttr(r.ogImage)}" alt="OG preview" style="max-width:220px;max-height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" onerror="this.style.display='none'"></div>`
    : `<div class="form-help" style="margin-top:6px">No OG image set (will use inherited/default behavior).</div>`;
  const urlLabel = seoState.contentType === 'project' ? 'Project URL' : 'Article URL';
  let thinNotice = '';
  if (seoState.contentType === 'project') {
    const cls = r.isThin ? 'var(--warning, #b45309)' : 'var(--success, #15803d)';
    const statusText = r.isThin ? 'Thin content (server classification)' : 'Meaningful content (server classification)';
    const inheritedText = r.inheritedRobots ? `Inherited robots default: <strong>${escapeHtml(r.inheritedRobots)}</strong>.` : 'Inherited robots default unavailable until loaded.';
    const warnIndex = r.isThin && r.robots === 'index, follow' ? `<div style="margin-top:8px;color:var(--danger, #dc2626)">Warning: choosing <code>index, follow</code> for thin projects may index low-value content. Save requires explicit confirmation.</div>` : '';
    thinNotice = `<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-elevated, #f8fafc)"><div style="font-weight:600;color:${cls}">${statusText}</div><div class="form-help" style="margin-top:4px">${inheritedText}</div>${warnIndex}</div>`;
  }
  box.innerHTML = `
    <div class="card" style="margin-top:16px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <h3 style="margin:0">SEO Preview (unsaved edits shown, not live)</h3>
        <span class="form-help">Preview approximates server renderer fallback behavior</span>
      </div>
      <div class="card-body" style="display:grid;gap:12px">
        ${thinNotice}
        <div><label style="display:block;font-weight:600;margin-bottom:4px">${urlLabel}</label><div style="word-break:break-all">${escapeHtml(r.articleUrl || r.articlePath || '')}</div></div>
        <div><label style="display:block;font-weight:600;margin-bottom:4px">Resolved title ${r.sources.title}</label><div>${escapeHtml(r.title)}</div></div>
        <div><label style="display:block;font-weight:600;margin-bottom:4px">Resolved meta description ${r.sources.description}</label><div>${escapeHtml(r.description || '(empty)')}</div></div>
        <div><label style="display:block;font-weight:600;margin-bottom:4px">Canonical URL ${r.sources.canonical}</label><div style="word-break:break-all">${escapeHtml(r.canonical)}</div></div>
        <div><label style="display:block;font-weight:600;margin-bottom:4px">Open Graph title ${r.sources.ogTitle}</label><div>${escapeHtml(r.ogTitle)}</div></div>
        <div><label style="display:block;font-weight:600;margin-bottom:4px">Open Graph description ${r.sources.ogDescription}</label><div>${escapeHtml(r.ogDescription || '(empty)')}</div></div>
        <div><label style="display:block;font-weight:600;margin-bottom:4px">Open Graph image ${r.sources.ogImage}</label><div style="word-break:break-all">${escapeHtml(r.ogImage || '(none)')}</div>${imgPreview}</div>
        <div><label style="display:block;font-weight:600;margin-bottom:4px">Robots directive ${r.sources.robots}</label><div>${escapeHtml(r.robots)}</div></div>
      </div>
    </div>`;
}

function seoFieldCounter(id, max) {
  const el = document.querySelector(`#perPageSeoForm [name="${id}"]`);
  const counter = document.getElementById(`counter_${id}`);
  if (el && counter) {
    const len = (el.value || '').length;
    counter.textContent = `${len}/${max}`;
    counter.style.color = len > max ? 'var(--danger, #dc2626)' : 'var(--text-muted)';
  }
}

function bindPerPageSeoFormEvents() {
  const form = document.getElementById('perPageSeoForm');
  if (!form) return;
  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => { seoMarkDirty(); renderSeoPreview(); ['seo_title','meta_description','og_title','og_description'].forEach(f => { const max = (f.includes('description') ? 320 : 120); if (el.name === f) seoFieldCounter(f, max); }); });
    el.addEventListener('change', () => { seoMarkDirty(); renderSeoPreview(); });
  });
  ['seo_title','meta_description','og_title','og_description'].forEach(f => seoFieldCounter(f, f.includes('description') ? 320 : 120));
}

function seoEntityContext() {
  if (seoState.contentType === 'blog_post') return { type: 'blog_post', id: seoState.selectedBlogPostId, label: 'blog post' };
  if (seoState.contentType === 'project') return { type: 'project', id: seoState.selectedProjectId, label: 'project' };
  return { type: 'page', id: seoState.selectedPageId, label: 'page' };
}

async function loadPerPageSeoRecord(nextId, { force = false } = {}) {
  const ctx = seoEntityContext();
  if (!nextId) return;
  if (!force && seoState.dirty) {
    const ok = await confirmAction('Unsaved changes', 'You have unsaved SEO changes. Discard them and switch items?');
    if (!ok) {
      const sel = document.getElementById('perPageSeoSelect');
      if (sel) sel.value = String(ctx.id || '');
      return;
    }
  }
  if (ctx.type === 'blog_post') seoState.selectedBlogPostId = nextId;
  else if (ctx.type === 'project') seoState.selectedProjectId = nextId;
  else seoState.selectedPageId = nextId;
  const container = document.getElementById('perPageSeoEditorContainer');
  if (container) container.innerHTML = '<div class="loading-state">Loading SEO...</div>';
  try {
    const record = await api(`/admin/seo/${ctx.type}/${nextId}`);
    seoState.loadedRecord = record || {};
    renderPerPageSeoEditor();
  } catch (e) {
    if (container) container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function renderPerPageSeoEditor() {
  const container = document.getElementById('perPageSeoEditorContainer');
  if (!container) return;
  const item = getSelectedSeoItem();
  const isBlog = seoState.contentType === 'blog_post';
  const isProject = seoState.contentType === 'project';
  if (!item) {
    const noneTitle = isProject ? 'published projects' : (isBlog ? 'published blog posts' : 'supported pages');
    const noneHelp = isProject
      ? 'Only published projects can be edited here. Unpublished projects are excluded.'
      : (isBlog ? 'Only published blog posts can be edited here. Draft, scheduled, and unpublished posts are excluded.' : 'Only published Home, About, Services, Work, Blog, Testimonials, and Contact pages can be edited here.');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>No ${noneTitle} available</h3><p>${noneHelp}</p></div>`;
    return;
  }
  const rec = seoState.loadedRecord || {};
  const val = (v) => seoEscapeAttr(v == null ? '' : v);
  const entityMeta = rec._entity || null;
  const inheritedRobotsDefault = entityMeta && entityMeta.inheritedRobots ? entityMeta.inheritedRobots : 'index, follow';
  const robotsVal = (rec.robots && SUPPORTED_ROBOTS_DIRECTIVES.includes(rec.robots)) ? rec.robots : inheritedRobotsDefault;
  const hasOverride = !!(rec && rec.id);
  let heading, sub, restoreLabel, saveLabel;
  if (isProject) {
    const brand = item.brand ? ` · ${escapeHtml(item.brand)}` : '';
    heading = `Project SEO: ${escapeHtml(item.title || 'Untitled')}${brand} <span class="badge">/work/${escapeHtml(item.slug || '')}</span>`;
    const thinBadge = entityMeta ? (entityMeta.isThin ? '<span class="badge badge-warning">Thin content</span>' : '<span class="badge badge-success">Meaningful content</span>') : '';
    sub = `Editing project: <strong>${escapeHtml(item.title || 'Untitled')}</strong> (slug: ${escapeHtml(item.slug || '')}, id: ${escapeHtml(String(item.id))}). ${hasOverride ? '<span class="badge badge-success">Saved override exists</span>' : '<span class="badge">Using inherited defaults</span>'} ${thinBadge}<br><span class="form-help">Server-classified readiness: inherited robots default is <strong>${escapeHtml(inheritedRobotsDefault)}</strong>. For thin projects, default is <code>noindex, follow</code>; indexing overrides require explicit confirmation.</span>`;
    restoreLabel = 'Restore Project SEO Defaults';
    saveLabel = 'Save Project SEO';
  } else if (isBlog) {
    heading = `Blog Post SEO: ${escapeHtml(item.title || 'Untitled')} <span class="badge">/blog/${escapeHtml(item.slug || '')}</span>`;
    sub = `Editing blog post: <strong>${escapeHtml(item.title || 'Untitled')}</strong> (slug: ${escapeHtml(item.slug || '')}, id: ${escapeHtml(String(item.id))}). ${hasOverride ? '<span class="badge badge-success">Saved override exists</span>' : '<span class="badge">Using inherited defaults</span>'}`;
    restoreLabel = 'Restore Article SEO Defaults';
    saveLabel = 'Save Article SEO';
  } else {
    heading = `Per-Page SEO: ${escapeHtml(item.label)} <span class="badge">${escapeHtml(item.path)}</span>`;
    sub = `Editing page record: <strong>${escapeHtml(item.title)}</strong> (slug: ${escapeHtml(item.slug)}). ${hasOverride ? '<span class="badge badge-success">Saved override exists</span>' : '<span class="badge">Using inherited defaults</span>'}`;
    restoreLabel = 'Restore Page SEO Defaults';
    saveLabel = 'Save Page SEO';
  }

  container.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0">${heading}</h3>
          <p class="form-help" style="margin:6px 0 0">${sub}</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span id="seoUnsavedWarning" class="badge badge-warning" style="display:none">Unsaved changes</span>
          <button type="button" class="btn btn-ghost" id="restoreSeoDefaultsBtn">${restoreLabel}</button>
        </div>
      </div>
      <div class="card-body">
        <form id="perPageSeoForm">
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>SEO title</label>
              <input type="text" name="seo_title" maxlength="200" value="${val(rec.seo_title)}" placeholder="Leave blank to use inherited/default title">
              <div class="form-help"><span id="counter_seo_title">0/120</span> · Recommended: ~50–60 chars (max 120).</div>
            </div>
          </div>
          <div class="form-group">
            <label>Meta description</label>
            <textarea name="meta_description" rows="3" maxlength="400" placeholder="Leave blank to use inherited/default description">${val(rec.meta_description)}</textarea>
            <div class="form-help"><span id="counter_meta_description">0/320</span> · Recommended: ~120–160 chars (max 320).</div>
          </div>
          <div class="form-group">
            <label>Canonical URL</label>
            <input type="url" name="canonical_url" value="${val(rec.canonical_url)}" placeholder="Leave blank to use trusted default canonical">
            <div class="form-help">Optional. Use a valid https:// URL. Leave blank to use the trusted renderer default. Cross-domain canonicals are allowed but should be intentional.</div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>Open Graph title</label>
              <input type="text" name="og_title" maxlength="200" value="${val(rec.og_title)}" placeholder="Leave blank to inherit">
              <div class="form-help"><span id="counter_og_title">0/120</span></div>
            </div>
            <div class="form-group" style="flex:1">
              <label>Robots directive</label>
              <select name="robots">
                ${SUPPORTED_ROBOTS_DIRECTIVES.map(r => `<option value="${seoEscapeAttr(r)}" ${r === robotsVal ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Open Graph description</label>
            <textarea name="og_description" rows="3" maxlength="400" placeholder="Leave blank to inherit">${val(rec.og_description)}</textarea>
            <div class="form-help"><span id="counter_og_description">0/320</span></div>
          </div>
          <div class="form-group">
            <label>Open Graph image URL</label>
            <input type="url" name="og_image" value="${val(rec.og_image)}" placeholder="https://... (leave blank if none)">
            <div class="form-help">Optional. Must be a valid https:// URL. Preview updates below (unsaved changes are not live).</div>
          </div>
          <div id="perPageSeoValidation" class="form-help" style="margin-bottom:12px"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="submit" class="btn btn-primary" id="savePerPageSeoBtn">💾 ${saveLabel}</button>
          </div>
        </form>
        <div id="perPageSeoPreview"></div>
      </div>
    </div>`;

  seoState.initialForm = seoNormalizeForCompare(seoGetFormValues());
  seoState.dirty = false;
  bindPerPageSeoFormEvents();
  renderSeoPreview();

  document.getElementById('perPageSeoForm').onsubmit = savePerPageSeo;
  document.getElementById('restoreSeoDefaultsBtn').onclick = restorePerPageSeoDefaults;
}

async function savePerPageSeo(e) {
  e.preventDefault();
  const item = getSelectedSeoItem();
  const ctx = seoEntityContext();
  if (!item || !ctx.id) return;
  const values = seoNormalizeForCompare(seoGetFormValues());
  const issues = seoValidateClient(values);
  const blocking = issues.filter(x => !x.startsWith('Warning:'));
  const warnings = issues.filter(x => x.startsWith('Warning:'));
  const vbox = document.getElementById('perPageSeoValidation');
  if (vbox) {
    vbox.innerHTML = issues.length ? issues.map(i => `<div style="color:${i.startsWith('Warning:') ? 'var(--warning, #b45309)' : 'var(--danger, #dc2626)'}">${escapeHtml(i)}</div>`).join('') : '';
  }
  if (blocking.length) { toast('Please fix validation errors before saving.', 'error'); return; }
  if (warnings.length) {
    const okWarn = await confirmAction('Canonical warning', warnings.join('\n') + '\n\nSave anyway?');
    if (!okWarn) return;
  }
  if (ctx.type === 'project') {
    const entityMeta = (seoState.loadedRecord && seoState.loadedRecord._entity) || null;
    const isThin = entityMeta ? !!entityMeta.isThin : false;
    const currentRobots = (values.robots || '').trim() || 'index, follow';
    const savedRobots = (seoState.loadedRecord && seoState.loadedRecord.robots) ? String(seoState.loadedRecord.robots).trim() : '';
    if (isThin && currentRobots === 'index, follow' && savedRobots !== 'index, follow') {
      const okIndex = await confirmAction('Index thin project?', 'This project is classified as thin content and defaults to "noindex, follow". Setting "index, follow" may index low-value content. Continue and save this indexing override?');
      if (!okIndex) return;
    }
  }
  const saveBtnLabel = ctx.type === 'blog_post' ? '💾 Save Article SEO' : (ctx.type === 'project' ? '💾 Save Project SEO' : '💾 Save Page SEO');
  const btn = document.getElementById('savePerPageSeoBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    const payload = {
      seo_title: values.seo_title,
      meta_description: values.meta_description,
      canonical_url: values.canonical_url,
      og_title: values.og_title,
      og_description: values.og_description,
      og_image: values.og_image,
      robots: values.robots,
    };
    await api(`/admin/seo/${ctx.type}/${ctx.id}`, { method: 'PUT', body: payload });
    toast(ctx.type === 'blog_post' ? 'Article SEO saved successfully.' : (ctx.type === 'project' ? 'Project SEO saved successfully.' : 'Page SEO saved successfully.'));
    await loadPerPageSeoRecord(ctx.id, { force: true });
  } catch (err) {
    toast(err.message || 'Failed to save SEO', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = saveBtnLabel; }
  }
}

async function restorePerPageSeoDefaults() {
  const item = getSelectedSeoItem();
  const ctx = seoEntityContext();
  if (!item || !ctx.id) return;
  const label = ctx.type === 'blog_post' ? (item.title || item.slug || 'this article') : (ctx.type === 'project' ? (item.title || item.slug || 'this project') : item.label);
  const entityNoun = ctx.type === 'blog_post' ? 'blog post' : (ctx.type === 'project' ? 'project' : 'page');
  const ok = await confirmAction('Restore defaults', `Restore default SEO for ${label}? This removes saved overrides for this ${entityNoun} only. Content will not be deleted.`);
  if (!ok) return;
  try {
    await api(`/admin/seo/${ctx.type}/${ctx.id}`, { method: 'DELETE' });
    toast(ctx.type === 'blog_post' ? 'Article SEO defaults restored.' : (ctx.type === 'project' ? 'Project SEO defaults restored.' : 'Page SEO defaults restored.'));
    await loadPerPageSeoRecord(ctx.id, { force: true });
  } catch (err) {
    toast(err.message || 'Failed to restore defaults', 'error');
  }
}

function renderSeoItemSelectorAndEditor() {
  const wrap = document.getElementById('perPageSeoSectionBody');
  if (!wrap) return;
  const isBlog = seoState.contentType === 'blog_post';
  const isProject = seoState.contentType === 'project';
  const items = isProject ? seoState.projects : (isBlog ? seoState.blogPosts : seoState.pages);
  const selectedId = isProject ? seoState.selectedProjectId : (isBlog ? seoState.selectedBlogPostId : seoState.selectedPageId);

  if (!items.length) {
    const emptyTitle = isProject ? 'published projects' : (isBlog ? 'published blog posts' : 'editable public pages');
    const emptyHelp = isProject
      ? 'Published projects will appear here (unpublished projects are excluded).'
      : (isBlog ? 'Published blog posts will appear here (drafts and unpublished posts are excluded).' : 'Published Home, About, Services, Work, Blog, Testimonials, and Contact pages are required.');
    wrap.innerHTML = `
      <div class="empty-state"><div class="empty-icon">🔍</div><h3>No ${emptyTitle} found</h3><p>${emptyHelp}</p></div>
    `;
    return;
  }

  let options = '';
  if (isProject) {
    options = items.map(p => {
      const brand = p.brand ? ` — ${escapeHtml(p.brand)}` : '';
      return `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.title || 'Untitled')}${brand} (/work/${escapeHtml(p.slug || '')})</option>`;
    }).join('');
  } else if (isBlog) {
    options = items.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.title || 'Untitled')} (/blog/${escapeHtml(p.slug || '')})</option>`).join('');
  } else {
    options = items.map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.label)} (${escapeHtml(p.path)})</option>`).join('');
  }

  const label = isProject ? 'Select published project' : (isBlog ? 'Select published blog post' : 'Select page');
  const help = isProject
    ? '<div class="form-help">Only published projects are listed. Numeric project IDs are used for SEO overrides. Project URL shown is the public detail page path.</div>'
    : (isBlog ? '<div class="form-help">Only published posts are listed. Numeric blog post IDs are used for SEO overrides.</div>' : '');

  wrap.innerHTML = `
    <div class="form-group" style="max-width:560px">
      <label for="perPageSeoSelect">${label}</label>
      <select id="perPageSeoSelect">${options}</select>
      ${help}
    </div>
    <div id="perPageSeoEditorContainer"></div>
  `;

  const sel = document.getElementById('perPageSeoSelect');
  sel.onchange = async () => {
    const nextId = parseInt(sel.value, 10);
    await loadPerPageSeoRecord(nextId);
  };
}

async function switchSeoContentType(nextType) {
  if (nextType === seoState.contentType) return;
  if (seoState.dirty) {
    const ok = await confirmAction('Unsaved changes', 'You have unsaved SEO changes. Discard them and switch content type?');
    if (!ok) {
      const sel = document.getElementById('seoContentTypeSelect');
      if (sel) sel.value = seoState.contentType;
      return;
    }
  }
  seoState.contentType = nextType;
  seoState.loadedRecord = null;
  seoState.initialForm = null;
  seoState.dirty = false;
  renderSeoItemSelectorAndEditor();
  const ctx = seoEntityContext();
  if (ctx.id) await loadPerPageSeoRecord(ctx.id, { force: true });
}

async function renderSEO(el) {
  seoState = { settings: {}, pages: [], blogPosts: [], projects: [], contentType: 'page', selectedPageId: null, selectedBlogPostId: null, selectedProjectId: null, loadedRecord: null, initialForm: null, dirty: false, loading: true };
  el.innerHTML = '<div class="loading-state">Loading SEO & Analytics settings...</div>';
  try {
    const [settingsRows, pagesRes, blogRes, projectRes] = await Promise.all([
      api('/admin/settings'),
      api('/admin/pages?limit=200'),
      api('/admin/blog?status=published&limit=500'),
      api('/admin/projects?status=published&limit=500'),
    ]);
    const settings = Array.isArray(settingsRows)
      ? Object.fromEntries(settingsRows.map(row => [row.setting_key, row.setting_value]))
      : (settingsRows || {});
    const pagesData = Array.isArray(pagesRes?.data) ? pagesRes.data : [];
    const blogDataRaw = Array.isArray(blogRes?.data) ? blogRes.data : (Array.isArray(blogRes) ? blogRes : []);
    const projectDataRaw = Array.isArray(projectRes?.data) ? projectRes.data : (Array.isArray(projectRes) ? projectRes : []);
    const supportedPages = SUPPORTED_PAGE_SEO
      .map(def => {
        const page = pagesData.find(p => p && p.slug === def.slug);
        if (!page) return null;
        if (page.status !== 'published') return null;
        const id = parseInt(page.id, 10);
        if (!Number.isInteger(id) || id <= 0) return null;
        return { id, slug: def.slug, label: def.label, path: def.path, title: page.title || def.label };
      })
      .filter(Boolean);
    const publishedBlogPosts = blogDataRaw
      .filter(p => p && p.status === 'published')
      .map(p => ({ id: parseInt(p.id, 10), title: p.title || 'Untitled', slug: p.slug || '', excerpt: p.excerpt || '', content: p.content || '', featured_image: p.featured_image || '', status: p.status, author: p.author || '', published_at: p.published_at || '' }))
      .filter(p => Number.isInteger(p.id) && p.id > 0 && p.slug);
    const publishedProjects = projectDataRaw
      .filter(p => p && p.status === 'published')
      .map(p => ({
        id: parseInt(p.id, 10),
        title: p.title || 'Untitled',
        slug: p.slug || '',
        brand: p.brand || '',
        description: p.description || '',
        full_description: p.full_description || '',
        thumbnail: p.thumbnail || '',
        images: p.images || '',
        video_url: p.video_url || '',
        status: p.status,
      }))
      .filter(p => Number.isInteger(p.id) && p.id > 0 && p.slug);

    seoState.settings = settings;
    seoState.pages = supportedPages;
    seoState.blogPosts = publishedBlogPosts;
    seoState.projects = publishedProjects;
    seoState.selectedPageId = supportedPages.length ? supportedPages[0].id : null;
    seoState.selectedBlogPostId = publishedBlogPosts.length ? publishedBlogPosts[0].id : null;
    seoState.selectedProjectId = publishedProjects.length ? publishedProjects[0].id : null;

    el.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">SEO & Analytics Settings</h1>
          <p class="page-subtitle">Manage global search settings, analytics IDs, and SEO overrides for public pages, published blog posts, and published projects</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Global SEO & Analytics</h3></div>
        <div class="card-body">
          <form id="seoGlobalForm">
            <div class="form-group"><label>Website Search Title (Meta Title)</label><input type="text" name="seo_title" value="${seoEscapeAttr(settings.seo_title || '')}"><div class="form-help">Appears in Google search result headers</div></div>
            <div class="form-group"><label>Search Engine Description (Meta Description)</label><textarea name="seo_description" rows="3">${escapeHtml(settings.seo_description || '')}</textarea><div class="form-help">1-2 sentence description shown in Google search snippets</div></div>
            <div class="form-group"><label>Google Analytics ID (GA4)</label><input type="text" name="google_analytics_id" value="${seoEscapeAttr(settings.google_analytics_id || '')}" placeholder="G-XXXXXXXXXX"><div class="form-help">e.g. G-123456789</div></div>
            <div class="form-group"><label>Google Tag Manager ID (GTM)</label><input type="text" name="google_tag_manager_id" value="${seoEscapeAttr(settings.google_tag_manager_id || '')}" placeholder="GTM-XXXXXXX"><div class="form-help">e.g. GTM-ABC1234</div></div>
            <button type="submit" class="btn btn-primary">💾 Save Global SEO Settings</button>
          </form>
        </div>
      </div>

      <div class="card" style="margin-top:20px">
        <div class="card-header"><h3>Content SEO Overrides</h3></div>
        <div class="card-body">
          <p class="form-help" style="margin-top:0">Edit SEO overrides for verified public website pages, published blog posts, and published projects. Leave fields blank to use inherited renderer/entity defaults. Saved changes affect live public HTML after save; preview below shows unsaved edits and is not live.</p>
          <div class="form-group" style="max-width:320px">
            <label for="seoContentTypeSelect">Content type</label>
            <select id="seoContentTypeSelect">
              <option value="page" ${seoState.contentType === 'page' ? 'selected' : ''}>Website Pages</option>
              <option value="blog_post" ${seoState.contentType === 'blog_post' ? 'selected' : ''}>Blog Posts</option>
              <option value="project" ${seoState.contentType === 'project' ? 'selected' : ''}>Projects</option>
            </select>
          </div>
          <div id="perPageSeoSectionBody"></div>
        </div>
      </div>
    `;

    document.getElementById('seoGlobalForm').onsubmit = async (e) => {
      e.preventDefault();
      const body = {};
      ['seo_title', 'seo_description', 'google_analytics_id', 'google_tag_manager_id'].forEach(k => {
        const input = document.querySelector(`#seoGlobalForm [name="${k}"]`);
        body[k] = input ? input.value : '';
      });
      await api('/admin/settings', { method: 'PUT', body });
      seoState.settings = Object.assign({}, seoState.settings, body);
      toast('Global SEO settings saved!');
      renderSeoPreview();
    };

    document.getElementById('seoContentTypeSelect').onchange = async (e) => {
      await switchSeoContentType(e.target.value);
    };

    renderSeoItemSelectorAndEditor();
    const ctx = seoEntityContext();
    if (ctx.id) await loadPerPageSeoRecord(ctx.id, { force: true });
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading SEO settings</h3><p>${escapeHtml(err.message)}</p></div>`;
  } finally {
    seoState.loading = false;
  }
}

// Warn on browser navigation if per-page form has unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (seoState && seoState.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ═══════════════════════════════════════════
// USERS & BACKUP
// ═══════════════════════════════════════════
async function renderUsers(el) {
  try {
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
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading users</h3><p>${e.message}</p></div>`;
    toast(e.message, 'error');
  }
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
        <tbody>${res.data.length ? res.data.map(a => {
          const actionClass = a.action === 'login' ? 'badge-active' : a.action === 'deleted' ? 'badge-closed' : 'badge-new';
          return `<tr>
            <td>${a.full_name || a.username || 'System'}</td>
            <td><span class="badge ${actionClass}">${a.action}</span></td>
            <td>${a.entity_type || '-'}</td>
            <td>${timeAgo(a.created_at)}</td>
          </tr>`;
        }).join('') : '<tr><td colspan="4"><div class="empty-state"><p>No activity recorded yet</p></div></td></tr>'}</tbody>
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
          <button type="button" class="btn btn-ghost" onclick="exportLeadsCsv()">Download CSV File</button>
        </div>
      </div>
    </div>
  `;
}

async function exportLeadsCsv() {
  try {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api/admin/leads-export', { headers, credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to export leads');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ourelads_leads_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast('Leads exported successfully!');
  } catch (err) {
    toast(err.message, 'error');
  }
}
window.exportLeadsCsv = exportLeadsCsv;

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
  document.getElementById('sidebarOverlay').classList.toggle('visible');
});
document.getElementById('sidebarClose').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
});
document.getElementById('sidebarOverlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
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

// ─── CLEANUP ON PAGE UNLOAD ───
window.addEventListener('beforeunload', () => {
  chartInstances.forEach(chart => chart.destroy());
  chartInstances = [];
});


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
        <div class="stat-card stat-primary" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border)">
          <div class="stat-label" style="color:var(--text-muted);font-size:13px;font-weight:600">👁️ Total Page Views</div>
          <div class="stat-value" style="font-size:28px;font-weight:800;color:var(--text-primary);margin:6px 0">${summary.total_views}</div>
          <small style="color:var(--accent)">All time page impressions</small>
        </div>
        <div class="stat-card stat-success" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border)">
          <div class="stat-label" style="color:var(--text-muted);font-size:13px;font-weight:600">⚡ Today's Views</div>
          <div class="stat-value" style="font-size:28px;font-weight:800;color:var(--success);margin:6px 0">${summary.today_views}</div>
          <small style="color:var(--success)">Live visits today</small>
        </div>
        <div class="stat-card stat-info" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border)">
          <div class="stat-label" style="color:var(--text-muted);font-size:13px;font-weight:600">👤 Unique Visitors</div>
          <div class="stat-value" style="font-size:28px;font-weight:800;color:var(--info);margin:6px 0">${summary.unique_visitors}</div>
          <small style="color:var(--info)">Distinct IP devices</small>
        </div>
        <div class="stat-card stat-warning" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border)">
          <div class="stat-label" style="color:var(--text-muted);font-size:13px;font-weight:600">📬 Total Inquiries</div>
          <div class="stat-value" style="font-size:28px;font-weight:800;color:var(--warning);margin:6px 0">${summary.total_leads}</div>
          <small style="color:var(--warning)">Leads from contact form</small>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-bottom:24px">
        <div class="card" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border)">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="font-size:16px;font-weight:700">📈 Traffic & Visitor Trend (Last 14 Days)</h3>
            <a href="https://analytics.google.com" target="_blank" class="btn btn-ghost btn-xs">Open Google Analytics ↗</a>
          </div>
          <div style="position:relative;height:280px">
            <canvas id="trafficTrendChart"></canvas>
          </div>
        </div>

        <div class="card" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border)">
          <div class="card-header" style="margin-bottom:16px">
            <h3 style="font-size:16px;font-weight:700">🔥 Most Visited Pages</h3>
          </div>
          <div style="position:relative;height:280px">
            <canvas id="topPagesChart"></canvas>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div class="card" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border)">
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

        <div class="card" style="background:var(--bg-card);padding:20px;border-radius:12px;border:1px solid var(--border)">
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
      // Destroy any existing charts to prevent memory leaks
      chartInstances.forEach(chart => chart.destroy());
      chartInstances = [];

      // Small delay to ensure canvas has proper dimensions
      setTimeout(() => {
        const ctx1 = document.getElementById('trafficTrendChart');
        if (ctx1) {
          const chart1 = new Chart(ctx1, {
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
          chartInstances.push(chart1);
        }

        const ctx2 = document.getElementById('topPagesChart');
        if (ctx2) {
          const chart2 = new Chart(ctx2, {
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
          chartInstances.push(chart2);
        }
      }, 0);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>${err.message}</h3></div>`;
  }
}
