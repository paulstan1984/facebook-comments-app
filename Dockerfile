# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
# Install only production deps; omit devDependencies (nodemon, etc.)
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine

# Run as a non-root user for reduced attack surface
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only what is needed to run the server
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
COPY views ./views
COPY public ./public

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
