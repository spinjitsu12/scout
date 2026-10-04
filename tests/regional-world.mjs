import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FIELD_LOCATIONS } from '../src/lib/expedition.ts';
import { WORLD_SIZE, WORLD_ROADS, REGIONAL_SETTLEMENTS, REGIONAL_SERVICE_POINTS, getImmersiveLocations, findRegionalRoute, regionalPointOnRoad, regionalRoadEndpoints, HOME_CENTER } from '../src/lib/immersive-locations.ts';
import { buildImmersiveWorld } from '../src/lib/immersive-world.ts';
import { createAssetLibrary } from '../src/lib/immersive-assets.ts';
import { buildRegionalScenery } from '../src/lib/regional-scenery.ts';
import { immersiveVehicleFits } from '../src/lib/immersive-driving.ts';
import { walkable, findLocalWalkPath } from '../src/lib/immersive-runtime.ts';
assert.equal(WORLD_SIZE.width, 12000); assert.equal(WORLD_SIZE.depth, 10000);
assert.equal(REGIONAL_SETTLEMENTS.length, 7, 'Separate towns, campuses and cities span the region');
assert.equal(new Set(WORLD_ROADS.map(road => road.id)).size, WORLD_ROADS.length, 'Road IDs are unambiguous for navigation and traffic');
const routes = [];
for (const tier of [0, 1, 2]) {
  const locations = getImmersiveLocations(tier), headquarters = locations[0];
  assert.deepEqual(locations[5].center, HOME_CENTER, 'Existing home coordinates remain compatible');
  assert.deepEqual(headquarters.parking, { x: FIELD_LOCATIONS[tier][0].point.x, z: FIELD_LOCATIONS[tier][0].point.y }, 'Existing office coordinates remain compatible');
  for (const location of locations.slice(1, 4)) {
    const route = findRegionalRoute(headquarters.parking, location.parking);
    assert(route.distance > 3000 && route.distance < 9000, 'Scouting trips are real 3–9 km regional drives');
    assert(route.segments.some(segment => segment.kind === 'highway'), 'Scouting trips leave town through the interstate');
    assert.equal(route.segments.at(-1).kind, 'access', 'Trips finish in a visitor forecourt, away from through lanes');
    assert(Math.hypot(location.parking.x - location.access.x, location.parking.z - location.access.z) > 100, 'Buildings have distinct access lanes and parking areas');
    for (const segment of route.segments) {
      assert(segment.from.x === segment.to.x || segment.from.z === segment.to.z, 'Navigation never cuts across fields');
      for (const amount of [0, .25, .5, .75, 1]) assert(regionalPointOnRoad({ x: segment.from.x + (segment.to.x - segment.from.x) * amount, z: segment.from.z + (segment.to.z - segment.from.z) * amount }, .01), 'Directions follow rendered roads');
    }
    routes.push(Math.round(route.distance));
  }
}
const headquarters = getImmersiveLocations(0)[0].parking;
for (const road of WORLD_ROADS) for (const endpoint of regionalRoadEndpoints(road)) assert(Number.isFinite(findRegionalRoute(headquarters, endpoint).distance), `${road.name} has no isolated endpoint`);
for (const region of REGIONAL_SETTLEMENTS) assert(Number.isFinite(findRegionalRoute(headquarters, region.center).distance), `${region.name} connects to the road network`);
const missedTurn = findRegionalRoute({ x: 4900, z: 2040 }, getImmersiveLocations(0)[3].parking);
assert(missedTurn.segments.length > 5, 'Missed exits reroute through real junctions'); assert.equal(missedTurn.segments[0].roadId, 'bellweather-exit', 'Rerouting starts on the current road');
assert.equal(findRegionalRoute({ x: 5800, z: 1100 }, { x: 5850, z: 1100 }).distance, 50, 'Close points on one road do not detour through distant junctions');

// Inspect real facades before static batching removes their original hierarchy.
// The street-facing pane must point toward its authored road on both sides of
// both road axes; checking an angle constant would miss the rendered outcome.
const frontageAssets = createAssetLibrary(), frontageRoot = new THREE.Group(), frontageCollisions = [], frontageGeometry = [], frontageMaterials = [], frontageCounts = new Map();
let checkedFrontages = 0;
try {
  buildRegionalScenery({ group: frontageRoot, assets: frontageAssets, collisions: frontageCollisions, interactables: [], locations: getImmersiveLocations(0), ownedGeometries: frontageGeometry, ownedMaterials: frontageMaterials, tier: 0 });
  frontageRoot.updateMatrixWorld(true);
  for (const building of frontageRoot.children) {
    if (!(building instanceof THREE.Group)) continue;
    const pane = building.children.find(child => child instanceof THREE.Mesh && child.geometry.type === 'BoxGeometry' && Math.abs(child.geometry.parameters.height - 1.57) < 1e-9 && Math.abs(child.geometry.parameters.depth - .035) < 1e-9 && Math.abs(child.position.x) < 1e-9);
    if (!pane) continue;
    const center = building.getWorldPosition(new THREE.Vector3()), collision = frontageCollisions.find(solid => solid.id.startsWith('regional-building-') && Math.abs((solid.minX + solid.maxX) / 2 - center.x) < 1e-7 && Math.abs((solid.minZ + solid.maxZ) / 2 - center.z) < 1e-7);
    assert(collision, 'A rendered neighborhood facade retains its existing physical footprint');
    const region = REGIONAL_SETTLEMENTS.find(item => collision.id.startsWith(`regional-building-${item.id}-`));
    const street = WORLD_ROADS.find(road => {
      if (road.kind !== 'street' || road.regionId !== region.id) return false;
      const horizontal = road.width > road.depth, across = horizontal ? center.z - road.z : center.x - road.x, along = horizontal ? center.x - road.x : center.z - road.z;
      const length = horizontal ? road.width : road.depth, spacing = region.character === 'city' ? 83 : region.character === 'campus' ? 90 : 72, parcelIndex = (along + length / 2 - 45) / spacing;
      // A corner parcel can be equally close to a crossing road. Match its
      // authored longitudinal slot before measuring the actual pane's direction.
      return Math.abs(Math.abs(across) - (horizontal ? road.depth : road.width) / 2 - 32) < 1e-7 && parcelIndex >= 0 && Math.abs(parcelIndex - Math.round(parcelIndex)) < 1e-7 && along < length / 2 - 25;
    });
    if (!street) continue; // Farmhouses belong to fields rather than street parcels.
    const horizontal = street.width > street.depth, towardStreet = new THREE.Vector3(horizontal ? 0 : street.x - center.x, 0, horizontal ? street.z - center.z : 0).normalize();
    const paneNormal = new THREE.Vector3(0, 0, 1).transformDirection(pane.matrixWorld), panePosition = pane.getWorldPosition(new THREE.Vector3());
    assert(paneNormal.dot(towardStreet) > .999, `${street.name}: the modeled front windows face the street instead of the field`);
    assert(horizontal ? Math.abs(panePosition.z - street.z) < Math.abs(center.z - street.z) : Math.abs(panePosition.x - street.x) < Math.abs(center.x - street.x), 'The actual facade sits on the road-facing side of its existing footprint');
    const side = Math.sign(horizontal ? center.z - street.z : center.x - street.x), key = `${horizontal ? 'horizontal' : 'vertical'}:${side}`;
    frontageCounts.set(key, (frontageCounts.get(key) ?? 0) + 1); checkedFrontages++;
  }
  assert(checkedFrontages > 500, 'The regression inspects the actual populated regional street frontages');
  for (const axis of ['horizontal', 'vertical']) for (const side of [-1, 1]) assert(frontageCounts.get(`${axis}:${side}`) > 0, 'Both sides of both street axes are covered');
} finally {
  frontageRoot.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
  frontageAssets.dispose(); new Set(frontageGeometry).forEach(geometry => geometry.dispose()); new Set(frontageMaterials).forEach(material => material.dispose()); frontageRoot.clear();
}
const world = buildImmersiveWorld({ tier: 0 });
try {
  const footSolids = world.collisions.filter(solid => solid.minY < 1.72 && solid.maxY > .25), carSolids = world.collisions.filter(solid => solid.minY < 1.3 && solid.maxY > .18);
  const drivingWorld = { solids: carSolids, bounds: { minX: 8, maxX: WORLD_SIZE.width - 8, minZ: 8, maxZ: WORLD_SIZE.depth - 8 } };
  assert(world.collisions.filter(collision => collision.id.startsWith('regional-building')).length > 500, 'The region contains populated blocks rather than only distant venues');
  assert(!world.collisions.some(collision => collision.id.startsWith('town-fence')), 'Old map fences do not block regional roads');
  for (const service of REGIONAL_SERVICE_POINTS) {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) assert(immersiveVehicleFits(service.parking, heading, drivingWorld), `${service.name}: the complete car fits at the pump`);
    const length = Math.hypot(service.parking.x - service.access.x, service.parking.z - service.access.z), heading = Math.atan2(-(service.parking.x - service.access.x), -(service.parking.z - service.access.z));
    for (let step = 0; step <= Math.ceil(length); step++) { const amount = step / Math.ceil(length); assert(immersiveVehicleFits({ x: service.access.x + (service.parking.x - service.access.x) * amount, z: service.access.z + (service.parking.z - service.access.z) * amount }, heading, drivingWorld), `${service.name}: no canopy or pump blocks the entrance`); }
  }
  const landmarks = world.interactables.filter(item => item.locationId === -1 && item.type === 'thought'); assert(landmarks.length >= 8, 'Every settlement and the coastal lookout has an explorable landmark');
  for (const landmark of landmarks) { assert(walkable(landmark.position, footSolids), `${landmark.label}: the scout can stand at the interaction`); assert(findLocalWalkPath({ x: landmark.position.x + 5, z: landmark.position.z }, landmark.position, footSolids, 30).length, `${landmark.label}: the plaza approach is accessible`); }
  const chunks = world.group.children.filter(object => object.userData.regionalChunk), homeVisible = chunks.filter(object => object.visible);
  assert(chunks.length > 100 && homeVisible.length < chunks.length / 4, 'Distant towns are hidden before render traversal'); world.setFocus(getImmersiveLocations(0)[3].parking);
  assert(chunks.some(object => object.visible && !homeVisible.includes(object)), 'Driving activates the new town geometry'); assert(homeVisible.some(object => !object.visible), 'The former district leaves the active rendering set');
  let instanceDisposals = 0; world.group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.addEventListener('dispose', () => { instanceDisposals++; }); }); world.dispose(); world.dispose(); assert(instanceDisposals > 500, 'Changing careers releases regional instance buffers');
} finally { world.dispose(); }
console.log(`PASS: 12×10 km region, seven settlements, ${WORLD_ROADS.length} connected roads, ${routes.slice(0, 3).join(', ')} m scouting drives, ${checkedFrontages} rendered facades facing their streets, accessible services and landmarks, spatial visibility and instance cleanup.`);
