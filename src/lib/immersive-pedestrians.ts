import * as THREE from 'three';
import { applyPersonRagdollPose, createPerson, type PersonModel, type PersonRagdollPose } from './immersive-assets.ts';
import { createWorldCollisionIndex, nearbyWorldCollisions, type WorldCollisionIndex } from './immersive-spatial.ts';
import { interpolateImmersivePose, smoothImmersiveAngle, smoothImmersiveValue, type ImmersiveMotionPose } from './immersive-motion.ts';
import { WORLD_ROADS, WORLD_SIZE, type RegionalRoad } from './regional-roads.ts';
import type { ImmersiveLocation, WorldCollision, WorldInteractable, WorldPoint } from './immersive-locations.ts';

const BODY_RADIUS = .33, CLEARANCE = .12, OUTDOOR_RANGE = 210;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type PedestrianRoute = {
  id: string; regionId: string; interior: number | null; kind: 'sidewalk' | 'plaza' | 'interior';
  points: readonly WorldPoint[]; length: number; bounds: Bounds;
};
export type PedestrianFocus = { position: WorldPoint; interior: number | null; driving?: boolean; population?: number };
export type PedestrianState = ImmersiveMotionPose & {
  slot: number; actorId: string | null; routeId: string | null; interior: number | null; speed: number; activity: 'idle' | 'phone';
  lifecycle: 'walking' | 'struck' | 'down' | 'retired';
};
export type PedestrianDynamicCollider = Pick<WorldCollision, 'minX' | 'maxX' | 'minZ' | 'maxZ' | 'minY' | 'maxY'> & { id?: string; kind?: string };
export type PedestrianObstacles = {
  player?: WorldPoint;
  vehicle?: WorldPoint & { heading: number; speed: number };
  nearbyCollisions?: (point: WorldPoint, radius: number) => readonly PedestrianDynamicCollider[];
  blockedPoints?: readonly WorldPoint[];
};
type RouteOptions = {
  collisions: readonly WorldCollision[]; locations: readonly ImmersiveLocation[]; interactables: readonly WorldInteractable[];
  roads?: readonly RegionalRoad[];
};
type Walker = {
  model: PersonModel; state: PedestrianState; previous: ImmersiveMotionPose; route: PedestrianRoute | null;
  progress: number; direction: 1 | -1; wait: number; age: number; animationPhase: number; visualSpeed: number; blockedSeconds: number;
};
const finitePoint = (point: WorldPoint) => Number.isFinite(point.x) && Number.isFinite(point.z);
const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
function seedOf(text: string): number { let seed = 2166136261; for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619); return seed >>> 0; }
function rectangle(point: WorldPoint, bounds: Bounds, pad = 0): boolean { return point.x >= bounds.minX - pad && point.x <= bounds.maxX + pad && point.z >= bounds.minZ - pad && point.z <= bounds.maxZ + pad; }
function boundsDistance(point: WorldPoint, bounds: Bounds): number { return Math.hypot(Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX), Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ)); }
/** Exact swept-circle broad phase against rectangles, including thin posts between path samples. */
function crossesRectangle(a: WorldPoint, b: WorldPoint, bounds: Bounds, radius: number): boolean {
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [[a.x, b.x - a.x, bounds.minX - radius, bounds.maxX + radius], [a.z, b.z - a.z, bounds.minZ - radius, bounds.maxZ + radius]]) {
    if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return false; continue; }
    const one = (min - start) / delta, two = (max - start) / delta;
    low = Math.max(low, Math.min(one, two)); high = Math.min(high, Math.max(one, two)); if (high < low) return false;
  }
  return high >= 0 && low <= 1;
}
function crossesCircle(a: WorldPoint, b: WorldPoint, center: WorldPoint, radius: number): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, square = dx * dx + dz * dz;
  const t = square > 0 ? clamp(((center.x - a.x) * dx + (center.z - a.z) * dz) / square, 0, 1) : 0;
  return Math.hypot(a.x + dx * t - center.x, a.z + dz * t - center.z) < radius;
}
function routeSample(route: PedestrianRoute, amount: number, direction: 1 | -1 = 1): ImmersiveMotionPose {
  let progress = clamp(amount, 0, route.length);
  for (let index = 1; index < route.points.length; index++) {
    const a = route.points[index - 1], b = route.points[index], span = distance(a, b);
    if (progress > span && index < route.points.length - 1) { progress -= span; continue; }
    const fraction = span > 0 ? clamp(progress / span, 0, 1) : 0;
    return { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction, heading: Math.atan2(-(b.x - a.x) * direction, -(b.z - a.z) * direction) };
  }
  return { ...route.points[0], heading: 0 };
}
function staticClear(index: WorldCollisionIndex, a: WorldPoint, b: WorldPoint, radius = BODY_RADIUS + CLEARANCE): boolean {
  const middle = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  return !nearbyWorldCollisions(index, middle, distance(a, b) / 2 + radius, .1, 1.85).some(solid => crossesRectangle(a, b, solid, radius));
}

/** Routes are prepared once from the same paving, walls, furniture, and road contract as the game. */
export function createPedestrianRoutes(options: RouteOptions): PedestrianRoute[] {
  const { locations, interactables } = options, roads = options.roads ?? WORLD_ROADS, index = createWorldCollisionIndex(options.collisions);
  const roadBounds = roads.map(road => ({ minX: road.x - road.width / 2, maxX: road.x + road.width / 2, minZ: road.z - road.depth / 2, maxZ: road.z + road.depth / 2 }));
  const radius = BODY_RADIUS + CLEARANCE, routes: PedestrianRoute[] = [];
  const clear = (a: WorldPoint, b: WorldPoint, interior: number | null) => {
    if (![a, b].every(point => finitePoint(point) && point.x > radius && point.z > radius && point.x < WORLD_SIZE.width - radius && point.z < WORLD_SIZE.depth - radius)) return false;
    if (!staticClear(index, a, b)) return false;
    if (interior === null) {
      if (roadBounds.some(bounds => crossesRectangle(a, b, bounds, radius + .25))) return false;
      if (locations.some(location => crossesRectangle(a, b, location.footprint, radius + .4) || crossesCircle(a, b, location.parking, 8) || crossesCircle(a, b, location.door, 3.8))) return false;
    } else {
      const location = locations.find(item => item.id === interior); if (!location) return false;
      if (![a, b].every(point => rectangle(point, location.footprint, -2))) return false;
      if (crossesCircle(a, b, location.door, 4) || crossesCircle(a, b, location.interiorSpawn, 2.5)) return false;
      if (location.candidateSpawns.some(point => crossesCircle(a, b, point, 1.15))) return false;
      if (interactables.some(item => item.locationId === interior && crossesCircle(a, b, item.position, 1.4))) return false;
    }
    return true;
  };
  const add = (id: string, regionId: string, interior: number | null, kind: PedestrianRoute['kind'], points: WorldPoint[]) => {
    if (points.length < 2) return;
    const length = points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0); if (length < (interior === null ? 10 : 7)) return;
    if (points.slice(1).some((point, i) => !clear(points[i], point, interior))) return;
    const xs = points.map(point => point.x), zs = points.map(point => point.z);
    routes.push({ id, regionId, interior, kind, points, length, bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) } });
  };
  const rail = (id: string, regionId: string, interior: number | null, kind: PedestrianRoute['kind'], a: WorldPoint, b: WorldPoint, spacing = 3) => {
    const span = distance(a, b), steps = Math.max(1, Math.ceil(span / spacing)); let run: WorldPoint[] = [], number = 0;
    const finish = () => { if (run.length > 1) add(`${id}-${number++}`, regionId, interior, kind, [run[0], run[run.length - 1]]); run = []; };
    for (let i = 0; i <= steps; i++) {
      const point = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
      if (!clear(point, point, interior) || run.length && !clear(run[run.length - 1], point, interior)) { finish(); if (clear(point, point, interior)) run.push(point); continue; }
      run.push(point); if (run.length > 1 && distance(run[0], point) >= 90) finish();
    }
    finish();
  };
  // The 2.6 m paving strip has room for a body and a curb gap. Intersections split
  // each rail, so a resident never needs to dash across an active traffic lane.
  roads.filter(road => road.kind === 'street' && road.regionId).forEach(road => {
    const horizontal = road.width > road.depth, length = horizontal ? road.width : road.depth, breadth = horizontal ? road.depth : road.width;
    for (const side of [-1, 1]) {
      const offset = side * (breadth / 2 + 1.35);
      rail(`${road.id}-walk-${side}`, road.regionId!, null, 'sidewalk',
        { x: road.x + (horizontal ? -length / 2 + 3 : offset), z: road.z + (horizontal ? offset : -length / 2 + 3) },
        { x: road.x + (horizontal ? length / 2 - 3 : offset), z: road.z + (horizontal ? offset : length / 2 - 3) });
    }
  });
  for (const marker of interactables.filter(item => item.id.endsWith('-landmark') && item.locationId === -1)) {
    const regionId = marker.id.slice(0, -'-landmark'.length), center = { x: marker.position.x - 8, z: marker.position.z - 7 };
    for (const z of [-17, -9, -1, 7, 15]) rail(`${regionId}-plaza-row-${z}`, regionId, null, 'plaza', { x: center.x - 26, z: center.z + z }, { x: center.x + 26, z: center.z + z });
    for (const x of [-24, -16, -8, 0, 8, 16, 24]) rail(`${regionId}-plaza-column-${x}`, regionId, null, 'plaza', { x: center.x + x, z: center.z - 20 }, { x: center.x + x, z: center.z + 20 });
  }
  for (const location of locations.filter(item => item.id >= 0 && item.id <= 3)) {
    const bounds = location.footprint;
    for (let z = bounds.minZ + 5; z < bounds.maxZ - 4; z += 5) rail(`interior-${location.id}-row-${z}`, location.regionId, location.id, 'interior', { x: bounds.minX + 4, z }, { x: bounds.maxX - 4, z }, 1.5);
    for (let x = bounds.minX + 5; x < bounds.maxX - 4; x += 5) rail(`interior-${location.id}-column-${x}`, location.regionId, location.id, 'interior', { x, z: bounds.minZ + 4 }, { x, z: bounds.maxZ - 4 }, 1.5);
  }
  return routes;
}

/** A fixed articulated model pool; no new characters, textures, or labels during a journey. */
export function createPedestrianWorld(options: RouteOptions & { maxPeople?: number }) {
  const routes = createPedestrianRoutes(options), group = new THREE.Group(); group.name = 'Coastal community life';
  const maxPeople = Math.floor(clamp(options.maxPeople ?? 10, 1, 12)), walkers: Walker[] = [];
  for (let slot = 0; slot < maxPeople; slot++) {
    const model = createPerson({ avatar: (slot * 7 + 3) % 16 }), state: PedestrianState = { slot, actorId: null, routeId: null, interior: null, x: 0, z: 0, heading: 0, speed: 0, activity: 'idle', lifecycle: 'retired' };
    model.group.name = `Coastal resident ${slot + 1}`; model.group.visible = false; group.add(model.group);
    walkers.push({ model, state, previous: { x: 0, z: 0, heading: 0 }, route: null, progress: 0, direction: 1, wait: 0, age: 0, animationPhase: slot * 1.73, visualSpeed: 0, blockedSeconds: 0 });
  }
  const retiredActorIds = new Set<string>();
  let disposed = false, focus: PedestrianFocus = { position: { x: -1000, z: -1000 }, interior: null }, selection: PedestrianFocus | null = null;
  const alive = (walker: Walker) => walker.state.lifecycle === 'walking' && !!walker.route;
  const reserved = (walker: Walker) => walker.state.lifecycle === 'struck' || walker.state.lifecycle === 'down';
  const unassign = (walker: Walker) => {
    walker.route = null; walker.state.actorId = null; walker.state.routeId = null; walker.state.speed = 0; walker.state.lifecycle = 'retired'; walker.model.group.visible = false;
  };
  const assign = (walker: Walker, route: PedestrianRoute): boolean => {
    const actorId = `pedestrian:${route.id}`;
    if (retiredActorIds.has(actorId)) return false;
    // Logical people belong to a route, never to a reusable display slot. A
    // victim cannot acquire a new identity when the pool moves to another town.
    const seed = seedOf(actorId), direction: 1 | -1 = seed % 2 ? 1 : -1;
    let progress = 0, pose: ImmersiveMotionPose | null = null;
    const spawnGap = focus.driving ? 4 : 1.8;
    for (let attempt = 0; attempt < 17; attempt++) {
      const fraction = (.12 + (seed % 700) / 1000 + attempt * .137) % .86 + .07;
      const candidateProgress = route.length * fraction, candidate = routeSample(route, candidateProgress, direction);
      if (distance(candidate, focus.position) < spawnGap || distance(candidate, focus.position) > (route.interior === null ? OUTDOOR_RANGE : 90)) continue;
      if (walkers.some(other => other !== walker && other.state.actorId && other.state.interior === route.interior && distance(candidate, other.state) < .95)) continue;
      progress = candidateProgress; pose = candidate; break;
    }
    if (!pose) return false;
    walker.model.resetPose();
    walker.route = route; walker.progress = progress; walker.direction = direction; walker.wait = (seed % 300) / 100;
    walker.age = 0; walker.visualSpeed = 0; walker.blockedSeconds = 0; walker.animationPhase = (seed % 1000) / 137;
    Object.assign(walker.state, pose, { actorId, routeId: route.id, interior: route.interior, speed: 0, activity: 'idle', lifecycle: 'walking' }); Object.assign(walker.previous, pose);
    walker.model.group.position.set(pose.x, 0, pose.z); walker.model.group.rotation.set(0, pose.heading, 0); return true;
  };
  const setFocus = (next: PedestrianFocus) => {
    if (disposed || !finitePoint(next.position)) return;
    focus = { ...next, position: { ...next.position } };
    const population = Math.floor(clamp(next.population ?? (next.interior === null ? 8 : 3), 0, maxPeople));
    if (selection && selection.interior === next.interior && selection.population === population && selection.driving === next.driving && distance(selection.position, next.position) < 32) return;
    selection = { ...focus, population };
    const occupiedActorIds = new Set(retiredActorIds); for (const walker of walkers) if (reserved(walker) && walker.state.actorId) occupiedActorIds.add(walker.state.actorId);
    const possible = routes.filter(route => route.interior === next.interior && !occupiedActorIds.has(`pedestrian:${route.id}`) && boundsDistance(next.position, route.bounds) < (next.interior === null ? OUTDOOR_RANGE : 90))
      .sort((a, b) => boundsDistance(next.position, a.bounds) + (a.kind === 'plaza' ? -10 : 0) - boundsDistance(next.position, b.bounds) - (b.kind === 'plaza' ? -10 : 0) || a.id.localeCompare(b.id));
    // Preserve the actual nearby person, including progress and facing. Focus
    // changes must not teleport somebody standing beside the player.
    const keepers = walkers.filter(walker => alive(walker) && walker.state.interior === next.interior && distance(walker.state, next.position) < 60)
      .sort((a, b) => distance(a.state, next.position) - distance(b.state, next.position)).slice(0, population);
    const kept = new Set(keepers);
    for (const walker of walkers) if (!kept.has(walker) && !reserved(walker)) unassign(walker);
    const assigned = new Set(keepers.map(walker => walker.route!.id)), wanted = keepers.map(walker => walker.route!);
    for (const route of possible) {
      if (wanted.length >= population) break;
      if (assigned.has(route.id)) continue;
      const center = routeSample(route, route.length / 2);
      if (wanted.some(other => distance(center, routeSample(other, other.length / 2)) < (next.interior === null ? 12 : 5))) continue;
      const walker = walkers.find(person => !person.route && !reserved(person)); if (!walker) break;
      if (assign(walker, route)) { assigned.add(route.id); wanted.push(route); }
    }
  };
  const dynamicallyClear = (walker: Walker, target: WorldPoint, obstacles: PedestrianObstacles): boolean => {
    const current = walker.state;
    // Static route clearance was checked once during creation. New movable
    // traffic props are supplied through the small local obstacle query.
    if (obstacles.player && crossesCircle(current, target, obstacles.player, .85)) return false;
    if (obstacles.blockedPoints?.some(point => crossesCircle(current, target, point, .85))) return false;
    if (obstacles.vehicle) {
      const car = obstacles.vehicle, cosine = Math.abs(Math.cos(car.heading)), sine = Math.abs(Math.sin(car.heading));
      const margin = .7 + Math.min(2.5, Math.abs(car.speed) * .2), halfX = cosine * 1.05 + sine * 2.3, halfZ = sine * 1.05 + cosine * 2.3;
      if (crossesRectangle(current, target, { minX: car.x - halfX, maxX: car.x + halfX, minZ: car.z - halfZ, maxZ: car.z + halfZ }, BODY_RADIUS + margin)) return false;
    }
    if (obstacles.nearbyCollisions?.(current, 4).some(solid => solid.minY < 1.85 && solid.maxY > .1 && crossesRectangle(current, target, solid, BODY_RADIUS + CLEARANCE))) return false;
    for (const other of walkers) {
      if (other === walker || !alive(other) || other.state.interior !== current.interior) continue;
      // Deterministic right of way when two paths cross. The waiting resident
      // resumes naturally once the other person has passed.
      const clearance = other.state.slot < current.slot ? .95 : .68;
      if (crossesCircle(current, target, other.state, clearance)) return false;
    }
    return true;
  };
  const update = (dt: number, _elapsed: number, obstacles: PedestrianObstacles = {}) => {
    if (disposed || !Number.isFinite(dt) || dt <= 0 || dt > .1) return;
    for (const walker of walkers) {
      if (!alive(walker)) continue; const state = walker.state, route = walker.route!; Object.assign(walker.previous, { x: state.x, z: state.z, heading: state.heading }); walker.age += dt;
      const near = distance(state, focus.position) < (state.interior === null ? OUTDOOR_RANGE + 20 : 90);
      if (!near) { state.speed = 0; continue; }
      const identity = seedOf(state.actorId!);
      const cruising = route.interior === null ? .88 + identity % 4 * .08 : .68 + identity % 3 * .06;
      const endDistance = walker.direction === 1 ? route.length - walker.progress : walker.progress;
      const targetSpeed = walker.wait > 0 ? 0 : Math.min(cruising, Math.sqrt(Math.max(0, endDistance) * 1.8));
      state.speed = smoothImmersiveValue(state.speed, targetSpeed, targetSpeed ? 3.8 : 6.5, dt);
      if (walker.wait > 0) walker.wait = Math.max(0, walker.wait - dt);
      const nextProgress = clamp(walker.progress + walker.direction * state.speed * dt, 0, route.length), target = routeSample(route, nextProgress, walker.direction);
      state.heading = smoothImmersiveAngle(state.heading, target.heading, 6, dt);
      if (dynamicallyClear(walker, target, obstacles)) { walker.progress = nextProgress; state.x = target.x; state.z = target.z; walker.blockedSeconds = 0; }
      else {
        state.speed = 0; walker.blockedSeconds += dt;
        // A blocked resident politely turns back instead of becoming a
        // permanent obstacle beside a parked car or another walker.
        if (walker.blockedSeconds > 2 + state.slot % 3 * .35 && walker.wait === 0) {
          walker.direction = walker.direction === 1 ? -1 : 1; walker.wait = .7; walker.blockedSeconds = 0;
        }
      }
      walker.animationPhase += dt * Math.min(7, 3 + state.speed * 2);
      if (walker.wait === 0 && endDistance < .035) { walker.progress = walker.direction === 1 ? route.length : 0; walker.direction = walker.direction === 1 ? -1 : 1; walker.wait = 3 + (seedOf(route.id) + state.slot * 13) % 60 / 10; state.speed = 0; }
      state.activity = walker.wait > 1.5 && (state.slot + seedOf(route.id)) % 4 === 0 ? 'phone' : 'idle';
    }
  };
  const render = (elapsed: number, alpha = 1, dt = 1 / 60) => {
    if (disposed) return;
    for (const walker of walkers) {
      const state = walker.state, visible = !!state.actorId && state.interior === focus.interior && distance(state, focus.position) < (state.interior === null ? OUTDOOR_RANGE : 90);
      walker.model.group.visible = visible; if (!visible || reserved(walker)) continue;
      const pose = interpolateImmersivePose(walker.previous, state, alpha); walker.model.group.position.set(pose.x, 0, pose.z); walker.model.group.rotation.y = pose.heading;
      walker.visualSpeed = smoothImmersiveValue(walker.visualSpeed, state.speed, 9, dt);
      // Preserve gait phase as the walker eases between walking and resting.
      const animationTime = walker.visualSpeed > .04 ? walker.animationPhase / Math.min(7, 3 + walker.visualSpeed * 2) : (Number.isFinite(elapsed) ? elapsed : 0) + state.slot * 1.73;
      const leftX = walker.model.leftArm.rotation.x, leftZ = walker.model.leftArm.rotation.z, rightX = walker.model.rightArm.rotation.x, rightZ = walker.model.rightArm.rotation.z;
      walker.model.update(walker.visualSpeed, animationTime, state.activity);
      walker.model.leftArm.rotation.x = smoothImmersiveValue(leftX, walker.model.leftArm.rotation.x, 16, dt); walker.model.leftArm.rotation.z = smoothImmersiveValue(leftZ, walker.model.leftArm.rotation.z, 12, dt);
      walker.model.rightArm.rotation.x = smoothImmersiveValue(rightX, walker.model.rightArm.rotation.x, 16, dt); walker.model.rightArm.rotation.z = smoothImmersiveValue(rightZ, walker.model.rightArm.rotation.z, 12, dt);
    }
  };
  const nearbyCollisions = (point: WorldPoint, radius = 4): WorldCollision[] => {
    if (disposed || !finitePoint(point)) return [];
    return walkers.filter(walker => alive(walker) && walker.state.interior === focus.interior && distance(point, walker.state) < radius + BODY_RADIUS).map(({ state }) => ({ id: state.actorId!, kind: 'furniture', minX: state.x - BODY_RADIUS, maxX: state.x + BODY_RADIUS, minZ: state.z - BODY_RADIUS, maxZ: state.z + BODY_RADIUS, minY: 0, maxY: 1.8 }));
  };
  const blocksPoint = (point: WorldPoint, radius = .25): boolean => !disposed && walkers.some(walker => alive(walker) && walker.state.interior === focus.interior && distance(point, walker.state) < BODY_RADIUS + radius);
  const modelForActor = (actorId: string): PersonModel | undefined => walkers.find(walker => walker.state.actorId === actorId)?.model;
  const strike = (actorId: string): boolean => {
    const walker = walkers.find(person => person.state.actorId === actorId); if (disposed || !walker || !alive(walker)) return false;
    walker.state.lifecycle = 'struck'; walker.state.speed = 0; walker.visualSpeed = 0; walker.state.activity = 'idle'; return true;
  };
  const down = (actorId: string): boolean => {
    const walker = walkers.find(person => person.state.actorId === actorId); if (disposed || !walker || !reserved(walker)) return false;
    walker.state.lifecycle = 'down'; return true;
  };
  const retire = (actorId: string): boolean => {
    if (disposed || !actorId) return false; const first = !retiredActorIds.has(actorId); retiredActorIds.add(actorId);
    const walker = walkers.find(person => person.state.actorId === actorId); if (walker) unassign(walker); selection = null; return first;
  };
  const applyRagdollPose = (actorId: string, pose: PersonRagdollPose, alpha = 1): boolean => {
    const walker = walkers.find(person => person.state.actorId === actorId); if (disposed || !walker || !reserved(walker)) return false;
    if (!applyPersonRagdollPose(walker.model, pose, alpha)) return false;
    walker.state.lifecycle = 'down'; walker.state.x = pose.parts.pelvis.position.x; walker.state.z = pose.parts.pelvis.position.z;
    walker.model.group.visible = walker.state.interior === focus.interior && distance(walker.state, focus.position) < (walker.state.interior === null ? OUTDOOR_RANGE : 90); return true;
  };
  const applyStandingPoses = (poses: readonly { id: string; x: number; z: number; heading: number; speed?: number }[]) => {
    if (disposed) return;
    for (const pose of poses) {
      const walker = walkers.find(person => person.state.actorId === pose.id); if (!walker || !alive(walker) || !finitePoint(pose) || !Number.isFinite(pose.heading)) continue;
      walker.state.x = pose.x; walker.state.z = pose.z; walker.state.heading = pose.heading;
      if (Number.isFinite(pose.speed)) walker.state.speed = Math.max(0, pose.speed!);
      // Keep planned route progress aligned with an engine-solved shove.
      // Steering back is navigation; contacts/gravity belong to Cannon.
      const route = walker.route!; let closest = Number.POSITIVE_INFINITY, progress = 0, base = 0;
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i], dx = b.x - a.x, dz = b.z - a.z, span = Math.hypot(dx, dz), fraction = span ? clamp(((pose.x - a.x) * dx + (pose.z - a.z) * dz) / (span * span), 0, 1) : 0;
        const error = Math.hypot(pose.x - a.x - dx * fraction, pose.z - a.z - dz * fraction); if (error < closest) { closest = error; progress = base + span * fraction; } base += span;
      }
      walker.progress = progress;
    }
  };
  const physicsPedestrians = () => walkers.filter(alive).map(({ state, previous }) => ({ id: state.actorId!, x: state.x, z: state.z, heading: state.heading, speed: state.speed, interior: state.interior, previous: { x: previous.x, z: previous.z } }));
  const dispose = () => { if (disposed) return; disposed = true; group.removeFromParent(); walkers.forEach(walker => { unassign(walker); walker.model.dispose(); }); group.clear(); };
  return { group, routes, states: walkers.map(walker => walker.state) as readonly PedestrianState[], modelCount: maxPeople, setFocus, update, render, nearbyCollisions, blocksPoint, modelForActor, strike, down, retire, applyRagdollPose, applyStandingPoses, physicsPedestrians, retiredActorIds: retiredActorIds as ReadonlySet<string>, dispose };
}
