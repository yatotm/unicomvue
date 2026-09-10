# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv

# Stage 1 — build the SPA from source. The whole workspace is needed:
# vite.config.js imports server/src/config.js and PrivacyModal imports
# docs/api-and-privacy.md?raw.
FROM node:22-alpine AS build

WORKDIR /app
ENV CI=true
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile

COPY . .

# Compiled into public JavaScript — never put a real secret here.
ARG VITE_API_BASE_URL=
ARG VITE_API_ACCESS_TOKEN=
ARG VITE_CAPTCHA_APP_ID=

# .git is excluded from the context, so build info comes in as arguments.
ARG APP_BRANCH=
ARG APP_COMMIT=
RUN pnpm run build

# Stage 2 — nginx serves the bundle. No node_modules, no sources.
FROM nginx:stable-alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
