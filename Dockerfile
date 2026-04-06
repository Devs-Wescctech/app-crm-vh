FROM node:20-alpine AS frontend-build

WORKDIR /app

COPY package.json ./
RUN echo "legacy-peer-deps=true" > .npmrc && npm install --legacy-peer-deps

COPY index.html vite.config.js tailwind.config.js postcss.config.js jsconfig.json components.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

FROM node:20-alpine AS backend-deps

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-alpine

RUN apk add --no-cache wget

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY backend/ ./backend/
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY --from=frontend-build /app/dist ./dist

RUN mkdir -p /app/uploads /app/backend/public/proposals /app/backend/public/signatures \
    && chown -R appuser:appgroup /app \
    && chmod -R 777 /app/uploads /app/backend/public/proposals /app/backend/public/signatures

USER appuser

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

CMD ["node", "backend/src/server.js"]
