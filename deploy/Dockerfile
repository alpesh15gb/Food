FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
# NODE_ENV must be set BEFORE the build (install already ran above, so
# devDependencies are present). Build-time checks like the dev-plugin gate
# read it; without this the image ships dev runtime code.
ENV NODE_ENV=production
# Client map key (Vite bakes these into the JS bundle at build time — they
# CANNOT come from runtime env). Preferred: own Google Cloud key.
# Legacy Forge proxy pair still honored when the Google key is absent.
ARG VITE_GOOGLE_MAPS_API_KEY=""
ARG VITE_FRONTEND_FORGE_API_URL=""
ARG VITE_FRONTEND_FORGE_API_KEY=""
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_FRONTEND_FORGE_API_URL=$VITE_FRONTEND_FORGE_API_URL
ENV VITE_FRONTEND_FORGE_API_KEY=$VITE_FRONTEND_FORGE_API_KEY
RUN pnpm run build

EXPOSE 4300
# Plain probe endpoint: system.health is a tRPC batch query and needs
# ?batch=1&input=… params, so a bare GET never returns 2xx (the container
# would report unhealthy forever).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4300/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
