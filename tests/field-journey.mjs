import assert from 'node:assert/strict';
import { act, newGame, normalizeGame, validGame, members, missions, canPrestige, MOTIVES } from '../src/lib/game.ts';
import { FIELD_LOCATIONS, FUEL_CAPACITY, GAS_PRICES, atVenue, candidateLocation, candidatePosition, fieldOf, styleOf } from '../src/lib/expedition.ts';
import { DISTRICT_GEOMETRIES, districtPath, districtRoadRoute, districtMove, districtWalkable, driveDistance, exitVehicle, fuelAfterDistance, shortestAngle, stepSteeredVehicle, vehicleFootprintFits } from '../src/lib/driving.ts';
import { PROLOGUE_PHASES, advancePrologue, chooseProloguePitch } from '../src/lib/prologue.ts';

let game = newGame(20261001);
const take = action => {
  game = act(game, action);
  assert(validGame(game), `${action.type} must leave a reloadable career`);
};
const snapshot = patch => take({ type: 'fieldSnapshot', field: { ...fieldOf(game), ...patch } });
const reload = () => {
  const json = JSON.stringify(game, null, 2);
  const imported = JSON.parse(json);
  assert(validGame(imported), 'An exported career is accepted on import');
  game = normalizeGame(imported);
  assert.deepEqual(game, imported, 'A current save resumes exactly where it was exported');
};

// Scene boundaries save the committed dream choice without charging the real career.
const realCareer = { cash: game.cash, actions: game.actions, candidates: structuredClone(game.candidates) };
for (const phase of PROLOGUE_PHASES) {
  assert.equal(game.story.phase, phase);
  reload();
  if (phase === 'meeting') {
    take({ type: 'story', state: chooseProloguePitch(game.story, 'purpose') });
    reload();
    assert.equal(game.story.choice, 'purpose');
  }
  if (phase !== 'complete') take({ type: 'story', state: advancePrologue(game.story) });
}
assert.equal(game.cash, realCareer.cash);
assert.equal(game.actions, realCareer.actions);
assert.deepEqual(game.candidates, realCareer.candidates);
take({ type: 'briefing' });

const geometry = () => DISTRICT_GEOMETRIES[game.tier];
function walkTo(goal) {
  assert.equal(game.field.driving, false);
  const route = districtPath(game.field.player, goal, false, geometry());
  assert(route.length, `A scout can walk to ${JSON.stringify(goal)}`);
  let player = { ...game.field.player };
  for (const waypoint of route) {
    for (let steps = 0; driveDistance(player, waypoint) > .05; steps++) {
      assert(steps < 1500, 'A walking route must not stick on furniture or a building');
      const gap = driveDistance(player, waypoint), distance = Math.min(5, gap);
      const next = districtMove(player, { x: (waypoint.x - player.x) / gap * distance, y: (waypoint.y - player.y) / gap * distance }, false, geometry());
      assert(driveDistance(player, next) > .001, 'The planned walking path must be physically traversable');
      assert(districtWalkable(next, 10, geometry()));
      player = next;
    }
  }
  snapshot({ player });
}
function enterCar() {
  walkTo(game.field.car);
  snapshot({ driving: true, player: { ...game.field.car } });
  reload();
  assert.deepEqual(game.field.player, game.field.car);
}
function park() {
  const player = exitVehicle(game.field.car, game.field.heading, geometry());
  assert(player, 'Every reached parking position has a safe pedestrian exit');
  snapshot({ driving: false, player });
}
function driveTo(locationId) {
  if (!game.field.driving) enterCar();
  take({ type: 'setDestination', destination: locationId });
  const target = FIELD_LOCATIONS[game.tier][locationId].point;
  const route = districtRoadRoute(game.field.car, target, geometry());
  assert(route.length, 'The real road network connects the requested venue');
  let motion = { position: { ...game.field.car }, velocity: { x: 0, y: 0 }, heading: game.field.heading };
  let fuel = game.field.fuel, distance = 0;
  const step = input => {
    const previous = motion.position;
    motion = stepSteeredVehicle(motion, input, .05, styleOf(game).car, geometry());
    assert(vehicleFootprintFits(motion.position, motion.heading, styleOf(game).car, geometry()), 'The full car stays on the actual district roads');
    const travelled = driveDistance(previous, motion.position);
    distance += travelled;
    fuel = fuelAfterDistance(fuel, travelled, styleOf(game).car);
    assert(fuel > 0, 'This planned first-week journey fits the paid tank');
  };
  // Drive each straight road segment and brake at its junction before steering.
  for (const waypoint of route) {
    if (driveDistance(motion.position, waypoint) < 6) continue;
    let desired = Math.atan2(waypoint.y - motion.position.y, waypoint.x - motion.position.x);
    for (let turns = 0; Math.abs(shortestAngle(motion.heading, desired)) > .00001; turns++) {
      assert(turns < 200, 'There is room to steer the chosen car at this junction');
      step({ throttle: 0, steer: Math.max(-1, Math.min(1, shortestAngle(motion.heading, desired) / .05)), brake: true });
    }
    for (let frames = 0; driveDistance(motion.position, waypoint) > 5; frames++) {
      assert(frames < 2500, `The road must reach ${JSON.stringify(waypoint)} without a collision loop`);
      const gap = driveDistance(motion.position, waypoint);
      desired = Math.atan2(waypoint.y - motion.position.y, waypoint.x - motion.position.x);
      step({ throttle: Math.min(.25, gap / 250), steer: Math.max(-1, Math.min(1, shortestAngle(motion.heading, desired) * 5)), brake: false });
    }
    for (let brakes = 0; Math.hypot(motion.velocity.x, motion.velocity.y) > 0; brakes++) {
      assert(brakes < 100);
      step({ throttle: 0, steer: 0, brake: true });
    }
  }
  assert(driveDistance(motion.position, target) < 12, 'Actual steering reaches venue parking');
  snapshot({ car: motion.position, player: motion.position, heading: motion.heading, driving: true, fuel });
  reload();
  assert.equal(game.field.fuel, fuel, 'Reloading a driven trip cannot refill the tank');
  assert(distance > 0);
  park();
}
function meetAndRecruit(id, sample = false) {
  driveTo(candidateLocation(id));
  const point = candidatePosition(game, id);
  walkTo({ x: point.x + 12, y: point.y + 24 });
  take({ type: 'meet', id });
  assert(game.field.met.includes(id));
  take({ type: 'investigate', id, method: 'interview' });
  const person = game.candidates.find(candidate => candidate.id === id);
  const learnedMotive = Object.entries(MOTIVES).find(([, motive]) => person.evidence.some(note => note.kind === 'interview' && note.text.includes(`values ${motive.name.toLowerCase()}.`)))?.[0];
  assert(learnedMotive, 'The conversation gives a usable offer benefit');
  if (sample) take({ type: 'investigate', id, method: 'sample' });
  take({ type: 'offer', id, salary: person.salary, perk: learnedMotive });
  assert.equal(game.candidates.find(candidate => candidate.id === id).status, 'hired');
  take({ type: 'dismissReport' });
}

// The opening keeps its six actions even when both recruits are met in the field.
take({ type: 'fieldEnter' });
meetAndRecruit('t0-0', true);
meetAndRecruit('t0-1');
assert.equal(game.actions, 1);
assert.equal(game.week, 1);
assert.deepEqual(game.field.met, ['t0-0', 't0-1']);
driveTo(0);
walkTo(FIELD_LOCATIONS[0][0].door);
take({ type: 'fieldReturn' });
assert.equal(game.field.scene, 'office');
take({ type: 'mission', mission: missions(game)[0].id, ids: members(game).map(person => person.id) });
assert(game.report.success, 'The complementary opening hires ship their first release');
assert.equal(game.actions, 0);
assert.equal(game.completed, 1);
take({ type: 'dismissReport' });

const fuelBeforeStyling = game.field.fuel;
const appearance = { name: 'Umi', avatar: 15, car: 'coupe', paint: 'violet', plate: 'UMI-01', camera: 'chase', radio: true, station: 2, music: true, sound: false, engine: false };
take({ type: 'customize', style: appearance });
reload();
assert.deepEqual(game.style, appearance);
assert.equal(game.field.fuel, fuelBeforeStyling, 'A new car appearance is not a free fuel refill');
assert.equal(game.story.phase, 'complete');
assert.equal(game.style.engine, false, 'Engine preferences persist independently of world sounds');

// A physical pump visit charges the chapter's displayed price, then remains saved.
take({ type: 'nextWeek' });
take({ type: 'fieldEnter' });
driveTo(4);
walkTo(FIELD_LOCATIONS[0][4].door);
assert(atVenue(game, 4));
const remaining = FUEL_CAPACITY - game.field.fuel, cashBeforeFuel = game.cash;
take({ type: 'refuel' });
assert.equal(game.field.fuel, FUEL_CAPACITY);
assert(Math.abs(cashBeforeFuel - game.cash - Math.round(remaining * GAS_PRICES[0] * 100) / 100) < .00001);
reload();
assert.equal(game.field.fuel, FUEL_CAPACITY);
assert.equal(game.actions, 6, 'Buying gas consumes cash, without using an investigation action');

meetAndRecruit('t0-2');
driveTo(0);
walkTo(FIELD_LOCATIONS[0][0].door);
take({ type: 'fieldReturn' });
for (let projects = 0; !canPrestige(game); projects++) {
  assert(projects < 6, 'The opening physical journey can still complete its mandate');
  if (game.missionThisWeek || game.actions < 1) take({ type: 'nextWeek' });
  take({ type: 'mission', mission: missions(game)[0].id, ids: members(game).map(person => person.id) });
  assert(game.report.success);
  take({ type: 'dismissReport' });
}
take({ type: 'prestige' });
reload();
assert.equal(game.tier, 1);
assert.deepEqual(game.style, appearance, 'Prestige carries the player identity, car and radio preferences');
assert.equal(game.story.phase, 'complete', 'A promotion never replays the dream');
assert.deepEqual(game.field.met, [], 'New chapter introductions start fresh');

// All chapters expose accessible parking, building entrances and every repeated NPC slot.
for (let tier = 0; tier < 3; tier++) {
  const district = DISTRICT_GEOMETRIES[tier], hq = FIELD_LOCATIONS[tier][0].point;
  for (const location of FIELD_LOCATIONS[tier]) {
    for (const kind of ['compact', 'wagon', 'coupe']) assert(vehicleFootprintFits(location.point, 0, kind, district));
    assert(districtRoadRoute(hq, location.point, district).length);
    assert(districtPath(location.point, location.door, false, district).length);
    assert(exitVehicle(location.point, 0, district));
  }
  for (let index = 0; index < 36; index++) {
    const id = `t${tier}-${index}`, point = candidatePosition({ tier }, id);
    assert(districtWalkable(point, 10, district), `${id} must stand outside the building collision`);
    assert(districtPath(FIELD_LOCATIONS[tier][candidateLocation(id)].door, { x: point.x + 12, y: point.y + 24 }, false, district).length);
  }
}

console.log('PASS: dream phase exports/reloads, real road driving and fuel, safe parking/walking, two first-week physical recruits, first project, paid pump, customization and prestige retention, all-chapter entrances and contact slots.');
