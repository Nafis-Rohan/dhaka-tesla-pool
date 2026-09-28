import * as ridesService from './rides.service.js';

// req.user.id comes from the verified token, never from the body: a passenger can only book for themselves
export async function create(req, res) {
  const ride = await ridesService.createRide(req.user.id, req.body);
  res.status(201).json({ ride });
}

// req.valid.query / req.valid.params are the validated values set by the validate middleware
export async function list(req, res) {
  const rides = await ridesService.listRides(req.user.id, req.valid.query.scope);
  res.json({ rides });
}

export async function get(req, res) {
  const ride = await ridesService.getRide(req.user.id, req.valid.params.id);
  res.json({ ride });
}

export async function cancel(req, res) {
  const ride = await ridesService.cancelRide(req.user.id, req.valid.params.id);
  res.json({ ride });
}
