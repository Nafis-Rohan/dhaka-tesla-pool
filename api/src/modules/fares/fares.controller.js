import * as faresService from './fares.service.js';

// POST because the answer is computed from a body, but nothing is created or saved
export async function estimate(req, res) {
  const result = await faresService.estimateFare(req.body);
  res.json(result);
}
