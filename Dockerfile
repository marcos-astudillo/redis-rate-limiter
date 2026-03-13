# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy migration SQL so runMigration() can find it at process.cwd()/scripts/schema.sql
COPY scripts/schema.sql ./scripts/schema.sql

EXPOSE 3000

# Run as non-root user for security
USER node

# Migration runs automatically inside bootstrap() on every startup
CMD ["node", "dist/index.js"]
