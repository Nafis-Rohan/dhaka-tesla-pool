import { AppError } from '../../lib/AppError.js';
import { estimate } from '../../domain/fare.js';
import { assertRequestTransition } from '../../domain/transitions.js';
import { getDistanceM } from '../zones/zones.service.js';
import * as ridesRepository from './rides.repository.js';


export const REQUEST_EXPIRY_MS = 10 * 60 * 1000;

// What the passenger sees: their own ride and their own fare only. Co-riders are just a count,
// never names or phones (privacy, rules.md B9). Money is integer paisa; the UI converts to taka.
export function toPassengerView(request, coPassengerCount = 0) {
  return {
    id: request.id,
    status: request.status,
    pickup: { id: request.pickupZone.id, name: request.pickupZone.name },
    destination: { id: request.destZone.id, name: request.destZone.name },
    seats: request.seats,
    allowPool: request.allowPool,
    fare: {
      estimatedSolo: request.estSoloFare,
      estimatedPooled: request.estPooledFare,
      poolDiscount: request.poolDiscount, // null until the trip starts
      final: request.finalFare, // null until the trip starts
    },
    coPassengerCount,
    requestedAt: request.requestedAt,
    expiresAt:
      request.status === 'REQUESTED'
        ? new Date(request.requestedAt.getTime() + REQUEST_EXPIRY_MS)
        : null,
  };
}

export async function createRide(passengerId, { pickupZoneId, destZoneId, seats, allowPool }) {
  // Reference data that never changes mid-request, so it stays outside the transaction
  const distanceM = await getDistanceM(pickupZoneId, destZoneId);
  const fare = estimate({ distanceM, seats });

  try {
    return await ridesRepository.inTransaction(async (tx) => {
      // An old REQUESTED ride still counts as "active" for the one-active-ride-per-passenger index,
      // so expire it first or the passenger could never book again.
      const expiredId = await ridesRepository.expireStaleRequest(
        tx,
        passengerId,
        new Date(Date.now() - REQUEST_EXPIRY_MS),
      );
      if (expiredId) {
        assertRequestTransition('REQUESTED', 'EXPIRED');
        await ridesRepository.createEvent(tx, {
          rideRequestId: expiredId,
          fromStatus: 'REQUESTED',
          toStatus: 'EXPIRED',
          reason: 'NOT_MATCHED_IN_TIME',
        });
      }

      // Only the solo breakdown is stored now. Pool discount and final fare are decided when the trip starts.
      const request = await ridesRepository.createRequest(tx, {
        passengerId,
        pickupZoneId,
        destZoneId,
        seats,
        allowPool,
        baseFare: fare.breakdown.solo.baseFare,
        distanceCharge: fare.breakdown.solo.distanceCharge,
        estSoloFare: fare.solo,
        estPooledFare: fare.pooled,
      });

      // 'NONE' = the ride didn't exist before (from_status is NOT NULL)
      await ridesRepository.createEvent(tx, {
        rideRequestId: request.id,
        fromStatus: 'NONE',
        toStatus: 'REQUESTED',
        actorUserId: passengerId,
      });

      return toPassengerView(request, 0);
    });
  } catch (err) {
    // The partial unique index one_active_request_per_passenger is the real guard: it also stops
    // a double-clicked submit, which a "check first, then insert" would let through. P2002 = unique violation.
    if (err.code === 'P2002') {
      throw new AppError('ACTIVE_RIDE_EXISTS', 409, 'You already have an active ride');
    }
    throw err;
  }
}
