import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PERSON_PART_NAMES } from '../src/lib/immersive-assets.ts';
import { createPoliceResponseWorld } from '../src/lib/immersive-police.ts';
import { createTrafficWorld } from '../src/lib/immersive-traffic.ts';
import { POLICE_ARRIVAL_SECONDS } from '../src/lib/immersive-law.ts';
import { REGIONAL_SETTLEMENTS, regionalPointOnRoad } from '../src/lib/regional-roads.ts';

const dt = 1 / 120, distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const incident = (position, seconds = 0, sequence = 1) => ({ id: `law:${sequence}:resident`, npcId: 'resident', position, speed: 14, phase: seconds >= POLICE_ARRIVAL_SECONDS ? 'arrived' : 'dispatched', elapsedSeconds: seconds });

// Reopening a pending career reconstructs the real bounded response controller
// at its persisted age rather than dispatching distant cars from zero again.
for (const savedAge of [18, 28, 30]) {
  const position = { x: 2970, z: 1105 }, player = { ...position, heading: 0, speed: 0 }, restored = createPoliceResponseWorld(), continuous = createPoliceResponseWorld();
  try {
    for (let tick = 0; tick <= Math.round(savedAge / dt); tick++) continuous.update(incident(position, tick * dt), player, dt, tick * dt);
    const persisted = incident(position, savedAge), original = structuredClone(persisted);
    restored.update(persisted, player, dt, 0); restored.render(1, 0); continuous.render(1, savedAge);
    assert.deepEqual(persisted, original, 'Visual reconstruction never mutates the persisted law response');
    const restoredCars = restored.actors(), continuousCars = continuous.actors(); assert.equal(restoredCars.length, continuousCars.length);
    for (let index = 0; index < restoredCars.length; index++) assert(distance(restoredCars[index], continuousCars[index]) < .00001, `${savedAge}s restored patrol matches continuous authored response progress`);
    assert(restored.group.children.some(object => object.name.startsWith('Regional patrol') && object.visible), `${savedAge}s restored response has patrols visible on its first render`);
    if (savedAge >= 28) assert.equal(restored.pedestrians().length, 1, `${savedAge}s restored on-scene case has its officer on the first render`);
    assert.equal(restored.pedestrians().length, continuous.pedestrians().length);
    const held = structuredClone(restored.group.userData.policeResponse), heldCars = structuredClone(restored.actors()), heldPeople = structuredClone(restored.pedestrians());
    for (let tick = 0; tick < 20; tick++) { restored.update(persisted, player, 0, 0); restored.render(1, 0); }
    assert.deepEqual(restored.actors(), heldCars); assert.deepEqual(restored.pedestrians(), heldPeople); assert.deepEqual(restored.group.userData.policeResponse, held, 'Paused restored patrols and officer retain their controller poses and response age');
    if (savedAge === 18) {
      for (let tick = 1; tick <= 10 / dt; tick++) restored.update(incident(position, savedAge + tick * dt), player, dt, tick * dt);
      assert.equal(restored.pedestrians().length, 1, 'An 18s reload reaches the officer normally before impound');
    }
    const beforeNewCase = restored.actors(); restored.update(incident({ x: position.x + 60, z: position.z }, 28, 2), player, dt, 31); restored.render(1, 31);
    assert(restored.actors().every((car, index) => distance(car, beforeNewCase[index]) <= 29 * dt + .001), 'A later live case preserves continuous visible positions even if supplied a nonzero age');
    assert(restored.group.userData.policeResponse.responseAge < .1, 'Only fresh-world restoration primes persisted age; a live replacement starts its own controller clock');
  } finally { restored.dispose(); continuous.dispose(); }
}

let maximumStep = 0;
for (const position of [{ x: 768, z: 500 }, { x: 2970, z: 1105 }, ...REGIONAL_SETTLEMENTS.slice(1).map(region => region.center)]) {
  const response = createPoliceResponseWorld(), player = { ...position, heading: 0, speed: 0 };
  try {
    response.update(null, player, dt, 0); response.render(1, 0);
    assert.equal(response.actors().length, 0); assert.equal(response.pedestrians().length, 0);
    response.update(incident(position), player, dt, 0); response.render(1, 0);
    const models = response.group.children.filter(object => object.name.startsWith('Regional patrol'));
    assert.equal(models.length, 2, 'The response uses two fixed patrol models');
    assert(models.every(model => !model.visible), 'Cars dispatch on connected roads outside model visibility');
    assert.equal(response.actors().length, 2); assert(response.actors().every(car => distance(car, position) > 360));
    let previous = response.actors(), sawCars = false, sawOfficer = false;
    for (let tick = 1; tick <= 30 / dt; tick++) {
      const seconds = tick * dt;
      response.update(incident(position, seconds), player, dt, seconds); response.render(.5, seconds);
      const cars = response.actors();
      assert.equal(cars.length, 2); assert(cars.every(car => regionalPointOnRoad(car, .05)), 'Patrol approaches follow real rendered roads');
      for (let index = 0; index < cars.length; index++) {
        const movement = distance(previous[index], cars[index]); maximumStep = Math.max(maximumStep, movement);
        assert(movement <= 29 * dt + .001, 'Patrol models approach continuously without a position snap');
      }
      previous = cars; sawCars ||= models.some(model => model.visible); sawOfficer ||= response.pedestrians().length === 1;
      if (seconds < POLICE_ARRIVAL_SECONDS) assert.equal(response.pedestrians().length, 0, 'Officer exits only during the on-scene phase');
    }
    assert(sawCars && sawOfficer, 'A real lit patrol and officer arrive during the response');
    assert(response.actors().every(car => car.speed === 0));
    const officer = response.pedestrians()[0]; assert.equal(officer.id, 'police:officer-1'); assert(officer.active);
    response.update(null, player, dt, 30); response.render(.5, 30);
    assert.equal(response.actors().length, 2, 'Case completion begins a departure rather than removing visible patrols');
    previous = response.actors();
    for (let tick = 1; tick <= 120 / dt; tick++) {
      const seconds = 30 + tick * dt;
      response.update(null, player, dt, seconds); response.render(.5, seconds);
      const cars = response.actors();
      for (const car of cars) { const prior = previous.find(item => item.id === car.id); if (prior) assert(distance(prior, car) <= 29 * dt + .001, 'Departure follows a continuous road trajectory'); }
      previous = cars;
    }
    assert.equal(response.actors().length, 0); assert.equal(response.pedestrians().length, 0);
    assert(models.every(model => !model.visible), 'Departed patrols release their active physics actors outside rendering range');
    response.update(incident(position, 0, 2), player, dt, 151); response.render(1, 151);
    assert.equal(response.group.children.filter(object => object.name.startsWith('Regional patrol')).length, 2, 'New cases reuse the bounded vehicle models');
  } finally { response.dispose(); response.dispose(); }
}

// A live case update/reload never relocates patrols already visible to the player.
const world = createPoliceResponseWorld({ maxCars: 1 }), player = { x: 2970, z: 1105, heading: 0, speed: 0 };
for (let tick = 0; tick <= 23 / dt; tick++) world.update(incident(player, tick * dt), player, dt, tick * dt);
world.render(1, 23);
const before = world.actors()[0]; world.update(incident({ x: 3030, z: 1105 }, 0, 2), player, dt, 24);
assert(distance(before, world.actors()[0]) <= 29 * dt + .001, 'Changing the live case retains a visible car position');
for (let tick = 0; tick <= 23 / dt; tick++) world.update(incident({ x: 3030, z: 1105 }, tick * dt, 2), player, dt, 24 + tick * dt);
world.render(1, 47);
const officerId = world.pedestrians()[0]?.id; assert(officerId, 'Replacement officer reaches the updated scene');
const officerBefore = world.pedestrians()[0];
world.applyStandingPoses([{ ...officerBefore, x: officerBefore.x + .1, z: officerBefore.z + .05 }]);
assert.equal(world.pedestrians()[0].x, officerBefore.x + .1); assert.equal(world.pedestrians()[0].z, officerBefore.z + .05);
assert(Number.isFinite(world.pedestrians()[0].speed), 'Officer supplies actual walking speed to the shared physics actor');
const parts = Object.fromEntries(PERSON_PART_NAMES.map((name, index) => [name, { position: { x: 3030 + index * .01, y: .5, z: 1105 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }]));
world.applyRagdollPoses([{ id: officerId, npcId: officerId, age: 0, settled: false, parts, previous: parts }], .5); world.render(.5, 48);
const officerModel = world.group.getObjectByName('Regional response officer');
assert(officerModel.userData.ragdoll); assert.equal(world.pedestrians().length, 0, 'A struck officer stops contributing a standing collider');
assert.equal(officerModel.position.x, 0, 'Normal police animation never overwrites engine limb coordinates');
world.applyRagdollPoses([], 1); assert(!officerModel.visible, 'Engine retirement removes the retired ragdoll render');
world.update(incident({ x: 3030, z: 1105 }, 0, 3), player, dt, 49);
for (let tick = 0; tick <= 23 / dt; tick++) world.update(incident({ x: 3030, z: 1105 }, tick * dt, 3), player, dt, 49 + tick * dt);
assert.equal(world.pedestrians()[0]?.id, 'police:officer-3', 'A later case safely reuses a retired officer model with a new physical identity');
assert.equal(officerModel.userData.ragdoll, false, 'Safe reuse restores normal articulated animation');
const resources = new Set(); world.group.traverse(object => { if (object instanceof THREE.Mesh) { resources.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { resources.add(material); if (material.map) resources.add(material.map); } } });
const disposals = new Map([...resources].map(resource => [resource, 0])); resources.forEach(resource => resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1)));
world.dispose(); world.dispose(); assert([...disposals.values()].every(count => count === 1), 'Patrol/officer resources dispose exactly once');

// The physics engine supplies body centers, while the modeled post is authored around its ground base.
const traffic = createTrafficWorld({ maxCars: 0 }), prop = traffic.props.find(prop => prop.kind === 'lamp'), model = traffic.group.getObjectByName(prop.id);
assert(prop && model);
const beforePose = { position: { x: prop.x, y: prop.height / 2, z: prop.z }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
const afterPose = { id: prop.id, height: prop.height, fallen: true, previous: beforePose, position: { x: prop.x + 12, y: .2, z: prop.z }, quaternion: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } };
traffic.applyPropPoses([afterPose]); traffic.render(prop, 1, dt, .5);
const expectedRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4), expectedCenter = new THREE.Vector3(prop.x + 6, (prop.height / 2 + .2) / 2, prop.z);
const expectedOrigin = expectedCenter.sub(new THREE.Vector3(0, prop.height / 2, 0).applyQuaternion(expectedRotation));
assert(model.position.distanceTo(expectedOrigin) < .000001); assert(model.quaternion.angleTo(expectedRotation) < .000001); assert.equal(prop.state, 'fallen');
traffic.applyPropPoses([{ ...afterPose, position: { x: NaN, y: 0, z: 0 } }]); traffic.render(prop, 2, dt, .5);
assert(model.position.distanceTo(expectedOrigin) < .000001, 'Invalid external transforms do not corrupt the last usable pose');
const moved = { ...afterPose, previous: { position: { x: prop.x + 700, y: .2, z: prop.z }, quaternion: afterPose.quaternion }, position: { x: prop.x + 700, y: .2, z: prop.z } };
traffic.applyPropPoses([moved]); traffic.render({ x: prop.x + 700, z: prop.z }, 3, dt, 1); assert(model.visible, 'Moved props use their actual engine location for visibility');
traffic.render(prop, 4, dt, 1); assert(!model.visible);
traffic.dispose(); traffic.dispose();
console.log(`PASS: persisted 18/28/30s response reconstruction and frozen reload poses; bounded physical patrol/officer response in eight regional scenes, continuous approach/departure (max ${maximumStep.toFixed(3)} m/tick), reusable models, hittable officer ragdoll binding, engine-driven post interpolation/visibility, and exact disposal.`);
