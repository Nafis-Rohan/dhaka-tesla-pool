import { AppError } from '../../lib/AppError.js';
import * as zonesRepository from './zones.repository.js';

// lat/lng are Decimals in the database; the client gets plain numbers (display only, never used for maths)
export async function listZones() {
  const zones = await zonesRepository.listZones();
  return zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    lat: Number(zone.lat),
    lng: Number(zone.lng),
  }));
}

// Distance in metres between two zones, from the seeded table (used for fares).
// Shared by the fare estimate now and by ride requests next.
export async function getDistanceM(pickupZoneId, destZoneId) {
  if (pickupZoneId === destZoneId) {
    throw new AppError('SAME_ZONE', 400, 'Pickup and destination must be different zones');
  }

  const row = await zonesRepository.findDistance(pickupZoneId, destZoneId);

  // Every pair of real zones is seeded, so a missing row means an unknown zone id
  if (!row) throw new AppError('ZONE_NOT_FOUND', 404, 'Unknown pickup or destination zone');

  return row.distanceM;
}
