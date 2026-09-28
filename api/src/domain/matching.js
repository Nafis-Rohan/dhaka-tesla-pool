function adjacencyKey(zoneA, zoneB) {
  return [zoneA, zoneB].sort().join(':');
}

export function buildAdjacency(pairs) {
  return new Set(pairs.map(([a, b]) => adjacencyKey(a, b)));
}

// A zone counts as compatible with itself: same destination is the best match
function isSameOrAdjacent(zoneA, zoneB, adjacency) {
  return zoneA === zoneB || adjacency.has(adjacencyKey(zoneA, zoneB));
}

export function canJoin(pool, members, request, adjacency) {
  // 1. Only before the driver arrives. Once arrived the pool is sealed (no mid-ride pickups).
  if (pool.status !== 'MATCHED') return { ok: false, reason: 'POOL_NOT_OPEN' };

  // 2. Both sides must agree to share
  if (!pool.isShared) return { ok: false, reason: 'POOL_NOT_SHARED' };
  if (!request.allowPool) return { ok: false, reason: 'PASSENGER_OPTED_OUT' };

  // 3. Same pickup zone (the driver makes one stop)
  if (request.pickupZoneId !== pool.pickupZoneId) return { ok: false, reason: 'PICKUP_MISMATCH' };

  // 4. Destination must be the same as or next to EVERY member's, not just the first
  //    (otherwise A -> B -> C could chain together passengers who aren't near each other)
  const fitsEveryone = members.every((member) =>
    isSameOrAdjacent(request.destZoneId, member.destZoneId, adjacency),
  );
  if (!fitsEveryone) return { ok: false, reason: 'DESTINATION_INCOMPATIBLE' };

  // 5. Capacity: the service re-checks this under a row lock, and the database CHECK is the last guard
  if (pool.seatsTaken + request.seats > pool.capacity) return { ok: false, reason: 'POOL_FULL' };

  return { ok: true };
}
