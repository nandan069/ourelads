# Ourel Ads — Advertising & Creative Production Agency

A full-stack CMS-driven website with admin panel for Ourel Ads, built with Express.js, SQLite, and vanilla JavaScript.

## Features

- **Public Website**: Home, About, Services, Work/Portfolio, Blog, Testimonials, Contact
- **Admin Panel**: Content management, lead tracking, media library, analytics, user management
- **API**: RESTful endpoints for all content types
- **Authentication**: JWT-based with role-based access control (super_admin, admin, editor, viewer)
- **Security**: CSP, CORS, CSRF protection, rate limiting, Helmet headers
- **Production Ready**: Docker, PM2, structured logging, health checks, migrations, backups

## Quick Start

### Prerequisites

- Node.js 22+
- npm 10+

### Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (JWT_SECRET is required)

# Start development server
npm run dev
```

Visit `http://localhost:3000` for the website and `http://localhost:3000/admin` for the admin panel.

Default admin login: `admin` / `admin123`

### Production with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f app
```

### Production with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js --env production

# Monitor
pm2 monit

# View logs
pm2 logs ourelads-api
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `DATABASE_PATH` | SQLite database path | No |
| `JWT_SECRET` | **Secure random string (min 32 chars)** | **Yes** |
| `ADMIN_EMAIL` | Admin notification email | No |
| `SESSION_EXPIRY` | JWT token expiry (default: 24h) | No |
| `UPLOAD_DIR` | File upload directory | No |
| `MAX_FILE_SIZE` | Max upload size in bytes (default: 10MB) | No |
| `SMTP_HOST` | SMTP server host | For email |
| `SMTP_PORT` | SMTP port (default: 587) | For email |
| `SMTP_USER` | SMTP username | For email |
| `SMTP_PASSWORD` | SMTP password | For email |
| `NOTIFY_EMAIL` | Lead notification recipient | For email |
| `GOOGLE_ANALYTICS_ID` | GA4 Measurement ID | No |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | Production |
| `LOG_DIR` | Log directory (default: ./logs) | No |
| `LOG_LEVEL` | Log level (default: info) | No |
| `BACKUP_DIR` | Backup directory | No |
| `MAX_BACKUPS` | Max backups to retain (default: 7) | No |

## Database

### Migrations

```bash
# Run pending migrations
npm run migrate

# Create new migration
npm run migrate:create "add new table"

# Check migration status
npm run migrate:status
```

### Backup

```bash
# Manual backup
npm run backup

# Automated backup (add to crontab)
0 2 * * * cd /path/to/ourelads && npm run backup >> /var/log/ourelads-backup.log 2>&1
```

## Project Structure

```
├── public/                 # Static website files
│   ├── *.html             # Page templates
│   ├── style.css          # Main stylesheet
│   ├── main.js            # Frontend JS
│   └── layout.js          # Header/footer injection
├── admin/                  # Admin panel (served at /admin)
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js
├── server/
│   ├── server.js          # Express app entry point
│   ├── database/
│   │   ├── init.js        # Schema & seeding
│   │   ├── migrate.js     # Migration runner
│   │   └── migrations/    # Migration files
│   ├── routes/
│   │   ├── auth.js        # Auth endpoints
│   │   ├── public.js      # Public API
│   │   └── admin.js       # Admin API
│   ├── middleware/
│   │   └── auth.js        # JWT auth middleware
│   └── utils/
│       └── logger.js      # Winston logger
├── scripts/
│   └── backup.js          # Automated backup script
├── tests/                  # Jest + Supertest tests
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js    # PM2 config
└── .github/workflows/     # CI/CD
```

## API Endpoints

### Public
- `GET /api/clients` - List clients
- `GET /api/projects` - List projects (filterable)
- `GET /api/services` - List services
- `GET /api/blog` - Paginated blog posts
- `GET /api/testimonials` - List testimonials
- `GET /api/settings` - Site settings
- `POST /api/contact` - Submit contact form

### Auth
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user
- `PUT /api/auth/password` - Change password

### Admin (requires JWT + CSRF)
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/analytics/overview` - Analytics
- `GET /api/admin/leads` - Lead management
- `GET /api/admin/media` - Media library
- `POST /api/admin/media` - Upload file
- `GET /api/admin/backup` - Create DB backup

## Security

- **CSP**: Strict Content Security Policy
- **HSTS**: HTTP Strict Transport Security
- **CORS**: Restricted to configured origins
- **CSRF**: Double-submit cookie pattern for admin/auth
- **Rate Limiting**: Per-endpoint limits
- **Helmet**: Security headers
- **Input Sanitization**: XSS prevention
- **SQL Injection Prevention**: Parameterized queries

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

## Deployment

### Docker
```bash
docker build -t ourelads .
docker run -d -p 3000:3000 --env-file .env ourelads
```

### Health Checks
- `GET /api/health` - Full health status
- `GET /api/health/ready` - Readiness probe
- `GET /api/health/live` - Liveness probe

## License

ISC