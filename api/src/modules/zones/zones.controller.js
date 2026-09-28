import * as zonesService from './zones.service.js';

export async function list(req, res) {
  const zones = await zonesService.listZones();
  res.json({ zones });
}
