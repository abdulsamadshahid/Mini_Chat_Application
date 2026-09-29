# ==========================================
# STAGE 1: Build Frontend Assets
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy source code and build configs
COPY . ./

# Build the production React SPA bundle
RUN npm run build

# ==========================================
# STAGE 2: High-Performance Nginx Web Server
# ==========================================
FROM nginx:alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy compiled frontend build output from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
