import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPerson, createVehicle, vehicleDashboardState } from '../src/lib/immersive-assets.ts';
import { createCoastalAtmosphere, createWindGrass } from '../src/lib/immersive-atmosphere.ts';

const dashboard = vehicleDashboardState({ speedMps: 26.8224, fuelGallons: 3, damage: .6, gear: 'D', gearNumber: 3, engineRpm: 2750 });
assert(Math.abs(dashboard.mph - 60) < .001, 'Speed converts metres/second to US miles/hour'); assert.equal(dashboard.fuelFraction, .25); assert.equal(dashboard.conditionFraction, .4); assert.equal(dashboard.gear, 'D3'); assert(dashboard.needsRepair); assert(!dashboard.lowFuel);
const empty = vehicleDashboardState({ speedMps: -4, fuelGallons: 0, damage: 4, gear: 'R', engineRpm: 8000 }); assert(empty.mph > 0); assert.equal(empty.gear, 'R'); assert.equal(empty.conditionFraction, 0); assert.equal(empty.rpm, 6000); assert(empty.lowFuel);
const invalid = vehicleDashboardState({ speedMps: NaN, fuelGallons: -20, damage: NaN, engineRpm: Infinity }); assert(Object.values(invalid).every(value => typeof value !== 'number' || Number.isFinite(value)), 'Corrupt telemetry never produces NaN');
function observeResources(group) { const resources = new Set(); group.traverse(object => { if (!(object instanceof THREE.Mesh)) return; resources.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { resources.add(material); if (material.map) resources.add(material.map); } }); const counts = new Map([...resources].map(resource => [resource, 0])); resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1))); return () => assert([...counts.values()].every(count => count === 1), 'Rendered geometries/materials/textures release exactly once'); }
const vehicle = createVehicle(), checkVehicleDisposed = observeResources(vehicle.group); vehicle.update(0, 0, .016);
const speedNeedle = vehicle.group.getObjectByName('Dashboard needle mph'), fuelNeedle = vehicle.group.getObjectByName('Dashboard needle fuelFraction'), conditionNeedle = vehicle.group.getObjectByName('Dashboard needle conditionFraction'); assert(speedNeedle && fuelNeedle && conditionNeedle);
const vehicleWindows = []; vehicle.group.traverse(object => { if (object instanceof THREE.Mesh && object.material.transparent) vehicleWindows.push(object); });
assert.equal(vehicleWindows.length, 4); assert(vehicleWindows.every(window => !window.castShadow && !window.receiveShadow), 'Transparent windows cannot cast opaque shadow-map silhouettes across the cockpit');
assert.equal(speedNeedle.castShadow, false); assert.equal(vehicle.group.getObjectByName('Juniper compact dentable bonnet').castShadow, true, 'Solid bodywork still casts grounded shadows');
vehicle.group.updateMatrixWorld(true);
const roof = vehicle.group.getObjectByName('Juniper compact roof'), roofBounds = new THREE.Box3().setFromObject(roof), point = new THREE.Vector3();
function highestVertex(mesh) {
  const vertices = mesh.geometry.getAttribute('position'); let top = new THREE.Vector3(0, -Infinity, 0);
  for (let index = 0; index < vertices.count; index++) { point.fromBufferAttribute(vertices, index).applyMatrix4(mesh.matrixWorld); if (point.y > top.y) top = point.clone(); }
  return top;
}
for (const name of ['Juniper compact windshield', 'Juniper compact rear window', 'Juniper compact front pillar -1', 'Juniper compact front pillar 1', 'Juniper compact rear pillar -1', 'Juniper compact rear pillar 1']) {
  const part = vehicle.group.getObjectByName(name); assert(part instanceof THREE.Mesh);
  assert(roofBounds.distanceToPoint(highestVertex(part)) < .08, `${name} joins the roof rather than leaning away from it`);
}
const rollingWheel = vehicle.wheels[0].children[0], tireBottom = new THREE.Vector3(0, -.345, 0);
vehicle.update(2, 0, .025);
assert(tireBottom.clone().applyQuaternion(rollingWheel.quaternion).z > .01, 'Forward wheel motion carries the ground contact backward relative to the car');
vehicle.update(-2, 0, .025);
assert(tireBottom.clone().applyQuaternion(rollingWheel.quaternion).distanceTo(tireBottom) < 1e-9, 'Reversing the same distance unwinds the wheel motion');
const idleAngle = speedNeedle.rotation.z; vehicle.updateDashboard({ speedMps: 26.8224, fuelGallons: 1, damage: .85, gear: 'D', engineRpm: 3900 }); vehicle.update(26.8224, .2, .016); assert(speedNeedle.rotation.z < idleAngle && speedNeedle.rotation.z > 0, 'Needles ease without snapping');
for (let i = 0; i < 150; i++) vehicle.update(26.8224, .2, 1 / 60); assert(Math.abs(speedNeedle.rotation.z) < .001, '60 MPH centres the 120 MPH dial'); assert(fuelNeedle.rotation.z > 1 && conditionNeedle.rotation.z > 1); assert(Math.abs(vehicle.steeringWheel.rotation.z + 2.8) < .001);
const bonnet = vehicle.group.getObjectByName('Juniper compact dentable bonnet'), bumper = vehicle.group.getObjectByName('Juniper compact damaged bumper'), damagedBonnet = new Float32Array(bonnet.geometry.getAttribute('position').array); assert(bumper.position.y < .52); vehicle.updateDashboard({ speedMps: 0, fuelGallons: 12, damage: 0, gear: 'D' }); assert(bonnet.geometry.getAttribute('position').array.some((value, i) => Math.abs(value - damagedBonnet[i]) > .005), 'Repairs restore visible dents'); assert.equal(bumper.position.y, .53); vehicle.dispose(); vehicle.dispose(); checkVehicleDisposed();
const patches = [{ x: 120, z: 330, width: 40, depth: 50, count: 500, seed: 42 }, { x: 5000, z: 6300, width: 80, depth: 80, count: 500, seed: 60 }], grass = createWindGrass({ patches, maxBlades: 800 }), checkGrassDisposed = observeResources(grass.group); assert.equal(grass.bladeCount, 800); assert.equal(grass.patchCount, 2); assert(grass.group.children.every(mesh => mesh instanceof THREE.InstancedMesh)); assert.equal(grass.group.children[0].geometry, grass.group.children[1].geometry); assert.equal(grass.group.children[0].material, grass.group.children[1].material);
const instances = grass.group.children.map(mesh => new Float32Array(mesh.instanceMatrix.array)); grass.update(100); grass.update(200); assert(grass.group.children.every((mesh, i) => mesh.instanceMatrix.array.every((value, n) => value === instances[i][n])), 'GPU wind has no per-blade CPU uploads'); assert(grass.group.children.every(mesh => mesh.boundingSphere?.radius > 20)); const sameGrass = createWindGrass({ patches, maxBlades: 800 }); assert.deepEqual([...sameGrass.group.children[0].instanceMatrix.array], [...instances[0]]); sameGrass.dispose(); grass.dispose(); grass.dispose(); checkGrassDisposed();
const atmosphere = createCoastalAtmosphere({ width: 12000, depth: 10000, centerX: 6000, centerZ: 5000, coastX: 11200 }), checkAtmosphereDisposed = observeResources(atmosphere.group), sea = atmosphere.group.getObjectByName('Moving wind-streaked coastal water'); assert(sea instanceof THREE.Mesh && sea.material instanceof THREE.ShaderMaterial); atmosphere.update(40); assert.equal(sea.material.uniforms.uTime.value, 40); assert(sea.position.x > 11200); assert(atmosphere.group.children.length <= 5);
const hills = atmosphere.group.getObjectByName('Painted distant coastal ridges'), hillMatrix = new THREE.Matrix4();
for (let index = 0; index < hills.count; index++) { hills.getMatrixAt(index, hillMatrix); const bounds = hills.geometry.boundingBox?.clone() ?? new THREE.Box3().setFromBufferAttribute(hills.geometry.getAttribute('position')); bounds.applyMatrix4(hillMatrix); assert(bounds.max.x < 0 || bounds.min.x > 12000 || bounds.max.z < 0 || bounds.min.z > 10000, 'Horizon mountains never intersect a playable map corner'); }
atmosphere.dispose(); atmosphere.dispose(); checkAtmosphereDisposed();
const person = createPerson({ avatar: 6 }), checkPersonDisposed = observeResources(person.group); person.update(2, .2); assert.notEqual(person.leftArm.rotation.x, 0); person.update(0, .5, 'phone'); assert(person.group.getObjectByName('held-phone').visible); assert(person.head.children.length < 15); person.dispose(); person.dispose(); checkPersonDisposed();
console.log('PASS: dashboard units/warnings, clear glass shadows, connected cockpit roof geometry, correct forward/reverse wheel motion, damped gauges, visible damage/repair, GPU meadow budget and deterministic wind, animated coastal atmosphere, character animation and exact resource disposal.');
