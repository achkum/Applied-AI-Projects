# Build from the SubTrack repository root: docker build -f apps/web/Dockerfile .
FROM node:24.11.1-bookworm-slim AS base
WORKDIR /repo
ENV COREPACK_HOME=/corepack

FROM base AS build
RUN --mount=type=secret,id=environment_ca,mode=0444 \
    if [ -f /run/secrets/environment_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/environment_ca; fi; \
    npm install --global pnpm@12.6.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages
RUN --mount=type=secret,id=environment_ca,mode=0444 \
    if [ -f /run/secrets/environment_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/environment_ca SSL_CERT_FILE=/run/secrets/environment_ca; fi; \
    pnpm install --filter @subtrack/web... --filter subtrack --frozen-lockfile && \
    NODE_ENV=production pnpm --filter @subtrack/web build && \
    rm -rf /root/.local/share/pnpm/store

FROM node:24.11.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 nextjs \
    && useradd --system --uid 1001 --gid nextjs nextjs
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/.next/standalone/ ./
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/public/ ./apps/web/public/
WORKDIR /app/apps/web
USER nextjs
CMD ["node", "server.js"]
