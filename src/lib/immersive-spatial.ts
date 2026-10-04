import type { WorldCollision } from './immersive-locations.ts';
import type { WorldPoint } from './immersive-runtime.ts';

/** Broad phase shared by walking and driving; large rectangles occupy every touched cell. */
export type WorldCollisionIndex = { cellSize: number; cells: Map<string, WorldCollision[]> };
export function createWorldCollisionIndex(solids: readonly WorldCollision[], cellSize = 96): WorldCollisionIndex {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('Collision cells must have a positive size.');
  const cells = new Map<string, WorldCollision[]>();
  for (const solid of solids) {
    if (![solid.minX, solid.maxX, solid.minZ, solid.maxZ].every(Number.isFinite)) continue;
    for (let x = Math.floor(solid.minX / cellSize); x <= Math.floor(solid.maxX / cellSize); x++) {
      for (let z = Math.floor(solid.minZ / cellSize); z <= Math.floor(solid.maxZ / cellSize); z++) {
        const key = `${x}:${z}`, bucket = cells.get(key);
        if (bucket) bucket.push(solid); else cells.set(key, [solid]);
      }
    }
  }
  return { cellSize, cells };
}
export function nearbyWorldCollisions(index: WorldCollisionIndex, point: WorldPoint, radius = 45, minY = .18, maxY = 1.3): WorldCollision[] {
  const result: WorldCollision[] = [], seen = new Set<WorldCollision>(), { cellSize, cells } = index;
  for (let x = Math.floor((point.x - radius) / cellSize); x <= Math.floor((point.x + radius) / cellSize); x++) {
    for (let z = Math.floor((point.z - radius) / cellSize); z <= Math.floor((point.z + radius) / cellSize); z++) {
      for (const solid of cells.get(`${x}:${z}`) ?? []) {
        if (seen.has(solid)) continue; seen.add(solid);
        if (solid.minY >= maxY || solid.maxY <= minY || solid.minX > point.x + radius || solid.maxX < point.x - radius || solid.minZ > point.z + radius || solid.maxZ < point.z - radius) continue;
        result.push(solid);
      }
    }
  }
  return result;
}
