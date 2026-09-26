# Dhaka Tesla Pool — Database (ERD)

![ERD](teslaERD.svg)

```mermaid
erDiagram
    USERS ||--o| VEHICLES : "1:1 drives"
    USERS ||--o{ RIDE_REQUESTS : "1:M books"
    USERS |o--o{ RIDE_EVENTS : "1:M acts in"

    VEHICLES ||--o{ POOLS : "1:M runs"
    POOLS |o--o{ RIDE_REQUESTS : "1:M contains"
    POOLS |o--o{ RIDE_EVENTS : "1:M logs"
    RIDE_REQUESTS |o--o{ RIDE_EVENTS : "1:M logs"

    ZONES ||--o{ RIDE_REQUESTS : "1:M pickup"
    ZONES ||--o{ RIDE_REQUESTS : "1:M destination"
    ZONES ||--o{ POOLS : "1:M pickup"
    ZONES |o--o{ VEHICLES : "1:M current zone"
    ZONES ||--o{ ZONE_ADJACENCY : "1:M neighbor of"
    ZONES ||--o{ ZONE_DISTANCES : "1:M distance from"

    USERS {
        uuid id PK
        text name
        text phone UK "BD format 01XXXXXXXXX"
        text password_hash "bcrypt"
        user_role role "PASSENGER or DRIVER"
        timestamptz created_at
    }

    VEHICLES {
        uuid id PK
        uuid driver_id FK, UK "one vehicle per driver"
        text name "Bullet"
        text plate UK
        int capacity "CHECK 1 to 6"
        boolean is_online
        int current_zone_id FK "set when going online"
        timestamptz created_at
    }

    ZONES {
        int id PK
        text name UK "Banani, Gulshan 1, Mohakhali"
        numeric lat "display only"
        numeric lng "display only"
    }

    ZONE_ADJACENCY {
        int zone_a_id PK, FK "CHECK a less than b"
        int zone_b_id PK, FK
    }

    ZONE_DISTANCES {
        int zone_a_id PK, FK "CHECK a less than b"
        int zone_b_id PK, FK
        int distance_m "CHECK greater than 0"
    }

    POOLS {
        uuid id PK
        uuid vehicle_id FK
        int pickup_zone_id FK
        pool_status status
        boolean is_shared "from first request allow_pool"
        int capacity "snapshot of vehicle capacity"
        int seats_taken "CHECK 0 to capacity"
        timestamptz created_at
    }

    RIDE_REQUESTS {
        uuid id PK
        uuid passenger_id FK
        uuid pool_id FK "null until matched"
        int pickup_zone_id FK
        int dest_zone_id FK "CHECK not equal pickup"
        int seats "CHECK at least 1"
        boolean allow_pool
        request_status status
        int distance_m "copied at booking"
        int est_solo_fare "paisa"
        int est_pooled_fare "paisa"
        int base_fare "paisa, set at START"
        int distance_charge "paisa, set at START"
        int pool_discount "paisa, set at START"
        int final_fare "paisa, set at START"
        payment_method payment_method "CASH only in MVP"
        cancel_reason cancel_reason "PASSENGER or NO_SHOW"
        timestamptz requested_at "reset on re-queue, drives expiry"
        timestamptz created_at
    }

    RIDE_EVENTS {
        bigint id PK
        uuid ride_request_id FK "nullable"
        uuid pool_id FK "nullable"
        text from_status "null on creation"
        text to_status
        uuid actor_user_id FK "null means SYSTEM"
        text reason
        timestamptz created_at
    }
```

**Reading the lines:** `||` = exactly one, `o{` = zero or many (M), `|o` / `o|` = zero or one. So `USERS ||--o{ RIDE_REQUESTS` reads "one user books many ride requests".

## Enums
| Enum | Values |
|---|---|
| `user_role` | PASSENGER, DRIVER |
| `request_status` | REQUESTED, MATCHED, DRIVER_ARRIVED, STARTED, COMPLETED, CANCELLED, EXPIRED |
| `pool_status` | MATCHED, DRIVER_ARRIVED, STARTED, COMPLETED, CANCELLED |
| `payment_method` | CASH (TESLAPAY is a stretch goal) |
| `cancel_reason` | PASSENGER, NO_SHOW |

## Constraints Mermaid can't show (added by hand in the migration SQL)
```sql
-- capacity can never be exceeded, even by buggy code
ALTER TABLE pools ADD CONSTRAINT pools_seats_within_capacity
  CHECK (seats_taken >= 0 AND seats_taken <= capacity);

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
