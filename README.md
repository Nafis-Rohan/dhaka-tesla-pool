# Dhaka Tesla Pool

> Share a seat. Split the fare. Survive Dhaka traffic.

**Demo video:** _TODO (max 6 minutes)_
**Live deployment:** [dhaka-tesla-pool-snowy.vercel.app](https://dhaka-tesla-pool-snowy.vercel.app) (API: [dhaka-tesla-pool-api-j1dy.onrender.com](https://dhaka-tesla-pool-api-j1dy.onrender.com))

## Summary

**Dhaka Tesla Pool** is a ride-pooling MVP: one Tesla ("Bullet", 3 seats, driven by Jashim) picks up multiple passengers heading the same way and splits the fare between them. Passengers request a ride, see a live fare estimate (solo vs. shared), and get matched automatically into an open pool when compatible; a driver can also accept waiting requests directly. Every ride and pool has its own status lifecycle, capacity is enforced at the database level, and money is tracked in integer paisa so fares are exact and hand-checkable.

## Problem Statement

Commuting alone in Dhaka traffic is slow and expensive, and most trips within the same few kilometres overlap heavily with someone else's. The brief asks for a small, defensible MVP — not a real dispatch platform — that demonstrates the actual hard parts of ride-pooling: a documented, consistent matching rule (who can share with whom), a fare model that's simple enough to verify by hand, strict seat-capacity enforcement even under concurrent requests, and a clear status lifecycle for both the passenger's ride and the driver's trip. No real maps, no payment gateway, no infrastructure beyond what a two-person team can explain and defend live.

## Features Implemented

**Passenger**
- Register (phone + password) and log in; drivers are pre-seeded, not self-registered
- Request a ride: pickup/destination zone, seat count, "OK to share" toggle
- Live fare estimate (solo vs. pooled) before booking
- Track ride status end to end (`REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`), polling every 5s
- See "sharing with N others" without ever seeing co-passengers' names or phones
- Cancel while still allowed; ride history with empty state

**Driver**
- Go online/offline with a current zone; can't go offline mid-trip
- See waiting requests in-zone, filtered to only the ones that could actually join the current open trip
- Accept a request (creates or extends a pool)
- Run the trip: mark arrival, start (locks final fares), drop off each passenger individually, mark no-show, or cancel the whole trip
- Trip history with per-trip earnings

**Pooling & fares**
- A documented matching rule (`canJoin`) — same pickup zone, compatible destinations, enough free seats
- Every passenger gets their own fare, locked only once the trip actually starts with 2+ people aboard
- Seat capacity is enforced by a DB `CHECK` constraint, not just application code — verified under concurrent requests (see [Concurrency Handling](#concurrency-handling))

## Screenshots
_TODO: add once final UI polish is done_

## Architecture

![Architecture diagram](docs/teslaArchitecture.svg)

Browser (React/Vite) → Express API → PostgreSQL, with nginx serving the built frontend as static files in Docker (never a reverse proxy — the browser calls the API directly). Inside the API: routes → controllers (thin) → services (business logic, transactions) → domain (pure functions: fare, matching, transitions) → repositories (the only layer touching Postgres).

Full rationale, the production diagram, and the "why this shape" reasoning live in [docs/architecture.md](docs/architecture.md).

## Database (ERD)

![ERD](docs/teslaERD.svg)

A solo ride is modelled as a pool with one member — one uniform model, no special cases. `pools.capacity` is snapshotted from the vehicle at creation so `CHECK (seats_taken <= capacity)` works inside a single row, and money is stored as integer paisa throughout. Full table-by-table rationale, constraints, and indexes are in [docs/erd.md](docs/erd.md).

## Tech Stack & Justification

| Layer | Pick | Alternatives considered | Why this, for this MVP | Switch when |
|---|---|---|---|---|
| Frontend | React + Vite + React Router | Next.js App Router | Learning React now; SSR/server components add concepts an authenticated dashboard app doesn't need. PRD allows either. | Need SEO or server-rendered pages |
| Server state | TanStack Query | `fetch` + `useEffect` | Free loading/error states and polling (`refetchInterval`) — directly graded | — |
| Styling | Tailwind CSS | Plain CSS modules, MUI | Fast, no component-library lock-in | A real design system is needed |
| Backend | Express (JS, ESM) | NestJS, Fastify | Smallest learning curve; layered structure (routes → controllers → services → repositories) mirrors familiar patterns anyway | Team grows and needs enforced structure/DI |
| Validation | zod | Joi, express-validator | One schema doubles as validation + clear error messages | — |
| Database | PostgreSQL 16 | MySQL, SQLite | Row locks (`SELECT ... FOR UPDATE`), CHECK constraints, and partial unique indexes are used directly for capacity/race safety | Never for this app; PostGIS only if real geo is added |
| ORM | Prisma | Drizzle, Knex, TypeORM | Best docs for getting started, migrations + seeding built in; locking/partial indexes done via raw SQL where Prisma can't express them | Heavy raw-SQL needs push toward Drizzle/Knex |
| Auth | JWT (bearer) + bcrypt | Sessions + cookies | Stateless, works across separate frontend/API hosts without cross-site cookie issues | Need instant token revocation |
| Tests | Vitest + Supertest against real Postgres | Jest + mocked DB | Concurrency tests must hit a real database — mocks would hide the exact race conditions being tested | — |
| Logging | pino + request id | winston, morgan | Structured JSON logs, cheap | Add distributed tracing at scale |
| Hosting | Frontend: Vercel · API: Render (free) · DB: Neon (free Postgres) | Netlify, Railway, Fly, Supabase | All free tier, all sufficient for MVP traffic | Move to a paid always-on tier to remove Render's cold starts |
| API style | REST | GraphQL | Resources map cleanly (rides, pools, vehicles); state changes are explicit action endpoints (`/accept`, `/cancel`) | Many client types need different data shapes |
| Real-time | Polling every 5s | WebSockets, SSE | Zero extra infrastructure; fine at MVP scale | Live driver location or thousands of concurrent clients |

See [rules.md](rules.md) Part B for the full list of engineering decisions and the reasoning behind each one.

## Project Structure

```
dhaka-tesla-pool/
├── api/                     # Node + Express + Prisma
│   ├── src/
│   │   ├── modules/         # auth, rides, driver, pools, fares, zones
│   │   │                    # (routes + controller + service + repository together, per feature)
│   │   ├── domain/          # fare.js, matching.js, transitions.js - pure functions, no DB access
│   │   ├── middleware/      # auth, role guard, validation, error handler
│   │   └── lib/             # prisma client, logger, AppError, env
│   ├── prisma/              # schema.prisma, migrations/, seed.js
│   ├── prisma.config.js     # datasource url for the Prisma CLI (migrate deploy)
│   ├── Dockerfile
│   └── docker-entrypoint.sh # runs migrate deploy + seed, then starts the server
├── web/                     # React + Vite
│   ├── src/
│   │   ├── auth/            # AuthContext, RequireAuth
│   │   ├── hooks/           # one TanStack Query hook per API resource
│   │   ├── pages/           # passenger/, driver/, plus Login/Register
│   │   ├── components/      # Loading, ErrorState, EmptyState
│   │   └── lib/             # api client (axios), money formatter
│   ├── Dockerfile
│   └── nginx.conf
├── docs/                    # architecture.md, erd.md, fare-and-matching.md, lifecycle.md, diagrams
├── docker-compose.yml
├── .env.example
└── README.md
```

## Prerequisites

- **Node.js 24.x** and npm 10+ (matches the version the app was built and tested with)
- **Docker Desktop**, for the one-command full-stack path
- Postgres is **not** needed locally if you use Docker for the database; only required if you run the API natively against your own Postgres instance

## Environment Variables

Two `.env.example` files, copied to `.env` and filled in — **never commit the real `.env`**.

**Root `.env.example`** (read by `docker-compose.yml` and the API):
| Variable | Purpose |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | Local Postgres container credentials |
| `DATABASE_URL` | Full Postgres connection string the API and Prisma use |
| `NODE_ENV`, `PORT` | API server config |
| `CORS_ORIGIN` | Comma-separated list of browser origins allowed to call the API |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Auth token signing |

**`web/.env.example`**:
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the API. Baked into the JS bundle at **build time** (Vite), not read at runtime |

## Local Setup

Without Docker, running the API and frontend directly:

```bash
git clone https://github.com/Nafis-Rohan/dhaka-tesla-pool.git
cd dhaka-tesla-pool
cp .env.example .env            # fill in JWT_SECRET
cp web/.env.example web/.env

docker compose up -d db         # or point DATABASE_URL at your own local Postgres

cd api
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev                     # API on http://localhost:3000

# in a second terminal
cd web
npm install
npm run dev                     # web on http://localhost:5173
```

## Docker

The whole stack — database, API, frontend — with one command:

```bash
cp .env.example .env            # fill in JWT_SECRET
docker compose up --build
```

- Web: `http://localhost:8080`
- API: `http://localhost:3000`
- Migrations and seed data run automatically every time the API container starts (both idempotent — safe on repeat runs, including restarts of an already-seeded database)
- nginx serves the built frontend as static files only; the browser calls the API directly (never a reverse proxy) — see [docs/architecture.md](docs/architecture.md)

## Migrations & Seed Data

- Migrations live in `api/prisma/migrations/`. The Prisma-generated SQL was hand-extended with `CHECK` constraints and partial unique indexes that Prisma's schema language can't express directly (see [docs/erd.md](docs/erd.md) for the exact SQL).
- `api/prisma.config.js` supplies the database URL to Prisma **CLI** commands (`migrate dev`, `migrate deploy`) specifically — the running app itself connects via `@prisma/adapter-pg` directly and never reads the schema's (deliberately absent) datasource url.
- The seed script (`api/prisma/seed.js`) is **idempotent** (upsert-based): creates the 9 zones with adjacency/distance data, driver Jashim + vehicle Bullet, passengers Nusrat/Rafiq/Shirin, and one completed historical pool (Nusrat + Rafiq) so history screens aren't empty on a fresh run.
- Run it manually with `npm run db:seed` (from `api/`), or let Docker's entrypoint run it automatically on every container start.

## Running Frontend, Backend & Tests

**API**
```bash
cd api
npm run dev          # nodemon, http://localhost:3000
```

**Web**
```bash
cd web
npm run dev          # Vite dev server, http://localhost:5173
```

**Tests** (Vitest + Supertest against a real Postgres — concurrency tests must hit a real database, not mocks, or they'd never catch the actual race conditions being tested)

One-time setup: create and migrate a dedicated test database. Tests refuse to run against anything whose name doesn't contain `_test`, as a safety check against accidentally wiping real data:
```bash
# with the compose db container already running
docker exec -it postgres psql -U tesla -c "CREATE DATABASE tesla_pool_test"
```
Then, from `api/`, with `DATABASE_URL` pointed at that new database for one command:
```powershell
$env:DATABASE_URL="postgresql://tesla:tesla@localhost:5434/tesla_pool_test"
npx prisma migrate deploy
```
After that one-time step:
```bash
npm test             # vitest.config.js derives the test URL automatically (appends _test)
```

## Demo Credentials

Password **`tesla1234`** for everyone. Drivers are seeded, not self-registered (rules.md B9) — only the passenger accounts below can also be recreated via Register.

| Name | Role | Phone |
|---|---|---|
| Jashim | Driver (Bullet, 3 seats) | `01711000001` |
| Nusrat | Passenger | `01711000002` |
| Rafiq | Passenger | `01711000003` |
| Shirin | Passenger | `01711000004` |

## API Overview

REST, JWT bearer auth. Error shape: `{ "error": { "code": "POOL_FULL", "message": "...", "details": {} } }`. Status codes: `400` validation, `401` unauthenticated, `403` wrong role, `404` not found or not yours, `409` invalid transition / capacity / lost a race.

| Resource | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /me` |
| Zones | `GET /zones` |
| Fares | `POST /fares/estimate` |
| Rides (passenger) | `POST /rides`, `GET /rides?scope=active\|history`, `GET /rides/:id`, `POST /rides/:id/cancel` |
| Driver | `GET/PUT /driver/availability`, `GET /driver/requests`, `POST /driver/requests/:id/accept`, `GET /driver/history` |
| Pool (driver's active trip) | `GET /driver/pool/current`, `POST /driver/pool/arrive`, `POST /driver/pool/start`, `POST /driver/pool/cancel`, `POST /driver/pool/requests/:id/dropoff`, `POST /driver/pool/requests/:id/no-show` |

A full Postman collection with every request pre-filled is in [docs/postman/dhaka-tesla-pool.postman_collection.json](docs/postman/dhaka-tesla-pool.postman_collection.json).

## Assumptions & Key Decisions

The PRD leaves several things open on purpose. The full list, with reasoning for each, is in [rules.md](rules.md) Part B — the highlights:

- **A solo ride is a pool with one member** — one data model, no special-casing.
- **Matching is pairwise, not transitive**: a request can join a pool only if its destination is the same as or adjacent to *every* existing member's destination, checked one pair at a time against a seeded adjacency list. Two zones both being adjacent to a third doesn't make them adjacent to each other.
- **Fares are integer paisa**, never floats — exact sums, exact test equality, no `0.1 + 0.2` surprises.
- **The pool discount is locked only when the trip starts**, and only if 2+ passengers are actually aboard at that moment — not when the ride is requested, since nobody can know yet who else will join.
- **Drivers are seeded, not self-registered** — real onboarding would need identity verification, out of scope for an MVP.
- **A driver's zone is set manually on going online**, and (as of the fix during Phase 13) updated automatically to the last drop-off's zone once a trip completes — see [Known Limitations](#known-limitations) for what this still doesn't cover.
- **No weather or traffic-based fare surcharge**, even though the brief explicitly allows it. Without a real map or weather API, the only honest way to know current conditions would be to ask the passenger and driver directly — and self-reported "it's raining" or "traffic is heavy" is trivial to disagree on or game (one side has a fare incentive to claim bad conditions, the other to deny them), which undermines the fare model's whole point of being simple and exact. Given limited time, this was deliberately left out rather than shipped as something that looks like a feature but doesn't actually hold up.

## Concurrency Handling

Every seat or status change runs inside **one database transaction** that locks the relevant pool row first (`SELECT ... FOR UPDATE`), always in the order **pool → request** everywhere in the codebase, so two operations can wait on each other but never deadlock.

- **Two passengers racing for the last seat** (Nusrat and Shirin requesting the same instant): the second transaction blocks on the pool's lock until the first commits, then re-checks the *fresh* seat count — never a stale read. Exactly one gets the seat; the other simply stays `REQUESTED` for another driver, which is not an error.
- **Two drivers accepting the same request**: one atomic conditional update — `UPDATE ride_requests SET status='MATCHED' ... WHERE status='REQUESTED'`. Only one of the two simultaneous updates can match a still-`REQUESTED` row; the loser's entire transaction (including any pool it just created) rolls back with zero rows changed.
- **A database `CHECK` constraint** (`seats_taken BETWEEN 0 AND capacity`) is the last line of defense against overbooking, independent of the application code above.

This is exercised directly by tests that fire concurrent requests with `Promise.all` and repeat the race multiple times, plus an `afterEach` invariant check that every pool's `seats_taken` always matches its actual member count.

**At scale**, this specific approach (a per-pool row lock) stays fine — contention is at most 3 seats per pool, so lock waits are always short. The real bottleneck at real scale is the *matching* step itself scanning waiting requests; the fix there is partitioning matching by zone into separate workers/queues, not more locking on the pool row.

## Known Limitations

- **Render free tier sleeps after ~15 min idle** — the first request after that takes 30-50s to wake up (a real cold start, not a bug)
- **A driver's zone is coarse and semi-manual**: set when going online, updated automatically only at trip completion (to the last passenger's destination) — it doesn't track continuously, and there's no way to update it mid-shift without going offline and online again
- **No real maps or routing** — zones, adjacency, and distances are all seeded, fixed data, not computed
- **Cash only** — no real payment gateway, no simulated wallet
- **No cancellation fees** — a passenger who cancels late faces no penalty
- **A second driver only exists in tests** (`test/helpers.js`), not in the seed — production data is exactly Jashim + Bullet, so multi-driver scenarios (competing drivers accepting the same request) aren't demonstrable live, only under test

## Next Improvements

Out of scope for this MVP, listed here rather than built in for the sake of it (rules.md B11):

- Real maps/routing and live, continuously-tracked driver location
- Passenger/driver ratings
- A simulated "TeslaPay" wallet, as an alternative to cash
- Cancellation fees and surge pricing
- OTP-based login (skipped here since it costs money per SMS)
- Self-service driver onboarding with identity verification
- Push notifications (currently: 5-second polling)
- An admin panel for managing zones, disputes, and accounts
- Bonus: [docs/scaling.md](docs/scaling.md) — reasoning on scaling to 1M passengers / 100k drivers (load balancing, read replicas, geospatial search, queues, rate limiting, and more — rules.md A15)

## AI Usage

**Tool:** Claude Code (Anthropic), used as a pair-programming assistant across backend, frontend, and debugging.

**What for and how:** every design and scope decision — the matching rule, the fare model, the two-lifecycle split, tech stack choices — was mine; Claude Code was the sounding board I discussed them with and got a second opinion from before committing to one. Day to day, I directed the work in small batches: I'd describe what to build next, Claude Code would propose and write the code, I'd review it, test it myself in the browser or Postman, and decide whether to keep it, change it, or push back. I ran every terminal command myself rather than letting the tool run them, and I can explain, debug, and modify every part of this codebase on my own.
