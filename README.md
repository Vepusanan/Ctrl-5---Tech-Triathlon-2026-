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

## Sign in and role workspaces

Open `/login` for every role. The account determines the workspace; there is no role selector.
The default seed password is `waypoint-demo` unless `SEED_PASSWORD` was set when the database was seeded.
An idempotent seed does not change existing passwords.

| Role | Email | Scope | Home route |
| --- | --- | --- | --- |
| Dispatcher | dispatcher@waypoint.test | Peliyagoda depot | /dispatcher |
| Loader | loader@waypoint.test | Peliyagoda depot | /loader |
| Driver | driver@waypoint.test | Seed-selected Peliyagoda van | /driver |
| Store Manager | store.manager@waypoint.test | Seed-selected Fresh outlet | /store |

With `DEMO_MODE=true`, startup sets the operating clock before the seeded service day’s cutoff so Store ordering remains usable. The seed report prints the actual vehicle/outlet assignments. Loader/Driver lists remain empty until a plan is published.
`/dispatch` redirects to `/dispatcher` for existing links.

See [the authentication audit and repair report](docs/AUTH_FLOW_REPAIR.md) for architecture, scope checks, tests, and offline limitations.
To verify the four real accounts, run `E2E_BASE_URL=http://localhost:8080 E2E_REAL_STACK=true pnpm e2e`
(adjust the URL for `HTTP_PORT`). Playwright loads `.env` for the seed password.
