# syntax=docker/dockerfile:1
# Tier-1 fallback image for Wahwedoin.
#
# This image is ASSEMBLED from a completed `npm run build` (standalone output).
# CI (see .github/workflows/fallback.yml) runs the build first, so runtime
# secrets are never baked into image layers — they are injected at deploy time
# via environment variables (see support/fallback.md).
#
# Local build from repo root:
#   npm ci && npm run build
#   docker build -t wahwedoin-fallback .
#   docker run --rm -p 3000:3000 --env-file .env.local wahwedoin-fallback

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
