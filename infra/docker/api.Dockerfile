# ============================================================================
# Nexus API Dockerfile - Multi-stage build
# ============================================================================

# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# ---- Dependencies ----
FROM base AS deps
# Install all workspace dependencies
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/ai/package.json ./packages/ai/
RUN npm ci --workspace=apps/api --workspace=packages/types --workspace=packages/db --workspace=packages/ai

# ---- Build ----
FROM deps AS builder
# Copy source files
COPY packages/types/ ./packages/types/
COPY packages/db/ ./packages/db/
COPY packages/ai/ ./packages/ai/
COPY apps/api/ ./apps/api/

# Build packages in dependency order
RUN npm run build --workspace=packages/types
RUN npm run build --workspace=packages/db
RUN npm run build --workspace=packages/ai

# Generate Prisma client
RUN cd packages/db && npx prisma generate

# Build API
RUN npm run build --workspace=apps/api

# ---- Development ----
FROM deps AS development
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client for dev
RUN cd packages/db && npx prisma generate

ENV NODE_ENV=development
EXPOSE 3001
CMD ["npm", "run", "dev", "--workspace=apps/api"]

# ---- Production Runner ----
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nexus

# Copy only what's needed for production
COPY --from=builder --chown=nexus:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nexus:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=nexus:nodejs /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=nexus:nodejs /app/packages/db/package.json ./packages/db/
COPY --from=builder --chown=nexus:nodejs /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder --chown=nexus:nodejs /app/packages/types/dist ./packages/types/dist
COPY --from=builder --chown=nexus:nodejs /app/packages/types/package.json ./packages/types/
COPY --from=builder --chown=nexus:nodejs /app/packages/ai/dist ./packages/ai/dist
COPY --from=builder --chown=nexus:nodejs /app/packages/ai/package.json ./packages/ai/
COPY --from=builder --chown=nexus:nodejs /app/package.json ./
COPY --from=builder --chown=nexus:nodejs /app/node_modules ./node_modules

# Regenerate Prisma client for production
RUN cd packages/db && npx prisma generate

USER nexus

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
