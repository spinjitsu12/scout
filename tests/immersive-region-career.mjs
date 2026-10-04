import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { act, newGame, normalizeGame, validGame } from '../src/lib/game.ts';
import { freshImmersion, immersionOf, validImmersion } from '../src/lib/immersive-runtime.ts';
import { getImmersiveLocations, WORLD_SIZE, REGIONAL_SERVICE_POINTS } from '../src/lib/immersive-locations.ts';
import { FIELD_LOCATIONS, canRefuel, GAS_PRICES } from '../src/lib/expedition.ts';
import { createImmersiveVehicle, stepImmersiveVehicle } from '../src/lib/immersive-driving.ts';
const require = createRequire(import.meta.url);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} vs ${expected}`);
const career = tier => {
  let game = newGame(30100 + tier); game.tier = tier; game.prestige = tier;
  game = act(game, { type: 'repeat' }); game.story = { phase: 'complete', choice: null }; game.briefing = false;
  game.immersion = freshImmersion(game); assert.ok(validGame(game)); return game;
};
const snapshot = (game, patch) => {
  const result = act(game, { type: 'immersionSnapshot', snapshot: { ...structuredClone(game.immersion), ...patch } });
  assert.ok(validGame(result), 'Regional checkpoints remain valid careers'); return result;
};
const stationCareer = (tier, station, overrides = {}) => {
  const game = career(tier), state = structuredClone(game.immersion);
  state.mode = 'foot'; state.interior = null; state.destination = 3;
  state.player = { ...state.player, x: station.parking.x + 3, z: station.parking.z };
  state.vehicle = { ...state.vehicle, ...station.parking, heading: -.2, speed: 0, steering: .12, distance: 42012.6, fuel: 6.5, damage: .4, disabled: false, ...overrides };
  return snapshot(game, state);
};
const reject = (game, action, reason) => {
  const before = JSON.stringify(game); assert.throws(() => act(game, action), reason);
  assert.equal(JSON.stringify(game), before, 'A rejected action cannot mutate a career or spend its budget');
};
let migrations = 0, services = 0, tows = 0;
const serialized = [];
for (const tier of [0, 1, 2]) {
  const locations = getImmersiveLocations(tier);
  for (const venue of [1, 2, 3]) for (const mode of ['foot', 'driving']) {
    const saved = career(tier), old = FIELD_LOCATIONS[tier][venue].point, relocated = locations[venue];
    saved.week = 7; saved.reputation = 36; saved.actions = 3; saved.field.fuel = 8.35;
    saved.field.destination = venue; saved.field.visited = [0, 1, 2, 3, 4]; saved.field.met = [saved.candidates[0].id];
    saved.immersion = {
      schema: 1, tier, interior: mode === 'foot' ? venue : null, mode, destination: venue,
      player: { x: old.x - 5, z: old.y + (mode === 'foot' ? (venue < 2 ? -58 : 68) : 3), yaw: .3, pitch: -.1 },
      vehicle: { x: old.x + 8, z: old.y + 3, heading: -.4, speed: mode === 'driving' ? 4 : 0, steering: .12, distance: 23456.78, fuel: 8.35, gear: 'R' },
      parkedAt: [0, venue, 5], tutorial: 'complete', thoughtsSeen: [`venue-${venue}-notice`, 'home-window'], homeReviewed: true,
    };
    assert.ok(validGame(saved), 'Authentic schema-1 saves remain supported before migration');
    const untouched = JSON.stringify(saved), migrated = normalizeGame(saved), next = migrated.immersion;
    assert.equal(next.schema, 2); assert.ok(validGame(migrated)); assert.equal(JSON.stringify(saved), untouched);
    close(next.vehicle.x, relocated.parking.x + 8, 'Parking X offset survives');
    close(next.vehicle.z, relocated.parking.z + 3, 'Parking Z offset survives');
    close(next.player.x, saved.immersion.player.x + relocated.parking.x - old.x, 'Room X offset survives');
    close(next.player.z, saved.immersion.player.z + relocated.parking.z - old.y, 'Room Z offset survives');
    for (const key of ['heading', 'speed', 'steering', 'distance', 'fuel', 'gear']) assert.equal(next.vehicle[key], saved.immersion.vehicle[key], `${key} retained`);
    assert.equal(next.vehicle.damage, 0); assert.equal(next.vehicle.disabled, false);
    for (const key of ['interior', 'mode', 'destination', 'tutorial', 'homeReviewed']) assert.equal(next[key], saved.immersion[key]);
    for (const key of ['parkedAt', 'thoughtsSeen']) assert.deepEqual(next[key], saved.immersion[key]);
    assert.deepEqual(migrated.field.visited, saved.field.visited); assert.deepEqual(migrated.field.met, saved.field.met);
    assert.equal(migrated.field.destination, venue); assert.equal(migrated.week, 7); assert.equal(migrated.actions, 3); assert.equal(migrated.reputation, 36);
    assert.deepEqual(normalizeGame(JSON.parse(JSON.stringify(migrated))), migrated, 'Migration is idempotent');
    assert.deepEqual(immersionOf(migrated), next, 'Scene retrieval never relocates twice');
    serialized.push(JSON.stringify(migrated)); migrations++;
  }
  const headquarters = career(tier), before = structuredClone(headquarters.immersion);
  headquarters.immersion.schema = 1; delete headquarters.immersion.vehicle.damage; delete headquarters.immersion.vehicle.disabled;
  const unchanged = normalizeGame(headquarters);
  assert.equal(unchanged.immersion.schema, 2); assert.deepEqual(unchanged.immersion.player, before.player);
  close(unchanged.immersion.vehicle.x, before.vehicle.x, 'Headquarters remains at home');
  const extended = career(tier);
  extended.immersion.vehicle = { ...extended.immersion.vehicle, x: WORLD_SIZE.width - 25, z: WORLD_SIZE.depth - 35, damage: .93, disabled: true, distance: 98123.45, fuel: 5.25 };
  extended.immersion.player = { ...extended.immersion.player, x: WORLD_SIZE.width - 22, z: WORLD_SIZE.depth - 35 };
  extended.immersion.interior = null; extended.immersion.mode = 'foot';
  const committed = snapshot(extended, extended.immersion), roundtrip = normalizeGame(JSON.parse(JSON.stringify(committed)));
  assert.ok(validGame(roundtrip)); assert.ok(validImmersion(roundtrip.immersion));
  assert.deepEqual(roundtrip.immersion, committed.immersion, 'Far-region position and mechanical state survive serialization');
  const disabled = stepImmersiveVehicle({ ...createImmersiveVehicle(roundtrip.immersion.vehicle), ...roundtrip.immersion.vehicle }, { throttle: 1, brake: 0, steer: 0 }, .1);
  assert.equal(disabled.disabled, true); assert.equal(disabled.speed, 0, 'Damaged engines remain disabled after reload');
  serialized.push(JSON.stringify(roundtrip));
  for (const damage of [Number.NaN, Infinity, -.001, 1.001, '0.93', null, {}]) {
    const malformed = structuredClone(roundtrip); malformed.immersion.vehicle.damage = damage;
    assert.equal(validGame(malformed), false); reject(roundtrip, { type: 'immersionSnapshot', snapshot: malformed.immersion }, /position could not be saved/);
  }
  for (const disabled of ['true', 1, null]) {
    const malformed = structuredClone(roundtrip); malformed.immersion.vehicle.disabled = disabled;
    assert.equal(validGame(malformed), false, 'Engine flags must be actual booleans');
    reject(roundtrip, { type: 'immersionSnapshot', snapshot: malformed.immersion }, /position could not be saved/);
  }
  for (const position of [{ x: WORLD_SIZE.width + .1, z: 2000 }, { x: 2000, z: WORLD_SIZE.depth + .1 }, { x: -1, z: 2000 }]) {
    const malformed = structuredClone(roundtrip); Object.assign(malformed.immersion.vehicle, position); assert.equal(validGame(malformed), false);
  }
  for (const station of REGIONAL_SERVICE_POINTS) {
    const original = stationCareer(tier, station), json = JSON.stringify(original), oldVehicle = structuredClone(original.immersion.vehicle);
    assert.ok(canRefuel(original), `${station.name} supports physical refuelling`);
    const gallons = 1.25, fueled = act(original, { type: 'refuel', gallons });
    close(original.cash - fueled.cash, Math.round(gallons * GAS_PRICES[tier] * 100) / 100, 'Fuel price is charged exactly');
    close(fueled.immersion.vehicle.fuel, oldVehicle.fuel + gallons, 'Fuel reaches the actual car');
    assert.equal(fueled.field.fuel, fueled.immersion.vehicle.fuel); assert.equal(fueled.actions, original.actions);
    const repaired = act(original, { type: 'vehicleService', station: station.id });
    assert.equal(original.cash - repaired.cash, 360); assert.equal(repaired.actions, original.actions);
    assert.equal(repaired.immersion.vehicle.damage, 0); assert.equal(repaired.immersion.vehicle.disabled, false);
    for (const key of ['x', 'z', 'heading', 'distance', 'fuel', 'gear']) assert.equal(repaired.immersion.vehicle[key], oldVehicle[key]);
    assert.equal(JSON.stringify(original), json); assert.ok(validGame(repaired)); serialized.push(JSON.stringify(repaired)); services++;
    const stranded = stationCareer(tier, station, { x: station.parking.x + 75, z: station.parking.z + 80, damage: .92, disabled: true });
    stranded.immersion.player = { ...stranded.immersion.player, x: stranded.immersion.vehicle.x + 3, z: stranded.immersion.vehicle.z };
    const prior = structuredClone(stranded.immersion.vehicle), towed = act(stranded, { type: 'roadside' });
    const nearest = [...REGIONAL_SERVICE_POINTS].sort((a, b) => Math.hypot(a.parking.x - prior.x, a.parking.z - prior.z) - Math.hypot(b.parking.x - prior.x, b.parking.z - prior.z))[0];
    assert.equal(stranded.cash - towed.cash, 150); assert.equal(towed.actions, stranded.actions);
    assert.equal(towed.immersion.vehicle.x, nearest.parking.x); assert.equal(towed.immersion.vehicle.z, nearest.parking.z);
    for (const key of ['damage', 'disabled', 'distance', 'fuel']) assert.equal(towed.immersion.vehicle[key], prior[key], 'Tow grants no free repairs, fuel or mileage');
    assert.equal(towed.immersion.vehicle.speed, 0); assert.equal(towed.immersion.mode, 'foot'); assert.equal(towed.immersion.interior, null);
    assert.ok(Math.hypot(towed.immersion.player.x - towed.immersion.vehicle.x, towed.immersion.player.z - towed.immersion.vehicle.z) < 4);
    assert.ok(canRefuel(towed)); assert.ok(validGame(towed)); tows++;
  }
}
const station = REGIONAL_SERVICE_POINTS[1], ready = stationCareer(0, station);
for (const change of [
  game => { game.immersion.mode = 'driving'; }, game => { game.immersion.vehicle.speed = 2; },
  game => { game.immersion.vehicle.x += 40; game.immersion.player.x += 40; }, game => { game.immersion.player.x += 20; },
]) {
  const remote = structuredClone(ready); change(remote); assert.equal(canRefuel(remote), false);
  reject(remote, { type: 'refuel', gallons: 1 }, /Park beside/); reject(remote, { type: 'vehicleService', station: station.id }, /Park at a service station/);
}
reject(ready, { type: 'vehicleService', station: 'imaginary-service' }, /Park at a service station/);
reject(ready, { type: 'vehicleService', station: REGIONAL_SERVICE_POINTS[3].id }, /Park at a service station/);
reject(stationCareer(0, station, { damage: 0 }), { type: 'vehicleService', station: station.id }, /already in good condition/);
reject(ready, { type: 'roadside' }, /stranded car/);
const costly = structuredClone(ready); costly.cash = 359.99; reject(costly, { type: 'vehicleService', station: station.id }, /budget cannot cover/);
const minimum = stationCareer(0, station, { damage: .005 }); minimum.cash = 20;
assert.equal(act(minimum, { type: 'vehicleService', station: station.id }).cash, 0);
const empty = stationCareer(0, station, { fuel: 0, damage: .1 }), emptyTow = act(empty, { type: 'roadside' });
assert.equal(emptyTow.immersion.vehicle.fuel, 0); assert.equal(emptyTow.immersion.vehicle.damage, .1);
for (const change of [game => { game.immersion.player.x += 20; }, game => { game.immersion.mode = 'driving'; }, game => { game.immersion.vehicle.speed = 2; }, game => { game.cash = 149.99; }]) {
  const remote = structuredClone(empty); change(remote); reject(remote, { type: 'roadside' });
}
// Refresh with electron/build-support.mjs before this suite: native validation uses the shipped engine.
const { validGame: validDesktopGame } = require('../electron/game-engine.cjs');
const { SaveStore, validateCareerJSON } = require('../electron/save-store.cjs');
for (const json of serialized) { assert.ok(validDesktopGame(JSON.parse(json)), 'Native and renderer validators agree'); assert.equal(validateCareerJSON(json), json); }
for (const damage of [-.001, 1.001, null, '0.8']) {
  const malformed = structuredClone(ready); malformed.immersion.vehicle.damage = damage;
  assert.throws(() => validateCareerJSON(JSON.stringify(malformed)), /supported SCOUT career/);
}
const directory = await mkdtemp(path.join(os.tmpdir(), 'scout-region-career-'));
try {
  const store = new SaveStore(directory), first = serialized.at(-1), second = serialized.at(-2);
  await store.save(first); await store.save(second); await store.flushStrict();
  const reopened = new SaveStore(directory); assert.equal(await reopened.load(), second); assert.equal(await reopened.loadBackup(), first);
} finally { await rm(directory, { recursive: true, force: true }); }
console.log(`Regional career checks passed: ${migrations} migrations, far-region durable saves, invalid mechanical state rejection, ${services} paid repairs/refuels, ${tows} nearest-service recoveries, no remote/free service, preserved mileage/fuel/damage and native validator agreement.`);
