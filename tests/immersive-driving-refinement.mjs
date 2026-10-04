import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const load = async name => {
  const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const { createImmersiveVehicle, stepImmersiveVehicle, immersiveVehicleFits, immersiveImpactDamage,
  applyImmersiveVehicleImpact, repairImmersiveVehicle, immersiveVehicleTelemetry, IMMERSIVE_VEHICLE } = await load('immersive-driving');
const { createImmersiveClock, advanceImmersiveClock, interpolateImmersivePose } = await load('immersive-motion');
const idle = { throttle: 0, brake: 0, steer: 0 }, accelerate = { ...idle, throttle: 1 };
const run = (state, input, seconds, world, fps = 120) => {
  for (let tick = 0; tick < seconds * fps; tick++) state = stepImmersiveVehicle(state, input, 1 / fps, world);
  return state;
};
const timedDrive = fps => {
  let clock = createImmersiveClock(), car = createImmersiveVehicle({ x: 0, z: 0 }), previous = car, ticks = 0;
  const began = performance.now();
  const schedule = [[12, accelerate], [3, { ...accelerate, steer: .7 }], [4, { ...idle, brake: 1 }], [3, { ...idle, brake: 1, reverse: true }], [2, accelerate]];
  for (const [seconds, input] of schedule) for (let frame = 0; frame < fps * seconds; frame++) {
    const next = advanceImmersiveClock(clock, 1 / fps); clock = next.clock;
    for (let tick = 0; tick < next.steps; tick++) { previous = car; car = stepImmersiveVehicle(car, input, next.stepSeconds); ticks++; }
    const rendered = interpolateImmersivePose(previous, car, next.alpha);
    assert.ok(Number.isFinite(rendered.x) && Number.isFinite(rendered.heading), 'Interpolated car poses stay finite');
  }
  return { car, ticks, milliseconds: performance.now() - began };
};
const reference = timedDrive(120), timings = [];
for (const fps of [30, 60, 120]) {
  const drive = timedDrive(fps); timings.push(`${fps}Hz ${drive.milliseconds.toFixed(1)}ms`);
  assert.equal(drive.ticks, reference.ticks, `${fps}Hz drives the same fixed ticks`);
  for (const key of ['x', 'z', 'heading', 'speed', 'steering', 'distance', 'fuel']) assert.ok(Math.abs(drive.car[key] - reference.car[key]) < 1e-9, `${fps}Hz ${key} matches the reference`);
}
let steering = createImmersiveVehicle({ x: 0, z: 0 });
for (let tick = 0; tick < 120 * 18; tick++) {
  const next = stepImmersiveVehicle(steering, { ...accelerate, steer: .4 }, 1 / 120);
  assert.ok(Math.abs(next.steering - steering.steering) < .035, 'Normal steering has no abrupt wheel snap');
  assert.ok(next.speed ** 2 * Math.abs(Math.tan(next.steering)) / IMMERSIVE_VEHICLE.wheelbase <= IMMERSIVE_VEHICLE.maxLateralAcceleration + .01, 'Steering remains inside grip'); steering = next;
}
const wall = { minX: -10, maxX: 10, minZ: -12, maxZ: -11.97, id: 'wall', kind: 'wall' };
let events = [];
const world = { solids: [wall], onImpact: impact => events.push(impact) && false };
let car = run({ ...createImmersiveVehicle({ x: 0, z: 0 }), speed: 29 }, accelerate, 1, world);
assert.ok(immersiveVehicleFits(car, car.heading, world), 'A fast crash cannot cross a thin wall');
assert.equal(car.speed, 0); assert.equal(car.disabled, true); assert.ok(car.damage >= .86 && car.damage <= 1);
assert.equal(events.length, 1, 'Resting contact is not reported every physics tick');
const damaged = car.damage; car = run(car, accelerate, 2, world); assert.equal(car.damage, damaged, 'Holding W at a barrier adds no damage');
assert.equal(immersiveVehicleTelemetry(car).engineRpm, 0, 'A disabled engine is silent');
const repaired = repairImmersiveVehicle(car);
assert.equal(repaired.damage, 0); assert.equal(repaired.disabled, false); assert.equal(repaired.speed, 0);
assert.equal(repaired.distance, car.distance); assert.equal(repaired.fuel, car.fuel);
assert.ok(run(repaired, { ...idle, brake: 1, reverse: true }, 3, world).speed < -1, 'A repaired car can back away');
const approach = { ...createImmersiveVehicle({ x: 0, z: 0 }), speed: 16 };
const merged = run(approach, idle, 1, { solids: [wall] });
const split = run(approach, idle, 1, { solids: [{ ...wall, maxX: 0 }, { ...wall, minX: 0 }] });
assert.ok(Math.abs(merged.damage - split.damage) < 1e-9, 'Wall sections cannot multiply damage');
const sideWall = { minX: 1.15, maxX: 1.2, minZ: -50, maxZ: 50 };
const glancing = run({ ...createImmersiveVehicle({ x: 0, z: 0, heading: -.1 }), speed: 30 }, idle, .5, { solids: [sideWall] });
assert.ok(glancing.damage < .01, 'A shallow side-swipe uses contact speed');
assert.equal(immersiveImpactDamage(2.3), 0, 'Parking taps cause no mechanical damage');
assert.ok(immersiveImpactDamage(12, 'prop') < immersiveImpactDamage(12, 'vehicle'));
assert.equal(createImmersiveVehicle({ x: 0, z: 0, damage: .9 }).disabled, true);
assert.equal(applyImmersiveVehicleImpact(createImmersiveVehicle({ x: 0, z: 0 }), 30, 'vehicle').disabled, true);
const pole = { minX: -.1, maxX: .1, minZ: -8, maxZ: -7.8, id: 'lamp', kind: 'prop' }; events = [];
const destructible = { solids: [pole], onImpact: impact => { events.push(impact); return true; } };
let moving = { ...createImmersiveVehicle({ x: 0, z: 0 }), speed: 12 };
moving = stepImmersiveVehicle(moving, accelerate, .25, destructible);
for (let frame = 0; frame < 3 && !events.length; frame++) moving = stepImmersiveVehicle(moving, accelerate, .1, destructible);
assert.equal(events.length, 1, 'Removed props immediately stop blocking all substeps');
assert.ok(moving.speed > 8); assert.ok(moving.damage > 0 && moving.damage < .1); assert.ok(moving.impactSpeed > 5);
assert.ok(run(moving, accelerate, 1, { solids: [] }).z < pole.minZ - 4);
let zeroEvents = 0;
const invalidClock = stepImmersiveVehicle({ ...createImmersiveVehicle({ x: 0, z: -11.98 }), speed: 20 }, accelerate, Number.NaN, { solids: [wall], onImpact: () => { zeroEvents++; } });
assert.equal(zeroEvents, 0); assert.equal(invalidClock.damage, 0);
const legacy = { ...createImmersiveVehicle({ x: 1, z: 1 }) }; delete legacy.damage; delete legacy.disabled; delete legacy.impactSpeed;
const safeLegacy = stepImmersiveVehicle(legacy, idle, 1 / 60);
assert.equal(safeLegacy.damage, 0); assert.equal(safeLegacy.disabled, false);
const invalid = stepImmersiveVehicle({ ...safeLegacy, x: Number.NaN, speed: Infinity, damage: Number.NaN, throttle: Number.NaN }, { throttle: Infinity, brake: Number.NaN, steer: Infinity }, .1);
for (const value of Object.values(invalid)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
console.log(`Refined driving checks passed: fixed-step parity (${timings.join(', ')}), smooth speed-dependent steering, high-speed wall containment, one-shot collision damage, disabled engines, recovery, yielding props, safe legacy saves and finite input handling.`);
