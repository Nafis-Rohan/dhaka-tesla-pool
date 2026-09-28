import { AppError } from '../lib/AppError.js';

// Names match the request_status / pool_status enums in the database
export const REQUEST_STATUS = Object.freeze({
  REQUESTED: 'REQUESTED',
  MATCHED: 'MATCHED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
});

export const POOL_STATUS = Object.freeze({
  MATCHED: 'MATCHED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

// One passenger's request. Back to REQUESTED = the driver cancelled the pool, so the passenger
// is re-queued. STARTED has no way to CANCELLED: a passenger can't cancel mid-ride.
const REQUEST_TRANSITIONS = {
  REQUESTED: ['MATCHED', 'CANCELLED', 'EXPIRED'],
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED', 'REQUESTED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED', 'REQUESTED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

// One vehicle trip
const POOL_TRANSITIONS = {
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

function makeAssert(label, table) {
  return function assertTransition(from, to) {
    // An unknown status has no entry, so it fails the same way as an illegal move
    if (!table[from]?.includes(to)) {
      throw new AppError('INVALID_TRANSITION', 409, `A ${label} cannot move from ${from} to ${to}`, {
        from,
        to,
      });
    }
  };
}

// Throws 409 INVALID_TRANSITION unless from -> to is allowed
export const assertRequestTransition = makeAssert('ride request', REQUEST_TRANSITIONS);
export const assertPoolTransition = makeAssert('pool', POOL_TRANSITIONS);
