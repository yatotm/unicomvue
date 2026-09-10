# syntax=docker/dockerfile:1

# Stage 1 — resolve the gateway's production dependencies from the workspace
# lockfile. `pnpm deploy` is what keeps the frontend's dependencies out: a
# plain filtered install always adds the workspace root's packages too.
FROM node:22-alpine AS deps

WORKDIR /app
ENV CI=true
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
RUN pnpm --filter unicom-server --prod --frozen-lockfile \
    --config.inject-workspace-packages=true deploy /deploy

# Stage 2 — runtime carries the gateway only: no pnpm, no build tooling,
# no frontend packages.
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8788

COPY --from=deps /deploy/package.json server/package.json
COPY --from=deps /deploy/node_modules server/node_modules
COPY server/src server/src

EXPOSE 8788
USER node

CMD ["node", "server/src/server.js"]
