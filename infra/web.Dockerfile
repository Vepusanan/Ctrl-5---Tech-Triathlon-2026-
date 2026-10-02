# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/planning/package.json packages/planning/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@waypoint/web..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/planning packages/planning
COPY apps/web apps/web
RUN pnpm --filter @waypoint/web build

FROM caddy:2-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
