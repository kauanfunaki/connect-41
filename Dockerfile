# Connect 41 — imagem de produção (Next.js standalone) para EasyPanel
# syntax=docker/dockerfile:1

FROM node:22-slim AS base
# openssl é exigido pelo Prisma (engine) em runtime e build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- dependências ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# --- build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# "build" roda `prisma generate && next build` (ver package.json)
RUN npm run build

# --- runtime ---
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# saída standalone: server.js + node_modules mínimos
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# storage/ e public/uploads/ não existem no build (são estado de runtime,
# criados sob demanda pelos uploads: avatares, logos, documentos) — precisam
# já nascer com dono nextjs, senão o primeiro mkdir em runtime falha com EACCES
# (/app é root:root por padrão via WORKDIR). Se o EasyPanel montar um volume
# persistente num desses caminhos, o Docker copia o conteúdo desta camada (já
# com o dono certo) pro volume na primeira inicialização.
RUN mkdir -p /app/storage /app/public/uploads && chown -R nextjs:nodejs /app/storage /app/public/uploads

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
