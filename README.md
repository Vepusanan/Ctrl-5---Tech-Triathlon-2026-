# Ctrl-5 — Waypoint (Tech Triathlon 2026)

Delivery planning and operations platform for Waypoint's Store Managers, Dispatchers, Loaders and Drivers.
Architecture: [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md). Requirements: [docs/SRS.md](docs/SRS.md).

## Repository layout

```
apps/
  web/          React 18 + Vite PWA (all four roles)
  api/          Fastify 5 API (routes -> service -> repo)
packages/
  shared/       Zod schemas, enums, DTOs, error codes
  planning/     Pure, deterministic planning engine (imports @waypoint/shared only)
  database/     Drizzle schema, migrations and seed
infra/          Dockerfiles and Caddyfile
e2e/            Playwright end-to-end tests
docs/           Architecture, requirements and design reference
data/           Confidential competition CSVs (gitignored, never committed)
```

## Prerequisites

- Node 22.18 or newer (`.nvmrc`)
- pnpm via Corepack: `corepack enable pnpm`
- Docker with Compose v2

## Source data

The competition datasets are confidential and are not in the repository. Place the supplied folders in `data/`
(`data/General Data/`, `data/Training Data/`, `data/Test Data/`, `data/Submission Templates/`). The folder is
gitignored and mounted read-only into the seed job.

## Local development

```bash
pnpm install
cp .env.example .env        # adjust POSTGRES_PORT / DATABASE_URL if 5432 is taken
pnpm db:up                  # Postgres 16 in Docker
pnpm db:migrate
pnpm db:seed
pnpm dev                    # API on :3000, web on :5173 (proxies /api)
```

Open http://localhost:5173. API docs: http://localhost:3000/api/docs.

## Full stack

```bash
docker compose up -d --build
```

Serves the web build and API through Caddy on `HTTP_PORT` (default 80). Set `DOMAIN` to a hostname for automatic HTTPS.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | API and web in watch mode |
| `pnpm build` | Build every workspace |
| `pnpm typecheck` | TypeScript strict check across all workspaces |
| `pnpm check` / `pnpm check:write` | Biome lint + format (check / fix) |
| `pnpm test` | Vitest unit and integration tests |
| `pnpm test:planning` | Planning engine tests only |
| `pnpm e2e` | Playwright (starts the web dev server unless `E2E_BASE_URL` is set) |
| `pnpm knip` | Unused files, exports and dependencies |
| `pnpm db:up` | Start Postgres 16 in Docker |
| `pnpm db:generate` | Generate a Drizzle migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed the database |

Commits follow Conventional Commits with scopes `web`, `api`, `planning`, `shared`, `database`, `infra`, `docs`
(for example `feat(api): add health endpoint`), enforced by Husky and commitlint.
