import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAssetLibrary } from '../src/lib/immersive-assets.ts';
import { buildImmersiveWorld } from '../src/lib/immersive-world.ts';
import { getImmersiveLocations } from '../src/lib/immersive-locations.ts';
import { REGIONAL_SERVICE_POINTS, REGIONAL_SETTLEMENTS, WORLD_ROADS, WORLD_SIZE } from '../src/lib/regional-roads.ts';
import { buildRegionalWayfinding, regionalWayfindingPlan, roadsideSignPosts } from '../src/lib/regional-wayfinding.ts';
import { immersiveVehicleFits } from '../src/lib/immersive-driving.ts';
import { findLocalWalkPath, walkable } from '../src/lib/immersive-runtime.ts';

const road = id => WORLD_ROADS.find(item => item.id === id);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const overlaps = (a, b, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
let signCount = 0, pumpApproaches = 0, reachablePois = 0;
for (const tier of [0, 1, 2]) {
  const world = buildImmersiveWorld({ tier });
  try {
    const signs = world.group.userData.roadsideSigns, planned = regionalWayfindingPlan(world.locations);
    assert.equal(signs.length, 42, `Tier ${tier}: every planned approach has a real board`);
    assert.equal(new Set(signs.map(sign => sign.id)).size, 42, 'Sign identities are unique');
    assert.deepEqual(signs.map(sign => sign.id), planned.map(sign => sign.id), 'No board silently disappears during clearance placement');
    assert.deepEqual(['exit', 'welcome', 'service', 'venue'].map(kind => signs.filter(sign => sign.kind === kind).length), [12, 14, 10, 6]);
    for (const sign of signs) {
      for (const key of ['id', 'roadId', 'kind', 'position', 'facing', 'direction', 'title', 'subtitle', 'arrow', 'motif', 'width', 'height', 'faceY', 'accent']) assert(key in sign, `QA metadata exposes ${key}`);
      const route = road(sign.roadId), horizontal = route.width > route.depth;
      const travel = horizontal ? { x: sign.direction, z: 0 } : { x: 0, z: sign.direction };
      const faceNormal = { x: Math.sin(sign.facing), z: Math.cos(sign.facing) };
      assert(faceNormal.x * travel.x + faceNormal.z * travel.z < -.999, `${sign.id}: lettering faces incoming drivers`);
      const along = horizontal ? sign.position.x : sign.position.z, center = horizontal ? route.x : route.z, extent = horizontal ? route.width : route.depth;
      assert(Math.abs(along - center) < extent / 2 - 13, `${sign.id}: board stands along a rendered approach`);
      const across = horizontal ? sign.position.z - route.z : sign.position.x - route.x;
      assert.equal(Math.sign(across), horizontal ? sign.direction : -sign.direction, `${sign.id}: board is on the incoming lane's shoulder`);
      const posts = roadsideSignPosts(sign);
      for (const [index, point] of posts.entries()) {
        assert(point.x > 10 && point.z > 10 && point.x < WORLD_SIZE.width - 10 && point.z < WORLD_SIZE.depth - 10);
        const own = world.collisions.find(solid => solid.id === `regional-wayfinding-${sign.id}-${index === 0 ? -1 : 1}`);
        assert(own && own.minY === 0 && own.maxY > 2, `${sign.id}: grounded support has a physical collider`);
        assert(distance(point, { x: (own.minX + own.maxX) / 2, z: (own.minZ + own.maxZ) / 2 }) < .000001, 'Rendered support and collider share world coordinates');
        for (const other of WORLD_ROADS) assert(!overlaps(own, { minX: other.x - other.width / 2, maxX: other.x + other.width / 2, minZ: other.z - other.depth / 2, maxZ: other.z + other.depth / 2 }, 2.6), `${sign.id}: support clears traffic lanes and the sidewalk strip`);
        for (const solid of world.collisions) if (solid !== own && solid.minY < 1.72 && solid.maxY > .25) assert(!overlaps(own, solid, .4), `${sign.id}: support does not overlap ${solid.id}`);
        for (const location of world.locations) assert(distance(point, location.door) > 5 && distance(point, location.parking) > 7, `${sign.id}: support clears entry and parking`);
      }
      if (sign.kind === 'exit') {
        const right = sign.roadId === 'interstate-7' || sign.id.startsWith('juniper');
        assert.equal(sign.arrow, right === (sign.direction === 1) ? 'right' : 'left', `${sign.id}: arrow leads toward the exit branch`);
      } else if (sign.kind === 'service' || sign.kind === 'venue') assert.equal(sign.arrow, sign.direction === 1 ? 'left' : 'right', `${sign.id}: arrow reaches the east-side access lane`);
      else assert.equal(sign.arrow, 'none', 'Town welcome boards do not imply a turn');
      signCount++;
    }
    for (const region of REGIONAL_SETTLEMENTS) assert.equal(signs.filter(sign => sign.kind === 'welcome' && sign.title === region.name).length, 2, `${region.name}: both entrances have a welcome board`);
    const larkspur = signs.find(sign => sign.id === 'larkspur-exit--1');
    assert(larkspur.position.z > 8200 && larkspur.position.z < 8300, 'Northbound Larkspur board uses the remaining 100 m of Interstate 19');
    const footSolids = world.collisions.filter(solid => solid.minY < 1.72 && solid.maxY > .25);
    const carSolids = world.collisions.filter(solid => solid.minY < 1.3 && solid.maxY > .18);
    const carWorld = { solids: carSolids, bounds: { minX: 8, maxX: WORLD_SIZE.width - 8, minZ: 8, maxZ: WORLD_SIZE.depth - 8 } };
    for (const service of REGIONAL_SERVICE_POINTS) {
      const heading = Math.atan2(-(service.parking.x - service.access.x), -(service.parking.z - service.access.z)), length = distance(service.access, service.parking);
      for (let step = 0; step <= Math.ceil(length); step++) {
        const amount = step / Math.ceil(length);
        assert(immersiveVehicleFits({ x: service.access.x + (service.parking.x - service.access.x) * amount, z: service.access.z + (service.parking.z - service.access.z) * amount }, heading, carWorld), `${service.name}: signage preserves the entire vehicle approach`);
      }
      for (const side of [-1, 1]) {
        const pump = { x: service.parking.x + (service.locationId === 4 ? side * 4.1 : 0), z: service.parking.z + (service.locationId === 4 ? 0 : side * 6.3) };
        for (const offset of [{ x: -1.8, z: 0 }, { x: 1.8, z: 0 }, { x: 0, z: -2 }, { x: 0, z: 2 }]) {
          const contact = { x: pump.x + offset.x, z: pump.z + offset.z };
          assert(walkable(contact, footSolids), `${service.name}: both modeled pumps have accessible contact points`);
          assert(distance(contact, pump) < 2.9, 'Contact points are within the real pump interaction range');
          pumpApproaches++;
        }
      }
      const poi = world.interactables.find(item => item.id === (service.locationId === 4 ? 'fuel' : `${service.id}-pump`));
      assert(poi, `${service.name}: service POI keeps its existing identity`);
      if (service.locationId === -1) { assert.deepEqual(poi.position, { x: service.parking.x, z: service.parking.z + 6.3 }); assert.equal(poi.range, 2.9); }
      reachablePois++;
    }
    for (const poi of world.interactables.filter(item => item.locationId === -1 && item.type === 'thought')) {
      assert(walkable(poi.position, footSolids));
      assert(findLocalWalkPath({ x: poi.position.x + 5, z: poi.position.z }, poi.position, footSolids, 30).length, `${poi.label}: the local approach is clear`);
      reachablePois++;
    }
    world.group.updateMatrixWorld(true);
    const faces = [];
    world.group.traverse(object => { if (object instanceof THREE.Mesh && !Array.isArray(object.material) && object.material.name === 'SCOUT shared wayfinding atlas') faces.push(object); });
    assert(faces.length > 0 && faces.length <= 42, 'Board faces share their atlas and bounded material batches');
    for (const face of faces) {
      let parent = face.parent;
      while (parent && !parent.userData.regionalChunk) parent = parent.parent;
      assert(parent?.userData.regionalChunk, 'Board lettering participates in regional visibility culling');
    }
    world.setFocus({ x: 2960, z: 1100 });
    assert(faces.some(face => face.parent.visible), 'Nearby highway lettering is visible');
    world.setFocus({ x: 11700, z: 9600 });
    assert(faces.every(face => !face.parent.visible), 'Distant lettering is excluded from render traversal');
  } finally { world.dispose(); world.dispose(); }
}

// A canvas fixture verifies atlas creation/UVs/ownership; screenshot QA checks actual browser rasterization separately.
const canvases = [], texts = [];
const assets = createAssetLibrary(), group = new THREE.Group(), geometries = [], materials = [], collisions = [];
const originalDocument = globalThis.document;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  const context = new Proxy({ measureText: value => ({ width: String(value).length * 17 }), fillText: value => texts.push(String(value)) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = { width: 0, height: 0, getContext: kind => kind === '2d' ? context : null }; canvases.push(canvas); return canvas;
} };
try {
  const signs = buildRegionalWayfinding({ group, assets, collisions, locations: getImmersiveLocations(0), ownedGeometries: geometries, ownedMaterials: materials });
  assert.equal(signs.length, 42); assert.equal(canvases.length, 1, 'All original boards use one atlas');
  assert(canvases[0].width <= 2048 && canvases[0].height <= 1536, 'Atlas memory is bounded');
  assert.equal(canvases[0].width, 2048); assert.equal(canvases[0].height, 1408);
  assert.equal(materials.length, 1); assert(materials[0] instanceof THREE.MeshBasicMaterial); assert(materials[0].map);
  assert.equal(materials[0].map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(geometries.length, 42);
  const tileUvs = new Set();
  for (const geometry of geometries) {
    const uv = geometry.getAttribute('uv');
    assert([...uv.array].every(value => value > 0 && value < 1), 'Inset UVs avoid adjacent-tile bleed');
    tileUvs.add([...uv.array].map(value => value.toFixed(5)).join(','));
  }
  assert.equal(tileUvs.size, 42, 'Each physical face samples its own lettering');
  assert.deepEqual(texts, signs.flatMap(sign => [sign.title, sign.subtitle]), 'Every board draws its actual local destination text');
  const resources = new Set([materials[0], materials[0].map, ...geometries]);
  group.traverse(object => { if (object instanceof THREE.Mesh) { resources.add(object.geometry); resources.add(object.material); } });
  const disposed = new Map([...resources].map(resource => [resource, 0]));
  resources.forEach(resource => resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1)));
  assets.dispose(); assets.dispose(); new Set(geometries).forEach(geometry => geometry.dispose()); new Set(materials).forEach(material => material.dispose());
  assert([...disposed.values()].every(count => count === 1), 'Shared sign geometry/material/texture and support resources dispose exactly once');
} finally { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument; }

console.log(`PASS: ${signCount} grounded directional signs across three tiers, ${pumpApproaches} accessible pump contacts, ${reachablePois} service/landmark POIs, original bounded shared atlas, spatial culling and exact resource disposal.`);
