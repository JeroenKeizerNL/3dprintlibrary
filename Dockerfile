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

# Copy only what’s needed to run
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]