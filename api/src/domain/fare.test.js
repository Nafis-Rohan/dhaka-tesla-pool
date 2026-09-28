import { describe, it, expect } from 'vitest';
import { calculateFare, estimate, qualifiesForPoolDiscount } from './fare.js';

// Distances come from the seeded zone table (rules.md B2)
const BANANI_TO_MOHAKHALI_M = 2500; // Nusrat
const BANANI_TO_GULSHAN_1_M = 3000; // Rafiq

describe('estimate: hand-checkable fares for the story cast', () => {
  it("Nusrat (Banani -> Mohakhali, 1 seat): solo ৳80.00, pooled ৳64.00", () => {
    // distance units = ceil(2500 / 100) = 25; distance charge = 25 x 200 = 5000
    // subtotal = 3000 + 5000 = 8000; discount = 20% of 8000 = 1600
    const fare = estimate({ distanceM: BANANI_TO_MOHAKHALI_M, seats: 1 });

    expect(fare.solo).toBe(8000);
    expect(fare.pooled).toBe(6400);
  });

  it("Rafiq (Banani -> Gulshan 1, 1 seat): solo ৳90.00, pooled ৳72.00", () => {
    // distance units = 30; distance charge = 6000; subtotal = 9000; discount = 1800
    const fare = estimate({ distanceM: BANANI_TO_GULSHAN_1_M, seats: 1 });

    expect(fare.solo).toBe(9000);
    expect(fare.pooled).toBe(7200);
  });

  it('each passenger gets an individual fare (Nusrat and Rafiq pay different amounts)', () => {
    const nusrat = estimate({ distanceM: BANANI_TO_MOHAKHALI_M, seats: 1 });
    const rafiq = estimate({ distanceM: BANANI_TO_GULSHAN_1_M, seats: 1 });

    expect(nusrat.pooled).not.toBe(rafiq.pooled);
  });
});

describe('calculateFare', () => {
  it('returns a breakdown that adds up: base + distance - discount = final', () => {
    const fare = calculateFare({ distanceM: BANANI_TO_MOHAKHALI_M, seats: 1, pooled: true });

    expect(fare).toEqual({ baseFare: 3000, distanceCharge: 5000, poolDiscount: 1600, finalFare: 6400 });
    expect(fare.baseFare + fare.distanceCharge - fare.poolDiscount).toBe(fare.finalFare);
  });

  it('charges per seat: 2 seats cost exactly double', () => {
    const one = calculateFare({ distanceM: BANANI_TO_MOHAKHALI_M, seats: 1, pooled: false });
    const two = calculateFare({ distanceM: BANANI_TO_MOHAKHALI_M, seats: 2, pooled: false });

    expect(two.finalFare).toBe(16000);
    expect(two.finalFare).toBe(one.finalFare * 2);
  });

  it('applies no discount when the ride is not pooled', () => {
    const fare = calculateFare({ distanceM: BANANI_TO_GULSHAN_1_M, seats: 1, pooled: false });

    expect(fare.poolDiscount).toBe(0);
  });

  it('rounds a started 100 m block up to a full block', () => {
    const exact = calculateFare({ distanceM: 2500, seats: 1, pooled: false });
    const oneMetreOver = calculateFare({ distanceM: 2501, seats: 1, pooled: false });

    expect(oneMetreOver.distanceCharge - exact.distanceCharge).toBe(200);
  });

  it.each([
    ['zero seats', { distanceM: 2500, seats: 0 }],
    ['negative distance', { distanceM: -100, seats: 1 }],
    ['zero distance', { distanceM: 0, seats: 1 }],
    ['fractional seats', { distanceM: 2500, seats: 1.5 }],
    ['missing distance', { seats: 1 }],
  ])('rejects invalid input: %s', (_label, input) => {
    expect(() => calculateFare({ ...input, pooled: false })).toThrow(RangeError);
  });
});

describe('qualifiesForPoolDiscount (checked when the pool starts)', () => {
  it('needs at least 2 active requests: if Rafiq cancels, Nusrat loses the discount', () => {
    expect(qualifiesForPoolDiscount(2)).toBe(true);
    expect(qualifiesForPoolDiscount(1)).toBe(false);
    expect(qualifiesForPoolDiscount(0)).toBe(false);
  });
});
