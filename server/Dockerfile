FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/package.json
RUN corepack enable && pnpm install --filter unicom-server --prod --frozen-lockfile

COPY server/src ./server/src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8788
EXPOSE 8788
USER node

CMD ["node", "server/src/server.js"]
