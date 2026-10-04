import * as THREE from 'three';
import { createAssetLibrary } from './immersive-assets.ts';
import { REGIONAL_SETTLEMENTS, REGIONAL_SERVICE_POINTS, WORLD_ROADS, WORLD_SIZE, regionalPointOnRoad, type RegionalSettlement } from './regional-roads.ts';
import { buildRegionalWayfinding } from './regional-wayfinding.ts';
import type { ImmersiveLocation, WorldCollision, WorldInteractable, WorldPoint } from './immersive-locations.ts';
type Assets = ReturnType<typeof createAssetLibrary>;
type GrassPatch = { x: number; z: number; width: number; depth: number; count: number; seed: number };

/** Shared-material architecture and spatial forest instances give each settlement its own silhouette. */
export function buildRegionalScenery(options: {
  group: THREE.Group; assets: Assets; collisions: WorldCollision[]; interactables: WorldInteractable[];
  locations: ImmersiveLocation[]; ownedGeometries: THREE.BufferGeometry[]; ownedMaterials: THREE.Material[]; tier: number;
}): { grassPatches: GrassPatch[]; update: (elapsed: number) => void } {
  const { group, assets, collisions, interactables, locations, ownedGeometries, ownedMaterials } = options;
  const { box, cylinder, sphere, mat, put } = assets;
  let collider = 0;
  const solid = (name: string, x: number, z: number, width: number, depth: number, height: number, minY = 0, kind: WorldCollision['kind'] = 'furniture') => collisions.push({ id: `regional-${name}-${collider++}`, minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, minY, maxY: minY + height, kind });
  const block = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number, color: string, collides = true, kind: WorldCollision['kind'] = 'furniture') => { const mesh = put(group, box(width, height, depth, color), x, y, z); if (collides) solid(name, x, z, width, depth, height, y - height / 2, kind); return mesh; };
  const prop = (name: string, object: THREE.Group, x: number, z: number, width: number, depth: number, height: number, rotation = 0) => { object.rotation.y = rotation; put(group, object, x, 0, z); const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation)); solid(name, x, z, width * c + depth * s, depth * c + width * s, height); };
  let randomSeed = 15301 + options.tier * 307; const random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const reserved = (point: WorldPoint, pad = 35) => locations.some(location => point.x > location.footprint.minX - pad && point.x < location.footprint.maxX + pad && point.z > location.footprint.minZ - pad && point.z < location.footprint.maxZ + pad || Math.hypot(point.x - location.parking.x, point.z - location.parking.z) < pad + 28) || REGIONAL_SERVICE_POINTS.some(service => Math.hypot(point.x - service.parking.x, point.z - service.parking.z) < 65 + pad);
  const intersectsSolid = (point: WorldPoint, pad: number) => collisions.some(collision => collision.minY < 1.4 && collision.maxY > .25 && point.x > collision.minX - pad && point.x < collision.maxX + pad && point.z > collision.minZ - pad && point.z < collision.maxZ + pad);

  REGIONAL_SERVICE_POINTS.filter(service => service.locationId === -1).forEach(service => {
    const { x, z } = service.parking;
    put(group, box(48, .035, 34, '#737e78'), x, .013, z).castShadow = false;
    block('service-canopy', x, 4.15, z, 25, .22, 17, '#e7dcc4', true, 'building');
    block('service-canopy-trim', x, 4.3, z, 25.4, .08, 17.4, '#3c797b', true, 'building');
    for (const side of [-1, 1]) {
      block('service-column', x + side * 11.8, 2.1, z - 6.5, .26, 4.2, .26, '#527e7b', true, 'building');
      const pump = new THREE.Group(); put(pump, box(.75, .88, .58, '#bb6551', .04), 0, .44, 0); put(pump, box(.71, .7, .54, '#ede5cd', .04), 0, 1.21, 0); put(pump, assets.label('87', 'Regular', .53, .34), 0, 1.28, .285); put(pump, box(.1, .3, .09, '#354f50'), .39, 1.13, .1);
      prop('service-pump', pump, x, z + side * 6.3, .9, .7, 1.7, side > 0 ? Math.PI : 0); block('service-pump-island', x, .055, z + side * 6.3, 3.4, .11, 1.35, '#c4c6b4');
    }
    put(group, assets.label(service.name.toUpperCase(), 'Fuel · repairs · a moment to rest', 10, 1.4, '#3c7779'), x, 4.6, z - 8.6);
    prop('service-bench', assets.bench(), x + 17, z + 12, 2.2, .8, 1.2);
    interactables.push({ id: `${service.id}-pump`, type: 'fuel', label: `Refuel at ${service.name}`, position: { x, z: z + 6.3 }, range: 2.9, locationId: -1 });
  });
  const landmarkPoints: Record<string, WorldPoint> = {
    cirrus: { x: 1288, z: 480 }, eastmere: { x: 3210, z: 1698 }, bellweather: { x: 5130, z: 2990 }, aster: { x: 6600, z: 3090 },
    juniper: { x: 2680, z: 6200 }, larkspur: { x: 6570, z: 7770 }, meridian: { x: 10200, z: 6650 },
  };
  const landmarkThoughts: Record<string, [string, string]> = {
    cirrus: ['Watch the harbor river', 'The river threads through familiar streets before disappearing toward the coast. There is a whole region waiting beyond the highway.'],
    eastmere: ['Pause on the campus green', 'Sketchbooks and engineering notes share the same picnic tables. A good introduction often starts with asking what somebody is working on.'],
    bellweather: ['Explore the lantern square', 'Old workshops have become studios, but the sound of making things still drifts out through the windows. People here notice when you take your time.'],
    aster: ['Listen in the tide garden', 'A coastal breeze moves through the garden. Research, art, and ordinary life meet here without needing an appointment.'],
    juniper: ['Visit the old mill', 'The towns along the valley keep their own pace. A quick stop for a cup of coffee can turn into an afternoon of local stories.'],
    larkspur: ['Walk the conservatory gardens', 'The gardeners know the shape of the seasons. New projects take root slowly, just like the camellias along the boulevard.'],
    meridian: ['Look up from the civic courtyard', 'The city is taller and busier, but the same patient curiosity opens doors. There is time to explore before the next conversation.'],
  };
  const landmarkReserved = (point: WorldPoint, pad: number) => Object.values(landmarkPoints).some(landmark => Math.abs(point.x - landmark.x) < 36 + pad && Math.abs(point.z - landmark.z) < 30 + pad);
  REGIONAL_SETTLEMENTS.filter(region => region.id !== 'cirrus').forEach(region => {
    const { x, z } = landmarkPoints[region.id];
    put(group, box(62, .024, 51, '#d7d8bd'), x, .015, z).castShadow = false;
    put(group, cylinder(4.3, .12, '#acc3b7', 4.3, 24), x - 10, .06, z - 6).castShadow = false; solid('plaza-basin', x - 10, z - 6, 8.6, 8.6, .22);
    put(group, cylinder(3.9, .012, '#78b0af', 3.9, 24), x - 10, .135, z - 6).castShadow = false;
    block('plaza-sculpture', x - 10, 1.9, z - 6, .9, 3.8, .9, region.colors[1]);
    put(group, sphere(1.05, region.colors[2], 1), x - 10, 3.7, z - 6).scale.set(.55, 1.4, .55);
    for (const side of [-1, 1]) { prop('plaza-bench', assets.bench(), x + 8, z + side * 14, 2.2, .8, 1.2, side > 0 ? 0 : Math.PI); prop('plaza-planter', assets.plant(2.8), x + side * 23, z + 19, 1.8, 1.8, 2.8); }
    const towerX = x + 19, towerZ = z - 15, height = region.character === 'city' ? 25 : region.character === 'campus' ? 13 : region.character === 'garden' ? 9 : 11;
    block('landmark-tower', towerX, height / 2, towerZ, 5, height, 5, region.colors[0], true, 'building'); block('landmark-tower-trim', towerX, height - 1, towerZ, 5.7, .35, 5.7, region.colors[1], true, 'building');
    put(group, cylinder(3.8, 3.5, region.colors[2], .05, 4), towerX, height + 1.5, towerZ).rotation.y = Math.PI / 4;
    put(group, assets.label(region.name.toUpperCase(), region.character === 'campus' ? 'Learning · curiosity · community' : 'Stay a while', 9.5, 1.25, region.colors[1]), x, 2.5, z - 23);
    const [label, detail] = landmarkThoughts[region.id]; interactables.push({ id: `${region.id}-landmark`, type: 'thought', label, detail, position: { x: x + 8, z: z + 7 }, range: 4, locationId: -1 });
  });

  let houseIndex = 0;
  function neighborhoodBuilding(point: WorldPoint, region: RegionalSettlement, facing: number) {
    const variant = houseIndex++, width = 16 + variant % 4 * 4, depth = 13 + variant % 3 * 4, floors = region.character === 'city' ? 5 + variant % 8 : region.character === 'campus' ? 2 + variant % 3 : region.character === 'village' ? 1 + variant % 2 : 1 + variant % 4;
    const height = floors * 3.25, building = new THREE.Group(); building.rotation.y = facing;
    const plaster = region.colors[variant % 3 === 0 ? 1 : 0], trim = region.colors[1], accent = region.colors[2];
    put(building, box(width, height, depth, plaster), 0, height / 2, 0); put(building, box(width + .65, .3, depth + .65, trim), 0, height + .1, 0); put(building, box(width + .15, 1.15, depth + .15, '#cdc8b3'), 0, .575, 0);
    if (region.character === 'village' || region.character === 'harbor' && variant % 3 !== 0) {
      const shape = new THREE.Shape(); shape.moveTo(-width / 2 - .4, 0); shape.lineTo(0, width * .26); shape.lineTo(width / 2 + .4, 0); shape.closePath(); const geometry = new THREE.ExtrudeGeometry(shape, { depth: depth + .8, bevelEnabled: false }); ownedGeometries.push(geometry); put(building, new THREE.Mesh(geometry, mat(accent)), 0, height + .2, -depth / 2 - .4).castShadow = true;
    } else { put(building, box(width * .65, 1.4, depth * .62, '#bdc9bb'), 0, height + .85, 0); if (variant % 3 === 0) put(building, cylinder(.55, 2.6, accent, .55, 10), width / 3, height + 1.7, 0); }
    const rows = Math.min(floors, 6);
    for (let row = 0; row < rows; row++) for (let column = 0; column < 3; column++) {
      const px = (column - 1) * width / 3.3, py = 1.95 + row * (height - 2.8) / Math.max(1, rows - 1);
      put(building, box(width / 5.6, 1.8, .09, '#5b7982'), px, py, depth / 2 + .06); put(building, box(width / 5.6 - .17, 1.57, .035, ['#c0d9cf', '#96bfc3', '#b7cbd2'][variant % 3]), px, py, depth / 2 + .12); put(building, box(width / 5.6 + .2, .13, .28, '#f1e2c5'), px, py - .91, depth / 2 + .13);
      if (row === 1 && variant % 2 === 0) put(building, box(width / 5.6 + .4, .8, 1.2, accent), px, py - 1.15, depth / 2 + .6);
    }
    put(building, box(1.5, 2.5, .08, trim), 0, 1.25, depth / 2 + .065); put(building, box(width * .45, .13, 2.2, accent), 0, 3, depth / 2 + .95);
    for (const side of [-1, 1]) put(building, box(.3, height, .18, accent), side * (width / 2 - .35), height / 2, depth / 2 + .09);
    put(group, building, point.x, 0, point.z); const c = Math.abs(Math.cos(facing)), s = Math.abs(Math.sin(facing)); solid(`building-${region.id}`, point.x, point.z, (width + .8) * c + (depth + 2.2) * s, (depth + 2.2) * c + (width + .8) * s, height + width * .27, 0, 'building');
  }
  const parcels = new Set<string>();
  REGIONAL_SETTLEMENTS.forEach(region => {
    for (const street of WORLD_ROADS.filter(road => road.regionId === region.id && road.kind === 'street')) {
      const horizontal = street.width > street.depth, length = horizontal ? street.width : street.depth, streetWidth = horizontal ? street.depth : street.width;
      for (const side of [-1, 1]) for (let offset = -length / 2 + 45; offset < length / 2 - 25; offset += region.character === 'city' ? 83 : region.character === 'campus' ? 90 : 72) {
        const point = { x: street.x + (horizontal ? offset : side * (streetWidth / 2 + 32)), z: street.z + (horizontal ? side * (streetWidth / 2 + 32) : offset) }, key = `${Math.round(point.x / 38)},${Math.round(point.z / 38)}`;
        if (parcels.has(key) || reserved(point, 22) || landmarkReserved(point, 21) || regionalPointOnRoad(point, 22) || intersectsSolid(point, 21)) continue;
        // Facades are authored on local +Z; each parcel faces back toward its street.
        const facing = horizontal ? side > 0 ? Math.PI : 0 : side > 0 ? -Math.PI / 2 : Math.PI / 2;
        parcels.add(key); neighborhoodBuilding(point, region, facing);
      }
    }
  });
  const countryRoads = WORLD_ROADS.filter(road => road.kind === 'highway' || road.kind === 'country');
  countryRoads.forEach((route, routeIndex) => {
    const horizontal = route.width > route.depth, length = horizontal ? route.width : route.depth;
    for (let offset = -length / 2 + 450; offset < length / 2 - 250; offset += 780) {
      const side = (Math.round(offset / 780) + routeIndex) % 2 ? 1 : -1, point = { x: route.x + (horizontal ? offset : side * 230), z: route.z + (horizontal ? side * 230 : offset) };
      if (point.x < 90 || point.z < 90 || point.x > 11100 || point.z > 9500 || reserved(point, 120) || regionalPointOnRoad(point, 150)) continue;
      put(group, box(240 + routeIndex % 3 * 50, .018, 300, ['#90a57d', '#acb583', '#87a48b', '#a8b996'][routeIndex % 4]), point.x, -.001, point.z).castShadow = false;
      for (let row = -5; row <= 5; row++) put(group, box(horizontal ? 230 : 1.7, .019, horizontal ? 1.7 : 280, '#759674'), point.x + (horizontal ? 0 : row * 18), .008, point.z + (horizontal ? row * 20 : 0)).castShadow = false;
      const farm = { x: point.x + 158, z: point.z + 105 };
      if (routeIndex % 2 === 0 && !regionalPointOnRoad(farm, 27) && !reserved(farm, 35) && !landmarkReserved(farm, 28) && !intersectsSolid(farm, 25)) neighborhoodBuilding(farm, REGIONAL_SETTLEMENTS[4], 0);
    }
  });
  buildRegionalWayfinding({ group, assets, collisions, locations, ownedGeometries, ownedMaterials });
  const riverGeometry = new THREE.PlaneGeometry(65, 650, 2, 12), riverMaterial = new THREE.MeshStandardMaterial({ color: '#78a8a5', roughness: .32, metalness: .18, transparent: true, opacity: .94 }); ownedGeometries.push(riverGeometry); ownedMaterials.push(riverMaterial);
  const river = new THREE.Mesh(riverGeometry, riverMaterial); river.rotation.x = -Math.PI / 2; river.position.set(1354, -.015, 525); river.receiveShadow = true; group.add(river);
  put(group, box(4.2, .028, 735, '#b2b59a'), 1298, .017, 530).castShadow = false;
  for (let z = 230; z < 870; z += 125) prop('river-bench', assets.bench(), 1291, z, 2.2, .8, 1.25, Math.PI / 2);
  interactables.push({ id: 'river-overlook', type: 'thought', label: landmarkThoughts.cirrus[0], detail: landmarkThoughts.cirrus[1], position: { x: 1290, z: 480 }, range: 4, locationId: -1 });
  for (let z = 182; z < 880; z += 12) { if ([350, 650].some(crossing => z <= crossing + 16 && z + 12 >= crossing - 16)) continue; block('river-rail-post', 1308, .55, z, .12, 1.1, .12, '#8a8070'); block('river-rail', 1308, .72, z + 6, .09, .11, 12, '#9c8c70'); }
  for (const z of [350, 650]) { block('river-bridge-deck', 1354, -.2, z, 100, .32, 20, '#9ba792', true, 'building'); for (const side of [-1, 1]) { block('river-bridge-rail', 1347, .8, z + side * 10, 82, .13, .13, '#7f9486'); for (let x = 1306; x <= 1386; x += 8) block('river-bridge-post', x, .55, z + side * 10, .16, 1.1, .16, '#718c7b'); } }
  put(group, box(78, .02, WORLD_SIZE.depth, '#dfd1aa'), 11161, -.002, WORLD_SIZE.depth / 2).castShadow = false;
  block('coastal-quay-wall', 11195, .45, WORLD_SIZE.depth / 2, .45, .9, WORLD_SIZE.depth, '#ced2c0', true, 'wall'); block('coastal-quay-coping', 11195, .93, WORLD_SIZE.depth / 2, .6, .12, WORLD_SIZE.depth, '#e4dbc0', true, 'wall');
  const lighthouseX = 11100, lighthouseZ = 4840;
  put(group, cylinder(5.5, 20, '#e8e2cf', 4.1, 16), lighthouseX, 10, lighthouseZ); solid('lighthouse', lighthouseX, lighthouseZ, 11, 11, 20, 0, 'building'); put(group, cylinder(5.8, 2.4, '#3e767b', 5.8, 16), lighthouseX, 20.5, lighthouseZ); put(group, cylinder(6, 2.3, '#bf6856', .2, 16), lighthouseX, 23, lighthouseZ);
  put(group, assets.label('TIDEGLASS LIGHT', 'The whole coast, in one breath.', 7.5, 1.3, '#3d7179'), lighthouseX - 13, 2.4, lighthouseZ - 20); prop('lighthouse-bench', assets.bench(), lighthouseX - 12, lighthouseZ + 10, 2.2, .8, 1.2, Math.PI / 2);
  interactables.push({ id: 'lighthouse-overlook', type: 'thought', label: 'Take in the Tideglass coast', detail: 'From here the highway looks like a thread between distant towns. Your next discovery could be anywhere along it.', position: { x: lighthouseX - 12, z: lighthouseZ + 4 }, range: 4, locationId: -1 });

  const treePoints: { x: number; z: number; size: number; angle: number; tint: number }[] = [];
  const tree = (point: WorldPoint, size: number) => {
    if (point.x < 15 || point.z < 15 || point.x > 11160 || point.z > WORLD_SIZE.depth - 15 || regionalPointOnRoad(point, 9) || reserved(point, 20) || landmarkReserved(point, 5) || intersectsSolid(point, 3)) return;
    treePoints.push({ ...point, size, angle: random() * Math.PI * 2, tint: random() }); solid('tree', point.x, point.z, .55 * size, .55 * size, 6 * size, 0, 'tree');
  };
  REGIONAL_SETTLEMENTS.forEach(region => { for (let i = 0; i < 165; i++) tree({ x: region.center.x + (random() - .5) * region.radiusX * 2, z: region.center.z + (random() - .5) * region.radiusZ * 2 }, 1 + random() * .8); });
  countryRoads.forEach(route => { const horizontal = route.width > route.depth, length = horizontal ? route.width : route.depth; for (let offset = -length / 2 + 25; offset < length / 2 - 20; offset += 45) for (const side of [-1, 1]) { const setback = 24 + random() * 115; tree({ x: route.x + (horizontal ? offset : side * setback), z: route.z + (horizontal ? side * setback : offset) }, 1.3 + random() * 1.5); } });
  for (let i = 0; i < 2200; i++) tree({ x: 90 + random() * 10920, z: 110 + random() * 9580 }, 1.5 + random() * 2);
  const trunkGeometry = new THREE.CylinderGeometry(.15, .28, 4.4, 7), crownGeometry = new THREE.IcosahedronGeometry(2.8, 1); ownedGeometries.push(trunkGeometry, crownGeometry);
  const patches = new Map<string, typeof treePoints>(); treePoints.forEach(point => { const key = `${Math.floor(point.x / 320)}:${Math.floor(point.z / 320)}`, patch = patches.get(key) ?? []; patch.push(point); patches.set(key, patch); });
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), color = new THREE.Color();
  for (const points of patches.values()) {
    const trunks = new THREE.InstancedMesh(trunkGeometry, mat('#887259'), points.length), crowns = new THREE.InstancedMesh(crownGeometry, mat('#6f9682'), points.length * 3); trunks.name = 'Regional grove trunks'; crowns.name = 'Regional grove canopy';
    points.forEach((point, index) => { position.set(point.x, point.size * 2.2, point.z); scale.setScalar(point.size); rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), point.angle); matrix.compose(position, rotation, scale); trunks.setMatrixAt(index, matrix);
      for (let crown = 0; crown < 3; crown++) { const angle = crown * Math.PI * 2 / 3 + point.angle; position.set(point.x + Math.sin(angle) * point.size * .8, point.size * (4.3 + crown * .35), point.z + Math.cos(angle) * point.size * .8); scale.set(point.size * (.8 + crown * .06), point.size * (.72 + crown * .1), point.size * .8); matrix.compose(position, rotation, scale); crowns.setMatrixAt(index * 3 + crown, matrix); color.setHSL(.29 + point.tint * .04, .28 + point.tint * .12, .36 + point.tint * .11); crowns.setColorAt(index * 3 + crown, color); }
    }); trunks.castShadow = crowns.castShadow = true; trunks.receiveShadow = crowns.receiveShadow = true; trunks.computeBoundingSphere(); crowns.computeBoundingSphere(); group.add(trunks, crowns);
  }
  const grassPatches: GrassPatch[] = [];
  REGIONAL_SETTLEMENTS.forEach((region, index) => { for (const [dx, dz] of [[-region.radiusX - 100, 110], [region.radiusX + 100, 170], [120, region.radiusZ + 120], [-170, -region.radiusZ - 120]]) { const x = region.center.x + dx, z = region.center.z + dz; if (x > 60 && z > 60 && x < 10960 && z < 9700 && !regionalPointOnRoad({ x, z }, 95) && !reserved({ x, z }, 100)) grassPatches.push({ x, z, width: 170, depth: 130, count: 1100, seed: index * 117 + grassPatches.length }); } });
  countryRoads.slice(0, 6).forEach((route, index) => { const horizontal = route.width > route.depth; for (const amount of [-.3, .2]) { const x = route.x + (horizontal ? route.width * amount : 180), z = route.z + (horizontal ? 180 : route.depth * amount); if (x < 10950 && z < 9700 && !regionalPointOnRoad({ x, z }, 95) && !reserved({ x, z }, 100)) grassPatches.push({ x, z, width: 200, depth: 160, count: 1100, seed: 900 + index }); } });
  return { grassPatches, update: elapsed => { riverMaterial.color.setHSL(.48, .2, .56 + Math.sin(elapsed * .12) * .012); } };
}
