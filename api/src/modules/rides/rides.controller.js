import * as ridesService from './rides.service.js';

// req.user.id comes from the verified token, never from the body: a passenger can only book for themselves
export async function create(req, res) {
  const ride = await ridesService.createRide(req.user.id, req.body);
  res.status(201).json({ ride });
}
