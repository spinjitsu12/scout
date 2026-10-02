import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/immersive-driving.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const {
  IMMERSIVE_VEHICLE, MPH_PER_METRE_SECOND, METRES_PER_MILE, createImmersiveVehicle,
  immersiveDrivingInput, immersiveFuelAfterDistance, immersiveVehicleFits, immersiveVehicleBlocksPoint,
  immersiveVehicleTelemetry, stepImmersiveVehicle,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const dt = 1 / 60;
const accelerate = { throttle: 1, brake: 0, steer: 0 };
const idle = { throttle: 0, brake: 0, steer: 0 };
const brake = { throttle: 0, brake: 1, steer: 0 };
const reverse = { throttle: 0, brake: 1, steer: 0, reverse: true };
const run = (state, input, seconds, world, frame = dt) => {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += frame) state = stepImmersiveVehicle(state, input, Math.min(frame, seconds - elapsed), world);
  return state;
};
let car = createImmersiveVehicle({ x: 0, z: 0 });
let accelerationSeconds = 0;
while (car.speed * MPH_PER_METRE_SECOND < 60 && accelerationSeconds < 30) {
  car = stepImmersiveVehicle(car, accelerate, dt); accelerationSeconds += dt;
  assert.equal(car.x, 0, 'W drives straight along the starting heading');
  assert.equal(car.y, 0, 'The car stays grounded on every acceleration frame');
}
assert.ok(accelerationSeconds >= 15 && accelerationSeconds <= 18, `The compact takes a measured ${accelerationSeconds.toFixed(2)}s to reach 60mph`);
assert.ok(car.distance > 170 && car.distance < 270, 'Highway speed requires real road distance');
let townCar = createImmersiveVehicle({ x: 0, z: 0 });
let townAcceleration = 0;
while (townCar.speed * MPH_PER_METRE_SECOND < 30) { townCar = stepImmersiveVehicle(townCar, accelerate, dt); townAcceleration += dt; }
assert.ok(townAcceleration > 5.5 && townAcceleration < 8, 'Town speed builds over several seconds');
const townStopStart = townCar.distance;
let brakingSeconds = 0;
while (townCar.speed > .001 && brakingSeconds < 5) { townCar = stepImmersiveVehicle(townCar, brake, dt); brakingSeconds += dt; }
assert.equal(townCar.speed, 0, 'Full braking brings the car to rest');
assert.ok(brakingSeconds > 2 && brakingSeconds < 3.3, 'Stopping from 30mph takes believable time');
assert.ok(townCar.distance - townStopStart > 14 && townCar.distance - townStopStart < 23, 'Braking consumes a sensible stopping distance');
const coast = run({ ...createImmersiveVehicle({ x: 0, z: 0 }), speed: 30 / MPH_PER_METRE_SECOND }, idle, 3);
assert.ok(coast.speed * MPH_PER_METRE_SECOND > 27 && coast.speed * MPH_PER_METRE_SECOND < 30, 'Coasting loses speed gradually');
const atRest = run(createImmersiveVehicle({ x: 18, z: -20 }), { ...idle, steer: 1 }, 2);
assert.equal(atRest.x, 18, 'Stationary steering never strafes'); assert.equal(atRest.z, -20);
assert.equal(atRest.heading, 0, 'A steering wheel cannot spin a stopped chassis');
assert.ok(atRest.steering > .58, 'The wheel visibly turns at rest');
const right = run(createImmersiveVehicle({ x: 0, z: 0 }), { ...accelerate, throttle: .65, steer: .75 }, 4);
const left = run(createImmersiveVehicle({ x: 0, z: 0 }), { ...accelerate, throttle: .65, steer: -.75 }, 4);
assert.ok(right.heading < -.3 && right.x > 1, 'D turns heading right and follows a curved road path');
assert.ok(left.heading > .3 && left.x < -1, 'A turns left instead of translating along screen X');
assert.ok(Math.abs(right.x + left.x) < .00001 && Math.abs(right.z - left.z) < .00001, 'Steering is symmetrical');
assert.ok(Math.abs(run(right, idle, 1).steering) < .005, 'Steering gently recentres');
const fastTurn = stepImmersiveVehicle({ ...createImmersiveVehicle({ x: 0, z: 0 }), speed: 60 / MPH_PER_METRE_SECOND, steering: .6 }, { ...idle, steer: 1 }, dt);
const lateral = fastTurn.speed ** 2 * Math.abs(Math.tan(fastTurn.steering)) / IMMERSIVE_VEHICLE.wheelbase;
assert.ok(lateral <= IMMERSIVE_VEHICLE.maxLateralAcceleration + .001, 'Highway turning respects grip');
let backing = run(createImmersiveVehicle({ x: 0, z: 0 }), reverse, .2);
assert.equal(backing.speed, 0, 'S holds the brake before engaging reverse');
backing = run(backing, reverse, 3);
assert.equal(backing.gear, 'R'); assert.ok(backing.speed < -1 && backing.z > 1, 'S reverses backwards after stopping');
assert.ok(Math.abs(backing.speed) <= IMMERSIVE_VEHICLE.maxReverseSpeed, 'Reverse is a parking speed');
let directionChange = run({ ...createImmersiveVehicle({ x: 0, z: 0 }), speed: 10 }, reverse, 1);
assert.ok(directionChange.speed > 0 && directionChange.gear === 'D', 'S cannot instantly reverse a moving car');
directionChange = run(directionChange, reverse, 3);
assert.ok(directionChange.speed < 0 && directionChange.gear === 'R', 'Reverse waits for a standstill');
assert.equal(run(backing, brake, 2).speed, 0, 'Space stops a reversing car without accelerating it');
const wallWorld = { solids: [{ minX: -8, maxX: 8, minZ: -35, maxZ: -34.95 }] };
let approachWall = createImmersiveVehicle({ x: 0, z: 0 });
for (let frame = 0; frame < 60 * 12; frame++) {
  approachWall = stepImmersiveVehicle(approachWall, accelerate, dt, wallWorld);
  assert.ok(immersiveVehicleFits(approachWall, approachWall.heading, wallWorld), 'The entire car stays outside a thin wall');
  assert.equal(approachWall.y, 0, 'A collision never launches the car');
}
assert.ok(approachWall.z > -32.91 && approachWall.z < -32.85, 'The bonnet stops before the driver point reaches the wall');
assert.equal(approachWall.speed, 0); assert.equal(approachWall.collision, true);
const held = run(approachWall, accelerate, 3, wallWorld);
assert.ok(held.distance - approachWall.distance < .001, 'Holding W against a solid cannot generate hidden travel');
assert.ok(Math.abs(held.fuel - approachWall.fuel) < 1e-7, 'Blocked cars burn no distance fuel');
const narrow = { solids: [{ minX: 1.1, maxX: 10, minZ: -10, maxZ: 10 }] };
assert.equal(immersiveVehicleFits({ x: 0, z: 0 }, 0, narrow), true, 'A parallel sedan fits beside a wall');
assert.equal(immersiveVehicleFits({ x: 0, z: 0 }, Math.PI / 4, narrow), false, 'Diagonal bonnet corners collide');
const parked = createImmersiveVehicle({ x: 0, z: 0 });
assert.equal(immersiveVehicleBlocksPoint({ x: 0, z: 0 }, parked), true, 'The scout cannot walk through the car');
assert.equal(immersiveVehicleBlocksPoint({ x: 1.1, z: 0 }, parked), true, 'The foot radius stops beside the door');
assert.equal(immersiveVehicleBlocksPoint({ x: 1.4, z: 0 }, parked), false, 'Open space beside the door is walkable');
assert.equal(immersiveVehicleBlocksPoint({ x: 0, z: -2.5 }, parked), false, 'The bonnet adds no oversized invisible barrier');
assert.equal(immersiveVehicleBlocksPoint({ x: -1.9, z: 0 }, { ...parked, heading: Math.PI / 2 }), true, 'The parked walking collider rotates with its body');
const boundaries = { solids: [], bounds: { minX: -10, maxX: 10, minZ: -20, maxZ: 10 } };
assert.ok(run(createImmersiveVehicle({ x: 0, z: 0 }), accelerate, 8, boundaries).z >= -20 + IMMERSIVE_VEHICLE.length / 2, 'The world edge contains the whole car');
const sixtyHz = run(createImmersiveVehicle({ x: 0, z: 0 }), accelerate, 12);
const tenHz = run(createImmersiveVehicle({ x: 0, z: 0 }), accelerate, 12, undefined, .1);
assert.ok(Math.abs(sixtyHz.speed - tenHz.speed) < .01 && Math.abs(sixtyHz.z - tenHz.z) < .03, '10Hz and 60Hz produce the same road distance and speed');
const resumed = stepImmersiveVehicle(sixtyHz, accelerate, 120);
assert.ok(Math.hypot(resumed.x - sixtyHz.x, resumed.z - sixtyHz.z) < 8.5, 'Hidden-tab catch-up cannot teleport down a road');
assert.equal(stepImmersiveVehicle(sixtyHz, accelerate, Number.NaN).z, sixtyHz.z, 'An invalid clock creates no movement');
const empty = run(createImmersiveVehicle({ x: 0, z: 0, fuel: 0 }), accelerate, 20);
assert.equal(empty.speed, 0); assert.equal(empty.distance, 0, 'An empty tank cannot provide power');
const emptyCoast = run({ ...createImmersiveVehicle({ x: 0, z: 0, fuel: 0 }), speed: 12, throttle: 1 }, accelerate, 2);
assert.ok(emptyCoast.speed < 12 && emptyCoast.speed > 10, 'An empty tank permits coasting but cannot accelerate');
assert.equal(immersiveFuelAfterDistance(12, METRES_PER_MILE * 32), 11, 'Consumption is saved in US gallons');
assert.equal(immersiveFuelAfterDistance(.01, 100000), 0); assert.equal(immersiveFuelAfterDistance(5, 0), 5);
assert.deepEqual(immersiveDrivingInput(new Set(['w', 'd'])), { throttle: 1, brake: 0, steer: 1, reverse: false });
assert.deepEqual(immersiveDrivingInput(new Set(['KeyS'])), { throttle: 0, brake: 1, steer: 0, reverse: true });
assert.deepEqual(immersiveDrivingInput(new Set(['s', ' '])), { throttle: 0, brake: 1, steer: 0, reverse: false });
assert.deepEqual(immersiveDrivingInput(new Set(['ArrowUp', 'ArrowLeft'])), { throttle: 1, brake: 0, steer: -1, reverse: false });
const telemetry = immersiveVehicleTelemetry(car);
assert.ok(telemetry.absoluteMph >= 60 && telemetry.normalizedEngine > 0 && telemetry.normalizedEngine <= 1, 'Audio receives physical mph and bounded engine mix');
assert.ok(immersiveVehicleTelemetry(townCar).brakeLights, 'The pedal drives real brake-light state');
assert.ok(immersiveVehicleTelemetry(right).steeringWheel < 0, 'Cockpit steering follows the road wheels');
console.log(`Immersive compact checks passed: 0–60mph ${accelerationSeconds.toFixed(2)}s, 0–30mph ${townAcceleration.toFixed(2)}s, 30mph stop ${brakingSeconds.toFixed(2)}s/${(townCar.distance - townStopStart).toFixed(1)}m; true steering, reverse interlock, grounded swept body collisions, refresh-rate consistency, hidden-tab safety, gallon fuel and audio telemetry.`);
