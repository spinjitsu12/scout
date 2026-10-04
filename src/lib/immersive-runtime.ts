import type { Game, Tier } from './game';
import { getImmersiveLocations, HOME_CAR_SPAWN as HOME_PARKING, HOME_SPAWN, WORLD_SIZE } from './immersive-locations.ts';

export type WorldPoint = { x: number; z: number };
export type WorldRect = { minX: number; maxX: number; minZ: number; maxZ: number };
export type ImmersionTutorial = 'accelerate' | 'brake' | 'steer' | 'complete';
export type ImmersionSnapshot = {
  schema: 1 | 2; tier: Tier; interior: number | null;
  player: WorldPoint & { yaw: number; pitch: number };
  vehicle: WorldPoint & { heading: number; speed: number; steering: number; distance: number; fuel: number; gear: 'D' | 'R'; damage?: number; disabled?: boolean };
  mode: 'foot' | 'driving'; destination: number | null; parkedAt: number[];
  tutorial: ImmersionTutorial; thoughtsSeen: string[]; homeReviewed: boolean;
};
export const IMMERSION_BOUNDS: WorldRect = { minX: 8, maxX: WORLD_SIZE.width - 8, minZ: 8, maxZ: WORLD_SIZE.depth - 8 };
export const FOOT_RADIUS = .3;
export const FOOT_SPEED = 2.15;
export const LOCAL_WALK_LIMIT = 180;
export const DREAM_CAR_SPAWN = { x: 500, z: 870, heading: 0 };
export const HOME_CAR_SPAWN = { ...HOME_PARKING, heading: Math.PI };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const point = (value: unknown, schema: unknown) => record(value) && finite(value.x) && finite(value.z) && value.x >= 0 && value.x <= (schema === 1 ? 1536 : WORLD_SIZE.width) && value.z >= 0 && value.z <= (schema === 1 ? 1024 : WORLD_SIZE.depth);
export const normalizeHeading = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
export const worldDistance = (first: WorldPoint, second: WorldPoint) => Math.hypot(first.x - second.x, first.z - second.z);

export function validImmersion(value: unknown): value is ImmersionSnapshot {
  if (!record(value) || ![1,2].includes(value.schema as number) || ![0,1,2].includes(value.tier as number) || !['foot','driving'].includes(value.mode as string) || !point(value.player,value.schema) || !point(value.vehicle,value.schema) || !record(value.player) || !record(value.vehicle)) return false;
  const player = value.player, vehicle = value.vehicle;
  const id = (value: unknown) => value === null || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 5);
  return finite(player.yaw) && Math.abs(player.yaw) <= Math.PI + .001 && finite(player.pitch) && Math.abs(player.pitch) <= 1.4 &&
    finite(vehicle.heading) && Math.abs(vehicle.heading) <= Math.PI + .001 && finite(vehicle.speed) && Math.abs(vehicle.speed) <= 65 && finite(vehicle.steering) && Math.abs(vehicle.steering) <= 1 &&
    finite(vehicle.distance) && vehicle.distance >= 0 && vehicle.distance < 1e9 && finite(vehicle.fuel) && vehicle.fuel >= 0 && vehicle.fuel <= 12 && ['D','R'].includes(vehicle.gear as string) &&
    (vehicle.damage === undefined || (finite(vehicle.damage) && vehicle.damage >= 0 && vehicle.damage <= 1)) && (vehicle.disabled === undefined || typeof vehicle.disabled === 'boolean') &&
    id(value.interior) && id(value.destination) && Array.isArray(value.parkedAt) && value.parkedAt.length <= 6 && new Set(value.parkedAt).size === value.parkedAt.length && value.parkedAt.every(id => Number.isInteger(id) && id >= 0 && id <= 5) &&
    ['accelerate','brake','steer','complete'].includes(value.tutorial as string) && Array.isArray(value.thoughtsSeen) && value.thoughtsSeen.length <= 100 && value.thoughtsSeen.every(id => typeof id === 'string' && id.length <= 120) && typeof value.homeReviewed === 'boolean';
}
export function freshImmersion(game: Game): ImmersionSnapshot {
  const waking = game.story?.phase === 'wake', dream = game.story && !['wake','complete'].includes(game.story.phase);
  const headquarters = getImmersiveLocations(game.tier)[0];
  const parking = dream ? DREAM_CAR_SPAWN : waking ? HOME_CAR_SPAWN : { ...headquarters.parking, heading: Math.PI };
  return {
    schema:2, tier:game.tier, interior:dream ? null : waking ? 5 : 0,
    player:dream ? { x:parking.x, z:parking.z, yaw:0, pitch:0 } : waking ? { ...HOME_SPAWN, yaw:-Math.PI/2, pitch:0 } : { ...headquarters.interiorSpawn, yaw:0, pitch:0 },
    vehicle:{ ...parking, speed:0, steering:0, distance:0, fuel:game.field?.fuel ?? 12, gear:'D', damage:0, disabled:false }, mode:dream ? 'driving' : 'foot', destination:dream ? 1 : waking ? 0 : null,
    parkedAt:dream ? [] : waking ? [5] : [0], tutorial:dream || waking ? 'accelerate' : 'complete', thoughtsSeen:[], homeReviewed:!waking,
  };
}
/** Move existing 3.0 careers to relocated venues once; retain their progress and vehicle condition. */
export function migrateImmersion(stored: ImmersionSnapshot): ImmersionSnapshot {
  const state = structuredClone(stored);
  state.vehicle.damage ??= 0; state.vehicle.disabled = state.vehicle.damage >= .86;
  if (state.schema === 2) return state;
  const legacy = [
    [{x:1159,z:266},{x:388,z:718},{x:1138,z:718}],
    [{x:1170,z:275},{x:375,z:752},{x:1170,z:752}],
    [{x:1167,z:266},{x:384,z:702},{x:1185,z:702}],
  ][state.tier], locations = getImmersiveLocations(state.tier);
  const parked = legacy.findIndex(point => worldDistance(state.vehicle,point) < 90);
  if (parked >= 0) {
    const next = locations[parked+1].parking, previous = legacy[parked], dx = next.x-previous.x, dz = next.z-previous.z;
    const playerNearby = worldDistance(state.player,state.vehicle) < LOCAL_WALK_LIMIT || state.interior === parked+1;
    state.vehicle.x += dx; state.vehicle.z += dz;
    if (playerNearby) { state.player.x += dx; state.player.z += dz; }
  } else if (state.interior !== null && state.interior >= 1 && state.interior <= 3) {
    const previous = legacy[state.interior-1], next = locations[state.interior].parking;
    state.player.x += next.x-previous.x; state.player.z += next.z-previous.z;
  }
  state.schema = 2;
  return state;
}
export function immersionOf(game: Game): ImmersionSnapshot {
  const stored = (game as Game & { immersion?: ImmersionSnapshot }).immersion;
  return stored && validImmersion(stored) && stored.tier === game.tier ? migrateImmersion(stored) : freshImmersion(game);
}
/** Shared visible wall/furniture rectangles are the only static foot blockers. */
export function walkable(point: WorldPoint, solids: readonly WorldRect[], radius = FOOT_RADIUS): boolean {
  if (point.x-radius < IMMERSION_BOUNDS.minX || point.x+radius > IMMERSION_BOUNDS.maxX || point.z-radius < IMMERSION_BOUNDS.minZ || point.z+radius > IMMERSION_BOUNDS.maxZ) return false;
  return !solids.some(solid => point.x > solid.minX-radius && point.x < solid.maxX+radius && point.z > solid.minZ-radius && point.z < solid.maxZ+radius);
}
export function moveWalker(position: WorldPoint, displacement: WorldPoint, solids: readonly WorldRect[]): WorldPoint {
  const steps = Math.max(1, Math.ceil(Math.hypot(displacement.x,displacement.z)/.12)), delta = {x:displacement.x/steps,z:displacement.z/steps}, result = {...position};
  for(let index=0;index<steps;index++) {
    const both = {x:result.x+delta.x,z:result.z+delta.z};
    if(walkable(both,solids)) { result.x=both.x;result.z=both.z;continue; }
    const x = {x:result.x+delta.x,z:result.z}; if(walkable(x,solids)) result.x=x.x;
    const z = {x:result.x,z:result.z+delta.z}; if(walkable(z,solids)) result.z=z.z;
  }
  return result;
}
/** Right-click is a local route, never a replacement for a driving trip. */
export function findLocalWalkPath(start:WorldPoint,destination:WorldPoint,solids:readonly WorldRect[],limit=38,blocked?:(point:WorldPoint)=>boolean):WorldPoint[] {
  const search={minX:Math.min(start.x,destination.x)-8.5,maxX:Math.max(start.x,destination.x)+8.5,minZ:Math.min(start.z,destination.z)-8.5,maxZ:Math.max(start.z,destination.z)+8.5};
  const localSolids=solids.filter(solid=>solid.maxX+FOOT_RADIUS>=search.minX&&solid.minX-FOOT_RADIUS<=search.maxX&&solid.maxZ+FOOT_RADIUS>=search.minZ&&solid.minZ-FOOT_RADIUS<=search.maxZ);
  const available = (point:WorldPoint)=>walkable(point,localSolids)&&!blocked?.(point);
  if(worldDistance(start,destination)>limit||!available(destination)) return [];
  const clearSegment=(from:WorldPoint,to:WorldPoint)=>{const steps=Math.max(1,Math.ceil(worldDistance(from,to)/.09));for(let index=0;index<=steps;index++){const amount=index/steps;if(!available({x:from.x+(to.x-from.x)*amount,z:from.z+(to.z-from.z)*amount}))return false;}return true;};
  if(clearSegment(start,destination))return [destination];
  const resolution=.5,minX=Math.min(start.x,destination.x)-8,minZ=Math.min(start.z,destination.z)-8;
  const columns=Math.ceil((Math.abs(start.x-destination.x)+16)/resolution),rows=Math.ceil((Math.abs(start.z-destination.z)+16)/resolution);
  const cell=(point:WorldPoint)=>({x:Math.round((point.x-minX)/resolution),z:Math.round((point.z-minZ)/resolution)}),spot=(x:number,z:number)=>({x:minX+x*resolution,z:minZ+z*resolution}),key=(x:number,z:number)=>z*(columns+1)+x;
  const accessibleCell=(point:WorldPoint)=>{const base=cell(point);let nearest:{x:number;z:number}|null=null,best=Infinity;for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const candidate={x:base.x+dx,z:base.z+dz},position=spot(candidate.x,candidate.z),distance=worldDistance(point,position);if(distance<best&&available(position)&&clearSegment(point,position)){nearest=candidate;best=distance;}}return nearest;};
  const source=accessibleCell(start),target=accessibleCell(destination);if(!source||!target)return [];
  const sourceKey=key(source.x,source.z),targetKey=key(target.x,target.z);
  const queue:{x:number;z:number;score:number}[]=[{...source,score:0}],costs=new Map<number,number>([[sourceKey,0]]),parents=new Map<number,number>(),closed=new Set<number>();
  for(let attempts=0;queue.length&&attempts<10000;attempts++) {
    let nearest=0;for(let index=1;index<queue.length;index++) if(queue[index].score<queue[nearest].score) nearest=index;
    const current=queue.splice(nearest,1)[0],currentKey=key(current.x,current.z);if(closed.has(currentKey))continue;
    if(currentKey===targetKey) {
      const route:WorldPoint[]=[];let cursor=currentKey;
      for(;;){route.push(spot(cursor%(columns+1),Math.floor(cursor/(columns+1))));if(cursor===sourceKey)break;cursor=parents.get(cursor)!;}
      route.reverse();route.push(destination);return route;
    }
    closed.add(currentKey);
    for(const [dx,dz] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]) {
      const x=current.x+dx,z=current.z+dz,nextKey=key(x,z);
      if(x<0||x>columns||z<0||z>rows||closed.has(nextKey)||!available(spot(x,z)))continue;
      if(dx&&dz&&(!available(spot(x-dx,z))||!available(spot(x,z-dz))))continue;
      if(!clearSegment(spot(current.x,current.z),spot(x,z)))continue;
      const cost=costs.get(currentKey)!+(dx&&dz?Math.SQRT2:1);if(cost>=(costs.get(nextKey)??Infinity))continue;
      costs.set(nextKey,cost);parents.set(nextKey,currentKey);queue.push({x,z,score:cost+Math.hypot(target.x-x,target.z-z)});
    }
  }
  return [];
}
