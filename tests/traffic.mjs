import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
const moduleURL = async (path, dependencies = {}) => { const source = await readFile(new URL(path, import.meta.url), 'utf8'); let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText; for (const [specifier, replacement] of Object.entries(dependencies)) compiled = compiled.replaceAll(`'${specifier}'`, `'${replacement}'`).replaceAll(`"${specifier}"`, `"${replacement}"`); return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`; };
const load = async path => import(await moduleURL(path));
const { createTrafficSimulation, buildTrafficNetwork, sampleTrafficRoute, trafficSignalPhase, TRAFFIC_CAR } = await load('../src/lib/traffic-data.ts');
const { WORLD_ROADS, regionalPointOnRoad } = await load('../src/lib/regional-roads.ts');
const roads = [{ id: 'east-west', x: 0, z: 0, width: 400, depth: 12, kind: 'street', regionId: 'test', speedLimit: 13.4 }, { id: 'north-south', x: 0, z: 0, width: 12, depth: 400, kind: 'street', regionId: 'test', speedLimit: 13.4 }];
const sim = createTrafficSimulation({ roads, maxCars: 4 });
assert.equal(sim.network.signals.length, 1, 'A genuine street junction receives a protected traffic signal');
assert.equal(sim.network.routes.length, 1, 'Connected two-way streets form a continuous lane route');
sim.network.signals[0].offset = 0;
for (let second = 0; second < 58; second += .1) assert.ok(!(trafficSignalPhase(second, 'east-west') === 'green' && trafficSignalPhase(second, 'north-south') === 'green'), 'Perpendicular traffic never receives a simultaneous green');
assert.equal(trafficSignalPhase(25, 'north-south'), 'yellow'); assert.equal(trafficSignalPhase(28, 'north-south'), 'red'); assert.equal(trafficSignalPhase(28, 'east-west'), 'red'); assert.equal(trafficSignalPhase(55, 'east-west'), 'yellow');
assert.equal(buildTrafficNetwork(roads.map(road => ({ ...road, kind: 'highway' }))).signals.length, 0, 'Interstate highways receive no traffic lights');
assert.equal(buildTrafficNetwork([{ ...roads[0], kind: 'access' }]).routes.length, 0, 'Parking and pedestrian forecourts remain free of generated traffic');
for (const route of sim.network.routes) for (let progress = 0; progress < route.length; progress += .25) { const point = sampleTrafficRoute(route, progress); assert.ok(roads.some(road => Math.abs(point.x - road.x) <= road.width / 2 + .01 && Math.abs(point.z - road.z) <= road.depth / 2 + .01), 'Turns and endpoint turnarounds remain on actual asphalt'); }
const longest = sim.network.routes[0].points.slice(0, -1).map((point, index) => ({ point, next: sim.network.routes[0].points[index + 1] })).sort((a, b) => (b.next.distance - b.point.distance) - (a.next.distance - a.point.distance))[0];
assert.ok(sampleTrafficRoute(sim.network.routes[0], (longest.point.distance + longest.next.distance) / 2).speedLimit > 12, 'A low corner speed must not cap the entire following straight');
const place = (car, progress, speed = 0) => Object.assign(car, { progress, speed, ...sampleTrafficRoute(sim.network.routes[car.route], progress) });
sim.cars.splice(1);
const car = sim.cars[0], route = sim.network.routes[car.route], stop = route.stops.find(stop => stop.axis === 'east-west'); assert.ok(stop); place(car, stop.distance - 40, 12);
for (let frame = 0; frame < 60 * 7; frame++) sim.update(1 / 60, frame / 60);
assert.ok(car.progress <= stop.distance + .02, 'A car bumper never crosses its red stop line'); assert.ok(car.speed < .06 && car.brake > .5, `Traffic comes to a controlled stop (${car.speed}, brake ${car.brake})`);
const stopped = car.progress; for (let frame = 0; frame < 60 * 4; frame++) sim.update(1 / 60, 29 + frame / 60); assert.ok(car.progress > stopped + 5, 'A green light smoothly releases a waiting car');
const queue = createTrafficSimulation({ roads, maxCars: 2 }); queue.network.signals[0].offset = 0;
const queueRoute = queue.network.routes[0], queueStop = queueRoute.stops.find(stop => stop.axis === 'east-west'), lead = queue.cars[0], follow = queue.cars[1];
Object.assign(lead, { progress: queueStop.distance - .2, ...sampleTrafficRoute(queueRoute, queueStop.distance - .2), speed: 0, stoppedFor: 30 });
Object.assign(follow, { progress: queueStop.distance - 32, ...sampleTrafficRoute(queueRoute, queueStop.distance - 32), speed: 12 });
for (let frame = 0; frame < 60 * 9; frame++) { queue.update(1 / 60, frame / 60); assert.ok(Math.hypot(follow.x - lead.x, follow.z - lead.z) >= TRAFFIC_CAR.length + TRAFFIC_CAR.standstillGap - .03, 'A queue never overlaps or drives through the lead car'); }
assert.ok(follow.speed < .05, 'Followers stop behind a stationary car');
const player = { ...sampleTrafficRoute(queueRoute, queueStop.distance - 20), speed: 0, driving: true };
Object.assign(follow, { progress: queueStop.distance - 55, ...sampleTrafficRoute(queueRoute, queueStop.distance - 55), speed: 11 });
for (let frame = 0; frame < 60 * 6; frame++) { queue.update(1 / 60, frame / 60, player); assert.ok(Math.hypot(follow.x - player.x, follow.z - player.z) >= TRAFFIC_CAR.length + TRAFFIC_CAR.standstillGap - .03, 'Moving traffic yields to the player vehicle'); }
const pedestrian = { ...player, driving: false };
Object.assign(follow, { progress: queueStop.distance - 55, ...sampleTrafficRoute(queueRoute, queueStop.distance - 55), speed: 11 });
for (let frame = 0; frame < 60 * 6; frame++) { queue.update(1 / 60, frame / 60, pedestrian); assert.ok(Math.hypot(follow.x - pedestrian.x, follow.z - pedestrian.z) >= TRAFFIC_CAR.length / 2 + 1.23, 'NPC drivers also stop short of a walking scout'); }
const pole = sim.props.find(prop => prop.kind === 'signal'), impact = { collider: { id: pole.id }, position: { x: pole.x - 1, z: pole.z }, heading: -Math.PI / 2, speed: 25, normalSpeed: 1 };
assert.equal(sim.hit(impact).knockedDown, false, 'A fast glancing impact uses normal speed'); assert.ok(sim.nearbyCollisions(pole, 4).some(collider => collider.id === pole.id));
for (let tick = 0; tick < 5; tick++) sim.update(.25, 34 + tick * .25);
const hit = sim.hit({ ...impact, normalSpeed: 10 }); assert.ok(hit.knockedDown && hit.firstImpact, 'A normal impact breaks the pole away'); assert.equal(pole.state, 'fallen');
assert.ok(!sim.nearbyCollisions(pole, 4).some(collider => collider.id === pole.id), 'The pole collider disappears immediately without a ghost barrier'); assert.equal(sim.hit({ ...impact, normalSpeed: 10 }).firstImpact, false, 'A fallen pole cannot generate another damage event');
sim.update(.25, 35.25); assert.ok(pole.fallAge > 0);
const npc = sim.cars[0], npcHit = sim.hit({ collider: { id: npc.id }, position: npc, speed: 14, normalSpeed: 14 }); assert.ok(npcHit.firstImpact && !npcHit.knockedDown); assert.ok(npc.damage > .1 && npc.stoppedFor > 0, 'A hit NPC remains solid, damaged and stopped');
assert.equal(sim.hit({ collider: { id: npc.id }, position: npc, speed: 14 }).firstImpact, false); assert.equal(sim.hit({ collider: { id: 'world-wall' }, position: npc, speed: 14 }).handled, false);
const region = createTrafficSimulation({ roads: WORLD_ROADS, maxCars: 999 }); assert.ok(region.cars.length <= 96 && region.cars.length > 55, 'Population is bounded across the wider world'); assert.ok(region.network.routes.some(route => route.kind === 'regional' && route.length > 10000));
for (const route of region.network.routes) for (let progress = 0; progress < route.length; progress += 9) assert.ok(regionalPointOnRoad(sampleTrafficRoute(route, progress), .15), `Cars follow actual regional roads on ${route.id}`);
for (let frame = 0; frame < 60 * 12; frame++) region.update(1 / 60, frame / 60); assert.ok(region.cars.some(car => car.speed > 10)); assert.ok(region.nearbyCollisions({ x: 220, z: 510 }, 40).length < 12);
const before = { ...region.cars[0] }; region.update(600, 612); assert.ok(Math.hypot(region.cars[0].x - before.x, region.cars[0].z - before.z) < 8, 'Returning to a hidden tab cannot teleport traffic across the map');

// Instantiate actual Three.js integration rather than mocked geometry or duplicated traffic rules.
const assetURL = await moduleURL('../src/lib/immersive-assets.ts', { three: import.meta.resolve('three'), 'three/addons/geometries/RoundedBoxGeometry.js': import.meta.resolve('three/addons/geometries/RoundedBoxGeometry.js'), 'three/addons/utils/BufferGeometryUtils.js': import.meta.resolve('three/addons/utils/BufferGeometryUtils.js') });
const renderURL = await moduleURL('../src/lib/immersive-traffic.ts', { three: import.meta.resolve('three'), './immersive-assets.ts': assetURL, './regional-roads.ts': await moduleURL('../src/lib/regional-roads.ts'), './traffic-data.ts': await moduleURL('../src/lib/traffic-data.ts') });
const { createTrafficWorld } = await import(renderURL), native = createTrafficWorld({ roads, maxCars: 5 }), scene = new THREE.Scene(); scene.add(native.group);
const instanceMeshes = native.group.children.filter(object => object.isInstancedMesh); assert.ok(instanceMeshes.length <= 30, 'Many cars share a small fixed number of instance draw groups');
const bodyMatrix = new THREE.Matrix4(); instanceMeshes[0].getMatrixAt(0, bodyMatrix); assert.equal(bodyMatrix.determinant(), 0, 'Unpositioned instances start hidden rather than stacking at origin');
native.update(1 / 60, 1 / 60, { x: 0, z: 0, driving: false }); instanceMeshes[0].getMatrixAt(0, bodyMatrix);
const drawnPosition = new THREE.Vector3().setFromMatrixPosition(bodyMatrix), actualCar = native.simulation.cars[0]; assert.ok(Math.hypot(drawnPosition.x - actualCar.x, drawnPosition.z - actualCar.z) < .001, 'Rendered car transforms follow physical lane state');
const drawnPole = native.props.find(prop => prop.kind === 'signal'), poleView = native.group.getObjectByName(drawnPole.id); native.hit({ collider: { id: drawnPole.id }, position: { x: drawnPole.x - 2, z: drawnPole.z }, speed: 15, normalSpeed: 15 }); for (let tick = 0; tick < 4; tick++) native.update(.25, tick * .25, drawnPole);
assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(poleView.quaternion).y < .05, 'The actual pole model visibly falls onto its side'); assert.ok(!native.nearbyCollisions(drawnPole, 5).some(collider => collider.id === drawnPole.id));
const geometrySet = new Set(), materialSet = new Set(); native.group.traverse(object => { if (object.isMesh) { geometrySet.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materialSet.add(material); } });
let disposedGeometries = 0, disposedMaterials = 0; geometrySet.forEach(geometry => geometry.addEventListener('dispose', () => disposedGeometries++)); materialSet.forEach(material => material.addEventListener('dispose', () => disposedMaterials++)); native.dispose();
assert.equal(native.group.parent, null); assert.equal(native.group.children.length, 0); assert.equal(disposedGeometries, geometrySet.size, 'Cleanup releases every shared traffic geometry'); assert.equal(disposedMaterials, materialSet.size, 'Cleanup releases every visible traffic material'); native.dispose(); assert.equal(disposedGeometries, geometrySet.size, 'Repeated scene cleanup is safe');
console.log('Regional traffic checks passed: continuous on-road lanes, protected signals/amber clearance, red stops/green release, queue spacing and player/pedestrian yielding, normal collision damage, breakaway poles without ghost colliders, bounded population, hidden-tab stability and real Three.js integration/disposal.');
