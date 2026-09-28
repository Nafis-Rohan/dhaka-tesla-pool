import * as authService from './auth.service.js';

// Controllers only translate HTTP <-> service calls. No business rules here.
// Express 5 forwards errors from async handlers to the error middleware automatically.
export async function register(req, res) {
  const result = await authService.register(req.body);
  res.status(201).json(result);
}

export async function login(req, res) {
  const result = await authService.login(req.body);
  res.json(result);
}
