# Multi-stage build: install deps separately, then copy only runtime files
FROM node:18-alpine AS builder

WORKDIR /app

# Install only production dependencies (no package-lock required)
COPY package*.json ./
RUN npm install --omit=dev

# Copy application sources
COPY . .

# Runtime image
FROM node:18-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache su-exec tzdata

# Copy only what’s needed to run
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

ENV TZ=UTC

EXPOSE 3123

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD sh -c 'wget -q -O /dev/null "http://127.0.0.1:${PORT:-3123}${BASE_URL:-}/api/health" || exit 1'

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]