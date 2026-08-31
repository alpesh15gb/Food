FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
COPY deploy/assets/ ./client/public/assets/
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 4300
CMD ["node", "dist/index.js"]
