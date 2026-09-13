# Build de contexto: la raíz del repo (necesita ver server/ y web/).
# docker build -f server/Dockerfile .

FROM node:20-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web-builder /web/dist ./web-dist

EXPOSE 3001
CMD ["node", "src/server.js"]
