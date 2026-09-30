# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/

FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@waypoint/api..."

FROM manifests AS build
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@waypoint/api..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/api apps/api
RUN pnpm --filter "@waypoint/api..." build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app ./
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/database/dist packages/database/dist
COPY packages/database/migrations packages/database/migrations
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
