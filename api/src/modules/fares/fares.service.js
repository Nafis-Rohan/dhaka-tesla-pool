import { estimate } from '../../domain/fare.js';
import { getDistanceM } from '../zones/zones.service.js';

// What the request form shows before booking. Both prices, because we can't know yet
// whether anyone will join (the discount is decided when the trip starts).
// All amounts are integer paisa; the UI converts to taka.
export async function estimateFare({ pickupZoneId, destZoneId, seats }) {
  const distanceM = await getDistanceM(pickupZoneId, destZoneId);
  return { distanceM, ...estimate({ distanceM, seats }) };
}
