# Backend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (only from backend directory)
COPY package.json package-lock.json* ./
COPY tsconfig.json ./

# Verify we have the correct package.json (should be raceflow-backend, not vite_react_shadcn_ts)
RUN if [ "$(cat package.json | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)" != "raceflow-backend" ]; then \
      echo "ERROR: Wrong package.json detected! Expected 'raceflow-backend' but got:"; \
      cat package.json | grep '"name"'; \
      exit 1; \
    fi

# Install dependencies
RUN npm ci

# Copy source code (only backend files)
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Verify we have the correct package.json
RUN if [ "$(cat package.json | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)" != "raceflow-backend" ]; then \
      echo "ERROR: Wrong package.json detected!"; \
      cat package.json | grep '"name"'; \
      exit 1; \
    fi

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy scripts and migrations for running migrations and creating test users
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrations ./migrations

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the application
CMD ["node", "dist/server.js"]

