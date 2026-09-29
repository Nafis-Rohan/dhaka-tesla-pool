# Dhaka Tesla Pool — RULES

This file has two parts:

- **Part A — Rules from the PRD.** Non-negotiable. Section numbers (§) point back to the brief.
- **Part B — Our engineering decisions.** The brief leaves some things open on purpose (§17). These are the gaps and how we fill them. Each one goes into the README's "Assumptions & Decisions" section, and the code must follow it consistently.

---

# PART A — Rules from the PRD

## A1. Story cast (§1, §16, §18)
- Use the cast everywhere: **seed data, tests, README, demo video**.
  - Passengers: **Nusrat** (Banani → Mohakhali), **Rafiq** (Banani → Gulshan 1), **Shirin** (grabs the last seat)
  - Driver: **Jashim**, vehicle: **Bullet** (3 seats)
- Never use `user1` / `driver1` / `test@test.com`-style placeholders anywhere.
- If you add extra characters, use them the same way everywhere.

## A2. Scope (§3, §4, §5)
- Three actors: **Passenger**, **Driver/Tesla**, **Ride/Pool**.
- No real routing, no map APIs. Use a predefined list of Dhaka areas (or plain lat/long).
- **Invent and document a matching rule**, and apply it consistently, including to Nusrat + Rafiq's overlapping-but-different trip.
- Fare model must be simple and **hand-testable** using Nusrat and Rafiq's trip.
- Document how money is stored (integer paisa vs decimal) and why.
- Payment: cash or simulated "TeslaPay" wallet only. No real gateway.

### Required features (§3 table)
| Passenger | Driver / Tesla | Pool / Ride split |
|---|---|---|
| Sign up / sign in | Sign in; go online/offline | Multiple requests can share one Tesla |
| Request ride: pickup, destination, seats | Owns a Tesla with fixed capacity | Occupied seats **never** exceed capacity |
| See estimated fare | See relevant requests; accept a ride/pool | Each passenger gets an **individual** fare |
| Track status: waiting → matched → in progress → completed/cancelled | Mark arrival, start, complete trip | Clear lifecycle; obvious pool membership |
| View history; cancel while valid | See passengers/seats and ride history | |

Suggested lifecycle: `REQUESTED → MATCHED/ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED (+ CANCELLED)` — you may improve it **if you explain why**.

## A3. Mandated stack (§6)
| Layer | Rule |
|---|---|
| Frontend | React or Next.js (mandatory) |
| Backend | **Node.js** (mandatory) — Express / NestJS / Fastify / other, justified |
| Database | Your choice (relational recommended) |
| Other tooling | Your choice — ORM, validation, auth, tests, hosting — all justified |

- API style (REST/GraphQL/other): pick and **explain why**.

## A4. What each layer is graded on (§6)
- **Backend:** API/resource design, auth, validation, where business logic lives, error handling, ride state transitions, pool capacity enforcement, data consistency, code organization, logging, basic security.
- **Frontend:** correct flows/states, clear **loading / error / empty** states, reasonable component organization, API integration, usability. Simple and clean is enough.
- **Database:** you design the schema (users, vehicles + capacity, ride requests, pools, pool membership, status/history, fare, optional payment/rating/audit). Proper relationships, constraints, indexes, types. **Be ready to explain every table.**

## A5. Docker (§6)
- Must run with **`docker compose up`**.
- Includes: app container(s), DB container, `.env.example`, migrations, seed data (story cast), health checks if possible.

## A6. Deployment (§6, §16)
- **Free / free-tier only. Never pay.**
- If free backend hosting isn't available: document the constraint and give a reproducible Docker deployment.
- Public deployment preferred.

## A7. Technology justification (§7)
For **every** non-mandated choice (DB, ORM, auth, styling, tests, hosting), the README states:
1. What you picked + realistic alternatives
2. Why it fits a ride-pooling MVP specifically
3. What would make you switch later

No trendy tech you can't defend.

## A8. AI usage (§8, §16)
- AI is allowed. **Never hide it.**
- README "AI Usage" section: tools used, what for, **one accepted suggestion**, **one rejected/changed suggestion + why**.
- You must be able to explain, debug, redesign, and modify any part live — especially auth, pooling/capacity enforcement, schema, failure behavior.
- Don't include code you can't explain.

## A9. Architecture first (§9)
- Before implementing everything: architecture diagram (at minimum **Browser → React → Node API → Database**) + **ERD**.
- Implementation must broadly match the docs. If it changes, update the docs.
- **No microservices, Kafka, Kubernetes, Redis, or queues in the MVP** just to look advanced.

## A10. Git workflow (§10, §16)
- Long-lived branches: **`master`**, **`pre-release`**, **`release/<version>`**
- Feature work on **`feature/*`** branches (e.g. `feature/passenger-auth`, `feature/tesla-pooling`, `feature/driver-flow`).
- Flow:
  1. Build one logical change on a feature branch with incremental commits
  2. Merge into `master` when it works
  3. Once MVP features are integrated → cut `pre-release` (integration fixes, docs, deployment checks)
  4. Cut `release/v1.0.0` from `pre-release` — this is the version shown in video/deployment
- **Never** push feature development directly to `master`.
- **Never** a single giant "initial commit" with the finished system.

## A11. Commit messages (§11)
- Format: `<type>(<scope>): <short description>`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`
- One commit = one understandable logical change.
- Banned: `update`, `changes`, `fix`, `final`, `latest`, `working now`, `asdf`.
- Also avoid 50 meaningless micro-commits. Useful history, not Git theatre.
- Examples: `feat(auth): add passenger login endpoint`, `feat(pool): enforce Bullet's seat capacity`, `fix(pool): prevent overbooking available seats`, `build(docker): add compose setup for api and postgres`

## A12. README must include (§12)
- Summary, problem statement, features implemented, screenshots/GIFs
- Architecture diagram + ERD
- Tech stack, project structure, prerequisites
- Environment variables (`.env.example`, never real secrets)
- Local setup, Docker instructions, migration/seed instructions
- How to run frontend, backend, and tests; **demo credentials**
- Deployment URL, API overview, key decisions/trade-offs, known limitations, next improvements
- AI Usage section + **demo video link (prominent)**

## A13. Required tests (§12) — meaningful, not coverage-chasing
1. Bullet's capacity can never be exceeded
2. Invalid state transitions are rejected
3. Nusrat's and Rafiq's pooled fares calculate correctly
4. Users can't modify another user's ride
5. Cancellation rules hold
6. Two concurrent requests can't corrupt pool capacity

## A14. Concurrency problem (§12)
- Bullet has 1 seat left. Nusrat and Shirin claim it at nearly the same instant; both saw 1 seat.
- No distributed solution needed, but: **document how you handle it now + what you'd change at larger scale.** Expect interview questions.

## A15. Bonus — "If Oi Tesla Goes Viral" (§12)
- Optional. **Reasoning only, don't build it.** Scale to 1M passengers / 100k drivers.
- Cover: load balancing, horizontal scaling, DB indexing/read replicas, caching, geospatial search, queues/events, real-time comms, rate limiting, idempotency, observability, DB contention, ride matching, retry/failure, security, deployment.
- Diagram encouraged; reasoning > box count.

## A16. Video (§13) — max 6 minutes, linked in README
| Time | Content |
|---|---|
| 0:00–1:00 | Problem, users, core idea **in your own words** (don't recite the PRD) |
| 1:00–3:00 | Architecture, backend, frontend, DB, ride/pool lifecycle, **one key decision, one trade-off** — show diagram/ERD |
| 3:00–6:00 | Product tour: passenger flow, driver flow, pooling, fare/status, **one edge case**, deployment |

## A17. Hard "don'ts" (§16)
- Don't pay for infra/services
- Don't commit API keys, passwords, tokens, `.env`
- Don't submit one giant initial commit
- Don't push features directly to master
- Don't add tech only to decorate the diagram
- Don't polish animations while data integrity is broken
- Don't hide AI usage or ship code you can't explain
- Don't replace the story cast with generic placeholders

## A18. Scoring (§15)
Product · Process · Backend/DB · Frontend · Docker/Deploy · Testing/Docs · Ownership.
**Following instructions is a major explicit part of the score.** A small clean MVP that follows the process beats 120 features with a broken process.

---

# PART B — Our Engineering Decisions (the gaps the PRD left open)

> Rule of thumb for every decision: **simplest thing that is correct, testable by hand, and defensible in an interview.**

## B1. Stack
| Choice | Pick | Alternatives | Why this, for this MVP | Switch when |
|---|---|---|---|---|
| Frontend | **React + Vite + React Router** | Next.js App Router | Learning React now; SSR/server components add concepts we don't need for a logged-in dashboard app. PRD explicitly allows it. | Need SEO/public pages or server-rendered data |
| Server state | **TanStack Query** | fetch + useEffect | Gives loading/error states + polling (`refetchInterval`) for free — directly graded | — |
| Styling | **Tailwind CSS** | Plain CSS modules, MUI | Fast, no component-library lock-in | Design system needed |
| Backend | **Express (JavaScript, ESM)** | NestJS, Fastify | Smallest learning curve coming from JS. Layered structure (routes → controllers → services → repositories) mirrors Spring Boot anyway | Team grows → NestJS for enforced structure/DI |
| Validation | **zod** | Joi, express-validator | One schema = validation + clear error messages | — |
| Database | **PostgreSQL 16** | MySQL, SQLite | Row locks (`SELECT … FOR UPDATE`), CHECK constraints, **partial unique indexes**, `timestamptz`, and a PostGIS path for the scaling bonus | Never for this app; add PostGIS for real geo |
| ORM | **Prisma** | Drizzle, Knex, TypeORM | Best docs for a Node beginner, migrations + seeding built in. Locking/partial indexes done via raw SQL — a conscious, explainable trade-off | Heavy raw-SQL needs → Drizzle/Knex |
| Auth | **JWT (bearer) + bcrypt** | Sessions + cookies, Auth.js | Stateless, works across different free hosts (frontend and API on different domains) without cross-site cookie pain | Need instant revocation → sessions or short JWT + refresh tokens |
| Tests | **Vitest + Supertest** against a real Postgres (Docker) | Jest | Native ESM, fast. Concurrency tests **must** hit a real DB, not mocks | — |
| Logging | **pino** + request id | winston, morgan | Structured JSON logs, cheap | Add tracing (OpenTelemetry) at scale |
| Hosting | Frontend: **Netlify/Vercel** · API: **Render free** · DB: **Neon free Postgres** | Railway, Fly, Koyeb, Supabase | All free. Render sleeps when idle — document cold starts | Paid always-on instance |
| API style | **REST** | GraphQL | Resources map cleanly (rides, pools, vehicles); state transitions are explicit action endpoints; easy to test with curl | Many client types with varied data needs |
| Real-time | **Polling every 5s** | WebSockets, SSE | MVP scale; zero extra infra; rubric bans adding complexity without reason | Driver live location / thousands of clients → WebSockets/SSE |

> Check current free-tier terms of each host when you deploy — they change.

## B2. Geography & matching rule
- **Zones:** Banani, Gulshan 1, Gulshan 2, Mohakhali, Farmgate, Dhanmondi, Mirpur, Uttara, Bashundhara (seeded in a `zones` table, with lat/long for display only).
- **Distance:** a seeded, symmetric **zone-to-zone distance table in meters** (not computed live) → the evaluator can hand-check fares.
  - Demo values: **Banani → Mohakhali = 2,500 m**, **Banani → Gulshan 1 = 3,000 m**
- **Adjacency:** a seeded, documented list of neighboring zones. Starting set:
  Banani–Gulshan 1, Banani–Gulshan 2, Banani–Mohakhali, Gulshan 1–Gulshan 2, Gulshan 1–Mohakhali, Gulshan 2–Bashundhara, Bashundhara–Uttara, Mohakhali–Farmgate, Farmgate–Dhanmondi, Farmgate–Mirpur.
- **Matching rule** — request R can join pool P only if ALL are true:
  1. P is in `MATCHED` status (not yet `DRIVER_ARRIVED`)
  2. P is shared (`is_shared = true`) and R allows pooling (`allow_pool = true`)
  3. **Same pickup zone** as the pool
  4. For **every** active member M of P: R's destination is the **same as or adjacent to** M's destination (pairwise, not just vs. the first member)
  5. `seats_taken + R.seats <= capacity`
- **Nusrat + Rafiq:** both pick up in Banani; Mohakhali and Gulshan 1 are adjacent → **compatible**.
- Implemented as a pure function `canJoin(pool, members, request)` → unit-tested in isolation.

## B3. Data model: Request vs Pool
- **`ride_request`** = one passenger's trip (their seats, pickup, destination, their fare, their status).
- **`pool`** = one vehicle trip that holds 1..N requests.
- **A solo ride is just a pool with one member.** One uniform model, no special cases.
- Pool membership = `ride_requests.pool_id` (FK). No separate join table needed because a request belongs to at most one pool.
- `pools.capacity` is **snapshotted** from the vehicle at creation → enables an intra-row `CHECK (seats_taken <= capacity)`.

## B4. Two lifecycles (our improvement on the suggested one)
The PRD shows one lifecycle, but in a pool **each passenger has their own status** (Nusrat can cancel while Rafiq still rides) and passengers **get dropped off at different places**. So we split it:

**Ride request (per passenger):**
```
REQUESTED ──► MATCHED ──► DRIVER_ARRIVED ──► STARTED ──► COMPLETED
    │            │               │
    ├─► EXPIRED  ├─► CANCELLED   ├─► CANCELLED (passenger cancel or driver marks no-show)
    │            └─► REQUESTED   └─► REQUESTED (driver cancelled the pool → re-queued)
    └─► CANCELLED
```

**Pool (per vehicle trip):**
```
MATCHED ──► DRIVER_ARRIVED ──► STARTED ──► COMPLETED
   │               │
   └─► CANCELLED ◄─┘   (driver cancels, or every member cancelled)
```

Rules:
- Transitions defined in **one table-driven module** (`allowedTransitions`). Anything else → `409 INVALID_TRANSITION`.
- Every transition writes a row to `ride_events` (from, to, actor, reason, time) → the "explain exactly what happened" requirement.
- **Joining is only allowed while the pool is `MATCHED`.** Once the driver marks arrival the pool is sealed (no mid-ride pickups).
- Driver "arrived" applies to the whole pool (everyone shares the pickup zone).
- Driver can **start** only with ≥1 active member.
- Driver **drops off each passenger individually** (request → `COMPLETED`). Pool auto-completes when no `STARTED` members remain.
- Request not matched within **10 minutes → `EXPIRED`**. Enforced lazily on read/write (no cron, no queue).

## B5. Who matches whom
Hybrid, no background workers:
1. **Auto-join on request:** when a passenger requests, the backend looks for a compatible `MATCHED` pool (oldest first) and joins it inside a transaction.
2. **Otherwise** the request stays `REQUESTED` and appears in the feed of online drivers **in the same pickup zone**.
3. **Driver accepts** a request → creates a new pool (or adds it to their current open pool if compatible).
- The pool's `is_shared` comes from the first request's `allow_pool`. Someone who wants a solo ride never gets strangers added.

## B6. Fare model (all integers, in paisa)
```
distanceUnits   = ceil(distance_m / 100)
distanceCharge  = distanceUnits × 200            # ৳2 per 100 m = ৳20/km
subtotal        = (BASE 3000 + distanceCharge) × seats
poolDiscount    = floor(subtotal × 20 / 100)     # only if pooled
finalFare       = subtotal − poolDiscount
```
**Hand check:**
| | Distance | Subtotal | Pool discount | Pooled fare | Solo fare |
|---|---|---|---|---|---|
| Nusrat (Banani → Mohakhali, 1 seat) | 2,500 m | 3000 + 5000 = 8000 | 1600 | **6400 = ৳64.00** | ৳80.00 |
| Rafiq (Banani → Gulshan 1, 1 seat) | 3,000 m | 3000 + 6000 = 9000 | 1800 | **7200 = ৳72.00** | ৳90.00 |

- **Estimate** at request time shows both solo and pooled price (we can't know yet if anyone will join).
- **Final fare is locked when the pool STARTS**: discount applies only if the pool has ≥2 distinct active requests at that moment. If Rafiq cancels before start, Nusrat pays solo price.
- Fare breakdown (base, distance, discount, final) stored on the request row for audit.
- **Money = integer paisa** (`INTEGER`): no floating-point rounding errors (`0.1 + 0.2`), exact equality in tests, sums are exact. Converted to ৳ only in the UI.
- Payment: **cash only**, recorded as `payment_method = 'CASH'` at completion. TeslaPay wallet = stretch goal.

## B7. Cancellation rules
| Who | Allowed when | Effect |
|---|---|---|
| Passenger | `REQUESTED`, `MATCHED`, `DRIVER_ARRIVED` | Request → `CANCELLED`, seats freed. No fee in MVP (documented limitation) |
| Passenger | `STARTED` or later | **Rejected** (409) |
| Driver cancels pool | before `STARTED` | Pool → `CANCELLED`; members go **back to `REQUESTED`** (passengers aren't punished for driver cancelling) |
| Driver marks no-show | `DRIVER_ARRIVED` | That request → `CANCELLED` (reason `NO_SHOW`) |
| Last member cancels | before `STARTED` | Pool → `CANCELLED` |

## B8. Concurrency strategy (the Nusrat vs Shirin race)
- Every seat change runs in **one DB transaction**:
  1. `SELECT … FROM pools WHERE id = $1 FOR UPDATE` → second request **waits** for the first
  2. Re-check `canJoin` with fresh data
  3. Update `seats_taken`, attach request
- **Driver accept race** (two drivers tap the same request): `UPDATE ride_requests SET status='MATCHED', pool_id=… WHERE id=$1 AND status='REQUESTED'` → if 0 rows updated, the other driver won → `409`.
- **Lock order is always pool → request** (prevents deadlocks).
- **Safety net:** DB `CHECK (seats_taken BETWEEN 0 AND capacity)` — even buggy code can't overbook.
- Loser of the race is **not** an error for the passenger: Shirin's request just stays `REQUESTED` for another driver.
- At scale: pessimistic per-pool locks are fine (contention is only 3 seats per pool); the real bottleneck becomes matching → partition matching by zone into dedicated workers/queues (bonus section).

## B9. Accounts, roles, privacy
- Login with **Bangladeshi phone number** (`^01[3-9]\d{8}$`) + password. No OTP (SMS costs money).
- **Passengers self-register. Drivers cannot** — driver + vehicle accounts are seeded (real onboarding needs verification). Matches the PRD, which only says "Sign in" for drivers.
- **One vehicle per driver**, fixed capacity (Bullet = 3).
- Seats per request: **1 to vehicle capacity** (max 3).
- **One active request per passenger** and **one active pool per vehicle** — enforced by **partial unique indexes** (also blocks double-submit duplicates).
- Driver can't go offline with an active pool. Driver sets their **current zone** when going online.
- **Privacy:** passengers see only "sharing with N other passenger(s)" — never co-riders' names/phones. Driver sees names, seats, destinations of their own pool only.
- Accessing someone else's ride → **404** (not 403, so we don't leak that it exists).

## B10. API conventions
- Error shape: `{ "error": { "code": "POOL_FULL", "message": "...", "details": {} } }`
- Codes: 400 validation · 401 unauthenticated · 403 wrong role · 404 not found/not yours · 409 invalid transition / capacity / race lost
- Timestamps stored as `timestamptz` (UTC), shown in Asia/Dhaka.
- Security basics: helmet, CORS allowlist, rate limit on auth routes, bcrypt, JWT expiry 1 day, zod on every input, secrets only via env.

## B11. Out of scope (documented as "next improvements")
Real maps/routing, live driver location, ratings, TeslaPay wallet, cancellation fees, surge pricing, OTP login, driver onboarding, push notifications, admin panel.
