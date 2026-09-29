import * as driverService from './driver.service.js';

// req.user.id is the driver from the verified token; the vehicle is found through it,
// so a driver can never act on someone else's Tesla.

export async function getAvailability(req, res) {
  res.json({ availability: await driverService.getAvailability(req.user.id) });
}

export async function setAvailability(req, res) {
  res.json({ availability: await driverService.setAvailability(req.user.id, req.body) });
}

export async function listRequests(req, res) {
  res.json(await driverService.listRequests(req.user.id)); // { seatsLeft, requests }
}

export async function accept(req, res) {
  res.json({ pool: await driverService.acceptRequest(req.user.id, req.valid.params.id) });
}

export async function history(req, res) {
  res.json({ pools: await driverService.getHistory(req.user.id) });
}
