# Frontend Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build arguments for Vite environment variables
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Debug: Print the variable to verify it's being passed
RUN echo "VITE_API_URL=${VITE_API_URL}"

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Create .env file if VITE_API_URL is provided (fallback method)
RUN if [ -n "$VITE_API_URL" ]; then \
      echo "VITE_API_URL=${VITE_API_URL}" > .env.production; \
      echo "Created .env.production with VITE_API_URL=${VITE_API_URL}"; \
    fi

# Build the application (Vite will use VITE_API_URL from ENV or .env.production)
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

