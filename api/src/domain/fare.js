export const BASE_FARE = 3000; // 30 per seat
export const RATE_PER_100M = 200; // 2 per 100 m = 20/km
export const POOL_DISCOUNT_PERCENT = 20;
export const MIN_POOL_MEMBERS_FOR_DISCOUNT = 2;

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}


// The pool discount rule, applied to the solo parts of a fare (base + distance).
// Used by calculateFare below AND when a trip starts, where the parts stored on the request are
// enough: no distance lookup is needed to lock the final fare.
export function settleFare({ baseFare, distanceCharge }, pooled) {
  const subtotal = baseFare + distanceCharge;
  const poolDiscount = pooled ? Math.floor((subtotal * POOL_DISCOUNT_PERCENT) / 100) : 0;

  return { poolDiscount, finalFare: subtotal - poolDiscount };
}

export function calculateFare({ distanceM, seats, pooled }) {
  assertPositiveInteger(distanceM, 'distanceM');
  assertPositiveInteger(seats, 'seats');

  const distanceUnits = Math.ceil(distanceM / 100); // a started 100 m block counts as a full one
  const baseFare = BASE_FARE * seats;
  const distanceCharge = distanceUnits * RATE_PER_100M * seats;

  return { baseFare, distanceCharge, ...settleFare({ baseFare, distanceCharge }, pooled) };
}

// Shown at request time: we can't know yet whether anyone will join, so show both prices.
export function estimate({ distanceM, seats }) {
  const solo = calculateFare({ distanceM, seats, pooled: false });
  const pooled = calculateFare({ distanceM, seats, pooled: true });

  return { solo: solo.finalFare, pooled: pooled.finalFare, breakdown: { solo, pooled } };
}


export function qualifiesForPoolDiscount(activeRequestCount) {
  return activeRequestCount >= MIN_POOL_MEMBERS_FOR_DISCOUNT;
}
