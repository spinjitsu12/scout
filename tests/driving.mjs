import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/driving.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const driving = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const { DISTRICT_GEOMETRIES, assistedSteering, assistedWaypointReached, districtCamera, districtMove, districtRoadRoute, districtToScreen, districtToWorld, driveDistance, driveInput, exitVehicle, fuelAfterDistance, stepSteeredVehicle, steeringInput, vehicleFootprintFits } = driving;
const locations = [
  [{ x: 387, y: 266 }, { x: 1159, y: 266 }, { x: 388, y: 718 }, { x: 1138, y: 718 }, { x: 840, y: 620 }],
  [{ x: 375, y: 275 }, { x: 1170, y: 275 }, { x: 375, y: 752 }, { x: 1170, y: 752 }, { x: 840, y: 620 }],
  [{ x: 383, y: 266 }, { x: 1167, y: 266 }, { x: 384, y: 702 }, { x: 1185, y: 702 }, { x: 840, y: 620 }],
];
let routes = 0;
for (let tier = 0; tier < 3; tier++) for (const kind of ['compact', 'wagon', 'coupe']) {
  const geometry = DISTRICT_GEOMETRIES[tier];
  for (let from = 0; from < 5; from++) for (let to = 0; to < 5; to++) {
    if (from === to) continue;
    let motion = { position: { ...locations[tier][from] }, velocity: { x: 0, y: 0 }, heading: 0 };
    const route = districtRoadRoute(motion.position, locations[tier][to], geometry);
    assert.ok(route.length, `A real road route connects tier${tier} ${from}->${to}`);
    const pending = [...route]; let steps = 0, distance = 0;
    while (pending.length && steps++ < 5000) {
      while (pending.length > 1 && assistedWaypointReached(motion, pending[0])) pending.shift();
      if (pending.length === 1 && assistedWaypointReached(motion, pending[0])) { pending.shift(); break; }
      const before = motion.position;
      motion = stepSteeredVehicle(motion, assistedSteering(motion, pending[0], pending.length === 1), 1 / 60, kind, geometry);
      assert.ok(vehicleFootprintFits(motion.position, motion.heading, kind, geometry), 'The actual oriented vehicle stays on the paved road at every frame');
      distance += driveDistance(before, motion.position);
    }
    assert.equal(pending.length, 0, `Assisted ${kind} reaches tier${tier} ${from}->${to}, including every corner and the fuel forecourt`);
    assert.ok(driveDistance(motion.position, locations[tier][to]) < 4, 'Assisted routes stop at the venue instead of teleporting there');
    assert.ok(distance >= driveDistance(locations[tier][from], locations[tier][to]) - 4, 'Distance is measured along the driven route');
    assert.ok(exitVehicle(motion.position, motion.heading, geometry), 'Every venue has a safe place to exit the car');
    routes++;
  }
}
assert.deepEqual(steeringInput(new Set(['w', 'd'])), { throttle: 1, steer: 1, brake: false });
assert.deepEqual(steeringInput(new Set(['s', ' '])), { throttle: -1, steer: 0, brake: true });
assert.ok(Math.abs(Math.hypot(...Object.values(driveInput(new Set(['w', 'd'])))) - 1) < 1e-10, 'Walking diagonally is not faster');
const geometry = DISTRICT_GEOMETRIES[0];
let car = { position: { x: 450, y: 266 }, velocity: { x: 0, y: 0 }, heading: 0 };
for (let i = 0; i < 60; i++) car = stepSteeredVehicle(car, { throttle: 1, steer: 0, brake: false }, 1 / 60, 'compact', geometry);
assert.ok(car.position.x > 640 && Math.abs(car.position.y - 266) < .001, 'W drives forward relative to the car heading, rather than screen north');
const oldSpeed = Math.hypot(car.velocity.x, car.velocity.y);
for (let i = 0; i < 30; i++) car = stepSteeredVehicle(car, { throttle: 0, steer: 0, brake: true }, 1 / 60, 'compact', geometry);
assert.ok(Math.hypot(car.velocity.x, car.velocity.y) < oldSpeed / 100, 'The brake stops the car smoothly');
const collision = districtMove({ x: 100, y: 110 }, { x: 700, y: 0 }, false, geometry);
assert.ok(collision.x <= 137, 'A long frame cannot tunnel through a building');
assert.equal(fuelAfterDistance(12, 650, 'compact'), 11);
assert.equal(fuelAfterDistance(12, 520, 'wagon'), 11);
assert.equal(fuelAfterDistance(12, 600, 'coupe'), 11);
assert.equal(fuelAfterDistance(.2, 500, 'compact'), 0, 'An empty tank clamps at zero');
assert.equal(fuelAfterDistance(3, 0, 'coupe'), 3, 'Stationary or blocked cars burn no distance fuel');
const phone = districtCamera(390, 780, { x: 1159, y: 266 }), world = { x: 1103, y: 215 };
assert.ok(phone.x > 900, 'Phone view follows the district instead of shrinking the whole map');
assert.ok(driveDistance(districtToWorld(districtToScreen(world, phone), phone), world) < .00001, 'Touch points follow the scrolling camera exactly');
console.log(`Driving checks passed: ${routes} actual assisted trips across all chapters and all cars, oriented collisions, safe exits, steer controls, braking, fuel consumption, and phone camera mapping.`);
