# Stage 0: Base image with essential system tools
FROM node:20-alpine AS base
# Install ffmpeg for voice note conversion (OGG to M4A)
RUN apk add --no-cache ffmpeg

# Stage 1: Install all dependencies (including devDeps for building)
FROM node:20-alpine AS deps
WORKDIR /app
# Copy package files to leverage Docker layer caching
COPY package*.json ./
# 'npm ci' is used instead of 'npm install' for faster, reliable builds in CI/CD
RUN npm ci --no-audit --no-fund

# Stage 2: Build the source code
FROM node:20-alpine AS builder
WORKDIR /app
# Copy node_modules from the deps stage to build the TS project
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Install only production dependencies
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
# Install only production dependencies to minimize final image size
RUN npm ci --omit=dev --no-audit --no-fund

# Stage 4: Runtime environment
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a deterministic non-root runtime user and fail the image build if the
# account database is ever corrupted by a stale Docker layer.
RUN addgroup -S -g 10001 nodejs \
    && adduser -S -D -H -u 10001 -G nodejs nodejs \
    && id nodejs

# Copy build artifacts and production dependencies
# --chown is used here to avoid creating an extra layer with 'RUN chown'
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# Switch to the non-root user
USER nodejs

# Start the application
CMD ["node", "dist/index.js"]
