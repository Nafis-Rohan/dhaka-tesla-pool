import { prisma } from '../../lib/prisma.js';

export function findByPhone(phone) {
  return prisma.user.findUnique({ where: { phone } });
}

export function createUser({ name, phone, passwordHash, role }) {
  return prisma.user.create({ data: { name, phone, passwordHash, role } });
}
