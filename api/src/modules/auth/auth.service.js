import bcrypt from 'bcryptjs';
import { AppError } from '../../lib/AppError.js';
import { signToken } from '../../lib/jwt.js';
import * as authRepository from './auth.repository.js';

const BCRYPT_ROUNDS = 10;

// Compared against when the phone doesn't exist, so "unknown phone" and "wrong password"
// take the same time and an attacker can't tell which phone numbers are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// Never send passwordHash to the client
function toPublicUser(user) {
  return { id: user.id, name: user.name, phone: user.phone, role: user.role };
}

function phoneTaken() {
  return new AppError('PHONE_TAKEN', 409, 'An account with this phone number already exists');
}

// Self-registration is passenger-only: the role is fixed here, never read from the request.
// Drivers are seeded (rules.md B9).
export async function register({ name, phone, password }) {
  if (await authRepository.findByPhone(phone)) throw phoneTaken();

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await authRepository.createUser({ name, phone, passwordHash, role: 'PASSENGER' });
    return { user: toPublicUser(user), token: signToken(user) };
  } catch (err) {
    // The check above can pass for two simultaneous sign-ups with the same phone;
    // the UNIQUE(phone) constraint is the real guard (Prisma code P2002 = unique violation).
    if (err.code === 'P2002') throw phoneTaken();
    throw err;
  }
}

// Works for both roles (Jashim the driver and passengers like Nusrat).
export async function login({ phone, password }) {
  const user = await authRepository.findByPhone(phone);

  // Always run bcrypt, even for an unknown phone (see DUMMY_HASH)
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // Same message for both failures on purpose: don't reveal which one it was
  if (!user || !passwordOk) {
    throw new AppError('INVALID_CREDENTIALS', 401, 'Incorrect phone number or password');
  }

  return { user: toPublicUser(user), token: signToken(user) };
}
