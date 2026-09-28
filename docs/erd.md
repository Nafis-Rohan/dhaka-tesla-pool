# Dhaka Tesla Pool — Database (ERD)

![ERD](teslaERD.svg)

## Mermaid — AI-generated, for a more readable view

```mermaid
erDiagram
    USERS ||--o| VEHICLES : "drives (driver_id FK, one Tesla per driver)"
    USERS ||--o{ RIDE_REQUESTS : "books (passenger_id FK)"
    USERS |o--o{ RIDE_EVENTS : "acted as (actor_user_id FK, nullable)"

    VEHICLES ||--o{ POOLS : "runs (vehicle_id FK)"
    VEHICLES }o--|| ZONES : "currently parked in (current_zone_id FK, nullable)"

    POOLS |o--o{ RIDE_REQUESTS : "holds (pool_id FK, nullable)"
    POOLS |o--o{ RIDE_EVENTS : "logs (pool_id FK, nullable)"
    POOLS }o--|| ZONES : "picks up in (pickup_zone_id FK)"

    RIDE_REQUESTS |o--o{ RIDE_EVENTS : "logs (ride_request_id FK, nullable)"
    RIDE_REQUESTS }o--|| ZONES : "picks up in (pickup_zone_id FK)"
    RIDE_REQUESTS }o--|| ZONES : "drops off in (dest_zone_id FK)"

    ZONES ||--o{ ZONE_ADJACENCY : "zone A side of pair (zone_a_id FK)"
    ZONES ||--o{ ZONE_ADJACENCY : "zone B side of pair (zone_b_id FK)"
    ZONES ||--o{ ZONE_DISTANCES : "zone A side of pair (zone_a_id FK)"
    ZONES ||--o{ ZONE_DISTANCES : "zone B side of pair (zone_b_id FK)"

    USERS {
        uuid id PK
        text name "e.g. Jashim, Nusrat"
        text phone UK "BD format, e.g. 017XXXXXXXX"
        text password_hash "bcrypt hash, never plain text"
        user_role role "PASSENGER or DRIVER"
        timestamptz created_at
    }

    VEHICLES {
        uuid id PK
        uuid driver_id FK,UK "one vehicle per driver"
        text name "e.g. Bullet"
        text plate
        int capacity "1-3, e.g. 3 for Bullet"
        bool is_online
        uuid current_zone_id FK "nullable, set when driver goes online"
    }

    ZONES {
        uuid id PK
        text name UK "Banani, Gulshan 1, Mohakhali"
        numeric lat "for display only, not routing"
        numeric lng "for display only, not routing"
    }

    ZONE_ADJACENCY {
        uuid zone_a_id PK,FK "composite PK, zone_a_id < zone_b_id"
        uuid zone_b_id PK,FK "composite PK, zone_a_id < zone_b_id"
    }

    ZONE_DISTANCES {
        uuid zone_a_id PK,FK "composite PK, zone_a_id < zone_b_id"
        uuid zone_b_id PK,FK "composite PK, zone_a_id < zone_b_id"
        int distance_m "e.g. Banani-Mohakhali = 2500"
    }

    POOLS {
        uuid id PK
        uuid vehicle_id FK
        uuid pickup_zone_id FK
        pool_status status "MATCHED, DRIVER_ARRIVED, STARTED, COMPLETED, CANCELLED"
        bool is_shared "copied from the first request's allow_pool"
        int capacity "snapshotted from the vehicle at creation"
        int seats_taken "CHECK 0 <= seats_taken <= capacity"
        timestamptz arrived_at "nullable"
        timestamptz started_at "nullable"
        timestamptz completed_at "nullable"
        timestamptz cancelled_at "nullable"
        timestamptz created_at
    }

    RIDE_REQUESTS {
        uuid id PK
        uuid passenger_id FK
        uuid pool_id FK "nullable, at most one pool at a time"
        uuid pickup_zone_id FK
        uuid dest_zone_id FK
        int seats "1..vehicle capacity"
        bool allow_pool
        request_status status "REQUESTED..COMPLETED/CANCELLED/EXPIRED"
        int base_fare "paisa, e.g. 3000"
        int distance_charge "paisa"
        int pool_discount "paisa, 20% if pooled"
        int final_fare "paisa, locked when the pool starts"
        int est_solo_fare "paisa, shown at request time"
        int est_pooled_fare "paisa, shown at request time"
        payment_method payment_method "nullable, CASH only in the MVP, set at completion"
        cancel_reason cancel_reason "nullable"
        uuid cancelled_by "nullable, actor user id"
        timestamptz requested_at "resets on re-queue, drives the 10 minute expiry"
        timestamptz created_at
    }

    RIDE_EVENTS {
        uuid id PK
        uuid ride_request_id FK "nullable, request-level event"
        uuid pool_id FK "nullable, pool-level event"
        text from_status "e.g. MATCHED"
        text to_status "e.g. DRIVER_ARRIVED"
        uuid actor_user_id FK "who caused the transition"
        text reason "nullable, e.g. NO_SHOW"
        timestamptz created_at
    }
```

## Enums
| Enum | Values |
|---|---|
| `user_role` | PASSENGER, DRIVER |
| `request_status` | REQUESTED, MATCHED, DRIVER_ARRIVED, STARTED, COMPLETED, CANCELLED, EXPIRED |
| `pool_status` | MATCHED, DRIVER_ARRIVED, STARTED, COMPLETED, CANCELLED |
| `payment_method` | CASH (TESLAPAY is a stretch goal) |
| `cancel_reason` | PASSENGER, NO_SHOW |

## Constraints and indexes (added by hand in the migration SQL)
```sql
-- capacity can never be exceeded, even by buggy code
ALTER TABLE pools ADD CONSTRAINT pools_seats_within_capacity
  CHECK (seats_taken >= 0 AND seats_taken <= capacity);

-- a Tesla has between 1 and 3 seats (assumption: Bullet has 3, so 3 is the max)
ALTER TABLE vehicles ADD CONSTRAINT vehicles_capacity_range
  CHECK (capacity BETWEEN 1 AND 3);

-- one active ride per passenger (also blocks double-submit)
CREATE UNIQUE INDEX one_active_request_per_passenger
  ON ride_requests (passenger_id)
  WHERE status IN ('REQUESTED','MATCHED','DRIVER_ARRIVED','STARTED');

-- one active pool per vehicle
CREATE UNIQUE INDEX one_active_pool_per_vehicle
  ON pools (vehicle_id)
  WHERE status IN ('MATCHED','DRIVER_ARRIVED','STARTED');

ALTER TABLE ride_requests ADD CONSTRAINT pickup_differs_from_dest
  CHECK (pickup_zone_id <> dest_zone_id);
ALTER TABLE ride_requests ADD CONSTRAINT seats_positive CHECK (seats >= 1);
ALTER TABLE ride_requests ADD CONSTRAINT fares_non_negative CHECK (
  coalesce(final_fare,0) >= 0 AND coalesce(pool_discount,0) >= 0);
ALTER TABLE zone_adjacency ADD CONSTRAINT adjacency_ordered CHECK (zone_a_id < zone_b_id);
ALTER TABLE zone_distances ADD CONSTRAINT distances_ordered CHECK (zone_a_id < zone_b_id);

-- indexes for the hot queries
CREATE INDEX ride_requests_feed    ON ride_requests (status, pickup_zone_id); -- driver feed
CREATE INDEX ride_requests_pool    ON ride_requests (pool_id);               -- pool members
CREATE INDEX ride_requests_history ON ride_requests (passenger_id, created_at DESC);
CREATE INDEX pools_open            ON pools (status, pickup_zone_id);        -- auto-join lookup
CREATE INDEX ride_events_request   ON ride_events (ride_request_id);
CREATE INDEX ride_events_pool      ON ride_events (pool_id);
```

## Why each table exists
| Table | Why |
|---|---|
| `users` | One table for both roles. Passengers and drivers share login, and a role column keeps auth simple. |
| `vehicles` | Capacity belongs to the vehicle, not the driver. `UNIQUE(driver_id)` enforces one Tesla per driver for the MVP. |
| `zones` | Predefined Dhaka areas instead of a map API (PRD §4). |
| `zone_adjacency` | The matching rule's data. Stored with `a < b` so each pair exists once. |
| `zone_distances` | Fixed distances so fares are hand-checkable. Not computed live. |
| `pools` | One vehicle trip. A solo ride is a pool with one member. `capacity` is **snapshotted** so the CHECK constraint works inside one row. |
| `ride_requests` | One passenger's trip, status, and fare. `pool_id` is the pool membership (a request is in at most one pool, so no join table). |
| `ride_events` | Append-only audit trail: "explain exactly what happened, in case anyone asks later" (PRD §2). |

## Key design choices
- **Money in integer paisa** (`int`): no float rounding, exact test equality. Max ≈ ৳21 million per value, far above any fare.
- **Fare breakdown stored on the row**, not recomputed: if the rates change later, old rides still show what was actually charged.
- **`seats_taken` is a stored counter, not `SUM(seats)`**: it can be locked and CHECK-constrained in one row. Trade-off: it must stay in sync with members, so it's only ever changed inside the same transaction that attaches or detaches a request.
- **UUID ids**: not guessable from the URL. Ownership is still checked (404 for other people's rides).
- **No per-status timestamps on `pools` / `ride_requests`**: `ride_events` already records when every status change happened, so we don't store the same fact twice.
- **`requested_at` resets on re-queue**, so a passenger bounced by a driver cancel doesn't instantly expire.

See [fare-and-matching.md](fare-and-matching.md) for the fare formula and [lifecycle.md](lifecycle.md) for the status flows.
