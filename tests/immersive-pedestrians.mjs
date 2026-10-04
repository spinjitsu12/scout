import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPedestrianRoutes, createPedestrianWorld } from '../src/lib/immersive-pedestrians.ts';
import { createPerson, applyPersonRagdollPose, PERSON_PART_NAMES } from '../src/lib/immersive-assets.ts';
import { createImmersiveClock, advanceImmersiveClock } from '../src/lib/immersive-motion.ts';
import { buildImmersiveWorld } from '../src/lib/immersive-world.ts';
import { WORLD_ROADS, WORLD_SIZE, REGIONAL_SETTLEMENTS } from '../src/lib/immersive-locations.ts';
import { createWorldCollisionIndex, nearbyWorldCollisions } from '../src/lib/immersive-spatial.ts';
const near = (actual, expected, message, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const walking = pool => pool.states.filter(state => state.lifecycle === 'walking' && state.actorId);
const fixtures = { collisions: [], locations: [], interactables: [{ id: 'test-landmark', type: 'thought', locationId: -1, label: 'Plaza', position: { x: 180, z: 240 }, range: 2 }], roads: [{ id: 'test-street', x: 200, z: 200, width: 240, depth: 12, kind: 'street', regionId: 'test', speedLimit: 13.4 }] };
function poseParts(offset = 0) {
  const centers = { pelvis: [0, .82, 0], torso: [0, 1.14, 0], head: [0, 1.57, 0], upperArmL: [-.27, 1.22, 0], lowerArmL: [-.27, .975, 0], upperArmR: [.27, 1.22, 0], lowerArmR: [.27, .975, 0], upperLegL: [-.11, .60, 0], lowerLegL: [-.11, .275, 0], upperLegR: [.11, .60, 0], lowerLegR: [.11, .275, 0] };
  return Object.fromEntries(PERSON_PART_NAMES.map((name, index) => { const [x, y, z] = centers[name], q = new THREE.Quaternion().setFromEuler(new THREE.Euler(offset * .4 + index * .02, index * .09, -offset * .25)); return [name, { position: { x: x + 120 + offset, y: y + offset * .2, z: z + 230 - offset * .8 }, quaternion: { x: q.x, y: q.y, z: q.z, w: q.w } }]; }));
}
// A genuine jointed model binds each independent body-center pose in world
// space, including when a containing group has a non-identity transform.
const person = createPerson({ avatar: 6 }), parent = new THREE.Group(); parent.position.set(4, 1, 9); parent.rotation.y = .7; parent.scale.set(1.2, 1.2, 1.2); parent.add(person.group); parent.updateMatrixWorld(true);
const restBounds = new THREE.Box3().setFromObject(person.group), restGeometry = new Set(); person.group.traverse(object => { if (object.isMesh) restGeometry.add(object.geometry); });
assert.equal(Object.keys(person.rig).length, 11); assert.equal(new Set(Object.values(person.rig).map(part => part.object)).size, 11, 'Eleven engine parts drive eleven distinct existing model parts');
const pose = { previous: poseParts(0), parts: poseParts(2) };
assert.equal(applyPersonRagdollPose(person, pose, .5), true);
for (const name of PERSON_PART_NAMES) {
  const previous = pose.previous[name], current = pose.parts[name], q = new THREE.Quaternion(previous.quaternion.x, previous.quaternion.y, previous.quaternion.z, previous.quaternion.w).slerp(new THREE.Quaternion(current.quaternion.x, current.quaternion.y, current.quaternion.z, current.quaternion.w), .5);
  const expected = new THREE.Vector3((previous.position.x + current.position.x) / 2, (previous.position.y + current.position.y) / 2, (previous.position.z + current.position.z) / 2).add(person.rig[name].pivotFromCenter.clone().applyQuaternion(q));
  const actual = person.rig[name].object.getWorldPosition(new THREE.Vector3()), actualQ = person.rig[name].object.getWorldQuaternion(new THREE.Quaternion()); near(actual.distanceTo(expected), 0, `${name} binds its own center/joint pivot`); near(actualQ.angleTo(q), 0, `${name} interpolates its own world quaternion`, 1e-7);
}
assert.equal(person.group.userData.ragdoll, true); const heldArm = person.leftArm.quaternion.clone(); person.update(2, 99, 'phone'); assert.ok(person.leftArm.quaternion.equals(heldArm), 'Walking and phone animation cannot overwrite a ragdoll');
const invalid = structuredClone(pose); invalid.parts.head.position.y = Number.NaN; assert.equal(applyPersonRagdollPose(person, invalid), false, 'Corrupt poses are rejected before altering the model');
person.resetPose(); person.group.position.set(0, 0, 0); assert.equal(person.group.userData.ragdoll, false); const restoredBounds = new THREE.Box3().setFromObject(person.group); assert.ok(restoredBounds.getSize(new THREE.Vector3()).distanceTo(restBounds.getSize(new THREE.Vector3())) < .02, 'Reusing a retired display slot restores its standing joint proportions');
person.update(1.4, .2); assert.notEqual(person.leftArm.rotation.x, 0); const sameGeometry = new Set(); person.group.traverse(object => { if (object.isMesh) sameGeometry.add(object.geometry); }); assert.deepEqual(sameGeometry, restGeometry, 'Ragdoll binding never creates substitute body geometry'); person.dispose(); person.dispose();

const pool = createPedestrianWorld({ ...fixtures, maxPeople: 999 }); assert.equal(pool.modelCount, 12, 'Model allocation is capped even if an invalid population is requested'); const originalModels = [...pool.group.children];
pool.setFocus({ position: { x: 200, z: 224 }, interior: null, driving: true, population: 8 }); pool.render(0);
const starts = walking(pool); assert.ok(starts.length >= 4); assert.ok(starts.every(state => distance(state, { x: 200, z: 224 }) >= 4), 'Driving focus never spawns a person inside or beside the car');
for (const state of starts) { assert.match(state.actorId, /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/); assert.equal(state.actorId, `pedestrian:${state.routeId}`); for (const other of starts) if (state !== other) assert.ok(distance(state, other) >= .95, 'Initial people never overlap'); }
const retained = starts.map(state => ({ ...state })); pool.setFocus({ position: { x: 238, z: 224 }, interior: null, driving: true, population: 8 });
for (const prior of retained.filter(state => distance(state, { x: 238, z: 224 }) < 60)) { const current = pool.states.find(state => state.actorId === prior.actorId); assert.ok(current, 'A nearby actor keeps its route assignment'); near(current.x, prior.x, 'A focus transition cannot teleport a nearby actor'); near(current.z, prior.z, 'A focus transition preserves route progress'); }
assert.deepEqual(pool.group.children, originalModels, 'Focusing cannot allocate another character');
const target = walking(pool)[0], id = target.actorId, model = pool.modelForActor(id), first = { ...target };
assert.ok(pool.nearbyCollisions(target).some(collision => collision.id === id)); assert.equal(pool.blocksPoint(target), true);
assert.equal(pool.strike(id), true); assert.equal(pool.strike(id), false, 'A person produces only one confirmed hit'); assert.equal(target.lifecycle, 'struck');
for (let tick = 0; tick < 240; tick++) pool.update(1 / 120, tick / 120); near(target.x, first.x, 'A struck person cannot continue route walking'); assert.ok(!pool.physicsPedestrians().some(actor => actor.id === id)); assert.ok(!pool.nearbyCollisions(target).some(collision => collision.id === id), 'Standing collision proxies are replaced by engine limb bodies');
pool.setFocus({ position: { x: 8000, z: 8000 }, interior: null }); assert.equal(pool.modelForActor(id), model, 'A ragdoll display slot remains reserved across focus changes');
pool.setFocus({ position: { x: 120, z: 230 }, interior: null }); assert.equal(pool.states.filter(state => state.actorId === id).length, 1, 'A reserved route actor cannot respawn in a second model slot'); assert.equal(pool.applyRagdollPose(id, pose, .5), true); assert.equal(target.lifecycle, 'down'); assert.equal(model.group.userData.ragdoll, true); near(target.x, pose.parts.pelvis.position.x, 'Visibility follows the solved ragdoll pelvis');
assert.equal(pool.retire(id), true); assert.equal(pool.retire(id), false); pool.setFocus({ position: { x: 238, z: 224 }, interior: null, population: 12 }); assert.ok(!walking(pool).some(actor => actor.actorId === id), 'A resolved actor never respawns under a reused model-slot identity');
const another = walking(pool)[0], correction = { id: another.actorId, x: another.x + .1, z: another.z + .05, heading: .2, speed: .3 }; pool.applyStandingPoses([correction]); near(another.x, correction.x, 'Living actor receives engine-solved position'); near(another.z, correction.z, 'Physical bumps are reflected in the model');
pool.setFocus({ position: { x: 180, z: 240 }, interior: 5, population: 12 }); assert.equal(walking(pool).length, 0, 'The private apartment never receives generic residents');
const geometries = new Set(), materials = new Set(); pool.group.traverse(object => { if (object.isMesh) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } }); let geoDisposed = 0, matDisposed = 0; geometries.forEach(resource => resource.addEventListener('dispose', () => geoDisposed++)); materials.forEach(resource => resource.addEventListener('dispose', () => matDisposed++)); const scene = new THREE.Scene(); scene.add(pool.group); pool.dispose(); pool.dispose(); assert.equal(pool.group.parent, null); assert.equal(pool.group.children.length, 0); assert.equal(geoDisposed, geometries.size); assert.equal(matDisposed, materials.size); assert.deepEqual(pool.physicsPedestrians(), []);
// Persistent handled IDs can be seeded before there is a display slot.
const seeded = createPedestrianWorld({ ...fixtures, maxPeople: 6 }); assert.equal(seeded.retire(id), true); seeded.setFocus({ position: { x: 238, z: 224 }, interior: null, population: 6 }); assert.ok(!walking(seeded).some(state => state.actorId === id)); seeded.dispose();

const simulation = (fps, seconds = 24) => { const result = createPedestrianWorld({ ...fixtures, maxPeople: 6 }); result.setFocus({ position: { x: 200, z: 224 }, interior: null, population: 6 }); let clock = createImmersiveClock(), elapsed = 0; for (let frame = 0; frame < fps * seconds; frame++) { const next = advanceImmersiveClock(clock, 1 / fps); clock = next.clock; for (let tick = 0; tick < next.steps; tick++) { elapsed += next.stepSeconds; result.update(next.stepSeconds, elapsed); } result.render(elapsed, next.alpha, 1 / fps); } const states = walking(result).map(state => ({ ...state })); result.dispose(); return states; };
const baseline = simulation(120); for (const fps of [30, 60, 144]) { const result = simulation(fps); assert.equal(result.length, baseline.length); for (let i = 0; i < result.length; i++) { assert.equal(result[i].actorId, baseline[i].actorId); near(result[i].x, baseline[i].x, `${fps}Hz fixed-tick actor X`); near(result[i].z, baseline[i].z, `${fps}Hz fixed-tick actor Z`); near(result[i].heading, baseline[i].heading, `${fps}Hz fixed-tick actor heading`); } }
function stationaryObstacle(obstacle) { const result = createPedestrianWorld({ ...fixtures, maxPeople: 1 }); result.setFocus({ position: { x: 200, z: 224 }, interior: null, population: 1 }); const actor = walking(result)[0], start = { ...actor }; for (let tick = 0; tick < 1800; tick++) result.update(1 / 120, tick / 120, obstacle(start)); near(actor.x, start.x, 'An occupied path cannot be entered'); near(actor.z, start.z, 'An occupied path never displaces a resident through another body'); result.dispose(); }
stationaryObstacle(start => ({ player: start })); stationaryObstacle(start => ({ blockedPoints: [start] })); stationaryObstacle(start => ({ vehicle: { ...start, speed: 22, heading: .6 } })); stationaryObstacle(start => ({ nearbyCollisions: () => [{ id: 'traffic-bollard', kind: 'prop', minX: start.x - .2, maxX: start.x + .2, minZ: start.z - .2, maxZ: start.z + .2, minY: 0, maxY: 1 }] }));
const above = createPedestrianWorld({ ...fixtures, maxPeople: 1 }); above.setFocus({ position: { x: 200, z: 224 }, interior: null }); const overheadActor = walking(above)[0], initial = { ...overheadActor }; for (let tick = 0; tick < 1800; tick++) above.update(1 / 120, tick / 120, { nearbyCollisions: () => [{ id: 'above', kind: 'prop', minX: initial.x - 200, maxX: initial.x + 200, minZ: initial.z - 200, maxZ: initial.z + 200, minY: 3, maxY: 4 }] }); assert.ok(distance(overheadActor, initial) > 2, 'Overhead traffic fixtures do not become invisible floor-level barriers'); const beforeGap = { ...overheadActor }; above.update(90, 105); above.update(Number.NaN, 105); near(overheadActor.x, beforeGap.x, 'Hidden or invalid time is never replayed'); above.dispose();

// Probe all three tiers against the actual world, including signposts, furniture,
// venue doors/parking and road widths, rather than a mock district.
let totalRoutes = 0, probes = 0;
for (const tier of [0, 1, 2]) {
  const world = buildImmersiveWorld({ tier, ambientResidents: false });
  try {
    const routes = createPedestrianRoutes(world), index = createWorldCollisionIndex(world.collisions), roadBounds = WORLD_ROADS.map(road => ({ minX: road.x - road.width / 2, maxX: road.x + road.width / 2, minZ: road.z - road.depth / 2, maxZ: road.z + road.depth / 2 })); totalRoutes += routes.length;
    assert.ok(routes.length > 700, `Tier ${tier} has living routes throughout its actual region`); assert.equal(new Set(routes.map(route => route.id)).size, routes.length); assert.ok(!routes.some(route => route.interior === 5));
    for (const settlement of REGIONAL_SETTLEMENTS) assert.ok(routes.some(route => route.regionId === settlement.id && route.interior === null), `${settlement.name} has actual outdoor routes`);
    for (const route of routes) { assert.match(`pedestrian:${route.id}`, /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/); assert.ok(route.length >= (route.interior === null ? 10 : 7));
      for (let segment = 1; segment < route.points.length; segment++) { const a = route.points[segment - 1], b = route.points[segment], span = distance(a, b), count = Math.ceil(span / .15), nearby = nearbyWorldCollisions(index, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, span / 2 + 1, .1, 1.85);
        for (let sample = 0; sample <= count; sample++) { const point = { x: a.x + (b.x - a.x) * sample / count, z: a.z + (b.z - a.z) * sample / count }; probes++; assert.ok(point.x >= .45 && point.z >= .45 && point.x <= WORLD_SIZE.width - .45 && point.z <= WORLD_SIZE.depth - .45); assert.ok(!nearby.some(solid => point.x > solid.minX - .449 && point.x < solid.maxX + .449 && point.z > solid.minZ - .449 && point.z < solid.maxZ + .449), `Tier ${tier} ${route.id} intersects a real physical wall/fixture`);
          if (route.interior === null) assert.ok(!roadBounds.some(solid => point.x > solid.minX - .699 && point.x < solid.maxX + .699 && point.z > solid.minZ - .699 && point.z < solid.maxZ + .699), `${route.id} never enters active road lanes`);
        }
      }
    }
  } finally { world.dispose(); }
}
// A tiny post positioned between coarse route samples still splits the rail.
const thin = { id: 'thin-between-samples', kind: 'furniture', minX: 150.125, maxX: 150.14, minZ: 206.9, maxZ: 208, minY: 0, maxY: 1.6 };
for (const route of createPedestrianRoutes({ ...fixtures, interactables: [], collisions: [thin] })) for (let i = 1; i < route.points.length; i++) { const a = route.points[i - 1], b = route.points[i]; if (a.z === b.z && a.z > thin.minZ - .45 && a.z < thin.maxZ + .45) assert.ok(Math.max(a.x, b.x) <= thin.minX - .45 || Math.min(a.x, b.x) >= thin.maxX + .45, 'Swept clearance catches posts between paving samples'); }
console.log(`Pedestrian checks passed: ${totalRoutes} actual routes and ${probes} geometry probes across three tiers; stable actor identities, bounded pool/spawn clearance, preserved focus, private apartment, deterministic 30/60/120/144Hz movement, local obstacle heights/yielding, struck/down/retired lifecycle, persistent handled IDs, engine-solved standing correction, actual eleven-part quaternion-interpolated rig binding and resource cleanup.`);
