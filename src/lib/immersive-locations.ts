import { FIELD_LOCATIONS } from './expedition.ts';
import type { Tier } from './game';
import { REGIONAL_VENUE_ANCHORS } from './regional-roads.ts';
export * from './regional-roads.ts';

export type WorldPoint = { x: number; z: number };
export type WorldCollision = { id: string; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; kind: 'wall' | 'furniture' | 'tree' | 'building' | 'vehicle' };
export type WorldInteractionType = 'door' | 'exit' | 'candidate' | 'sources' | 'missions' | 'career' | 'team' | 'week' | 'laptop' | 'thought' | 'fuel' | 'home';
export type WorldInteractable = { id: string; type: WorldInteractionType; label: string; position: WorldPoint; range: number; locationId: number; detail?: string };
export type ImmersiveLocation = {
  id: number; name: string; subtitle: string; center: WorldPoint; door: WorldPoint; parking: WorldPoint; access: WorldPoint; regionId: string;
  interiorSpawn: WorldPoint; footprint: { minX: number; maxX: number; minZ: number; maxZ: number };
  candidateSpawns: WorldPoint[]; pointsOfInterest: WorldInteractable[]; theme: string;
};
export const HOME_CENTER: WorldPoint = { x: 220, z: 480 };
export const HOME_SPAWN: WorldPoint = { x: 219, z: 482 };
export const HOME_CAR_SPAWN: WorldPoint = { x: 220, z: 510 };
/** Literal schema-1 anchors avoid a module-initialization cycle with expedition. */
export const LEGACY_LOCATION_PARKINGS: Record<Tier, Record<number, WorldPoint>> = {
  0: { 0: { x: 387, z: 266 }, 1: { x: 1159, z: 266 }, 2: { x: 388, z: 718 }, 3: { x: 1138, z: 718 }, 4: { x: 840, z: 620 } },
  1: { 0: { x: 375, z: 275 }, 1: { x: 1170, z: 275 }, 2: { x: 375, z: 752 }, 3: { x: 1170, z: 752 }, 4: { x: 840, z: 620 } },
  2: { 0: { x: 383, z: 266 }, 1: { x: 1167, z: 266 }, 2: { x: 384, z: 702 }, 3: { x: 1185, z: 702 }, 4: { x: 840, z: 620 } },
};
export const roadAnchorForLocation = (location: ImmersiveLocation): WorldPoint => ({ ...location.access });

/** The only geometry contract used by gameplay, renderer and collision tests. All dimensions are metres. */
export function getImmersiveLocations(tier: Tier): ImmersiveLocation[] {
  const themes = tier === 0 ? ['studio', 'workshop', 'gallery', 'cafe'] : tier === 1 ? ['institute', 'archive', 'observatory', 'pavilion'] : ['headquarters', 'signal', 'station', 'market'];
  const locations = FIELD_LOCATIONS[tier].map((location): ImmersiveLocation => {
    const anchor = location.id >= 1 && location.id <= 3 ? REGIONAL_VENUE_ANCHORS[location.id as 1 | 2 | 3] : undefined;
    const north = location.id < 2, parking = anchor ? { ...anchor.parking } : { x: location.point.x, z: location.point.y };
    const center = location.id === 4 ? { x: 850, z: 595 } : { x: parking.x, z: parking.z + (north ? -63 : 63) };
    const access = anchor ? { ...anchor.access } : location.id === 4 ? { x: parking.x, z: 650 } : { x: 500, z: parking.z };
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
    return { id: location.id, name: location.name, subtitle: anchor ? `${anchor.regionId === 'eastmere' ? 'Eastmere Campus' : anchor.regionId === 'bellweather' ? 'Bellweather' : 'Aster Bay'} · ${location.subtitle}` : location.subtitle, center, door, parking, access, regionId: anchor?.regionId ?? 'cirrus', interiorSpawn: { x: door.x, z: door.z + (north || location.id === 4 ? -3 : 3) }, footprint, candidateSpawns, pointsOfInterest, theme: themes[location.id] ?? 'fuel' };
  });
  locations.push({
    id: 5, name: 'Home', subtitle: 'Your apartment', center: { ...HOME_CENTER }, door: { x: 220, z: 488.5 }, parking: { ...HOME_CAR_SPAWN }, access: { x: 220, z: 525 }, regionId: 'cirrus', interiorSpawn: { x: 220, z: 485.8 },
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
