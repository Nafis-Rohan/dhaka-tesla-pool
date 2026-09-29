import * as poolsService from './pools.service.js';

// req.user.id is the driver from the verified token. A driver only ever reaches THEIR OWN pool:
// the service finds it through their vehicle, so no pool id is taken from the URL.

// 200 with { pool: null } when there is no active trip: an empty state, not an error
export async function current(req, res) {
  const pool = await poolsService.getCurrentPool(req.user.id);
  res.json({ pool });
}

export async function arrive(req, res) {
  res.json({ pool: await poolsService.arrive(req.user.id) });
}

export async function start(req, res) {
  res.json({ pool: await poolsService.start(req.user.id) });
}

export async function cancel(req, res) {
  res.json({ pool: await poolsService.cancelTrip(req.user.id) });
}

export async function dropOff(req, res) {
  res.json({ pool: await poolsService.dropOff(req.user.id, req.valid.params.id) });
}

export async function noShow(req, res) {
  res.json({ pool: await poolsService.markNoShow(req.user.id, req.valid.params.id) });
}
