# OUREL ADS — Multi-stage Docker Build
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, sharp, bcryptjs)
RUN apk add --no-cache python3 make g++ sqlite-dev vips-dev

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Prune dev dependencies before copying to production
RUN npm prune --omit=dev

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache sqlite-libs vips tini dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -u 1001 -G nodejs appuser

# Copy package files and pruned node_modules from builder
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy application files from builder
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public
COPY --from=builder /app/admin ./admin
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrate.js ./migrate.js
COPY --from=builder /app/ecosystem.config.js ./ecosystem.config.js

# Create directories for database, uploads, and backups
RUN mkdir -p /app/server/database /app/public/uploads /app/server/database/backups && \
    chown -R appuser:nodejs /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health/ready || exit 1

# Use tini as init process for proper signal handling
ENTRYPOINT ["tini", "--"]

# Start application
CMD ["node", "server/server.js"]