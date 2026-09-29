# Dhaka Tesla Pool

> Share a seat. Split the fare. Survive Dhaka traffic.

**Demo video:** _TODO (max 6 minutes)_
**Live deployment:** _TODO_

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
_TODO_

## Prerequisites
_TODO_

## Environment Variables
_TODO: see `.env.example`_

## Local Setup
_TODO_

## Docker
_TODO_

## Migrations & Seed Data
_TODO_

## Running Frontend, Backend & Tests
_TODO_

## Demo Credentials
_TODO_

## API Overview
_TODO_

## Assumptions & Key Decisions
_TODO_

## Concurrency Handling
_TODO_

## Known Limitations
_TODO_

## Next Improvements
_TODO_

## AI Usage
_TODO_
