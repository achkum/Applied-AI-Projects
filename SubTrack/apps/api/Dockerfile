# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:22.18.0-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN --mount=type=secret,id=environment_ca,mode=0444 \
    sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources; \
    set --; \
    if [ -n "$HTTPS_PROXY" ]; then set -- "$@" -o "Acquire::https::Proxy=$HTTPS_PROXY"; fi; \
    if [ -f /run/secrets/environment_ca ]; then set -- "$@" -o Acquire::https::CaInfo=/run/secrets/environment_ca; fi; \
    apt-get "$@" update && apt-get "$@" install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=environment_ca,mode=0444 \
    if [ -f /run/secrets/environment_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/environment_ca; fi; \
    npm install --global pnpm@12.6.0
WORKDIR /workspace

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
COPY packages/config ./packages/config
RUN --mount=type=secret,id=environment_ca,mode=0444 \
    if [ -f /run/secrets/environment_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/environment_ca SSL_CERT_FILE=/run/secrets/environment_ca; fi; \
    pnpm install --filter @subtrack/api... --filter subtrack --frozen-lockfile && \
    DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" pnpm --filter @subtrack/api exec prisma generate --schema=prisma/schema.prisma && \
    pnpm --filter @subtrack/api exec tsc -p tsconfig.build.json && \
    test -f apps/api/dist/main.js && \
    pnpm --filter @subtrack/api exec node -e "require('node:fs').cpSync(require('node:path').dirname(require('node:module').createRequire(require.resolve('@prisma/client')).resolve('.prisma/client/package.json')), '/generated-prisma-client', { recursive: true })" && \
    rm -rf /pnpm/store

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
COPY packages/config ./packages/config
RUN --mount=type=secret,id=environment_ca,mode=0444 \
    --mount=type=bind,from=build,source=/generated-prisma-client,target=/generated-prisma-client \
    --mount=type=bind,from=build,source=/workspace/apps/api/dist,target=/compiled-api \
    if [ -f /run/secrets/environment_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/environment_ca SSL_CERT_FILE=/run/secrets/environment_ca; fi; \
    pnpm install --prod --filter @subtrack/api... --frozen-lockfile && \
    pnpm --filter @subtrack/api exec node -e "const p = require('node:path'); require('node:fs').cpSync('/generated-prisma-client', p.resolve(p.dirname(require.resolve('@prisma/client')), '../../.prisma/client'), { recursive: true })" && \
    mkdir -p /runtime/apps/api /runtime/packages && \
    cp -a node_modules /runtime/node_modules && \
    cp -a apps/api/node_modules apps/api/package.json /runtime/apps/api/ && \
    cp -a packages/contracts /runtime/packages/ && \
    cp -a /compiled-api /runtime/apps/api/dist && \
    rm -rf /pnpm/store /workspace/node_modules

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /workspace
COPY --from=production-dependencies --chown=node:node /runtime/ ./
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
