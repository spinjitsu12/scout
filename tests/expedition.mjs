import assert from 'node:assert/strict';
import { act, newGame, normalizeGame, validGame, TIERS } from '../src/lib/game.ts';
import { DEFAULT_STYLE, FIELD_LOCATIONS, FUEL_CAPACITY, FULL_TURN, GAS_PRICES, HQ_POINT, atVenue, candidateLocation, candidatePosition, canMeet, canRefuel, freshField } from '../src/lib/expedition.ts';

const take = (game, action) => {
  const next = act(game, action);
  assert(validGame(next), `The ${action.type} action must preserve a reloadable save`);
  return next;
};
const snapshot = (game, patch) => take(game, { type: 'fieldSnapshot', field: { ...game.field, ...patch } });

// Existing browser saves gain travel and appearance without losing decisions or
// forcing a second introduction to contacts the player already investigated.
const introducedLegacy = newGame(54);
introducedLegacy.field.met = ['t0-0']; // This contact was already met before travel existed.
let legacy = act(introducedLegacy, { type: 'investigate', id: 't0-0', method: 'interview' });
delete legacy.field;
delete legacy.style;
assert(validGame(legacy));
const originalLegacy = JSON.stringify(legacy);
const migrated = normalizeGame(legacy);
assert.deepEqual(migrated.style, DEFAULT_STYLE);
assert.equal(migrated.field.fuel, FUEL_CAPACITY);
assert.equal(migrated.style.engine, true, 'Earlier saves default to audible engines');
assert.deepEqual(migrated.field.met, ['t0-0']);
assert.equal(migrated.candidates[0].tested[0], 'interview');
assert.equal(JSON.stringify(legacy), originalLegacy, 'Migration does not mutate the supplied career');
const oldFuel = newGame(55);
delete oldFuel.field.fuel;
assert(validGame(oldFuel), 'A pre-fuel field save is still supported');
assert.equal(normalizeGame(oldFuel).field.fuel, 12);

let game = newGame(56);
assert.equal(game.field.scene, 'office');
assert.throws(() => act(game, { type: 'setDestination', destination: 1 }));
assert.throws(() => act(game, { type: 'meet', id: 't0-0' }));
const beforeRemoteAttempts = JSON.stringify(game);
assert.throws(() => act(game, { type: 'scout', source: 0 }), 'Scouting requires an actual venue visit');
assert.throws(() => act(game, { type: 'investigate', id: 't0-0', method: 'interview' }), 'A dossier is not a first meeting');
assert.throws(() => act(game, { type: 'offer', id: 't0-0', salary: game.candidates[0].salary, perk: 'autonomy' }), 'Unmet people cannot accept remote offers');
assert.equal(JSON.stringify(game), beforeRemoteAttempts, 'Rejected remote actions spend no cash, time or story choices');
const initialCash = game.cash, initialActions = game.actions;
game = take(game, { type: 'fieldEnter' });
assert.equal(game.field.scene, 'district');
assert.equal(game.field.driving, false);
assert.deepEqual(game.field.car, FIELD_LOCATIONS[game.tier][0].point);
const parkedPosition = structuredClone(game.field.car);
const playerPosition = structuredClone(game.field.player);
game = take(game, { type: 'setDestination', destination: 1 });
assert.deepEqual(game.field.car, parkedPosition, 'Selecting GPS does not drive or teleport the vehicle');
assert.deepEqual(game.field.player, playerPosition, 'Selecting GPS does not teleport the scout');
assert.equal(game.field.destination, 1);
assert.throws(() => act(game, { type: 'setDestination', destination: 5 }));
assert.throws(() => act(game, { type: 'setDestination', destination: 1.5 }));
assert.throws(() => act(game, { type: 'setDestination', destination: Number.NaN }));
assert.throws(() => act(game, { type: 'meet', id: 't0-0' }), 'Distant contacts require a trip');
assert.throws(() => act(game, { type: 'scout', source: 0 }), 'Stepping outside HQ is not arrival at Maker Yard');

// Save overshoot safely; snapshots cannot forge an introduction, venue visits,
// an instantaneous scene change, a GPS choice or free fuel.
game = snapshot(game, { player: { x: -50, y: 9000 }, car: { x: -100, y: 9999 },
  heading: -Math.PI / 2, fuel: 30, visited: [0, 1, 2, 3, 4], met: ['t0-0'], destination: 4 });
assert.deepEqual(game.field.player, { x: 0, y: 1024 });
assert.deepEqual(game.field.car, { x: 0, y: 1024 });
assert.equal(game.field.heading, FULL_TURN * .75);
assert.equal(game.field.fuel, 12);
assert.deepEqual(game.field.visited, [0]);
assert.deepEqual(game.field.met, []);
assert.equal(game.field.destination, 1);
assert.throws(() => snapshot(game, { scene: 'office' }));
assert.throws(() => snapshot(game, { heading: Number.NaN }));
assert.throws(() => snapshot(game, { player: { x: Number.POSITIVE_INFINITY, y: 0 } }));
assert.throws(() => snapshot(game, { visited: [0, 0] }));
assert.throws(() => snapshot(game, { fuel: '12' }));

const meetingPoint = candidatePosition(game, 't0-0');
game = snapshot(game, { player: meetingPoint, car: meetingPoint, driving: true, fuel: 10.75 });
assert.equal(canMeet(game, 't0-0'), false, 'A conversation cannot start through the windscreen');
assert.throws(() => act(game, { type: 'meet', id: 't0-0' }));
game = snapshot(game, { driving: false, player: meetingPoint });
assert.equal(canMeet(game, 't0-0'), true);
game = take(game, { type: 'meet', id: 't0-0' });
assert.deepEqual(game.field.met, ['t0-0']);
const logCount = game.log.length;
game = take(game, { type: 'meet', id: 't0-0' });
assert.equal(game.log.length, logCount, 'Repeated introductions do not spam the fieldbook');
assert.throws(() => act(game, { type: 'meet', id: 't0-6' }), 'Undiscovered contacts cannot be met by guessing an id');
assert.throws(() => act(game, { type: 'meet', id: 'not-a-contact' }));
game = snapshot(game, { player: FIELD_LOCATIONS[game.tier][1].door });
assert(atVenue(game, 1));
assert(game.field.visited.includes(1));
assert.equal(game.cash, initialCash);
assert.equal(game.actions, initialActions, 'Driving, meeting and GPS never consume weekly actions');

// Follow-up calls work after a first meeting, including from another location.
let followUp = snapshot(game, { player: FIELD_LOCATIONS[0][0].door });
followUp = take(followUp, { type: 'fieldReturn' });
followUp = take(followUp, { type: 'investigate', id: 't0-0', method: 'interview' });
assert.equal(followUp.candidates[0].tested[0], 'interview');
followUp = take(followUp, { type: 'offer', id: 't0-0', salary: followUp.candidates[0].salary, perk: followUp.candidates[0].motive });
assert.equal(followUp.candidates[0].status, 'hired', 'Known contacts can make decisions after a follow-up call');
const earlierRanges = structuredClone(followUp.candidates[0].ranges);
followUp = take(followUp, { type: 'mentor', id: 't0-0' });
for (const skill of Object.keys(earlierRanges)) {
  const person = followUp.candidates[0], range = person.ranges[skill];
  assert(range[0] >= earlierRanges[skill][0], 'Development improves existing estimates');
  assert(range[0] <= person.skills[skill] && range[1] >= person.skills[skill], 'Mentoring cannot make unverified skill estimates dishonest');
}
assert.throws(() => act({ ...game, field: { ...game.field, driving: true } }, { type: 'scout', source: 0 }), 'Searching a venue requires parking and stepping out');

// An identity and vehicle change preserves the physical trip and preferences.
game = take(game, { type: 'preferences', camera: 'cockpit', radio: true, station: 2, music: false, sound: false, engine: false });
const positionBefore = structuredClone(game.field);
const appearance = { name: 'Umi', avatar: 15, car: 'coupe', paint: 'violet', plate: 'UMI-01' };
game = take(game, { type: 'customize', style: appearance });
assert.deepEqual(game.field, positionBefore);
assert.equal(game.style.camera, 'cockpit');
assert.equal(game.style.station, 2);
assert.equal(game.style.music, false);
assert.equal(game.style.sound, false);
assert.equal(game.style.radio, true);
assert.equal(game.style.engine, false, 'Vehicle appearance preserves the independent engine setting');
const engineOnly = take(game, { type: 'preferences', engine: true });
assert.equal(engineOnly.style.engine, true);
assert.equal(engineOnly.style.sound, false, 'Engine and world sound preferences are independent');
assert.equal(game.cash, initialCash);
for (const patch of [{ name: '' }, { name: 'x'.repeat(25) }, { name: 'Scout\nName' }, { avatar: -1 }, { avatar: 16 },
  { avatar: 1.5 }, { car: 'airplane' }, { paint: '__proto__' }, { plate: 'TOO-LONG-PLATE' }, { plate: 'lower' },
  { camera: 'diagonal' }, { radio: 'yes' }, { station: 3 }, { music: 1 }, { sound: null }, { engine: 'yes' }]) {
  assert.throws(() => act(game, { type: 'customize', style: { ...appearance, ...patch } }));
}
for (const patch of [{ camera: 'sideways' }, { radio: 1 }, { station: -1 }, { station: .5 }, { music: 'on' }, { sound: null }, { engine: 'on' }]) {
  assert.throws(() => act(game, { type: 'preferences', ...patch }));
}

// Paid fuel uses the tier price, partial refills, a real nearby car and no AP.
for (const tier of [0, 1, 2]) {
  let pumpGame = { ...newGame(100 + tier), tier, prestige: tier, actions: 6 + tier };
  pumpGame = take(pumpGame, { type: 'fieldEnter' });
  const station = FIELD_LOCATIONS[tier][4];
  pumpGame = snapshot(pumpGame, { player: station.door, car: station.point, fuel: 8 });
  assert(canRefuel(pumpGame));
  const cash = pumpGame.cash, actions = pumpGame.actions;
  pumpGame = take(pumpGame, { type: 'refuel', gallons: 1.5 });
  assert.equal(pumpGame.field.fuel, 9.5);
  assert.equal(pumpGame.cash, Math.round((cash - Math.round(1.5 * GAS_PRICES[tier] * 100) / 100) * 100) / 100);
  pumpGame = take(pumpGame, { type: 'refuel' });
  assert.equal(pumpGame.field.fuel, 12);
  assert.equal(pumpGame.actions, actions);
  assert.throws(() => act(pumpGame, { type: 'refuel' }), 'A full tank is not charged again');
  pumpGame = snapshot(pumpGame, { fuel: 10 });
  for (const gallons of [-1, 0, 13, Number.NaN, Number.POSITIVE_INFINITY, '1', .00001]) {
    assert.throws(() => act(pumpGame, { type: 'refuel', gallons }));
  }
  assert.throws(() => act({ ...pumpGame, cash: 0 }, { type: 'refuel' }), 'The pump enforces the available budget');
  assert.throws(() => act({ ...pumpGame, field: { ...pumpGame.field, driving: true } }, { type: 'refuel' }));
  assert.throws(() => act({ ...pumpGame, field: { ...pumpGame.field, car: HQ_POINT } }, { type: 'refuel' }));
  const beforeReload = JSON.stringify(pumpGame);
  assert.equal(JSON.stringify(normalizeGame(JSON.parse(beforeReload))), beforeReload);
}

game = snapshot(game, { fuel: 0 });
const beforeTow = game.cash;
game = take(game, { type: 'roadside' });
assert.equal(game.cash, beforeTow - 150);
assert.equal(game.field.fuel, 0, 'A tow does not grant complimentary fuel');
assert(canRefuel(game));
assert.equal(game.field.destination, 4);
assert.equal(game.actions, initialActions);
assert.throws(() => act({ ...game, cash: 149 }, { type: 'roadside' }));
game = take(game, { type: 'refuel', gallons: 1 });
assert.throws(() => act(game, { type: 'roadside' }), 'A running vehicle does not qualify for an emergency tow');
const fuelBeforeCustomize = game.field.fuel;
game = take(game, { type: 'customize', style: { ...appearance, car: 'wagon' } });
assert.equal(game.field.fuel, fuelBeforeCustomize, 'Changing the car body never resets fuel');

// Each physical search produces three leads at the venue the scout visited.
for (const source of [0, 1, 2]) {
  let search = newGame(222 + source);
  search = take(search, { type: 'fieldEnter' });
  search = snapshot(search, { player: FIELD_LOCATIONS[0][source + 1].door });
  for (let visit = 0; visit < 4; visit++) {
    if (search.actions === 0) search = take(search, { type: 'nextWeek' });
    const previouslyKnown = new Set(search.candidates.filter(candidate => candidate.discovered).map(candidate => candidate.id));
    search = take(search, { type: 'scout', source });
    const revealed = search.candidates.filter(candidate => candidate.discovered && !previouslyKnown.has(candidate.id));
    assert.equal(revealed.length, 3);
    assert(revealed.every(candidate => candidateLocation(candidate.id) === source + 1));
    assert(search.report.body.includes(FIELD_LOCATIONS[0][source + 1].name));
  }
}

// Returning to HQ and progressing a chapter saves customization while resetting
// the new organization's vehicle, tank, district visits and introductions.
assert.throws(() => act(game, { type: 'fieldReturn' }), 'HQ return requires a physical visit');
game = snapshot(game, { player: FIELD_LOCATIONS[0][0].door });
game = take(game, { type: 'fieldReturn' });
assert.equal(game.field.scene, 'office');
assert.equal(game.field.destination, null);
const styleBeforeSeason = structuredClone(game.style);
game = take(game, { type: 'repeat' });
assert.deepEqual(game.style, styleBeforeSeason);
assert.deepEqual(game.field, freshField(game.tier));
game.candidates.slice(0, 3).forEach(candidate => Object.assign(candidate, {
  status: 'hired', hiredWeek: 1, wage: candidate.salary, morale: 95, verified: true, completed: 1,
}));
game.completed = TIERS[0].goals.missions;
game.reputation = TIERS[0].goals.reputation;
game = take(game, { type: 'prestige' });
assert.equal(game.tier, 1);
assert.deepEqual(game.style, styleBeforeSeason);
assert.deepEqual(game.field, freshField(game.tier));

// Invalid optional additions are rejected before a browser can render them.
for (const patch of [{ player: null }, { player: { x: -1, y: 0 } }, { car: { x: 0, y: 1025 } },
  { heading: Number.NaN }, { heading: FULL_TURN }, { driving: true }, { fuel: -1 }, { fuel: 12.1 },
  { visited: [0, 5] }, { visited: [0, 0] }, { met: ['t9-999'] }, { destination: 5 }, { scene: 'moon' }]) {
  assert.equal(validGame({ ...game, field: { ...game.field, ...patch } }), false);
}
assert.equal(validGame({ ...game, field: null }), false);
assert.equal(validGame({ ...game, style: null }), false);
assert.equal(validGame({ ...game, style: { ...game.style, station: 3 } }), false);

console.log('PASS: legacy migration, honest meeting/visiting, bounded snapshots, GPS, customization/preferences, paid fuel/tow, source-specific leads and prestige retention.');
