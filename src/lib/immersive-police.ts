import * as THREE from 'three';
import { applyPersonRagdollPose, createAssetLibrary, createPerson, type PersonRagdollPose } from './immersive-assets.ts';
import { POLICE_ARRIVAL_SECONDS, POLICE_RESOLVE_SECONDS, type PoliceResponse } from './immersive-law.ts';
import type { WorldCollision, WorldPoint } from './immersive-locations.ts';
import type { PhysicsPedestrian, PhysicsRagdollPose } from './immersive-physics.ts';
import { interpolateImmersivePose, type ImmersiveMotionPose } from './immersive-motion.ts';
import { moveWalker } from './immersive-runtime.ts';
import { createWorldCollisionIndex, nearbyWorldCollisions } from './immersive-spatial.ts';
import { findRegionalRoute, regionalRoadEndpoints, WORLD_ROADS, type RegionalRoad, type RegionalRoute } from './regional-roads.ts';

type PoliceVehicle = WorldPoint & { heading: number; speed: number };
export type PoliceActor = PoliceVehicle & { id: string; width: number; length: number; previous?: WorldPoint };
export type PolicePerson = WorldPoint & { id: string; heading: number; speed?: number; active: boolean; previous?: WorldPoint };
type PathPoint = WorldPoint & { distance: number };
type Path = { points: PathPoint[]; length: number };
type Unit = PoliceActor & { previous: ImmersiveMotionPose; progress: number; path: Path; active: boolean; leaving: boolean };
const VISIBLE_RANGE = 360, APPROACH_LENGTH = 450, AXIS = new THREE.Vector3(0, 1, 0);
const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, finite(value)));
const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));

function pathFromRoute(route: RegionalRoute, start?: WorldPoint): Path {
  const points: PathPoint[] = [];
  const append = (point: WorldPoint) => {
    const previous = points.at(-1), length = previous ? distance(previous, point) : 0;
    if (previous && length < .0001) return;
    points.push({ ...point, distance: (previous?.distance ?? 0) + length });
  };
  if (start) append(start);
  for (const segment of route.segments) {
    const length = distance(segment.from, segment.to), dx = (segment.to.x - segment.from.x) / length, dz = (segment.to.z - segment.from.z) / length;
    const road = WORLD_ROADS.find(road => road.id === segment.roadId), breadth = road ? Math.min(road.width, road.depth) : 12;
    const lane = Math.min(3.3, breadth * .23), offset = { x: -dz * lane, z: dx * lane };
    append({ x: segment.from.x + offset.x, z: segment.from.z + offset.z });
    append({ x: segment.to.x + offset.x, z: segment.to.z + offset.z });
  }
  return { points, length: points.at(-1)?.distance ?? 0 };
}

function sample(path: Path, progress: number): ImmersiveMotionPose {
  const value = clamp(progress, 0, path.length), points = path.points;
  if (points.length < 2) return { x: points[0]?.x ?? 0, z: points[0]?.z ?? 0, heading: 0 };
  let lo = 0, hi = points.length - 1;
  while (lo + 1 < hi) { const middle = (lo + hi) >>> 1; if (points[middle].distance <= value) lo = middle; else hi = middle; }
  const a = points[lo], b = points[hi], span = Math.max(.0001, b.distance - a.distance), amount = (value - a.distance) / span;
  return { x: a.x + (b.x - a.x) * amount, z: a.z + (b.z - a.z) * amount, heading: Math.atan2(a.x - b.x, a.z - b.z) };
}

function nearestRoadPoint(point: WorldPoint, roads: readonly RegionalRoad[]): WorldPoint {
  let closest = point, best = Infinity;
  for (const road of roads.filter(road => road.kind !== 'access')) {
    const horizontal = road.width > road.depth;
    const projected = horizontal ? { x: clamp(point.x, road.x - road.width / 2 + 14, road.x + road.width / 2 - 14), z: road.z } : { x: road.x, z: clamp(point.z, road.z - road.depth / 2 + 14, road.z + road.depth / 2 - 14) };
    const span = distance(point, projected); if (span < best) { best = span; closest = projected; }
  }
  return closest;
}

/** Dispatch starts on a connected approach beyond model visibility, then follows that road continuously. */
function dispatchPath(incident: WorldPoint, roads: readonly RegionalRoad[]): Path {
  const anchor = nearestRoadPoint(incident, roads), candidates: WorldPoint[] = [];
  for (const road of roads.filter(road => road.kind !== 'access')) {
    const horizontal = road.width > road.depth;
    if (Math.abs((horizontal ? anchor.z - road.z : anchor.x - road.x)) < 20) {
      for (const side of [-1, 1]) candidates.push(horizontal ? { x: clamp(anchor.x + side * (APPROACH_LENGTH + 35), road.x - road.width / 2 + 14, road.x + road.width / 2 - 14), z: road.z } : { x: road.x, z: clamp(anchor.z + side * (APPROACH_LENGTH + 35), road.z - road.depth / 2 + 14, road.z + road.depth / 2 - 14) });
    }
    candidates.push(...regionalRoadEndpoints(road));
  }
  const ordered = candidates.filter(point => distance(point, anchor) >= APPROACH_LENGTH).sort((a, b) => distance(a, anchor) - distance(b, anchor));
  for (const source of ordered) {
    const route = findRegionalRoute(source, anchor, roads), path = pathFromRoute(route);
    if (path.length < APPROACH_LENGTH || !Number.isFinite(path.length)) continue;
    const start = Math.max(0, path.length - APPROACH_LENGTH), spawn = sample(path, start);
    if (distance(spawn, incident) <= VISIBLE_RANGE + 15) continue;
    const points: PathPoint[] = [{ x: spawn.x, z: spawn.z, distance: 0 }];
    for (const point of path.points) if (point.distance > start) points.push({ x: point.x, z: point.z, distance: point.distance - start });
    return { points, length: path.length - start };
  }
  // A winding town approach may be longer than its straight-line distance; retain the full connected route to keep its spawn hidden.
  for (const source of ordered) {
    const route = findRegionalRoute(source, anchor, roads), path = pathFromRoute(route);
    if (path.length >= APPROACH_LENGTH && Number.isFinite(path.length)) return path;
  }
  return { points: [], length: 0 };
}

function departurePath(unit: Unit, player: WorldPoint, roads: readonly RegionalRoad[]): Path {
  const endpoints = roads.filter(road => road.kind !== 'access').flatMap(road => regionalRoadEndpoints(road));
  const options = endpoints.filter(point => distance(point, unit) > 650 && distance(point, unit) < 1800).sort((a, b) => distance(b, player) - distance(a, player));
  for (const point of options) {
    const route = findRegionalRoute(unit, point, roads); if (Number.isFinite(route.distance) && route.distance > 500) return pathFromRoute(route, unit);
  }
  const origin = unit.path.points[0];
  if (origin && distance(origin, unit) > 40) return pathFromRoute(findRegionalRoute(unit, origin, roads), unit);
  return { points: [{ x: unit.x, z: unit.z, distance: 0 }], length: 0 };
}

/** Two reused regional patrol cars and one officer; pathing is authored traffic, collisions belong to the shared physics engine. */
export function createPoliceResponseWorld(options: { maxCars?: 1 | 2; roads?: readonly RegionalRoad[]; collisions?: readonly WorldCollision[] } = {}) {
  const roads = options.roads ?? WORLD_ROADS, count = options.maxCars === 1 ? 1 : 2, assets = createAssetLibrary(), group = new THREE.Group(); group.name = 'SCOUT regional police response';
  const { box, cylinder, put, mat } = assets, models: THREE.Group[] = [], tyreGroups: THREE.Group[][] = [];
  const blue = mat('#68bad3', .35, .15), red = mat('#ef9782', .35, .15); blue.emissive.set('#4ba9cd'); red.emissive.set('#e97863');
  const livery = assets.label('POLICE', 'REGIONAL SERVICE', 1.55, .38, '#285563');
  for (let index = 0; index < count; index++) {
    const model = new THREE.Group(); model.name = `Regional patrol ${index + 1}`; model.visible = false; group.add(model); models.push(model);
    put(model, box(1.86, .48, 4.45, '#eee2c7', .05), 0, .63, 0);
    put(model, box(1.78, .17, 1.34, '#285563', .04), 0, .95, -1.34).rotation.x = -.065;
    put(model, box(1.63, .64, 1.99, '#354f61', .04), 0, 1.22, .09);
    put(model, box(1.7, .095, 1.67, '#eee2c7', .04), 0, 1.59, .15);
    put(model, box(1.68, .17, .82, '#285563', .03), 0, .95, 1.77);
    for (const side of [-1, 1]) {
      put(model, box(.06, .54, .08, '#eee2c7'), side * .82, 1.25, -.8).rotation.x = -.42;
      put(model, box(.055, .56, .08, '#eee2c7'), side * .82, 1.25, .95).rotation.x = .21;
      put(model, box(.05, .30, 2.68, '#285563'), side * .934, .77, .02);
      const label = livery.clone(); put(model, label, side * .964, .86, .15).rotation.y = side * Math.PI / 2;
      put(model, box(.38, .17, .036, '#f7df9f'), side * .62, .78, -2.242);
      put(model, box(.32, .16, .036, '#d47764'), side * .62, .78, 2.242);
    }
    for (const z of [-2.18, 2.18]) put(model, box(1.78, .16, .17, '#354653'), 0, .47, z);
    put(model, box(.83, .14, .42, '#394d57', .025), 0, 1.72, .02);
    put(model, box(.33, .16, .37, blue, .03), -.23, 1.84, .02).castShadow = false;
    put(model, box(.33, .16, .37, red, .03), .23, 1.84, .02).castShadow = false;
    const wheels: THREE.Group[] = [];
    for (const side of [-1, 1]) for (const z of [-1.35, 1.36]) {
      const wheel = new THREE.Group(); put(model, wheel, side * .885, .34, z); put(wheel, cylinder(.33, .20, '#253642', .33, 12), 0, 0, 0).rotation.z = Math.PI / 2; put(wheel, cylinder(.19, .21, '#b7c5bc', .19, 10), 0, 0, 0).rotation.z = Math.PI / 2; wheels.push(wheel);
    }
    tyreGroups.push(wheels);
  }
  const officer = createPerson({ avatar: 0 }); officer.group.name = 'Regional response officer'; officer.group.visible = false; group.add(officer.group);
  put(officer.head, cylinder(.17, .075, '#285563', .155, 10), 0, .15, 0); put(officer.head, box(.19, .025, .17, '#285563', .025), 0, .112, -.115);
  const badge = box(.04, .055, .015, '#d2ae69'); badge.position.set(-.11, .11, -.165); officer.rig.torso.object.add(badge);
  const collisionIndex = createWorldCollisionIndex(options.collisions ?? []);
  const units: Unit[] = Array.from({ length: count }, (_, index) => ({ id: `police-car-${index}`, x: 0, z: 0, heading: 0, speed: 0, width: 1.86, length: 4.45, previous: { x: 0, z: 0, heading: 0 }, progress: 0, path: { points: [], length: 0 }, active: false, leaving: false }));
  const officerState: PolicePerson & { previous: ImmersiveMotionPose; speed: number; returning: boolean } = { id: 'police:officer-0', x: 0, z: 0, heading: 0, active: false, previous: { x: 0, z: 0, heading: 0 }, speed: 0, returning: false };
  const wheelAngles = new Float64Array(count); let caseId: string | null = null, responseAge = 0, hasInitializedCase = false, currentPlayer: PoliceVehicle = { x: 0, z: 0, heading: 0, speed: 0 }, disposed = false, officerDown = false, officerPose: PersonRagdollPose | null = null;
  const officerAtDoor = (unit: Unit): WorldPoint => ({ x: unit.x - Math.cos(unit.heading) * 1.28, z: unit.z + Math.sin(unit.heading) * 1.28 });

  const update = (response: PoliceResponse | null, player: PoliceVehicle, seconds: number, elapsed: number) => {
    if (disposed) return;
    const dt = clamp(seconds, 0, .1); currentPlayer = { x: finite(player.x), z: finite(player.z), heading: finite(player.heading), speed: finite(player.speed) };
    if (dt <= 0) return;
    if (response && response.id !== caseId) {
      const savedAge = hasInitializedCase ? 0 : clamp(response.elapsedSeconds, 0, POLICE_RESOLVE_SECONDS); hasInitializedCase = true;
      const path = dispatchPath(response.position, roads); caseId = response.id; responseAge = 0;
      units.forEach((unit, index) => {
        if (unit.active && distance(unit, currentPlayer) < VISIBLE_RANGE) unit.path = pathFromRoute(findRegionalRoute(unit, nearestRoadPoint(response.position, roads), roads), unit);
        else unit.path = path;
        unit.progress = index === 0 && unit.path === path ? 13 : 0;
        const pose = sample(unit.path, unit.progress); Object.assign(unit, pose); unit.previous = { ...pose }; unit.speed = unit.path === path ? 25 : unit.speed; unit.active = unit.path.length > 1; unit.leaving = false;
      });
      if (officerState.active && distance(officerState, currentPlayer) < VISIBLE_RANGE) officerState.returning = true;
      else if (!officerDown || !officerPose || distance(officerPose.parts.pelvis.position, currentPlayer) > VISIBLE_RANGE) {
        officerState.active = false; officerDown = false; officerPose = null; officer.resetPose();
        officerState.id = `police:officer-${response.id.split(':')[1] ?? '0'}`;
      }
      // A fresh scene reconstructs its authored response at the persisted age.
      // This warms only the bounded visual controller; the law clock and Cannon
      // are never advanced, and live replacement cases retain continuous poses.
      for (let age = 0; age < savedAge - 1e-9;) {
        const warmStep = Math.min(1 / 120, savedAge - age); age += warmStep;
        update({ ...response, elapsedSeconds: age, phase: age >= POLICE_ARRIVAL_SECONDS ? 'arrived' : 'dispatched' }, player, warmStep, elapsed - savedAge + age);
      }
    }
    responseAge += dt;
    if (!response && caseId) {
      caseId = null; officerState.returning = officerState.active;
      units.forEach(unit => { if (unit.active) { unit.path = departurePath(unit, currentPlayer, roads); unit.progress = 0; unit.leaving = true; } });
    }
    units.forEach((unit, index) => {
      unit.previous = { x: unit.x, z: unit.z, heading: unit.heading }; if (!unit.active) return;
      if (unit.leaving && distance(unit, currentPlayer) > VISIBLE_RANGE + 55) { unit.active = false; return; }
      if (unit.leaving && unit.path.length - unit.progress < 3 && !officerState.active) { unit.path = departurePath(unit, currentPlayer, roads); unit.progress = 0; }
      const stopPad = unit.leaving ? 0 : 8 + index * 14, remaining = Math.max(0, unit.path.length - stopPad - unit.progress);
      const officerWait = index === 0 && unit.leaving && officerState.active;
      const desired = officerWait ? 0 : Math.min(29, Math.sqrt(2 * 4.8 * remaining));
      unit.speed += clamp(desired - unit.speed, -6.2 * dt, 3.6 * dt);
      const advance = Math.min(remaining, Math.max(0, unit.speed) * dt); unit.progress += advance;
      const pose = sample(unit.path, unit.progress), ahead = sample(unit.path, Math.min(unit.path.length, unit.progress + Math.max(2, unit.speed * .25)));
      const targetHeading = distance(pose, ahead) > .1 ? Math.atan2(pose.x - ahead.x, pose.z - ahead.z) : pose.heading;
      unit.x = pose.x; unit.z = pose.z; unit.heading = angle(unit.heading + clamp(angle(targetHeading - unit.heading), -2.5 * dt, 2.5 * dt));
      if (remaining < .03) unit.speed = 0;
      wheelAngles[index] -= advance / .33;
    });
    const lead = units[0];
    if (response?.phase === 'arrived' && lead.active && !officerState.active && !officerDown && lead.speed < .3 && lead.path.length - lead.progress < 10) {
      const door = officerAtDoor(lead); Object.assign(officerState, door); officerState.heading = lead.heading; officerState.previous = { ...door, heading: lead.heading }; officerState.active = true; officerState.returning = false;
    }
    officerState.previous = { x: officerState.x, z: officerState.z, heading: officerState.heading };
    if (officerState.active) {
      if (distance(officerState, currentPlayer) > VISIBLE_RANGE + 55 && !response) officerState.active = false;
      const target = officerState.returning ? officerAtDoor(lead) : response?.position ?? officerAtDoor(lead), span = distance(officerState, target);
      const requested = span > (officerState.returning ? .65 : 2) ? Math.min(1.45 * dt, span) : 0;
      const solids = nearbyWorldCollisions(collisionIndex, officerState, 5, .25, 1.72);
      const moved = requested > 0 ? moveWalker(officerState, { x: (target.x - officerState.x) / span * requested, z: (target.z - officerState.z) / span * requested }, solids) : officerState;
      officerState.speed = dt ? distance(moved, officerState) / dt : 0;
      if (officerState.speed > .02) officerState.heading = angle(officerState.heading + clamp(angle(Math.atan2(officerState.x - moved.x, officerState.z - moved.z) - officerState.heading), -5 * dt, 5 * dt));
      officerState.x = moved.x; officerState.z = moved.z;
      if (officerState.returning && span < .85) officerState.active = false;
    }
  };

  const render = (alpha = 1, elapsed = 0) => {
    if (disposed) return;
    const blink = Math.floor(Math.max(0, elapsed) * 5) % 2 === 0; blue.emissiveIntensity = blink ? 1.4 : .12; red.emissiveIntensity = blink ? .12 : 1.4;
    units.forEach((unit, index) => {
      const model = models[index]; model.visible = unit.active && distance(unit, currentPlayer) <= VISIBLE_RANGE;
      if (!model.visible) return;
      const pose = interpolateImmersivePose(unit.previous, unit, alpha); model.position.set(pose.x, 0, pose.z); model.quaternion.setFromAxisAngle(AXIS, pose.heading);
      tyreGroups[index].forEach(wheel => { wheel.rotation.x = wheelAngles[index]; });
    });
    if (officerDown && officerPose) {
      officer.group.visible = distance(officerPose.parts.pelvis.position, currentPlayer) <= VISIBLE_RANGE;
      if (officer.group.visible) applyPersonRagdollPose(officer, officerPose, alpha);
    } else {
      officer.group.visible = officerState.active && distance(officerState, currentPlayer) <= VISIBLE_RANGE;
      if (officer.group.visible) { const pose = interpolateImmersivePose(officerState.previous, officerState, alpha); officer.group.position.set(pose.x, 0, pose.z); officer.group.rotation.y = pose.heading; officer.update(officerState.speed, elapsed, officerState.speed < .05 ? 'phone' : 'idle'); }
    }
    group.userData.policeResponse = { caseId, responseAge, cars: units.filter(unit => unit.active).map(({ id, x, z, heading, speed, leaving }) => ({ id, x, z, heading, speed, leaving })), officer: { id: officerState.id, x: officerState.x, z: officerState.z, heading: officerState.heading, active: officerState.active, down: officerDown } };
  };
  const applyRagdollPoses = (poses: readonly PhysicsRagdollPose[], alpha = 1) => {
    if (disposed) return;
    const pose = poses.find(pose => pose.npcId === officerState.id);
    if (pose && applyPersonRagdollPose(officer, pose, alpha)) { officerDown = true; officerPose = pose; officerState.active = false; officerState.speed = 0; }
    else if (officerDown && !pose) { officerPose = null; officer.group.visible = false; }
  };
  const applyStandingPoses = (poses: readonly PhysicsPedestrian[]) => {
    if (disposed || officerDown || !officerState.active) return;
    const pose = poses.find(pose => pose.id === officerState.id);
    if (pose && Number.isFinite(pose.x) && Number.isFinite(pose.z)) { officerState.x = pose.x; officerState.z = pose.z; if (Number.isFinite(pose.speed)) officerState.speed = Math.max(0, pose.speed!); }
  };
  const actors = (): PoliceActor[] => disposed ? [] : units.filter(unit => unit.active).map(({ id, x, z, heading, speed, width, length, previous }) => ({ id, x, z, heading, speed, width, length, previous: { x: previous.x, z: previous.z } }));
  const pedestrians = (): PolicePerson[] => disposed || !officerState.active ? [] : [{ id: officerState.id, x: officerState.x, z: officerState.z, heading: officerState.heading, speed: officerState.speed, active: true, previous: { x: officerState.previous.x, z: officerState.previous.z } }];
  const dispose = () => { if (disposed) return; disposed = true; officer.dispose(); assets.dispose(); group.removeFromParent(); group.clear(); };
  return { group, update, render, actors, pedestrians, applyStandingPoses, applyRagdollPoses, dispose };
}
