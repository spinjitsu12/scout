import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createImmersivePhysics, IMMERSIVE_PHYSICS_STEP as DT, PHYSICS_PART_NAMES } from '../src/lib/immersive-physics.ts';
import { createImmersiveVehicle, stepImmersiveVehicle, immersiveImpactDamage } from '../src/lib/immersive-driving.ts';
import { createPedestrianWorld } from '../src/lib/immersive-pedestrians.ts';
import { createPoliceResponseWorld } from '../src/lib/immersive-police.ts';
import { stepImmersiveWalk } from '../src/lib/immersive-motion.ts';
import { POLICE_ARRIVAL_SECONDS } from '../src/lib/immersive-law.ts';
import { createTrafficSimulation } from '../src/lib/traffic-data.ts';
import { WORLD_ROADS } from '../src/lib/regional-roads.ts';

const start = (x = 100, z = 100, heading = 0) => createImmersiveVehicle({ x, z, heading });
const idle = { throttle: 0, brake: 0, steer: 0 };
const wall = (id, minX, maxX, minZ, maxZ, minY = 0, maxY = 3) => ({ id, kind: 'wall', minX, maxX, minZ, maxZ, minY, maxY });
const create = (state = start(), solids = [], options = {}) => createImmersivePhysics({ vehicle: state, nearbyCollisions: () => solids, bounds: { minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 }, ...options });
const tick = (physics, state, options = {}) => physics.step({ dt: DT, vehicle: { previous: state, proposed: stepImmersiveVehicle(state, options.input ?? idle, DT), driving: options.driving ?? true }, ...(options.walker ? { walker: options.walker } : {}), pedestrians: options.pedestrians ?? [], traffic: options.traffic ?? [], props: options.props ?? [] });
const bounded = pose => Object.values(pose.parts).every(part => Object.values(part.position).every(Number.isFinite) && Object.values(part.quaternion).every(Number.isFinite));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Observe native engine poses while driving the real authored traffic controller.
// This catches colliders advancing a tick beyond their authoritative rendered route.
const authoredTraffic = createTrafficSimulation({ roads: WORLD_ROADS, maxCars: 1 }), authoredCar = authoredTraffic.cars[0];
let authoredVehicle = start(authoredCar.x + 30, authoredCar.z + 30), authoredPhysics = create(authoredVehicle, [], { bounds: undefined }), engineTraffic = [];
const nativeStep = CANNON.World.prototype.step;
try {
  CANNON.World.prototype.step = function (...args) { nativeStep.apply(this, args); engineTraffic = this.bodies.filter(body => body.type === CANNON.Body.KINEMATIC).map(body => ({ x: body.position.x, z: body.position.z })); };
  for (let tick = 0; tick < 120; tick++) {
    authoredTraffic.update(DT, tick * DT, { ...authoredVehicle, driving: false });
    const contacts = authoredPhysics.step({ dt: DT, vehicle: { previous: authoredVehicle, proposed: authoredVehicle, driving: false }, traffic: authoredTraffic.cars }); authoredVehicle = contacts.vehicle;
    assert.equal(engineTraffic.length, 1); assert(distance(engineTraffic[0], authoredTraffic.cars[0]) < 1e-7, 'Ordinary authored traffic ends at the actual controller pose instead of one tick ahead');
  }
} finally { CANNON.World.prototype.step = nativeStep; authoredPhysics.dispose(); }

// Use the actual resident planner with Cannon feedback, as the playable scene does.
// Independent planner/engine tests missed a second velocity integration each tick.
const residentFixture = { collisions: [], locations: [], interactables: [], roads: [{ id: 'test-street', x: 200, z: 200, width: 240, depth: 12, kind: 'street', regionId: 'test', speedLimit: 13.4 }] };
const residents = createPedestrianWorld({ ...residentFixture, maxPeople: 1 });
residents.setFocus({ position: { x: 200, z: 224 }, interior: null, population: 1 });
let residentVehicle = start(200, 224), residentSolids = [], residentPhysics = create(residentVehicle, [], { nearbyCollisions: () => residentSolids });
let movingTicks = 0, freeDistance = 0;
const residentTick = (dt, elapsed) => {
  const before = { ...residents.physicsPedestrians()[0] }; residents.update(dt, elapsed);
  const desired = residents.physicsPedestrians()[0], inputs = residents.physicsPedestrians();
  const contacts = residentPhysics.step({ dt, vehicle: { previous: residentVehicle, proposed: residentVehicle, driving: false }, pedestrians: inputs }); residentVehicle = contacts.vehicle;
  residents.applyStandingPoses(contacts.standingPedestrians); residents.render(elapsed, 1, dt);
  return { before, desired, actual: residents.physicsPedestrians()[0], contacts };
};
for (let tick = 0; tick < 960; tick++) {
  const { before, desired, actual } = residentTick(DT, tick * DT), planned = distance(before, desired);
  assert.deepEqual(desired.previous, { x: before.x, z: before.z }, 'Resident exports the start of the exact planner tick');
  assert(distance(actual, desired) < 1e-7, 'Unobstructed Cannon motion ends at the actual route planner pose, without a second walking advance');
  assert(distance(residents.modelForActor(actual.id).group.position, actual) < 1e-7, 'Standing presentation uses the engine-solved pose');
  if (planned > .001) { movingTicks++; freeDistance += planned; assert(Math.abs(actual.speed - planned / DT) < 1e-6, 'Gait speed reflects actual solved displacement'); }
}
assert(movingTicks > 500 && freeDistance > 4, 'The coupled regression observes sustained real route walking');
const movingResident = residents.physicsPedestrians()[0], direction = -Math.sin(movingResident.heading), barrierX = movingResident.x + direction * .8;
residentSolids = [wall('new-resident-barrier', barrierX - .1, barrierX + .1, movingResident.z - 2, movingResident.z + 2)];
let approachedBarrier = false;
for (let tick = 0; tick < 180; tick++) {
  const { actual } = residentTick(DT, 8 + tick * DT); approachedBarrier ||= Math.abs(actual.x - barrierX) < .45;
  assert(direction < 0 ? actual.x > barrierX + .36 : actual.x < barrierX - .36, 'Engine contacts block a newly occupied resident path without crossing the wall');
}
assert(approachedBarrier, 'The coupled resident actually reaches the engine collider');
const heldResident = { ...residents.physicsPedestrians()[0] }, heldModel = residents.modelForActor(heldResident.id).group.position.clone(), heldSteps = residentPhysics.stats.stepCount;
for (let tick = 0; tick < 20; tick++) residentTick(0, 10);
assert.equal(residentPhysics.stats.stepCount, heldSteps); assert.deepEqual(residents.physicsPedestrians()[0], heldResident); assert(residents.modelForActor(heldResident.id).group.position.equals(heldModel), 'Paused resident/controller/engine/render cycles cannot drift');
residentPhysics.dispose(); residents.dispose();

// Authored patrols and the actual officer controller supply the same previous→desired contract.
const patrol = createPoliceResponseWorld({ maxCars: 1 }), incidentPoint = { x: 2970, z: 1105 }, patrolPlayer = { x: 2995, z: 1130, heading: 0, speed: 0 };
const response = seconds => ({ id: 'law:1:resident', npcId: 'resident', position: incidentPoint, speed: 12, phase: seconds >= POLICE_ARRIVAL_SECONDS ? 'arrived' : 'dispatched', elapsedSeconds: seconds });
let officerVehicle = start(patrolPlayer.x, patrolPlayer.z), officerPhysics = create(officerVehicle, [], { bounds: undefined }), officerMovingTicks = 0;
for (let tick = 0; tick < 30 / DT; tick++) {
  const seconds = tick * DT; patrol.update(response(seconds), patrolPlayer, DT, seconds);
  const desired = patrol.pedestrians()[0];
  const contacts = officerPhysics.step({ dt: DT, vehicle: { previous: officerVehicle, proposed: officerVehicle, driving: false }, pedestrians: patrol.pedestrians() }); officerVehicle = contacts.vehicle;
  patrol.applyStandingPoses(contacts.standingPedestrians);
  if (desired) {
    const actual = patrol.pedestrians()[0], planned = distance(desired.previous, desired);
    assert(distance(actual, desired) < 1e-7, 'Actual officer navigation moves once after Cannon standing feedback');
    if (planned > .001) { officerMovingTicks++; assert(Math.abs(distance(actual.previous, actual) / DT - 1.45) < 1e-6, 'Unobstructed officer retains the authored 1.45m/s walking pace'); }
  }
  patrol.render(1, seconds);
}
assert(officerMovingTicks > 30, 'The coupled patrol regression observes the walking officer');
const heldOfficer = patrol.pedestrians()[0], officerSteps = officerPhysics.stats.stepCount;
patrol.update(response(30), patrolPlayer, 0, 30); const pausedOfficer = officerPhysics.step({ dt: 0, vehicle: { previous: officerVehicle, proposed: officerVehicle, driving: false }, pedestrians: patrol.pedestrians() }); patrol.applyStandingPoses(pausedOfficer.standingPedestrians);
assert.equal(officerPhysics.stats.stepCount, officerSteps); assert.deepEqual(patrol.pedestrians()[0], heldOfficer, 'Pausing the real officer/controller/Cannon bridge preserves his pose and speed');
const visiblePatrol = patrol.group.getObjectByName('Regional patrol 1'); assert(visiblePatrol.visible); assert(visiblePatrol.children.filter(part => part.isGroup).every(wheel => wheel.rotation.x < 0), 'Forward -Z patrol wheels roll around the axle in the correct direction');
officerPhysics.dispose(); patrol.dispose();

// A damped walking controller slides tangentially along engine contacts.
let slideVehicle = start(60, 60), slidePhysics = create(slideVehicle, [wall('walking-slide-wall', 70, 70.5, 40, 80)]), slidePoint = { x: 69, z: 60 }, slideVelocity = { x: 0, z: 0 };
for (let tick = 0; tick < 600; tick++) {
  const contacts = slidePhysics.step({ dt: DT, vehicle: { previous: slideVehicle, proposed: slideVehicle, driving: false }, walker: { position: slidePoint, displacement: { x: 0, z: 0 } } }); slideVehicle = contacts.vehicle; slidePoint = contacts.walker;
}
assert(Math.abs(slidePhysics.stats.walkerVerticalSpeed) < .001 && Math.abs(slidePhysics.stats.walkerHeight - .84) < .001, 'A grounded walker keeps the Cannon floor pose instead of resetting its height and accumulating falling velocity');
for (let tick = 0; tick < 240; tick++) {
  const walked = stepImmersiveWalk(slideVelocity, { x: 1, z: 1 }, DT); slideVelocity = walked.velocity;
  const contacts = slidePhysics.step({ dt: DT, vehicle: { previous: slideVehicle, proposed: slideVehicle, driving: false }, walker: { position: slidePoint, displacement: walked.displacement } }); slideVehicle = contacts.vehicle; slidePoint = contacts.walker;
}
assert(slidePoint.x < 69.8 && slidePoint.x > 69.5 && slidePoint.z > 62.5, 'Actual walking controller is blocked normally and slides along the contact tangent');
const beforeWalkerPause = { point: { ...slidePoint }, height: slidePhysics.stats.walkerHeight, verticalSpeed: slidePhysics.stats.walkerVerticalSpeed, steps: slidePhysics.stats.stepCount };
slidePhysics.step({ dt: 0, vehicle: { previous: slideVehicle, proposed: slideVehicle, driving: false }, walker: { position: { x: 200, z: 200 }, displacement: { x: 20, z: 20 } } });
assert.equal(slidePhysics.stats.stepCount, beforeWalkerPause.steps); assert.equal(slidePhysics.stats.walkerHeight, beforeWalkerPause.height); assert.equal(slidePhysics.stats.walkerVerticalSpeed, beforeWalkerPause.verticalSpeed, 'Paused walking cannot drift vertically or apply a queued teleport');
for (let tick = 0; tick < 120; tick++) {
  const contacts = slidePhysics.step({ dt: DT, vehicle: { previous: slideVehicle, proposed: slideVehicle, driving: false }, walker: { position: { x: 200, z: 200 }, displacement: { x: 0, z: 0 } } }); slideVehicle = contacts.vehicle;
}
assert(Math.abs(slidePhysics.stats.walkerVerticalSpeed) < .001 && Math.abs(slidePhysics.stats.walkerHeight - .84) < .001, 'Tow/load teleports reset the walker once and then restore physical ground support'); slidePhysics.dispose();

// Collision feedback charges fuel/mileage for solved motion, including small
// contact corrections, instead of the controller's unfulfilled advance.
let mileageVehicle = { ...start(), speed: 8, distance: 123, fuel: 4.5 }, mileagePhysics = create(mileageVehicle, [wall('mileage-wall', 80, 120, 94, 94.04)]), solvedMetres = 0, blockedSolved = 0, blockedProposed = 0;
for (let tick = 0; tick < 720; tick++) {
  const proposed = stepImmersiveVehicle(mileageVehicle, { throttle: 1, brake: 0, steer: 0 }, DT), contacts = mileagePhysics.step({ dt: DT, vehicle: { previous: mileageVehicle, proposed, driving: true } }), travelled = distance(mileageVehicle, contacts.vehicle);
  solvedMetres += travelled; if (tick >= 600) { blockedSolved += travelled; blockedProposed += distance(mileageVehicle, proposed); } mileageVehicle = contacts.vehicle;
}
assert(blockedSolved < .002 && blockedProposed > blockedSolved * 5, 'The mileage regression actually holds the running compact against an engine wall');
assert(Math.abs(mileageVehicle.distance - 123 - solvedMetres) < 1e-10, 'Odometer uses actual Cannon displacement after blocking');
assert(Math.abs(4.5 - mileageVehicle.fuel - solvedMetres / (1609.344 * 32)) < 1e-10, 'Fuel consumption uses actual contact-resolved mileage'); mileagePhysics.dispose();

// Real regional unload/reload creates a fresh native body ID for the same wall.
// Prepared ray impacts must not retain those dead IDs or expired live entries.
let cacheSolids = [], cacheVehicle = { ...start(), speed: 33.5 }, cachePhysics = create(cacheVehicle, [], { nearbyCollisions: () => cacheSolids }), peakCacheBodies = 0;
const prepareRegionalImpact = () => {
  cacheSolids = [wall('revisited-regional-wall', 80, 120, 94, 94.04)]; cacheVehicle = { ...start(), speed: 33.5 }; cachePhysics.resetVehicle(cacheVehicle);
  let prepared = false;
  for (let tickIndex = 0; tickIndex < 40 && !prepared; tickIndex++) {
    const next = tick(cachePhysics, cacheVehicle); cacheVehicle = next.vehicle; prepared ||= cachePhysics.stats.sweptImpactEntries > 0; peakCacheBodies = Math.max(peakCacheBodies, cachePhysics.stats.bodies);
  }
  assert(prepared, 'Native bumper rays prepare an actual contact during each regional visit'); assert.equal(cachePhysics.stats.sweptImpactEntries, 1);
};
for (let journey = 0; journey < 40; journey++) {
  prepareRegionalImpact(); cacheSolids = []; cacheVehicle = { ...cacheVehicle, x: 500, z: 500, speed: 0 }; cachePhysics.resetVehicle(cacheVehicle); cacheVehicle = tick(cachePhysics, cacheVehicle, { driving: false }).vehicle;
  assert.equal(cachePhysics.stats.staticBodies, 0); assert.equal(cachePhysics.stats.sweptImpactEntries, 0, 'Leaving a region releases the retired native body ID from prepared-impact tracking');
}
assert(peakCacheBodies <= 8, 'Repeated real body replacement retains the bounded local body budget');
prepareRegionalImpact();
for (let tickIndex = 0; tickIndex < 12; tickIndex++) cacheVehicle = tick(cachePhysics, cacheVehicle, { driving: false }).vehicle;
assert.equal(cachePhysics.stats.staticBodies, 1); assert.equal(cachePhysics.stats.sweptImpactEntries, 0, 'Expired prepared impacts are removed even while their physical wall remains loaded'); cachePhysics.dispose(); assert.equal(cachePhysics.stats.sweptImpactEntries, 0);

// One actual wall crash emits contacts across several settling ticks. Damage is
// charged once, including when the same wall is authored as neighboring pieces.
for (const pieces of [[wall('one-shot-wall', 80, 120, 94, 94.04)], [wall('wall-left', 80, 100, 94, 94.04), wall('wall-right', 100, 120, 94, 94.04)]]) {
  let impactVehicle = { ...start(), speed: 8 }, impactPhysics = create(impactVehicle, pieces), damageTicks = 0, expectedDamage = 0, collisionTicks = 0, eventTicks = 0;
  const crashAndSettle = () => {
    for (let tickIndex = 0; tickIndex < 300; tickIndex++) {
      const before = impactVehicle, next = tick(impactPhysics, before); impactVehicle = next.vehicle;
      if (next.impacts.length) {
        eventTicks++; expectedDamage += Math.max(...next.impacts.map(impact => immersiveImpactDamage(impact.normalSpeed, impact.kind === 'prop' ? 'prop' : impact.kind === 'vehicle' ? 'vehicle' : 'solid')));
      }
      if (next.vehicle.damage - before.damage > 1e-8) damageTicks++;
      collisionTicks += Number(next.vehicle.collision);
      assert(Math.abs(next.vehicle.damage - expectedDamage) < 1e-10, 'Settling/contact-cache ticks cannot charge an already emitted physical impact again');
    }
  };
  crashAndSettle(); assert.equal(eventTicks, 1); assert.equal(damageTicks, 1); assert(collisionTicks >= 5, 'The regression actually observes continued engine contact after the initial crash'); assert(impactVehicle.damage > .03 && impactVehicle.damage < .06);
  impactVehicle = { ...impactVehicle, x: 100, z: 100, speed: 8 }; impactPhysics.resetVehicle(impactVehicle); crashAndSettle();
  assert.equal(eventTicks, 2); assert.equal(damageTicks, 2); assert(impactVehicle.damage > .06 && impactVehicle.damage < .12, 'A distinct fresh crash after cooldown is charged once again'); impactPhysics.dispose();
}
let weightedVehicle = { ...start(), speed: 8 }, weightedPhysics = create(weightedVehicle, [wall('weighted-wall', 80, 120, 94, 94.04)]), sawWeightedImpact = false, sawWeightedRelease = false;
for (let tickIndex = 0; tickIndex < 120; tickIndex++) {
  const before = weightedVehicle, next = tick(weightedPhysics, before, { props: [{ id: 'weighted-bollard', x: 100, z: 93.88, heading: 0, height: .94, kind: 'bollard', state: 'standing' }] }); weightedVehicle = next.vehicle;
  sawWeightedRelease ||= next.props.some(prop => prop.fallen);
  if (next.impacts.some(impact => impact.kind === 'prop') && next.impacts.some(impact => impact.kind === 'wall')) {
    sawWeightedImpact = true; const losses = next.impacts.map(impact => immersiveImpactDamage(impact.normalSpeed, impact.kind === 'prop' ? 'prop' : 'solid'));
    assert(Math.max(...losses) > Math.min(...losses) * 3, 'The real mixed contact has distinct material-weighted damage');
    assert(Math.abs(next.vehicle.damage - before.damage - Math.max(...losses)) < 1e-10, 'A simultaneous wall/post crash charges the greatest weighted loss once, rather than adding losses or using the softer post category');
  }
}
assert(sawWeightedImpact && sawWeightedRelease, 'The weighted damage regression observes real simultaneous wall/post contacts and preserves physical prop release'); weightedPhysics.dispose();

let state = start(), physics = create(state), previousZ = state.z;
for (let i = 0; i < 360; i++) { state = tick(physics, state, { input: { throttle: 1, brake: 0, steer: 0 } }).vehicle; assert(state.z <= previousZ + .001); previousZ = state.z; }
assert(state.speed > 5 && state.speed < 7, 'Grounded engine retains gentle compact acceleration');
assert(state.z < 92 && state.y === 0, 'A car supported by physical tyres starts grounded and travels forward');
assert.equal(physics.stats.engine, 'cannon-es'); assert.equal(physics.stats.ragdolls, 0); assert.equal(physics.stats.constraints, 0);
const beforePause = { ...state }, steps = physics.stats.stepCount;
for (const dt of [0, -1, NaN, 1, 90]) { const stopped = physics.step({ dt, vehicle: { previous: state, proposed: { ...state, z: state.z - 50 }, driving: true } }); assert.equal(stopped.vehicle.z, beforePause.z); }
assert.equal(physics.stats.stepCount, steps, 'Paused/invalid/hidden time does not simulate or build backlog');
physics.dispose(); physics.dispose(); assert.equal(physics.stats.bodies, 0); assert.equal(physics.stats.constraints, 0);

// Contact is determined by the engine's actual body geometry, including thin obstacles at maximum game speed.
for (const speed of [8, 33.5, -3.2]) {
  state = { ...start(), speed, gear: speed < 0 ? 'R' : 'D' };
  const obstacle = speed < 0 ? wall('reverse-wall', 80, 120, 104, 104.04) : wall('thin-wall', 80, 120, 94, 94.04);
  physics = create(state, [obstacle]); let hit = false;
  for (let i = 0; i < 320; i++) { const next = tick(physics, state, { input: speed < 0 ? { throttle: 0, brake: 0, steer: 0, reverse: true } : idle }); state = next.vehicle; hit ||= next.impacts.some(impact => impact.id === obstacle.id); }
  assert(hit, `${speed}m/s real wall contact is reported`);
  assert(speed < 0 ? state.z < 102.1 : state.z > 96, `${speed}m/s chassis cannot tunnel through a four-centimetre wall`);
  if (speed > 8) assert(state.damage > .8, 'High-speed engine contact damages/disables the compact');
  physics.dispose();
}
state = { ...start(), speed: 12 }; physics = create(state); let trafficHit = false;
for (let i = 0; i < 180; i++) { const next = tick(physics, state, { traffic: [{ id: 'traffic-car', x: 100, z: 94, heading: Math.PI, speed: 0 }] }); state = next.vehicle; trafficHit ||= next.impacts.some(impact => impact.id === 'traffic-car' && impact.kind === 'vehicle'); }
assert(trafficHit && state.z > 97.9, 'Kinematic traffic is contacted and stops the entire compact body'); physics.dispose();

state = start(60, 60); physics = create(state, [wall('bedroom-shelf', 70, 70.5, 55, 65, 0, 1.2)]); let point = { x: 67, z: 60 };
for (let i = 0; i < 360; i++) { const next = tick(physics, state, { driving: false, walker: { position: point, displacement: { x: .025, z: 0 } } }); point = next.walker; state = next.vehicle; }
assert(point.x < 69.8 && point.x > 69, 'Cannon walking capsule stops at visible furniture without crossing or climbing it');
const snap = { ...state, x: 500, z: 500 }; physics.resetVehicle(snap); state = tick(physics, snap, { driving: false }).vehicle; assert(Math.hypot(state.x - 500, state.z - 500) < .01, 'Tow/load reset has no velocity or old-location impulse'); physics.dispose();

// No proximity crime, no charge at low speed, and no repeat contact charges.
state = { ...start(), speed: 12 }; physics = create(state); let proximityEvents = 0;
for (let i = 0; i < 120; i++) { const next = tick(physics, state, { pedestrians: [{ id: 'nearby-only', x: 104, z: 95, heading: 0, speed: 0 }] }); state = next.vehicle; proximityEvents += next.incidents.length; }
assert.equal(proximityEvents, 0); assert.equal(physics.stats.ragdolls, 0); physics.dispose();
state = { ...start(), speed: 1.5 }; physics = create(state); let bumps = 0;
for (let i = 0; i < 240; i++) { const next = tick(physics, state, { pedestrians: [{ id: 'slow-nudge', x: 100, z: 97.5, heading: 0, speed: 0 }] }); state = next.vehicle; bumps += next.incidents.length; }
assert.equal(bumps, 0); assert.equal(physics.stats.ragdolls, 0, 'Walking-speed nudges are physical but never run-over crimes'); physics.dispose();

for (const [speed, direction] of [[12, -1], [-3.2, 1], [33.5, -1]]) {
  state = { ...start(), speed, gear: speed < 0 ? 'R' : 'D' }; physics = create(state); const person = { id: `actual-contact-${speed}`, x: 100, z: 100 + direction * 5, heading: 0, speed: 0 };
  let incidents = [], highest = 0, windscreen = false, snapshots = 0;
  for (let i = 0; i < 600; i++) {
    const next = tick(physics, state, { pedestrians: [person], input: speed < 0 ? { throttle: 0, brake: 0, steer: 0, reverse: true } : idle }); state = next.vehicle; incidents.push(...next.incidents);
    for (const rag of next.ragdolls) { assert.equal(Object.keys(rag.parts).length, 11); assert(bounded(rag), 'Every engine-driven limb snapshot remains finite'); highest = Math.max(highest, rag.parts.head.position.y); const head = rag.parts.head.position; windscreen ||= head.y > 1.15 && head.z - state.z > -1.25 && head.z - state.z < 1.15; snapshots++; }
  }
  assert.equal(incidents.length, 1, `${speed}m/s confirmed contact has exactly one persistent incident`);
  assert(incidents[0].speed >= 2.5 && incidents[0].npcId === person.id); assert.equal(physics.stats.people, 0); assert.equal(physics.stats.ragdolls, 1); assert.equal(physics.stats.constraints, 10); assert(snapshots > 10);
  if (speed > 0) assert(physics.stats.bonnetContacts > 0, `${speed}m/s articulated body makes real contact with the modeled bonnet`);
  if (speed > 30) { assert(highest > 1.8, 'A high-energy crash lifts the articulated body above roof height'); assert(windscreen, 'High-energy body trajectory crosses the windshield/roof region'); assert(physics.stats.windshieldContacts > 0, 'Cannon narrowphase confirms actual articulated-body contact with the sloped glass shape'); }
  const stepBefore = physics.stats.stepCount, ragBefore = JSON.stringify(physics.ragdolls); tick(physics, state, { driving: false }); physics.step({ dt: 0, vehicle: { previous: state, proposed: state, driving: false } }); assert(physics.stats.stepCount > stepBefore); assert.notEqual(JSON.stringify(physics.ragdolls), ragBefore, 'Only active fixed ticks advance articulated bodies');
  physics.retireRagdoll(person.id); assert.equal(physics.stats.ragdolls, 0); assert.equal(physics.stats.constraints, 0); assert(physics.stats.struckNpcIds.includes(person.id)); tick(physics, state, { pedestrians: [person] }); assert.equal(physics.stats.people, 0, 'A retired victim cannot return as an invisible or uncharged standing collider'); physics.dispose();
}

state = { ...start(), speed: 12 }; physics = create(state); const pole = { id: 'roadside-pole', x: 100, z: 95, heading: 0, height: 4.2, kind: 'lamp', state: 'standing' }; let fallen = false, angle = 0;
for (let i = 0; i < 500; i++) { const next = tick(physics, state, { props: [pole] }); state = next.vehicle; const view = next.props[0]; if (view?.fallen) { fallen = true; angle = Math.max(angle, Math.hypot(view.quaternion.x, view.quaternion.z)); assert(Object.values(view.position).every(Number.isFinite)); } }
assert(fallen && angle > .4, 'Confirmed roadside impact releases a pole into actual Cannon gravity/rotation'); assert.equal(physics.stats.props, 1);
const settledProp = physics.step({ dt: 0, vehicle: { previous: state, proposed: state, driving: false } }).props[0], propPosition = { ...settledProp.position }, propRotation = { ...settledProp.quaternion };
physics.resetVehicle({ ...state, x: 500, z: 500 }); state = tick(physics, { ...state, x: 500, z: 500 }, { driving: false, props: [{ ...pole, state: 'fallen' }] }).vehicle; assert.equal(physics.stats.props, 0); assert.equal(physics.stats.savedFallenProps, 1);
physics.resetVehicle({ ...state, x: 106, z: 95 }); const restored = tick(physics, { ...state, x: 106, z: 95 }, { driving: false, props: [{ ...pole, state: 'fallen' }] }).props[0]; assert(restored?.fallen); assert.deepEqual(restored.position, propPosition); assert.deepEqual(restored.quaternion, propRotation, 'Returning to visible debris restores the same physical collider pose');
physics.retireRagdoll('other-victim'); assert.equal(physics.stats.props, 1, 'Resolving a pedestrian incident leaves physical world debris intact'); physics.clearActors(); assert.equal(physics.stats.props, 0); const rebound = tick(physics, { ...state, x: 106, z: 95 }, { driving: false, props: [{ ...pole, state: 'fallen' }] }).props[0]; assert(rebound?.fallen); physics.dispose();

const many = Array.from({ length: 1000 }, (_, i) => wall(`budget-${i}`, 200 + i / 100, 200.02 + i / 100, 200, 200.04));
state = start(); physics = create(state, many, { maxStaticBodies: 40, struckNpcIds: ['saved-victim'] });
tick(physics, state, { pedestrians: [{ id: 'saved-victim', x: 100, z: 95, heading: 0, speed: 0 }] }); assert.equal(physics.stats.staticBodies, 40); assert.equal(physics.stats.people, 0, 'Reloaded struck NPC identity cannot return as an uncharged standing body'); physics.dispose(); assert.equal(physics.stats.bodies, 0); assert.equal(physics.stats.constraints, 0);
assert.equal(PHYSICS_PART_NAMES.length, 11);
console.log('PASS: coupled resident/officer/traffic controllers move once at their authored pace; grounded walkers block/slide/pause/teleport safely; solved fuel/mileage, bounded prepared-impact tracking through regional body replacement/expiry, one-shot material-weighted damage and distinct fresh crashes, real Cannon ground and gentle controls, fixed clocks, thin-wall/traffic/furniture contacts, reverse/high-speed impacts, articulated eleven-part windshield ragdolls, no proximity/slow/repeated crime, dynamic falling props, bounded local bodies, tow reset and exact cleanup.');
