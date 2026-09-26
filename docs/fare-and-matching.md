# Matching Rule & Fare Model

## Geography

- No map APIs. The app uses a predefined list of Dhaka zones: Banani, Gulshan 1, Gulshan 2, Mohakhali, Farmgate, Dhanmondi, Mirpur, Uttara, Bashundhara.
- Distances come from a **seeded zone-to-zone table in metres**, not computed live, so fares can be checked by hand. Demo values:
  - Banani → Mohakhali = **2,500 m**
  - Banani → Gulshan 1 = **3,000 m**
- Neighbouring zones come from a seeded adjacency list:
  Banani–Gulshan 1, Banani–Gulshan 2, Banani–Mohakhali, Gulshan 1–Gulshan 2, Gulshan 1–Mohakhali, Gulshan 2–Bashundhara, Bashundhara–Uttara, Mohakhali–Farmgate, Farmgate–Dhanmondi, Farmgate–Mirpur.

## Matching rule

A request R can join pool P only if **all** of these are true:

1. P is `MATCHED` (the driver has not arrived yet).
2. P is shared and R allows pooling.
3. R has the **same pickup zone** as P.
4. For **every** active member M of P, R's destination is the **same as or adjacent to** M's destination (checked against each member, not just the first).
5. `seats_taken + R.seats <= capacity`.

**Nusrat + Rafiq:** both pick up in Banani. Mohakhali and Gulshan 1 are adjacent, so they are compatible and can share Bullet.

The rule is one pure function, `canJoin(pool, members, request)`, unit tested on its own.

### Who matches whom

1. **Auto-join on request:** the backend looks for a compatible `MATCHED` pool (oldest first) and joins it inside a transaction.
2. Otherwise the request stays `REQUESTED` and shows in the feed of online drivers in the same pickup zone.
3. A driver accepts a request, which creates a new pool (or adds it to their open pool if compatible).

A passenger who turns off "OK to share" never gets strangers added.

## Fare model

All amounts are integers in **paisa**.

```
distanceUnits  = ceil(distance_m / 100)
distanceCharge = distanceUnits × 200          (৳2 per 100 m = ৳20/km)
subtotal       = (BASE_FARE 3000 + distanceCharge) × seats
poolDiscount   = floor(subtotal × 20 / 100)   (only if pooled)
finalFare      = subtotal − poolDiscount
```

### Hand check (Nusrat and Rafiq, 1 seat each)

| | Distance | Subtotal | Pool discount | Pooled fare | Solo fare |
|---|---|---|---|---|---|
| Nusrat (Banani → Mohakhali) | 2,500 m | 3000 + 5000 = 8000 | 1600 | **6400 = ৳64.00** | ৳80.00 |
| Rafiq (Banani → Gulshan 1) | 3,000 m | 3000 + 6000 = 9000 | 1800 | **7200 = ৳72.00** | ৳90.00 |

### When the fare is decided

- The **estimate** at request time shows both solo and pooled prices, because we can't know yet if anyone will join.
- The **final fare is locked when the pool starts.** The discount applies only if the pool has at least 2 distinct active requests at that moment. If Rafiq cancels before start, Nusrat pays the solo price.
- The breakdown (base, distance, discount, final) is stored on the request row for audit.

### Why integer paisa

Decimals and floats can introduce rounding errors (`0.1 + 0.2 = 0.30000000000000004`). Integers make sums exact and tests can use exact equality. The UI converts to ৳ only for display.

### Payment

Cash only, recorded as `payment_method = 'CASH'` at completion. A simulated TeslaPay wallet is a stretch goal.
