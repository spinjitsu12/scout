import * as CANNON from 'cannon-es';
import { applyImmersiveVehicleImpact, immersiveFuelAfterDistance, immersiveImpactDamage, IMMERSIVE_VEHICLE, type ImmersiveVehicleState } from './immersive-driving.ts';
import { MIN_PEDESTRIAN_IMPACT_SPEED } from './immersive-law.ts';
import type { WorldCollision, WorldPoint } from './immersive-locations.ts';

/** All contacts and articulated motion are solved by Cannon; controls supply desired planar motion. */
export const IMMERSIVE_PHYSICS_STEP = 1 / 120;
export const PHYSICS_PART_NAMES = ['pelvis', 'torso', 'head', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'upperLegL', 'lowerLegL', 'upperLegR', 'lowerLegR'] as const;
export type PhysicsPartName = typeof PHYSICS_PART_NAMES[number];
export type PhysicsVector = { x: number; y: number; z: number };
export type PhysicsQuaternion = PhysicsVector & { w: number };
export type PhysicsPartPose = { position: PhysicsVector; quaternion: PhysicsQuaternion };
export type PhysicsRagdollPose = {
  id: string; npcId: string; age: number; settled: boolean;
  previous: Record<PhysicsPartName, PhysicsPartPose>; parts: Record<PhysicsPartName, PhysicsPartPose>;
};
/** Controller x/z are the desired end-of-tick pose; previous is the start of that same tick. */
export type PhysicsPedestrian = WorldPoint & { id: string; heading: number; speed?: number; interior?: number | null; previous?: WorldPoint };
export type PhysicsTrafficVehicle = WorldPoint & { id: string; heading: number; speed: number; width?: number; length?: number; previous?: WorldPoint };
export type PhysicsProp = WorldPoint & { id: string; height: number; heading: number; kind: string; state: 'standing' | 'fallen' };
export type PhysicsPropPose = PhysicsPartPose & { id: string; previous: PhysicsPartPose; fallen: boolean; height: number };
export type PedestrianPhysicsIncident = { npcId: string; position: WorldPoint; speed: number; heading: number };
export type PhysicsVehicleImpact = { id: string; kind: string; position: WorldPoint; heading: number; speed: number; normalSpeed: number };
export type ImmersivePhysicsInput = {
  dt: number; vehicle: { previous: ImmersiveVehicleState; proposed: ImmersiveVehicleState; driving: boolean };
  walker?: { position: WorldPoint; displacement: WorldPoint };
  pedestrians?: readonly PhysicsPedestrian[]; traffic?: readonly PhysicsTrafficVehicle[]; props?: readonly PhysicsProp[];
};
export type ImmersivePhysicsResult = {
  vehicle: ImmersiveVehicleState; walker?: WorldPoint; incidents: PedestrianPhysicsIncident[]; impacts: PhysicsVehicleImpact[];
  vehiclePose: PhysicsPartPose; ragdolls: readonly PhysicsRagdollPose[]; standingPedestrians: PhysicsPedestrian[]; props: readonly PhysicsPropPose[];
};
type Metadata = { kind: 'floor' | 'car' | 'walker' | 'static' | 'traffic' | 'person' | 'ragdoll' | 'prop'; id: string; category?: string };
type StandingPerson = { body: CANNON.Body; input: PhysicsPedestrian; start: WorldPoint; requestedVelocity: CANNON.Vec3 };
type Ragdoll = { bodies: Record<PhysicsPartName, CANNON.Body>; joints: CANNON.ConeTwistConstraint[]; pose: PhysicsRagdollPose };
type PropBody = { input: PhysicsProp; body: CANNON.Body; pose: PhysicsPropPose };
const GROUP = { static: 1, car: 2, traffic: 4, person: 8, ragdoll: 16, walker: 32, prop: 64 };
const ALL = 127, ACTORS = ALL ^ GROUP.static;
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, finite(value)));
const poseOf = (body: CANNON.Body): PhysicsPartPose => ({ position: { x: body.position.x, y: body.position.y, z: body.position.z }, quaternion: { x: body.quaternion.x, y: body.quaternion.y, z: body.quaternion.z, w: body.quaternion.w } });
const clonePose = (pose: PhysicsPartPose): PhysicsPartPose => ({ position: { ...pose.position }, quaternion: { ...pose.quaternion } });
const yaw = (heading: number) => new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), finite(heading));
const distanceToSolid = (point: WorldPoint, solid: WorldCollision) => Math.hypot(Math.max(solid.minX - point.x, 0, point.x - solid.maxX), Math.max(solid.minZ - point.z, 0, point.z - solid.maxZ));
const vehicleImpactKind = (impact: PhysicsVehicleImpact): 'prop' | 'vehicle' | 'solid' => impact.kind === 'prop' ? 'prop' : impact.kind === 'vehicle' ? 'vehicle' : 'solid';
const controllerMotion = (input: WorldPoint & { heading: number; speed?: number; previous?: WorldPoint }, seconds: number) => {
  const velocity = { x: -Math.sin(input.heading) * finite(input.speed ?? 0), z: -Math.cos(input.heading) * finite(input.speed ?? 0) };
  const previous = input.previous && Number.isFinite(input.previous.x) && Number.isFinite(input.previous.z)
    ? input.previous : { x: input.x - velocity.x * seconds, z: input.z - velocity.z * seconds };
  return { previous, velocity: { x: (input.x - previous.x) / seconds, z: (input.z - previous.z) / seconds } };
};

export function createImmersivePhysics(options: {
  vehicle: ImmersiveVehicleState; nearbyCollisions: (point: WorldPoint, radius: number) => readonly WorldCollision[];
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  maxStaticBodies?: number; maxRagdolls?: number; struckNpcIds?: readonly string[];
}) {
  const solver = new CANNON.GSSolver(); solver.iterations = 16; solver.tolerance = 1e-7;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0), allowSleep: true, solver });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = .25; world.defaultContactMaterial.restitution = .015;
  world.defaultContactMaterial.contactEquationStiffness = 2e7; world.defaultContactMaterial.contactEquationRelaxation = 3;
  const groundMaterial = new CANNON.Material('SCOUT ground'), wallMaterial = new CANNON.Material('SCOUT static walls'), carMaterial = new CANNON.Material('SCOUT controlled tyres'), actorMaterial = new CANNON.Material('SCOUT people'), looseMaterial = new CANNON.Material('SCOUT articulated bodies');
  world.addContactMaterial(new CANNON.ContactMaterial(carMaterial, groundMaterial, { friction: 0, restitution: 0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(actorMaterial, groundMaterial, { friction: 0, restitution: 0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(actorMaterial, wallMaterial, { friction: 0, restitution: 0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(looseMaterial, groundMaterial, { friction: .58, restitution: .04 }));
  world.addContactMaterial(new CANNON.ContactMaterial(looseMaterial, carMaterial, { friction: .38, restitution: .035 }));
  const sweptImpact = new Map<number, { speed: number; until: number }>();
  const metadata = new Map<CANNON.Body, Metadata>(), velocityBefore = new Map<CANNON.Body, CANNON.Vec3>(), zeroVelocity = new CANNON.Vec3(), statics = new Map<string, { solid: WorldCollision; body: CANNON.Body }>(), traffic = new Map<string, CANNON.Body>(), people = new Map<string, StandingPerson>(), props = new Map<string, PropBody>(), fallenProps = new Map<string, PhysicsPropPose>(), ragdolls = new Map<string, Ragdoll>(), struck = new Set(options.struckNpcIds ?? []), impactCooldown = new Map<string, number>();
  const add = (body: CANNON.Body, data: Metadata) => { metadata.set(body, data); if (data.kind !== 'static' && data.kind !== 'floor') velocityBefore.set(body, new CANNON.Vec3()); world.addBody(body); return body; };
  const remove = (body: CANNON.Body) => { world.removeBody(body); metadata.delete(body); velocityBefore.delete(body); sweptImpact.delete(body.id); };
  const floor = add(new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMaterial, collisionFilterGroup: GROUP.static, collisionFilterMask: ACTORS }), { kind: 'floor', id: 'physics-ground' });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  if (options.bounds) {
    const b = options.bounds, width = b.maxX - b.minX, depth = b.maxZ - b.minZ;
    if (width > 0 && depth > 0) for (const [id, x, z, hx, hz] of [
      ['west', b.minX - .5, (b.minZ + b.maxZ) / 2, .5, depth / 2 + 1], ['east', b.maxX + .5, (b.minZ + b.maxZ) / 2, .5, depth / 2 + 1],
      ['north', (b.minX + b.maxX) / 2, b.minZ - .5, width / 2 + 1, .5], ['south', (b.minX + b.maxX) / 2, b.maxZ + .5, width / 2 + 1, .5],
    ] as const) add(new CANNON.Body({ mass: 0, material: wallMaterial, position: new CANNON.Vec3(x, 3, z), shape: new CANNON.Box(new CANNON.Vec3(hx, 3, hz)), collisionFilterGroup: GROUP.static, collisionFilterMask: ACTORS }), { kind: 'static', id: `world-${id}`, category: 'wall' });
  }
  const car = add(new CANNON.Body({ mass: 1220, material: carMaterial, linearDamping: 0, angularDamping: .65, angularFactor: new CANNON.Vec3(0, 1, 0), allowSleep: false, collisionFilterGroup: GROUP.car, collisionFilterMask: ALL ^ GROUP.car }), { kind: 'car', id: 'player-car' });
  // Model ground origin is y=0. Tyres support the body; bonnet and inclined glass receive real limb contacts.
  car.addShape(new CANNON.Box(new CANNON.Vec3(.865, .28, 1.915)), new CANNON.Vec3(0, .04, .01));
  car.addShape(new CANNON.Box(new CANNON.Vec3(.82, .075, .58)), new CANNON.Vec3(0, .35, -1.25), new CANNON.Quaternion().setFromEuler(-.035, 0, 0));
  car.addShape(new CANNON.Box(new CANNON.Vec3(.72, .285, .025)), new CANNON.Vec3(0, .826, -.70), new CANNON.Quaternion().setFromEuler(.43, 0, 0));
  car.addShape(new CANNON.Box(new CANNON.Vec3(.77, .04, .82)), new CANNON.Vec3(0, 1.135, .30));
  car.addShape(new CANNON.Box(new CANNON.Vec3(.75, .31, .75)), new CANNON.Vec3(0, .61, .45));
  car.addShape(new CANNON.Box(new CANNON.Vec3(.845, .08, .11)), new CANNON.Vec3(0, -.11, -1.94));
  car.addShape(new CANNON.Box(new CANNON.Vec3(.845, .075, .085)), new CANNON.Vec3(0, -.10, 1.97));
  for (const x of [-.70, .70]) for (const z of [-1.23, 1.23]) car.addShape(new CANNON.Sphere(.30), new CANNON.Vec3(x, -.34, z));
  const walker = add(new CANNON.Body({ mass: 78, material: actorMaterial, fixedRotation: true, linearDamping: 0, allowSleep: false, collisionFilterGroup: GROUP.walker, collisionFilterMask: ALL ^ GROUP.walker }), { kind: 'walker', id: 'player-walker' });
  walker.addShape(new CANNON.Sphere(.29), new CANNON.Vec3(0, -.55, 0)); walker.addShape(new CANNON.Sphere(.29), new CANNON.Vec3(0, .50, 0)); walker.addShape(new CANNON.Cylinder(.29, .29, 1.05, 8));
  let disposed = false, elapsed = 0, focusAge = 1, lastFocus: WorldPoint = { x: -1e9, z: -1e9 }, lastVehicle = options.vehicle, walkerActive = false, bonnetContacts = 0, windshieldContacts = 0, roofContacts = 0, lastSubdivisions = 0;
  const sweepResult = new CANNON.RaycastResult(), sweepFrom = new CANNON.Vec3(), sweepTo = new CANNON.Vec3();
  const maxStatic = Math.floor(clamp(options.maxStaticBodies ?? 384, 32, 800)), maxRagdolls = Math.floor(clamp(options.maxRagdolls ?? 12, 1, 20));
  const resetVehicle = (state: ImmersiveVehicleState) => {
    if (disposed) return; lastVehicle = state; car.position.set(finite(state.x), .64, finite(state.z)); car.quaternion.copy(yaw(state.heading)); car.velocity.set(0, 0, 0); car.angularVelocity.set(0, 0, 0); car.force.set(0, 0, 0); car.torque.set(0, 0, 0); car.previousPosition.copy(car.position); car.previousQuaternion.copy(car.quaternion); car.aabbNeedsUpdate = true; car.wakeUp(); lastFocus = { x: -1e9, z: -1e9 }; focusAge = 1;
  };
  resetVehicle(options.vehicle);
  const syncStatics = (focus: WorldPoint, dt: number) => {
    focusAge += dt; if (focusAge < .12 && Math.hypot(focus.x - lastFocus.x, focus.z - lastFocus.z) < 10) return;
    focusAge = 0; lastFocus = { ...focus };
    const solids = options.nearbyCollisions(focus, 72).filter(solid => [solid.minX, solid.maxX, solid.minY, solid.maxY, solid.minZ, solid.maxZ].every(Number.isFinite) && solid.maxX > solid.minX && solid.maxY > solid.minY && solid.maxZ > solid.minZ).sort((a, b) => distanceToSolid(focus, a) - distanceToSolid(focus, b)).slice(0, maxStatic), live = new Set(solids.map(solid => solid.id));
    for (const [id, item] of statics) if (!live.has(id)) { remove(item.body); statics.delete(id); }
    for (const solid of solids) {
      if (statics.has(solid.id)) continue;
      const body = add(new CANNON.Body({ mass: 0, material: wallMaterial, position: new CANNON.Vec3((solid.minX + solid.maxX) / 2, (solid.minY + solid.maxY) / 2, (solid.minZ + solid.maxZ) / 2), shape: new CANNON.Box(new CANNON.Vec3((solid.maxX - solid.minX) / 2, (solid.maxY - solid.minY) / 2, (solid.maxZ - solid.minZ) / 2)), collisionFilterGroup: GROUP.static, collisionFilterMask: ACTORS }), { kind: 'static', id: solid.id, category: solid.kind });
      statics.set(solid.id, { solid, body });
    }
  };
  const syncTraffic = (inputs: readonly PhysicsTrafficVehicle[], focus: WorldPoint, seconds: number) => {
    const local = inputs.filter(input => Math.hypot(input.x - focus.x, input.z - focus.z) <= 90).slice(0, 32), live = new Set(local.map(input => input.id));
    for (const [id, body] of traffic) if (!live.has(id)) { remove(body); traffic.delete(id); }
    for (const input of local) {
      let body = traffic.get(input.id); if (!body) { body = add(new CANNON.Body({ type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(clamp(input.width ?? 1.82, 1.5, 2.5) / 2, .56, clamp(input.length ?? 4.35, 3, 6) / 2)), collisionFilterGroup: GROUP.traffic, collisionFilterMask: ALL ^ GROUP.traffic }), { kind: 'traffic', id: input.id, category: 'vehicle' }); traffic.set(input.id, body); }
      const motion = controllerMotion(input, seconds);
      body.position.set(motion.previous.x, .87, motion.previous.z); body.quaternion.copy(yaw(input.heading)); body.velocity.set(motion.velocity.x, 0, motion.velocity.z); body.aabbNeedsUpdate = true;
    }
  };
  const syncPeople = (inputs: readonly PhysicsPedestrian[], focus: WorldPoint, seconds: number) => {
    const local = inputs.filter(input => !struck.has(input.id) && Math.hypot(input.x - focus.x, input.z - focus.z) <= 100).slice(0, 36), live = new Set(local.map(input => input.id));
    for (const [id, person] of people) if (!live.has(id)) { remove(person.body); people.delete(id); }
    for (const input of local) {
      let person = people.get(input.id); if (!person) {
        const body = add(new CANNON.Body({ mass: 72, material: actorMaterial, fixedRotation: true, linearFactor: new CANNON.Vec3(1, 0, 1), linearDamping: 0, collisionFilterGroup: GROUP.person, collisionFilterMask: ALL ^ GROUP.person }), { kind: 'person', id: input.id });
        body.addShape(new CANNON.Sphere(.28), new CANNON.Vec3(0, -.56, 0)); body.addShape(new CANNON.Sphere(.28), new CANNON.Vec3(0, .56, 0)); body.addShape(new CANNON.Cylinder(.28, .28, 1.12, 8)); person = { body, input, start: { x: input.x, z: input.z }, requestedVelocity: new CANNON.Vec3() }; people.set(input.id, person);
      }
      const motion = controllerMotion(input, seconds);
      person.input = input; person.start = { ...motion.previous }; person.requestedVelocity.set(motion.velocity.x, 0, motion.velocity.z);
      person.body.position.set(motion.previous.x, .85, motion.previous.z); person.body.quaternion.copy(yaw(input.heading)); person.body.velocity.copy(person.requestedVelocity); person.body.aabbNeedsUpdate = true; person.body.wakeUp();
    }
  };
  const syncProps = (inputs: readonly PhysicsProp[], focus: WorldPoint) => {
    const local = inputs.filter(input => Math.hypot(input.x - focus.x, input.z - focus.z) < 100).slice(0, 64), live = new Set(local.map(input => input.id));
    for (const [id, item] of props) if (!live.has(id) && (!item.pose.fallen || Math.hypot(item.body.position.x - focus.x, item.body.position.z - focus.z) > 160)) { if (item.pose.fallen) fallenProps.set(id, { ...item.pose, ...poseOf(item.body), previous: poseOf(item.body) }); remove(item.body); props.delete(id); }
    for (const input of local) {
      if (props.has(input.id)) continue; const height = clamp(input.height, .7, 8), radius = input.kind === 'bollard' ? .16 : .17, saved = fallenProps.get(input.id);
      const body = add(new CANNON.Body({ mass: 0, position: saved ? new CANNON.Vec3(saved.position.x, saved.position.y, saved.position.z) : new CANNON.Vec3(input.x, height / 2, input.z), shape: new CANNON.Cylinder(radius, radius, height, 8), material: looseMaterial, collisionFilterGroup: GROUP.prop, collisionFilterMask: ALL ^ GROUP.prop }), { kind: 'prop', id: input.id, category: 'prop' });
      body.quaternion.copy(saved ? new CANNON.Quaternion(saved.quaternion.x, saved.quaternion.y, saved.quaternion.z, saved.quaternion.w) : yaw(input.heading));
      if (!saved && input.state === 'fallen') { body.position.y = radius; body.quaternion.setFromEuler(Math.PI / 2, input.heading, 0); }
      const pose = poseOf(body); props.set(input.id, { input, body, pose: { id: input.id, ...pose, previous: clonePose(pose), fallen: !!saved || input.state === 'fallen', height } });
    }
  };
  const removeRagdoll = (id: string) => { const item = ragdolls.get(id); if (!item) return; for (const joint of item.joints) world.removeConstraint(joint); for (const name of PHYSICS_PART_NAMES) remove(item.bodies[name]); ragdolls.delete(id); };
  const retireRagdoll = (npcId: string) => { removeRagdoll(npcId); const person = people.get(npcId); if (person) { remove(person.body); people.delete(npcId); } struck.add(npcId); };
  const makeRagdoll = (person: StandingPerson, impact: PedestrianPhysicsIncident) => {
    if (ragdolls.size >= maxRagdolls) { const oldest = [...ragdolls.values()].sort((a, b) => b.pose.age - a.pose.age)[0]; if (oldest) removeRagdoll(oldest.pose.id); }
    const heading = person.input.heading, rotation = yaw(heading), origin = new CANNON.Vec3(person.body.position.x, 0, person.body.position.z), definitions: [PhysicsPartName, number, number, number, number, CANNON.Shape][] = [
      ['pelvis', 0, .82, 0, 13, new CANNON.Box(new CANNON.Vec3(.185, .11, .125))], ['torso', 0, 1.14, 0, 23, new CANNON.Box(new CANNON.Vec3(.215, .28, .135))], ['head', 0, 1.57, 0, 5, new CANNON.Sphere(.16)],
      ['upperArmL', -.27, 1.22, 0, 2.3, new CANNON.Cylinder(.072, .072, .29, 8)], ['lowerArmL', -.28, .975, 0, 1.8, new CANNON.Cylinder(.055, .055, .23, 8)],
      ['upperArmR', .27, 1.22, 0, 2.3, new CANNON.Cylinder(.072, .072, .29, 8)], ['lowerArmR', .28, .975, 0, 1.8, new CANNON.Cylinder(.055, .055, .23, 8)],
      ['upperLegL', -.11, .60, 0, 8, new CANNON.Cylinder(.085, .085, .35, 8)], ['lowerLegL', -.11, .275, 0, 5.4, new CANNON.Cylinder(.068, .068, .34, 8)],
      ['upperLegR', .11, .60, 0, 8, new CANNON.Cylinder(.085, .085, .35, 8)], ['lowerLegR', .11, .275, 0, 5.4, new CANNON.Cylinder(.068, .068, .34, 8)],
    ];
    const bodies = {} as Record<PhysicsPartName, CANNON.Body>;
    for (const [name, x, y, z, mass, shape] of definitions) {
      const center = rotation.vmult(new CANNON.Vec3(x, y, z)); center.vadd(origin, center);
      const body = add(new CANNON.Body({ mass, shape, position: center, quaternion: rotation.clone(), material: looseMaterial, linearDamping: .07, angularDamping: .24, allowSleep: true, sleepSpeedLimit: .25, sleepTimeLimit: 1.8, collisionFilterGroup: GROUP.ragdoll, collisionFilterMask: ALL ^ GROUP.person }), { kind: 'ragdoll', id: impact.npcId });
      if (name === 'lowerLegL' || name === 'lowerLegR') body.addShape(new CANNON.Box(new CANNON.Vec3(.075, .0475, .135)), new CANNON.Vec3(0, -.197, -.065));
      // A bumper hits the lower body. Upper limbs retain their inertia rather than receiving an artificial whole-body launch.
      body.velocity.copy(person.requestedVelocity); bodies[name] = body;
    }
    const joints: CANNON.ConeTwistConstraint[] = [];
    const joint = (a: PhysicsPartName, b: PhysicsPartName, x: number, y: number, z: number, angle: number, twist: number) => {
      const anchor = rotation.vmult(new CANNON.Vec3(x, y, z)); anchor.vadd(origin, anchor);
      const constraint = new CANNON.ConeTwistConstraint(bodies[a], bodies[b], { pivotA: bodies[a].pointToLocalFrame(anchor), pivotB: bodies[b].pointToLocalFrame(anchor), axisA: new CANNON.Vec3(0, 1, 0), axisB: new CANNON.Vec3(0, 1, 0), angle, twistAngle: twist, maxForce: 2e5, collideConnected: false });
      world.addConstraint(constraint); joints.push(constraint);
    };
    joint('pelvis', 'torso', 0, .90, 0, .55, .38); joint('torso', 'head', 0, 1.43, 0, .65, .5);
    for (const [suffix, side] of [['L', -1], ['R', 1]] as const) {
      joint('torso', `upperArm${suffix}`, side * .27, 1.35, 0, 1.6, .65); joint(`upperArm${suffix}`, `lowerArm${suffix}`, side * .28, 1.08, 0, 1.95, .10);
      joint('pelvis', `upperLeg${suffix}`, side * .11, .76, 0, 1.45, .35); joint(`upperLeg${suffix}`, `lowerLeg${suffix}`, side * .11, .43, 0, 2.0, .08);
    }
    const momentum = person.body.velocity.vsub(person.requestedVelocity).scale(72 * .72);
    bodies.pelvis.applyImpulse(momentum.scale(.18), new CANNON.Vec3(0, -.06, .08));
    for (const suffix of ['L', 'R'] as const) { bodies[`upperLeg${suffix}`].applyImpulse(momentum.scale(.20), new CANNON.Vec3(0, -.10, .06)); bodies[`lowerLeg${suffix}`].applyImpulse(momentum.scale(.21), new CANNON.Vec3(0, .08, .04)); }
    remove(person.body); people.delete(impact.npcId);
    const parts = Object.fromEntries(PHYSICS_PART_NAMES.map(name => [name, poseOf(bodies[name])])) as Record<PhysicsPartName, PhysicsPartPose>;
    ragdolls.set(impact.npcId, { bodies, joints, pose: { id: impact.npcId, npcId: impact.npcId, age: 0, settled: false, parts, previous: Object.fromEntries(PHYSICS_PART_NAMES.map(name => [name, clonePose(parts[name])])) as Record<PhysicsPartName, PhysicsPartPose> } });
  };
  const result = (vehicle: ImmersiveVehicleState, incidents: PedestrianPhysicsIncident[], impacts: PhysicsVehicleImpact[], point?: WorldPoint, seconds = IMMERSIVE_PHYSICS_STEP): ImmersivePhysicsResult => { const vehiclePose = poseOf(car); vehiclePose.position.y -= .64; return { vehicle, ...(point ? { walker: point } : {}), incidents, impacts, vehiclePose, ragdolls: [...ragdolls.values()].map(item => item.pose), standingPedestrians: [...people.values()].map(item => ({ ...item.input, x: item.body.position.x, z: item.body.position.z, speed: Math.hypot(item.body.position.x - item.start.x, item.body.position.z - item.start.z) / seconds })), props: [...props.values()].map(item => item.pose) }; };
  const step = (input: ImmersivePhysicsInput): ImmersivePhysicsResult => {
    const dt = finite(input.dt); if (disposed || dt <= 0 || dt > .1) return result(lastVehicle, [], [], input.walker?.position);
    const seconds = Math.min(IMMERSIVE_PHYSICS_STEP, dt), previous = input.vehicle.previous, proposed = input.vehicle.proposed, driving = input.vehicle.driving, focus = driving || !input.walker ? previous : input.walker.position;
    if (Math.hypot(previous.x - car.position.x, previous.z - car.position.z) > 3) resetVehicle(previous);
    syncStatics(focus, seconds); syncTraffic(input.traffic ?? [], focus, seconds); syncPeople(input.pedestrians ?? [], focus, seconds); syncProps(input.props ?? [], focus);
    elapsed += seconds; const incidents: PedestrianPhysicsIncident[] = [], impacts: PhysicsVehicleImpact[] = [];
    for (const [bodyId, impact] of sweptImpact) if (impact.until < elapsed) sweptImpact.delete(bodyId);
    for (const item of ragdolls.values()) for (const name of PHYSICS_PART_NAMES) item.pose.previous[name] = poseOf(item.bodies[name]);
    for (const item of props.values()) item.pose.previous = poseOf(item.body);
    if (driving) {
      car.quaternion.copy(yaw(proposed.heading)); car.angularVelocity.set(0, 0, 0);
      const dx = proposed.x - previous.x, dz = proposed.z - previous.z, span = Math.hypot(dx, dz), desiredSpeed = Math.abs(proposed.speed);
      car.velocity.x = span > 1e-9 ? dx / span * desiredSpeed : -Math.sin(proposed.heading) * proposed.speed;
      car.velocity.z = span > 1e-9 ? dz / span * desiredSpeed : -Math.cos(proposed.heading) * proposed.speed;
    } else { car.velocity.x = 0; car.velocity.z = 0; car.quaternion.copy(yaw(previous.heading)); car.angularVelocity.set(0, 0, 0); }
    car.aabbNeedsUpdate = true;
    if (input.walker && !driving) {
      if (!walkerActive || Math.hypot(input.walker.position.x - walker.position.x, input.walker.position.z - walker.position.z) > 3) { walker.position.y = .84; walker.velocity.y = 0; }
      walkerActive = true; walker.collisionFilterMask = ALL ^ GROUP.walker; walker.position.x = input.walker.position.x; walker.position.z = input.walker.position.z; walker.velocity.set(input.walker.displacement.x / seconds, walker.velocity.y, input.walker.displacement.z / seconds); walker.aabbNeedsUpdate = true; walker.wakeUp();
    } else { walkerActive = false; walker.collisionFilterMask = 0; walker.position.set(car.position.x, .84, car.position.z); walker.velocity.set(0, 0, 0); }
    // Native Cannon narrowphase at <=0.14m travel per subdivision prevents thin posts/person tunneling at game speeds.
    const maxSpeed = Math.max(Math.hypot(car.velocity.x, car.velocity.z), ...[...ragdolls.values()].flatMap(item => PHYSICS_PART_NAMES.map(name => item.bodies[name].velocity.length()))), subdivisions = Math.max(1, Math.min(8, Math.ceil(maxSpeed * seconds / .14))), sub = seconds / subdivisions;
    lastSubdivisions = subdivisions;
    const struckNow = new Map<string, { person: StandingPerson; incident: PedestrianPhysicsIncident }>();
    let maxNormalSpeed = 0, carContact = false;
    for (let index = 0; index < subdivisions; index++) {
      const approachSpeed = Math.hypot(car.velocity.x, car.velocity.z), carVelocity = car.velocity.clone();
      for (const [body, velocity] of velocityBefore) velocity.copy(body.velocity);
      // Cannon's native rays supply continuous contact preparation for the thin front/rear bumpers.
      // This only limits travel into a returned engine shape; incidents/impacts still require narrowphase contacts below.
      if (approachSpeed > 4) {
        const forward = new CANNON.Vec3(-Math.sin(proposed.heading), 0, -Math.cos(proposed.heading)), travelSign = carVelocity.dot(forward) >= 0 ? 1 : -1;
        let fraction = 1;
        for (const x of [-.83, 0, .83]) {
          car.pointToWorldFrame(new CANNON.Vec3(x, -.11, travelSign > 0 ? -2.05 : 2.055), sweepFrom); sweepTo.copy(sweepFrom); sweepTo.x += carVelocity.x * sub; sweepTo.z += carVelocity.z * sub; sweepResult.reset();
          if (world.raycastClosest(sweepFrom, sweepTo, { collisionFilterMask: GROUP.static | GROUP.traffic | GROUP.prop, collisionFilterGroup: GROUP.car, skipBackfaces: false }, sweepResult) && sweepResult.body && metadata.get(sweepResult.body)?.kind !== 'floor') {
            fraction = Math.min(fraction, clamp((sweepResult.distance + .004) / Math.max(1e-9, approachSpeed * sub), 0, 1)); sweptImpact.set(sweepResult.body.id, { speed: Math.abs(carVelocity.dot(sweepResult.hitNormalWorld)), until: elapsed + .05 });
          }
        }
        if (fraction < 1) { car.velocity.x *= fraction; car.velocity.z *= fraction; }
      }
      world.step(sub);
      for (const contact of world.contacts) {
        const other = contact.bi === car ? contact.bj : contact.bj === car ? contact.bi : undefined; if (!other) continue;
        const data = metadata.get(other); if (!data || data.kind === 'floor' || data.kind === 'walker') continue;
        const otherVelocity = velocityBefore.get(other) ?? zeroVelocity, prepared = sweptImpact.get(other.id), normalSpeed = Math.max(Math.abs(carVelocity.vsub(otherVelocity).dot(contact.ni)), prepared && prepared.until >= elapsed ? prepared.speed : 0), speed = Math.abs(driving ? proposed.speed : previous.speed);
        if (data.kind === 'ragdoll') { const shape = contact.bi === car ? contact.si : contact.sj; if (shape === car.shapes[1]) bonnetContacts++; if (shape === car.shapes[2]) windshieldContacts++; if (shape === car.shapes[3]) roofContacts++; }
        if (data.kind === 'person' && driving && approachSpeed >= MIN_PEDESTRIAN_IMPACT_SPEED && !struck.has(data.id)) {
          const person = people.get(data.id); if (!person) continue;
          const relative = carVelocity.vsub(otherVelocity), contactSpeed = Math.max(normalSpeed, relative.length());
          if (contactSpeed >= MIN_PEDESTRIAN_IMPACT_SPEED) { struck.add(data.id); const incident = { npcId: data.id, position: { x: person.body.position.x, z: person.body.position.z }, speed: clamp(Math.max(contactSpeed, approachSpeed), 0, 65), heading: proposed.heading }; struckNow.set(data.id, { person, incident }); }
        } else if (data.kind !== 'ragdoll' && data.kind !== 'person') {
          carContact = true; maxNormalSpeed = Math.max(maxNormalSpeed, normalSpeed);
          if (normalSpeed > .7 && elapsed - (impactCooldown.get(data.id) ?? -99) > 1.2) { impactCooldown.set(data.id, elapsed); impacts.push({ id: data.id, kind: data.category ?? data.kind, position: { x: car.position.x, z: car.position.z }, heading: proposed.heading, speed, normalSpeed }); }
          if (data.kind === 'prop') {
            const item = props.get(data.id), threshold = item?.input.kind === 'bollard' ? 1.8 : 3.4;
            if (item && !item.pose.fallen && normalSpeed >= threshold) { item.pose.fallen = true; item.body.type = CANNON.Body.DYNAMIC; item.body.mass = item.input.kind === 'bollard' ? 14 : 32; item.body.updateMassProperties(); item.body.wakeUp(); item.body.applyImpulse(carVelocity.scale(item.body.mass * .72), new CANNON.Vec3(0, -item.pose.height / 2 + .7, 0)); }
          }
        }
      }
      for (const [id, queued] of struckNow) { incidents.push(queued.incident); makeRagdoll(queued.person, queued.incident); struckNow.delete(id); }
    }
    for (const [id, item] of ragdolls) {
      item.pose.age += seconds; item.pose.settled = PHYSICS_PART_NAMES.every(name => item.bodies[name].sleepState === CANNON.Body.SLEEPING);
      for (const name of PHYSICS_PART_NAMES) item.pose.parts[name] = poseOf(item.bodies[name]);
      if (item.pose.age > 90 && Math.hypot(item.bodies.pelvis.position.x - focus.x, item.bodies.pelvis.position.z - focus.z) > 180) removeRagdoll(id);
    }
    for (const item of props.values()) Object.assign(item.pose, poseOf(item.body));
    const traveled = Math.hypot(car.position.x - previous.x, car.position.z - previous.z), forward = new CANNON.Vec3(-Math.sin(proposed.heading), 0, -Math.cos(proposed.heading));
    let vehicle = { ...proposed, x: car.position.x, z: car.position.z, y: 0 as const, speed: driving ? car.velocity.dot(forward) : 0, distance: previous.distance + (driving ? traveled : 0), fuel: immersiveFuelAfterDistance(previous.fuel, driving ? traveled : 0), collision: carContact, impactSpeed: maxNormalSpeed };
    // A cached sweep speed can describe several settling contacts from one hit.
    // Charge only a newly emitted impact, choosing the greatest material-weighted
    // loss so neighboring wall sections cannot multiply the same crash.
    const damageImpact = impacts.reduce<PhysicsVehicleImpact | undefined>((worst, impact) => !worst || immersiveImpactDamage(impact.normalSpeed, vehicleImpactKind(impact)) > immersiveImpactDamage(worst.normalSpeed, vehicleImpactKind(worst)) ? impact : worst, undefined);
    if (damageImpact) vehicle = applyImmersiveVehicleImpact(vehicle, damageImpact.normalSpeed, vehicleImpactKind(damageImpact));
    if (!Number.isFinite(vehicle.x + vehicle.z + vehicle.speed)) { resetVehicle(previous); vehicle = { ...previous, speed: 0 }; }
    lastVehicle = vehicle; return result(vehicle, incidents, impacts, input.walker && !driving ? { x: walker.position.x, z: walker.position.z } : undefined, seconds);
  };
  const clearActors = () => { for (const item of people.values()) remove(item.body); people.clear(); for (const body of traffic.values()) remove(body); traffic.clear(); for (const id of [...ragdolls.keys()]) removeRagdoll(id); for (const [id, item] of props) { if (item.pose.fallen) fallenProps.set(id, { ...item.pose, ...poseOf(item.body), previous: poseOf(item.body) }); remove(item.body); } props.clear(); impactCooldown.clear(); };
  const dispose = () => { if (disposed) return; clearActors(); for (const body of [...world.bodies]) remove(body); world.constraints.splice(0); statics.clear(); metadata.clear(); fallenProps.clear(); sweptImpact.clear(); disposed = true; };
  return { step, resetVehicle, retireRagdoll, clearActors, dispose,
    get ragdolls(): readonly PhysicsRagdollPose[] { return [...ragdolls.values()].map(item => item.pose); },
    get stats() { return { engine: 'cannon-es' as const, bodies: world.bodies.length, constraints: world.constraints.length, staticBodies: statics.size, people: people.size, traffic: traffic.size, props: props.size, savedFallenProps: fallenProps.size, ragdolls: ragdolls.size, struckNpcIds: [...struck], sweptImpactEntries: sweptImpact.size, stepCount: world.stepnumber, elapsed, bonnetContacts, windshieldContacts, roofContacts, walkerHeight: walker.position.y, walkerVerticalSpeed: walker.velocity.y, lastSubdivisions, disposed }; },
  };
}
