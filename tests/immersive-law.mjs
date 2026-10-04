import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { act, newGame, normalizeGame, TIERS, validGame } from '../src/lib/game.ts';
import { freshImmersion } from '../src/lib/immersive-runtime.ts';
import { advanceImmersiveClock, createImmersiveClock } from '../src/lib/immersive-motion.ts';
import { REGIONAL_SERVICE_POINTS, WORLD_SIZE } from '../src/lib/immersive-locations.ts';
import { freshLaw, incidentIdFor, LAW_HISTORY_LIMIT, lawOf, MIN_PEDESTRIAN_IMPACT_SPEED, POLICE_ARRIVAL_SECONDS, POLICE_RESOLVE_SECONDS, policeResponseIsCurrent, policeResponseProgress, validLaw } from '../src/lib/immersive-law.ts';

const require = createRequire(import.meta.url);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} vs ${expected}`);
function career(tier = 0) {
  let game = newGame(30170 + tier); game.tier = tier; game.prestige = tier;
  game = act(game, { type: 'repeat' }); game.story = { phase: 'complete', choice: null }; game.briefing = false;
  game.week = 8; game.reputation = 72; game.completed = 5; game.attempts = 7; game.actions = 5;
  for (const candidate of game.candidates) candidate.trust = 80;
  for (const [index, morale] of [[0, 78], [1, 20]]) {
    Object.assign(game.candidates[index], { status: 'hired', wage: 1200 * (tier + 1), hiredWeek: 2, morale, verified: true, completed: 4 });
  }
  game.candidates[2].trust = 15; game.candidates[3].trust = 0;
  game.immersion = freshImmersion(game);
  const state = game.immersion;
  state.mode = 'driving'; state.interior = null; state.destination = 3;
  state.vehicle = { ...state.vehicle, x: 3060, z: 2115, speed: 12.4, heading: -.4, steering: .12, distance: 38432.125, fuel: 6.25, gear: 'R', damage: .47, disabled: false };
  state.player = { ...state.player, x: state.vehicle.x, z: state.vehicle.z };
  game.field.fuel = state.vehicle.fuel; game.field.met = [game.candidates[0].id, game.candidates[2].id];
  assert.ok(validGame(game)); return game;
}
function contact(game, npcId = 'pedestrian:eastmere-plaza-0', patch = {}) {
  return { type: 'pedestrianIncident', incident: { id: incidentIdFor(game, npcId), npcId, position: { x: game.immersion.vehicle.x + .8, z: game.immersion.vehicle.z }, speed: 12.4, ...patch } };
}
const advance = (game, seconds) => act(game, { type: 'policeAdvance', id: game.law.response.id, seconds });
const roundtrip = game => normalizeGame(JSON.parse(JSON.stringify(game)));
let penalties = 0, rejected = 0, migrations = 0;
const legacy = newGame(42);
delete legacy.law; const legacyBytes = JSON.stringify(legacy); assert.ok(validGame(legacy)); assert.deepEqual(lawOf(legacy), freshLaw());
assert.equal(incidentIdFor(legacy, 't0-0'), 'law:1:t0-0');
const upgraded = normalizeGame(legacy); assert.deepEqual(upgraded.law, freshLaw());
assert.equal(JSON.stringify(legacy), legacyBytes, 'Legacy migration cannot rewrite the input career'); migrations++;
delete legacy.field; delete legacy.style; delete legacy.story;
assert.ok(validGame(legacy)); assert.deepEqual(normalizeGame(legacy).law, freshLaw()); migrations++;

const committed = [];
for (const tier of [0, 1, 2]) {
  const original = career(tier), before = JSON.stringify(original), event = contact(original);
  const charged = act(original, event), fine = TIERS[tier].budget * .45;
  assert.equal(JSON.stringify(original), before, 'The penalty must be an atomic immutable reducer action');
  assert.equal(charged.cash, original.cash - fine); assert.equal(charged.reputation, 32);
  assert.equal(charged.completed, 3); assert.equal(charged.actions, 0);
  assert.equal(charged.candidates[0].trust, 35); assert.equal(charged.candidates[0].morale, 48);
  assert.equal(charged.candidates[1].morale, 0); assert.equal(charged.candidates[2].trust, 0); assert.equal(charged.candidates[3].trust, 0);
  assert.equal(charged.tier, tier); assert.equal(charged.week, original.week); assert.equal(charged.prestige, original.prestige);
  assert.equal(charged.candidates.filter(person => person.status === 'hired').length, 2, 'Police consequences never erase recruits or another career');
  assert.deepEqual(charged.field.met, original.field.met); assert.deepEqual(charged.immersion, original.immersion);
  assert.deepEqual(charged.law.handled, [event.incident.id]); assert.equal(charged.law.sequence, 1);
  assert.deepEqual(charged.law.last.loss, { fine, reputation: 40, missions: 2, actions: 5, trust: 45, morale: 30 });
  assert.equal(charged.law.last.week, original.week); assert.equal(charged.law.last.tier, tier);
  assert.equal(charged.law.last.resolved, false); assert.equal(charged.law.response.phase, 'dispatched');
  assert.equal(policeResponseProgress(charged.law.response), 0); assert.ok(validGame(charged)); assert.ok(validLaw(charged.law));
  const restored = roundtrip(charged); assert.deepEqual(restored, charged, 'Reload keeps the penalty and pending response exactly');
  assert.deepEqual(act(restored, event), restored, 'The exact contact cannot charge a second fine after reload');
  for (const action of [
    { type: 'nextWeek' }, { type: 'prestige' }, { type: 'repeat' }, { type: 'rescue' }, { type: 'roadside' },
    { type: 'vehicleService', station: 'eastmere-fuel' }, { type: 'refuel' }, { type: 'scout', source: 0 },
    { type: 'investigate', id: restored.candidates[2].id, method: 'interview' },
    { type: 'offer', id: restored.candidates[2].id, salary: 2000, perk: 'none' },
    { type: 'mission', mission: 'm0', ids: restored.candidates.slice(0, 2).map(person => person.id) },
    { type: 'mentor', id: restored.candidates[0].id }, { type: 'release', id: restored.candidates[0].id },
    { type: 'meet', id: restored.candidates[2].id }, { type: 'cover' }, { type: 'story', state: { phase: 'wake', choice: null } },
  ]) {
    const frozen = JSON.stringify(restored); assert.throws(() => act(restored, action), /Police are responding/);
    assert.equal(JSON.stringify(restored), frozen, 'Blocked business/reset operations cannot evade consequences'); rejected++;
  }
  assert.ok(act(restored, { type: 'preferences', music: false }).law.response);
  assert.equal(act(restored, { type: 'star', id: restored.candidates[2].id }).candidates[2].starred, true);
  const moved = structuredClone(restored.immersion); moved.vehicle.x += 5; moved.player.x += 5;
  assert.deepEqual(act(restored, { type: 'immersionSnapshot', snapshot: moved }).law, restored.law, 'Position snapshots cannot discard police state');
  let response = advance(restored, 5); response = advance(response, 5); response = advance(response, 5);
  assert.equal(response.law.response.phase, 'dispatched'); response = advance(response, 3);
  assert.equal(response.law.response.elapsedSeconds, POLICE_ARRIVAL_SECONDS); assert.equal(response.law.response.phase, 'arrived');
  close(policeResponseProgress(response.law.response), .6, 'Police response progress uses simulation seconds');
  assert.deepEqual(act(response, { type: 'policeResolve', id: response.law.response.id }), response, 'Early resolution cannot teleport or forgive the player');
  const wrong = act(response, { type: 'policeAdvance', id: 'law:99:somebody', seconds: 5 }); assert.deepEqual(wrong, response);
  for (const seconds of [0, -.1, 5.001, 1000, Number.NaN, Infinity, '5']) assert.deepEqual(advance(response, seconds), response);
  response = advance(response, 5); response = advance(response, 5); response = advance(response, 2);
  assert.equal(response.law.response.elapsedSeconds, POLICE_RESOLVE_SECONDS); assert.equal(policeResponseProgress(response.law.response), 1);
  const pendingCar = structuredClone(response.immersion.vehicle), cash = response.cash;
  const nearest = [...REGIONAL_SERVICE_POINTS].sort((a, b) => Math.hypot(a.parking.x - pendingCar.x, a.parking.z - pendingCar.z) - Math.hypot(b.parking.x - pendingCar.x, b.parking.z - pendingCar.z))[0];
  const settled = act(roundtrip(response), { type: 'policeResolve', id: response.law.response.id });
  assert.equal(settled.law.response, null); assert.equal(settled.law.last.resolved, true); assert.equal(settled.cash, cash);
  assert.equal(settled.immersion.mode, 'foot'); assert.equal(settled.immersion.interior, null);
  assert.equal(settled.immersion.vehicle.x, nearest.parking.x); assert.equal(settled.immersion.vehicle.z, nearest.parking.z);
  assert.equal(settled.immersion.vehicle.speed, 0); assert.equal(settled.immersion.vehicle.steering, 0);
  for (const key of ['damage', 'disabled', 'distance', 'fuel', 'gear']) assert.equal(settled.immersion.vehicle[key], pendingCar[key], `Impound preserves ${key}`);
  assert.equal(settled.immersion.destination, response.immersion.destination); assert.equal(settled.field.fuel, pendingCar.fuel);
  assert.equal(settled.immersion.player.x, nearest.parking.x + 3); assert.equal(settled.immersion.player.z, nearest.parking.z);
  assert.deepEqual(act(settled, { type: 'policeResolve', id: response.law.response.id }), settled, 'Duplicate resolution cannot relocate or spend again');
  assert.ok(validGame(settled)); assert.deepEqual(roundtrip(settled), settled);
  const resumed = act(settled, { type: 'nextWeek' }); assert.equal(resumed.week, settled.week + 1); assert.equal(resumed.actions, 6 + tier);
  assert.equal(resumed.law.sequence, 1); assert.equal(resumed.law.last.resolved, true); assert.ok(validGame(resumed));
  committed.push(charged, response, settled); penalties++;
}

const poor = career(); poor.cash = 13.57; poor.reputation = 7; poor.completed = 1; poor.actions = 1;
const chargedPoor = act(poor, contact(poor));
assert.equal(chargedPoor.cash, 0); assert.equal(chargedPoor.reputation, 0); assert.equal(chargedPoor.completed, 0);
assert.deepEqual(chargedPoor.law.last.loss, { fine: 13.57, reputation: 7, missions: 1, actions: 1, trust: 45, morale: 30 }); assert.ok(validGame(chargedPoor));
const ready = career(), baseline = JSON.stringify(ready);
for (const patch of [
  ...[0, 2.499999, -4, 65.01, Infinity, NaN, '9'].map(speed => ({ speed })),
  { position: { x: -1, z: 2115 } }, { position: { x: WORLD_SIZE.width + .1, z: 2115 } },
  { position: { x: 3060, z: WORLD_SIZE.depth + .1 } }, { position: { x: 3090, z: 2115 } },
  { position: { x: NaN, z: 2115 } }, { npcId: 'bad/id' }, { npcId: ' ' },
  { id: 'law:2:pedestrian:eastmere-plaza-0' }, { id: 'law:01:pedestrian:eastmere-plaza-0' }, { id: 'not-a-contact' },
]) {
  assert.deepEqual(act(ready, contact(ready, 'pedestrian:eastmere-plaza-0', patch)), ready);
  assert.equal(JSON.stringify(ready), baseline); rejected++;
}
const slow = structuredClone(ready); slow.immersion.mode = 'foot'; assert.deepEqual(act(slow, contact(slow)), slow);
assert.equal(act(ready, contact(ready, 't0-2', { speed: MIN_PEDESTRIAN_IMPACT_SPEED })).law.sequence, 1, 'Threshold-speed confirmed contacts are accepted');
assert.equal(act(ready, contact(ready, 't0-2', { speed: 65 })).law.sequence, 1, 'Maximum legal vehicle speed remains supported');

const twoContacts = career(), firstContact = contact(twoContacts, 'pedestrian:first-person');
let secondCase = act(twoContacts, firstContact); secondCase = advance(secondCase, 5); secondCase = advance(secondCase, 5);
const secondContact = contact(secondCase, 'pedestrian:second-person', { speed: 8.5 });
secondCase = act(secondCase, secondContact);
assert.equal(secondCase.law.sequence, 2); assert.equal(secondCase.law.response.id, secondContact.incident.id);
assert.equal(secondCase.law.response.elapsedSeconds, 0, 'A second actual collision starts its own police response');
assert.equal(secondCase.cash, twoContacts.cash - TIERS[0].budget * .9);
assert.equal(secondCase.reputation, 0); assert.equal(secondCase.completed, 1);
assert.equal(secondCase.law.last.loss.reputation, 32, 'Later contacts retain the real additional bounded reputation loss');
assert.deepEqual(secondCase.law.handled, [firstContact.incident.id, secondContact.incident.id]);
assert.deepEqual(roundtrip(secondCase), secondCase, 'Multiple penalties and the latest response survive saving');
assert.deepEqual(act(secondCase, { type: 'policeAdvance', id: firstContact.incident.id, seconds: 5 }), secondCase);
assert.deepEqual(act(secondCase, { type: 'policeResolve', id: firstContact.incident.id }), secondCase, 'An earlier response cannot settle a later collision');
let oldCaseReady = act(twoContacts, firstContact);
for (let index = 0; index < 6; index++) oldCaseReady = advance(oldCaseReady, 5);
const replacementCase = act(oldCaseReady, contact(oldCaseReady, 'pedestrian:next-frame-contact'));
assert.equal(policeResponseIsCurrent(oldCaseReady.law.response, oldCaseReady.law.sequence), true);
assert.equal(policeResponseIsCurrent(oldCaseReady.law.response, replacementCase.law.sequence), false,
  'A ready old response cannot trigger live-world impound in the same frame as a new contact');
assert.equal(policeResponseIsCurrent(replacementCase.law.response, replacementCase.law.sequence), true);
assert.equal(policeResponseIsCurrent(null, replacementCase.law.sequence), false);
committed.push(secondCase);

let broken = structuredClone(committed[0]);
const brokenSnapshot = structuredClone(broken.immersion);
Object.assign(brokenSnapshot.vehicle, { damage: .93, disabled: true, fuel: 0, speed: 0 });
broken = act(broken, { type: 'immersionSnapshot', snapshot: brokenSnapshot });
for (let index = 0; index < 6; index++) broken = advance(broken, 5);
broken = act(broken, { type: 'policeResolve', id: broken.law.response.id });
assert.equal(broken.immersion.vehicle.damage, .93); assert.equal(broken.immersion.vehicle.disabled, true);
assert.equal(broken.immersion.vehicle.fuel, 0, 'Police impound never refills or repairs a broken engine');
assert.ok(validGame(broken)); committed.push(broken);

let timed = act(career(), contact(career())), clock = createImmersiveClock();
const paused = advanceImmersiveClock(clock, 90, false); clock = paused.clock;
assert.equal(paused.elapsed, 0); assert.deepEqual(advance(timed, paused.elapsed), timed, 'A paused/background interval cannot progress police');
const stalled = advanceImmersiveClock(clock, 90, true); timed = advance(timed, stalled.elapsed);
close(timed.law.response.elapsedSeconds, .1, 'A long active frame may contribute only its bounded fixed-tick budget');
assert.equal(timed.law.response.phase, 'dispatched');

let crowded = career(); const first = contact(crowded, 'pedestrian:first');
crowded = act(crowded, first);
for (let index = 2; index <= LAW_HISTORY_LIMIT + 6; index++) crowded = act(crowded, contact(crowded, `pedestrian:route-${index}`));
assert.equal(crowded.law.sequence, 70); assert.equal(crowded.law.handled.length, LAW_HISTORY_LIMIT);
assert.equal(crowded.law.handled.includes(first.incident.id), false); assert.ok(validGame(crowded));
assert.deepEqual(act(roundtrip(crowded), first), crowded, 'Even a pruned contact is never charged again');
let closed = crowded; for (let index = 0; index < 6; index++) closed = advance(closed, 5);
closed = act(closed, { type: 'policeResolve', id: closed.law.response.id });
const repeated = act(closed, { type: 'repeat' }); assert.equal(repeated.law.sequence, 70);
assert.deepEqual(act(repeated, first), repeated, 'A fresh chapter cannot resurrect stale incident IDs');
const promotion = structuredClone(closed);
Object.assign(promotion.candidates[2], { status: 'hired', wage: 1200, hiredWeek: 2, morale: 80, verified: true, completed: 4 });
promotion.completed = TIERS[0].goals.missions; promotion.reputation = TIERS[0].goals.reputation;
const promoted = act(promotion, { type: 'prestige' });
assert.equal(promoted.tier, 1); assert.equal(promoted.law.sequence, 70); assert.equal(promoted.law.last.tier, 0);
assert.deepEqual(act(promoted, first), promoted); assert.ok(validGame(promoted)); committed.push(promoted);

const malformed = [], source = committed[0];
for (const change of [
  law => { law.schema = 2; }, law => { law.sequence = '1'; }, law => { law.sequence = -1; }, law => { law.sequence = Infinity; },
  law => { law.handled = []; }, law => { law.handled[0] = 'law:4:somebody'; }, law => { law.handled.push(law.handled[0]); },
  law => { law.last = null; }, law => { law.last.resolved = true; }, law => { law.last.week = 0; }, law => { law.last.tier = 3; },
  law => { law.last.loss.fine = -1; }, law => { law.last.loss.reputation = 41; }, law => { law.last.loss.missions = 3; },
  law => { law.last.loss.actions = 9; }, law => { law.last.loss.trust = 46; }, law => { law.last.loss.morale = 31; },
  law => { law.last.position.x = -1; }, law => { law.last.speed = 1; }, law => { law.response = null; },
  law => { law.response.phase = 'arrived'; }, law => { law.response.elapsedSeconds = 30.001; }, law => { law.response.elapsedSeconds = NaN; },
  law => { law.response.npcId = 'another-person'; }, law => { law.response.position.x += 2; }, law => { law.response.id = 'law:2:another-person'; },
]) {
  const bad = structuredClone(source); change(bad.law); assert.equal(validLaw(bad.law), false); assert.equal(validGame(bad), false); malformed.push(bad);
}
for (const change of [game => { delete game.immersion; }, game => { game.tier = 1; game.immersion.tier = 1; }, game => { game.week = 1; }]) {
  const bad = structuredClone(source); change(bad); assert.equal(validGame(bad), false); malformed.push(bad);
}
for (const law of [null, false, [], 'wanted', {}, { ...freshLaw(), response: source.law.response }]) {
  const bad = { ...source, law }; assert.equal(validGame(bad), false); malformed.push(bad);
}

// npm pretest refreshes this shared native validator before the suite runs.
const { validGame: validDesktopGame } = require('../electron/game-engine.cjs');
const { SaveSlots, validateCareerJSON } = require('../electron/save-store.cjs');
for (const game of [...committed, legacy, upgraded, chargedPoor, crowded, repeated]) {
  const json = JSON.stringify(game); assert.ok(validDesktopGame(JSON.parse(json)), 'Native and renderer validators agree for pending/resolved/old careers');
  assert.equal(validateCareerJSON(json), json);
}
for (const game of malformed) {
  assert.equal(validDesktopGame(game), false, 'Native validation must reject every malformed law state');
  assert.throws(() => validateCareerJSON(JSON.stringify(game)), /supported SCOUT career/);
}
const directory = await mkdtemp(path.join(os.tmpdir(), 'scout-law-career-'));
try {
  const saves = new SaveSlots(directory), first = JSON.stringify(committed[0]), second = JSON.stringify(committed[3]), third = JSON.stringify(committed[6]);
  await Promise.all([saves.save(first, 1), saves.save(second, 2), saves.save(third, 3)]);
  const updated = advance(committed[0], 5); await saves.save(JSON.stringify(updated), 1);
  const reopened = new SaveSlots(directory); assert.equal(await reopened.load(1), JSON.stringify(updated));
  assert.equal(await reopened.loadBackup(1), first); assert.equal(await reopened.load(2), second); assert.equal(await reopened.load(3), third);
  const code = `const {SaveSlots}=require(${JSON.stringify(path.resolve('electron/save-store.cjs'))});new SaveSlots(process.argv[1]).load(1).then(raw=>process.stdout.write(raw));`;
  const actual = JSON.parse(execFileSync(process.execPath, ['-e', code, directory], { encoding: 'utf8' }));
  assert.deepEqual(normalizeGame(actual), updated, 'A fresh native Node process reads the pending response and exact penalties');
  assert.deepEqual(act(normalizeGame(actual), contact(career())), updated, 'A reloaded original contact cannot duplicate its penalty');
} finally { await rm(directory, { recursive: true, force: true }); }
console.log(`Law checks passed: ${penalties} tier-scaled atomic penalties, ${migrations} legacy migrations, ${rejected} blocked/malformed contacts and career actions, fixed-time pause bounds, police arrival/impound, 64-history replay protection, native validation, fresh-process reload and three isolated careers.`);
