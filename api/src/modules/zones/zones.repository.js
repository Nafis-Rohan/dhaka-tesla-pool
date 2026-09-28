import { prisma } from '../../lib/prisma.js';

export function listZones() {
  return prisma.zone.findMany({ orderBy: { name: 'asc' } });
}

// zone_distances stores each pair once, smaller id first, so put the ids in that order before looking up
export function findDistance(zoneIdA, zoneIdB) {
  const [zoneAId, zoneBId] = zoneIdA < zoneIdB ? [zoneIdA, zoneIdB] : [zoneIdB, zoneIdA];
  return prisma.zoneDistance.findUnique({ where: { zoneAId_zoneBId: { zoneAId, zoneBId } } });
}
