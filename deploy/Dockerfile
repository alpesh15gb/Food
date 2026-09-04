FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 4300
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4300/api/trpc/system.health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
