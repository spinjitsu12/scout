import { FIELD_LOCATIONS } from './expedition.ts';
import type { Tier } from './game';

export type WorldPoint = { x: number; z: number };
export type WorldCollision = { id: string; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; kind: 'wall' | 'furniture' | 'tree' | 'building' | 'vehicle' };
export type WorldInteractionType = 'door' | 'exit' | 'candidate' | 'sources' | 'missions' | 'career' | 'team' | 'week' | 'laptop' | 'thought' | 'fuel' | 'home';
export type WorldInteractable = { id: string; type: WorldInteractionType; label: string; position: WorldPoint; range: number; locationId: number; detail?: string };
export type ImmersiveLocation = {
  id: number; name: string; subtitle: string; center: WorldPoint; door: WorldPoint; parking: WorldPoint;
  interiorSpawn: WorldPoint; footprint: { minX: number; maxX: number; minZ: number; maxZ: number };
  candidateSpawns: WorldPoint[]; pointsOfInterest: WorldInteractable[]; theme: string;
};
export const WORLD_SIZE = { width: 1536, depth: 1024 };
export const HOME_CENTER: WorldPoint = { x: 220, z: 480 };
export const HOME_SPAWN: WorldPoint = { x: 219, z: 482 };
export const HOME_CAR_SPAWN: WorldPoint = { x: 220, z: 510 };
export const WORLD_ROADS = [
  { x: 125, z: 530, width: 12, depth: 840 }, { x: 1400, z: 530, width: 12, depth: 840 },
  { x: 762.5, z: 110, width: 1287, depth: 12 }, { x: 762.5, z: 950, width: 1287, depth: 12 },
  { x: 500, z: 530, width: 12, depth: 840 }, { x: 1040, z: 530, width: 12, depth: 840 },
  { x: 762.5, z: 350, width: 1287, depth: 14 }, { x: 762.5, z: 650, width: 1287, depth: 14 },
  { x: 768, z: 530, width: 14, depth: 840 }, { x: 315, z: 525, width: 380, depth: 9 },
  { x: 1059, z: 480, width: 402, depth: 9 },
] as const;

/** The only geometry contract used by gameplay, renderer and collision tests. All dimensions are metres. */
export function getImmersiveLocations(tier: Tier): ImmersiveLocation[] {
  const themes = tier === 0 ? ['studio', 'workshop', 'gallery', 'cafe'] : tier === 1 ? ['institute', 'archive', 'observatory', 'pavilion'] : ['headquarters', 'signal', 'station', 'market'];
  const locations = FIELD_LOCATIONS[tier].map((location): ImmersiveLocation => {
    const north = location.id < 2, parking = { x: location.point.x, z: location.point.y };
    const center = location.id === 4 ? { x: 850, z: 595 } : { x: location.point.x, z: location.point.y + (north ? -63 : 63) };
    const width = location.id === 0 ? 60 : location.id === 4 ? 24 : 68, depth = location.id === 0 ? 42 : location.id === 4 ? 16 : 46;
    const door = { x: center.x, z: center.z + (north || location.id === 4 ? depth / 2 : -depth / 2) };
    const footprint = { minX: center.x - width / 2, maxX: center.x + width / 2, minZ: center.z - depth / 2, maxZ: center.z + depth / 2 };
    const candidateSpawns = Array.from({ length: 12 }, (_, slot) => ({ x: center.x - 23 + slot % 6 * 8.5, z: center.z + (slot < 6 ? -4 : 7) }));
    const make = (id: string, type: WorldInteractionType, label: string, px: number, pz: number, range = 2.8, detail?: string): WorldInteractable => ({ id, type, label, position: { x: px, z: pz }, range, locationId: location.id, detail });
    const pointsOfInterest = location.id === 4 ? [make('fuel', 'fuel', 'Refuel at the pump', parking.x, parking.z, 4)] : location.id === 0 ? [
      make('office-missions', 'missions', 'Read the assignments board', center.x + 14, center.z - 12),
      make('office-career', 'career', 'Review your career notebook', center.x - 14, center.z - 12),
      make('office-team', 'team', 'Check the team lounge', center.x + 17, center.z + 10, 3),
      make('office-week', 'week', 'Finish the scouting week', center.x - 15, center.z + 10),
    ] : [
      make(`venue-${location.id}-sources`, 'sources', `Ask about the ${location.name} community`, center.x + 24, center.z - 13, 3),
      make(`venue-${location.id}-notice`, 'thought', 'Read the local noticeboard', center.x - 24, center.z + 14, 2.5, location.id === 1 ? 'The best discoveries begin with listening. Members share their projects here; walk around and get to know them.' : location.id === 2 ? 'Take your time with the exhibits. A portfolio tells you what someone makes; a conversation tells you why.' : 'People return here for the quiet corners, the conversations, and the familiar faces. Take a little time before asking for an introduction.'),
    ];
    return { id: location.id, name: location.name, subtitle: location.subtitle, center, door, parking, interiorSpawn: { x: door.x, z: door.z + (north || location.id === 4 ? -3 : 3) }, footprint, candidateSpawns, pointsOfInterest, theme: themes[location.id] ?? 'fuel' };
  });
  locations.push({
    id: 5, name: 'Home', subtitle: 'Your apartment', center: { ...HOME_CENTER }, door: { x: 220, z: 488.5 }, parking: { ...HOME_CAR_SPAWN }, interiorSpawn: { x: 220, z: 485.8 },
    footprint: { minX: 210, maxX: 230, minZ: 471.5, maxZ: 488.5 }, candidateSpawns: [], theme: 'home',
    pointsOfInterest: [
      { id: 'home-laptop', type: 'laptop', label: 'Sit at your laptop', position: { x: 225.8, z: 476.2 }, range: 1.6, locationId: 5 },
      { id: 'home-rest', type: 'week', label: 'Wind down for the week', position: { x: 212.4, z: 480.8 }, range: 2, locationId: 5 },
      { id: 'home-window', type: 'thought', label: 'Take a moment by the window', position: { x: 228.8, z: 483.2 }, range: 1.7, locationId: 5, detail: 'The town is in no rush. Neither are you. One thoughtful conversation can be worth an entire day of chasing leads.' },
    ],
  });
  return locations;
}
export function candidateAnchor(tier: Tier, id: string): WorldPoint {
  const index = Math.max(0, Number(id.split('-')[1]) || 0), location = getImmersiveLocations(tier)[index % 3 + 1];
  return { ...location.candidateSpawns[Math.floor(index / 3) % 12] };
}
export function publicInteriorContains(tier: Tier, locationId: number, point: WorldPoint, margin = 0): boolean {
  const location = getImmersiveLocations(tier).find(item => item.id === locationId); if (!location) return false;
  const b = location.footprint;
  return point.x >= b.minX + margin && point.x <= b.maxX - margin && point.z >= b.minZ + margin && point.z <= b.maxZ - margin;
}
