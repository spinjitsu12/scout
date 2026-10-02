import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildImmersiveWorld, WORLD_ROADS, getImmersiveLocations } from '../src/lib/immersive-world.ts';
import { createVehicle } from '../src/lib/immersive-assets.ts';
import { createImmersiveVehicle, immersiveVehicleFits, stepImmersiveVehicle } from '../src/lib/immersive-driving.ts';
import { DREAM_CAR_SPAWN, HOME_CAR_SPAWN, IMMERSION_BOUNDS } from '../src/lib/immersive-runtime.ts';
const driveBetween = (from, to, world, label) => {
  const heading = Math.atan2(-(to.x - from.x), -(to.z - from.z));
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const samples = Math.max(1, Math.ceil(length / 2));
  for (let index = 0; index <= samples; index++) {
    const fraction = index / samples;
    const position = { x: from.x + (to.x - from.x) * fraction, z: from.z + (to.z - from.z) * fraction };
    assert.ok(immersiveVehicleFits(position, heading, world), `${label}: the entire compact fits at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
  }
};
let parkingChecks = 0, approachChecks = 0;
for (const tier of [0, 1, 2]) {
  const scene = buildImmersiveWorld({ tier });
  try {
    const world = { solids: scene.collisions.filter(solid => solid.maxY > .18 && solid.minY < 1.3), bounds: IMMERSION_BOUNDS };
    const locations = getImmersiveLocations(tier);
    assert.ok(immersiveVehicleFits(DREAM_CAR_SPAWN, DREAM_CAR_SPAWN.heading, world), 'The prologue car starts on a clear actual main road');
    assert.ok(WORLD_ROADS.some(road => Math.abs(DREAM_CAR_SPAWN.x - road.x) <= road.width / 2 && Math.abs(DREAM_CAR_SPAWN.z - road.z) <= road.depth / 2), 'The dream spawn follows the relocated road');
    assert.ok(immersiveVehicleFits(HOME_CAR_SPAWN, HOME_CAR_SPAWN.heading, world), 'The home car starts outside apartment furniture and walls');
    for (const location of locations) {
      for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        assert.ok(immersiveVehicleFits(location.parking, heading, world), `${location.name} has a full-body parking space, heading ${heading}`); parkingChecks++;
      }
      if (location.id < 4) {
        const roadX = location.parking.x < 768 ? 500 : 1040;
        driveBetween({ x: roadX, z: location.parking.z }, location.parking, world, `${location.name} driveway`);
        const bound = location.footprint;
        assert.ok(Math.abs(location.parking.x - roadX) > 50, `${location.name} parking is a forecourt instead of the main lane`);
        assert.ok(location.parking.z < bound.minZ || location.parking.z > bound.maxZ, `${location.name} parking stays outside its building`); approachChecks++;
      }
    }
    const fuel = locations.find(location => location.id === 4);
    driveBetween({ x: 768, z: 650 }, { x: fuel.parking.x, z: 650 }, world, 'Fuel road approach');
    driveBetween({ x: fuel.parking.x, z: 650 }, fuel.parking, world, 'Fuel station entrance');
    driveBetween({ x: 500, z: 525 }, { x: HOME_CAR_SPAWN.x, z: 525 }, world, 'Home branch road');
    driveBetween({ x: HOME_CAR_SPAWN.x, z: 525 }, HOME_CAR_SPAWN, world, 'Home parking entrance');
    for (const road of WORLD_ROADS) {
      const horizontal = road.width > road.depth, margin = 4;
      const from = horizontal ? { x: road.x - road.width / 2 + margin, z: road.z } : { x: road.x, z: road.z - road.depth / 2 + margin };
      const to = horizontal ? { x: road.x + road.width / 2 - margin, z: road.z } : { x: road.x, z: road.z + road.depth / 2 - margin };
      driveBetween(from, to, world, `Tier ${tier} road ${road.x},${road.z}`);
    }
    let car = createImmersiveVehicle({ x: 500, z: locations[0].parking.z, heading: Math.PI / 2 });
    for (let frame = 0; frame < 60 * 6; frame++) {
      car = stepImmersiveVehicle(car, { throttle: .65, brake: 0, steer: 0 }, 1 / 60, world);
      assert.equal(car.collision, false, 'A legal branch has no hidden vehicle barrier'); assert.equal(car.y, 0, 'The driveway never launches a car');
    }
    assert.ok(car.x < 485, 'The compact physically drives from the street into a branch');
  } finally { scene.dispose(); }
}
const carModel = createVehicle();
try {
  carModel.group.updateMatrixWorld(true);
  const extents = new THREE.Box3().setFromObject(carModel.group);
  assert.ok(extents.min.y >= -.015 && extents.min.y < .025, 'Rendered tyres rest on the physics ground plane');
  assert.ok(extents.max.z - extents.min.z > 4 && extents.max.z - extents.min.z < 4.3, 'Visible length matches the 4.1m body');
  const sight = new THREE.Raycaster(carModel.cockpitEye, new THREE.Vector3(0, 0, -1), .025, 5);
  const blocked = sight.intersectObject(carModel.group, true).filter(hit => {
    const material = hit.object.material, materials = Array.isArray(material) ? material : [material];
    return materials.some(item => !item.transparent || item.opacity > .4);
  });
  assert.equal(blocked.length, 0, 'The driver has a clear view above the dashboard and through the windshield');
  carModel.update(5, .2, .1);
  assert.ok(carModel.wheels[0].rotation.y < 0 && carModel.wheels[1].rotation.y < 0, 'Visible front wheels steer right with the physics');
  assert.ok(carModel.steeringWheel.rotation.z < -2, 'The cockpit wheel follows the real steering ratio');
} finally { carModel.dispose(); }
console.log(`Immersive physical-world checks passed: ${parkingChecks} real parking poses, ${approachChecks} venue approaches, all main road centre lines across three chapters, home/fuel access, real branch driving, grounded car geometry, clear cockpit view and matching visual steering.`);
