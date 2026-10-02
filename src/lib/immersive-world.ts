import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Tier } from './game';
import { createAssetLibrary, createPerson, WORLD_PALETTE, type PersonModel } from './immersive-assets.ts';
import { getImmersiveLocations, WORLD_SIZE, WORLD_ROADS, HOME_SPAWN, HOME_CAR_SPAWN, type WorldPoint, type WorldCollision, type WorldInteractable, type ImmersiveLocation } from './immersive-locations.ts';
export * from './immersive-locations.ts';
export { createPerson, createVehicle } from './immersive-assets.ts';

export type ImmersiveWorld = { group: THREE.Group; collisions: WorldCollision[]; locations: ImmersiveLocation[]; interactables: WorldInteractable[]; homeSpawn: WorldPoint; carSpawn: WorldPoint; update: (dt: number, elapsed: number) => void; dispose: () => void };

/** A continuous 1.5km town. Rooms are physically inside their buildings and open doors have actual gaps. */
export function buildImmersiveWorld(options: { tier: Tier }): ImmersiveWorld {
  const tier = options.tier, assets = createAssetLibrary(), { box, cylinder, sphere, put, mat, textured } = assets;
  const group = new THREE.Group(); group.name = 'SCOUT continuous open world';
  const collisions: WorldCollision[] = [], locations = getImmersiveLocations(tier);
  const interactables: WorldInteractable[] = locations.flatMap(l => [...l.pointsOfInterest, { id: `door-${l.id}`, type: 'door' as const, label: `Enter ${l.name}`, position: l.door, range: 2.5, locationId: l.id }]);
  const ownedGeometries: THREE.BufferGeometry[] = [], ownedMaterials: THREE.Material[] = [], ownedTextures: THREE.Texture[] = [];
  const residents: { person: PersonModel; path: WorldPoint[]; distance: number; speed: number }[] = [];
  let colliderIndex = 0;
  const solid = (id: string, x: number, z: number, width: number, depth: number, height: number, minY = 0, kind: WorldCollision['kind'] = 'furniture') => collisions.push({ id: `${id}-${colliderIndex++}`, minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, minY, maxY: minY + height, kind });
  const block = (id: string, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material | string, kind: WorldCollision['kind'] = 'wall', collides = true) => { const mesh = put(group, box(w, h, d, material), x, y, z); if (collides) solid(id, x, z, w, d, h, y - h / 2, kind); return mesh; };
  const furniture = (id: string, object: THREE.Group, x: number, z: number, w: number, d: number, h: number, rotation = 0) => { object.rotation.y = rotation; put(group, object, x, 0, z); const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation)); solid(id, x, z, w * c + d * s, d * c + w * s, h); return object; };
  put(group, box(WORLD_SIZE.width + 600, .2, WORLD_SIZE.depth + 600, textured('grass')), 768, -.12, 512).castShadow = false;
  const roadMat = textured('asphalt'), sidewalkMat = textured('stone');
  const road = (x: number, z: number, w: number, d: number, lanes = true) => {
    put(group, box(w + 5.2, .025, d + 5.2, sidewalkMat), x, -.012, z).castShadow = false; put(group, box(w, .03, d, roadMat), x, .01, z).castShadow = false;
    const horizontal = w > d, length = horizontal ? w : d;
    if (lanes) { for (let offset = -length / 2 + 7; offset < length / 2 - 3; offset += 13) put(group, box(horizontal ? 5 : .12, .006, horizontal ? .12 : 5, '#dec996'), x + (horizontal ? offset : 0), .029, z + (horizontal ? 0 : offset)).castShadow = false;
      for (const side of [-1, 1]) put(group, box(horizontal ? w : .1, .007, horizontal ? .1 : d, '#dfdfcf'), x + (horizontal ? 0 : side * (w / 2 - .45)), .03, z + (horizontal ? side * (d / 2 - .45) : 0)).castShadow = false; }
  };
  WORLD_ROADS.forEach(p => road(p.x, p.z, p.width, p.depth));
  const glass = new THREE.MeshPhysicalMaterial({ color: '#abc7bc', roughness: .16, metalness: .05, transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false }); ownedMaterials.push(glass);
  const wallColor = tier === 2 ? '#b8b8ac' : WORLD_PALETTE.plaster;
  const windowWall = (id: string, x: number, z: number, length: number, horizontal: boolean, color: string, height = 4.4) => {
    block(id, x, .52, z, horizontal ? length : .22, 1.04, horizontal ? .22 : length, color);
    block(id, x, height - .42, z, horizontal ? length : .22, .84, horizontal ? .22 : length, color);
    const panels = Math.max(1, Math.floor(length / 4)); for (let i = 0; i <= panels; i++) { const offset = -length / 2 + i * length / panels; block(id, x + (horizontal ? offset : 0), (height - .84 + 1.04) / 2, z + (horizontal ? 0 : offset), horizontal ? .11 : .22, height - 1.88, horizontal ? .22 : .11, '#516d61'); }
    const paneH = height - 1.88; put(group, box(horizontal ? length : .012, paneH, horizontal ? .012 : length, glass), x, 1.04 + paneH / 2, z).castShadow = false;
    solid(`${id}-glass`, x, z, horizontal ? length : .04, horizontal ? .04 : length, paneH, 1.04, 'wall');
    block(id, x, 1.025, z, horizontal ? length : .34, .08, horizontal ? .34 : length, '#9b8f73', 'wall', false);
  };
  const rug = (x: number, z: number, w: number, d: number, color = '#98a993') => { put(group, box(w, .012, d, color), x, .035, z).castShadow = false; };
  const pendant = (x: number, z: number, height: number) => { put(group, cylinder(.012, Math.max(.08, height - 2.85), '#645d48'), x, (height + 2.85) / 2, z); put(group, cylinder(.46, .3, '#5c7464', .23, 16), x, 2.88, z); const bulb = mat('#f5dfaf'); bulb.emissive.set('#f5dfaf'); bulb.emissiveIntensity = .5; put(group, cylinder(.37, .025, bulb), x, 2.738, z); };
  const noticeboard = (x: number, z: number, facing: number, title = 'COMMUNITY') => { const board = new THREE.Group(); board.rotation.y = facing; put(board, box(2.2, 1.3, .09, '#705739'), 0, 1.7, 0); put(board, box(2.05, 1.15, .018, '#b59e71'), 0, 1.7, .055); for (let i = 0; i < 7; i++) { const paper = put(board, box(.29, .31 + i % 2 * .04, .01, ['#ebdfc1', '#cbdcc1', '#e4bd98'][i % 3]), -.72 + i % 4 * .47, 1.84 - Math.floor(i / 4) * .47, .073); paper.rotation.z = (i % 3 - 1) * .09; put(board, sphere(.012, '#997457', 0), paper.position.x, paper.position.y + .11, .087); } put(board, assets.label(title, '', 1.8, .19), 0, 2.29, .09); put(group, board, x, 0, z); };
  const shelf = (x: number, z: number, rotation = 0, width = 2.8) => furniture('bookshelf', assets.bookshelf(width), x, z, width + .1, .5, 2.2, rotation);
  const workDesk = (x: number, z: number, rotation = 0) => { furniture('desk', assets.deskSet(), x, z, 2.2, .85, .86, rotation); const offset = new THREE.Vector3(0, 0, 1.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation); furniture('desk-chair', assets.chair('#859a89', true), x + offset.x, z + offset.z, .68, .68, 1.15, rotation); };
  const kitchen = (x: number, z: number, length: number, rotation = 0) => { const counter = new THREE.Group(); put(counter, box(length, .87, .7, '#c5c6af'), 0, .435, 0); put(counter, box(length + .04, .07, .77, '#756d55'), 0, .905, 0); for (let i = 0; i < Math.floor(length / .7); i++) { put(counter, box(.61, .68, .018, '#a1b59f'), -length / 2 + .35 + i * .7, .47, .365); put(counter, box(.1, .025, .025, '#766d51'), -length / 2 + .35 + i * .7, .65, .383); } furniture('counter', counter, x, z, length, .78, .95, rotation); };
  const thought = (l: ImmersiveLocation, id: string, label: string, dx: number, dz: number, detail: string) => interactables.push({ id, type: 'thought', label, position: { x: l.center.x + dx, z: l.center.z + dz }, range: 3, locationId: l.id, detail });
  const floorMaterial = (width: number, depth: number, stone = false) => {
    const material = textured(stone ? 'stone' : 'wood').clone();
    if (material.map) { const texture = material.map.clone(); texture.repeat.set(width / (stone ? 4 : 2.4), depth / (stone ? 4 : 4.8)); texture.needsUpdate = true; material.map = texture; ownedTextures.push(texture); }
    ownedMaterials.push(material); return material;
  };
  const tabletopDetails = (x: number, z: number, height: number, variant = 0) => {
    put(group, box(.32, .032, .42, ['#5a786e', '#b5986d', '#7c8e8d'][variant % 3]), x - .55, height + .065, z - .16).rotation.y = -.14;
    put(group, box(.29, .009, .39, '#ece3c8'), x - .54, height + .086, z - .16).rotation.y = -.14;
    for (let line = 0; line < 4; line++) put(group, box(.17, .002, .004, '#b1b7a1'), x - .53, height + .092, z - .26 + line * .055);
    put(group, cylinder(.06, .09, '#c4b18b'), x + .45, height + .1, z + .14);
    put(group, cylinder(.049, .005, '#644c32'), x + .45, height + .146, z + .14);
    put(group, box(.12, .012, .018, '#695b41'), x - .24, height + .083, z + .07).rotation.y = .28;
    put(group, assets.plant(.35), x + .7, height + .06, z - .2);
  };
  const entrance = (l: ImmersiveLocation, width: number, height: number, doorWidth: number) => {
    const { x, z } = l.center, front = l.door.z, flank = (width - doorWidth) / 2, facing = front > z ? 1 : -1;
    for (const side of [-1, 1]) { windowWall(`facade-${l.id}`, x + side * (doorWidth / 2 + flank / 2), front, flank, true, wallColor, height); block('entry-jamb', x + side * (doorWidth / 2 + .055), 1.3, front, .11, 2.6, .28, '#516d61'); }
    block('entry-lintel', x, (height + 2.65) / 2, front, doorWidth, height - 2.65, .25, '#6d7765');
    for (const side of [-1, 1]) { const leaf = new THREE.Group(); put(group, leaf, x + side * (doorWidth / 2 - .05), 0, front); leaf.rotation.y = side * Math.PI / 2 * facing; put(leaf, box(doorWidth / 2 - .08, 2.55, .04, glass), side * -.5 * (doorWidth / 2 - .08), 1.28, 0).castShadow = false; put(leaf, box(.055, 2.55, .06, '#4a695a'), side * -(doorWidth / 2 - .08), 1.28, 0); put(leaf, box(.045, .35, .07, '#beaa77'), side * -(doorWidth / 2 - .19), 1.12, .04); solid('open-door', x + side * (doorWidth / 2 - .05), front + facing * (doorWidth / 4 - .04), .08, doorWidth / 2 - .08, 2.55); }
    block('entry-awning', x, 3.3, front + facing * 1.4, Math.min(width / 2, 15), .16, 3, '#5c786a', 'building'); const sign = assets.label(l.name, l.subtitle, Math.min(width - 3, 12), 1.35, tier === 2 ? '#394b46' : '#355b52'); put(group, sign, x, height + .1, front + facing * .2).rotation.y = facing < 0 ? Math.PI : 0;
    for (const side of [-1, 1]) furniture('entry-planter', assets.plant(2.6), x + side * (doorWidth / 2 + 2), front + facing * 1.25, 1.25, 1.25, 2.5);
    if (l.id !== 4) for (const side of [-1, 1]) { put(group, cylinder(.095, .9, '#7a866c'), x + side * .82, .45, front + facing * 2.2); solid('pedestrian-bollard', x + side * .82, front + facing * 2.2, .19, .19, .9); put(group, cylinder(.098, .08, '#e1c884'), x + side * .82, .8, front + facing * 2.2); }
    road(x, (front + l.parking.z) / 2, 5.6, Math.abs(l.parking.z - front) + 2, false);
  };

  function home(l: ImmersiveLocation) {
    const { x, z } = l.center, h = 3.1;
    block('home-floor', x, .025, z, 20, .05, 17, floorMaterial(20, 17), 'building', false); block('home-ceiling', x, h + .08, z, 20.4, .16, 17.4, '#e8e1c9', 'building');
    windowWall('home-east-window', x + 10, z, 17, false, '#e9dfc9', h); windowWall('home-west-window', x - 10, z, 17, false, '#e9dfc9', h); windowWall('home-north-window', x, z - 8.5, 20, true, '#e9dfc9', h);
    block('home-front-west', x - 5.4, h / 2, z + 8.5, 9.2, h, .2, '#e5dbc7'); block('home-front-east', x + 5.4, h / 2, z + 8.5, 9.2, h, .2, '#e5dbc7'); block('home-front-header', x, 2.72, z + 8.5, 1.6, .76, .2, '#e5dbc7'); block('home-open-door', x - .82, 1.17, z + 7.81, .07, 2.34, 1.38, textured('wood'));
    // Real walls with wide, visible openings. The central hallway can reach every room.
    for (const [wallX, northDepth, northZ, southDepth, southZ] of [[x - 2.4, 5.2, z - 5.9, 6.2, z + 1.9], [x + 2, 5, z - 6, 6.5, z + 1.8]]) { block('home-partition-north', wallX, 1.55, northZ, .14, 3.1, northDepth, '#ebe3d0'); block('home-partition-south', wallX, 1.55, southZ, .14, 3.1, southDepth, '#ebe3d0'); block('home-room-header', wallX, 2.73, z - 1.65, .14, .74, 2.5, '#ebe3d0'); }
    block('bath-front-left', x - 8.55, 1.55, z - 3.1, 2.7, 3.1, .14, '#d6ddd0'); block('bath-front-right', x - 3.75, 1.55, z - 3.1, 2.7, 3.1, .14, '#d6ddd0'); block('bath-door-header', x - 6.15, 2.73, z - 3.1, 2.1, .74, .14, '#d6ddd0');
    rug(x - 6.2, z + .1, 5.4, 4.4, '#b2b8a0'); rug(x + 6, z - 3.4, 5.2, 5.6, '#a6b09b');
    furniture('home-bed', assets.bed(), x - 7.4, z + .15, 1.8, 2.25, 1.1); furniture('nightstand', assets.table(.62, .62, .55), x - 8.8, z + .15, .62, .62, .65); furniture('wardrobe', assets.bookshelf(2.3, 2.3), x - 4.2, z + 2.3, 2.4, .5, 2.3);
    furniture('living-sofa', assets.sofa('#809b8d', 3), x - 6.4, z + 5.5, 3.2, 1, 1.1, Math.PI / 2); furniture('coffee-table', assets.table(1.5, .8, .45), x - 4.55, z + 5.5, 1.5, .8, .55, Math.PI / 2); furniture('living-plant', assets.plant(1.6), x - 8.9, z + 3.3, .9, .9, 1.65);
    furniture('home-laptop-desk', assets.deskSet(), x + 5.8, z - 5.1, 2.2, .85, .88); furniture('home-laptop-chair', assets.chair('#849b8d', true), x + 5.8, z - 3.55, .65, .65, 1.15); shelf(x + 8.8, z - 6.6, -Math.PI / 2, 2.8); furniture('study-lamp', assets.floorLamp(), x + 3.1, z - 6.6, .5, .5, 1.9);
    kitchen(x + 5.9, z + 4, 5.6); block('fridge', x + 8.9, .95, z + 3.95, .78, 1.9, .73, '#d0d9c9', 'furniture'); block('fridge-handle', x + 8.61, 1.08, z + 4.345, .035, .58, .03, '#5c6d59', 'furniture', false);
    furniture('dining-table', assets.table(1.4, 1), x + 5.5, z + .7, 1.4, 1, .85); for (const side of [-1, 1]) furniture('dining-chair', assets.chair('#a1865e'), x + 5.5 + side * 1.1, z + .7, .65, .65, 1.15, side * Math.PI / 2);
    block('bathtub', x - 8.3, .37, z - 6.8, 1.1, .74, 1.7, '#dddcd0', 'furniture'); block('bathtub-water', x - 8.3, .725, z - 6.8, .88, .012, 1.46, '#a6c6ba', 'furniture', false); block('bath-vanity', x - 4.1, .41, z - 7, 1.55, .82, .64, '#a4b5a1', 'furniture'); put(group, box(1.25, .035, .5, '#e8e6d8', .04), x - 4.1, .84, z - 7); put(group, box(.95, 1.12, .018, mat('#bdd0c4', .22, .7)), x - 4.1, 1.68, z - 8.28); block('toilet', x - 5.9, .32, z - 7.1, .55, .64, .76, '#e5e3d6', 'furniture'); put(group, box(.57, .46, .15, '#dfded1', .05), x - 5.9, .63, z - 7.47);
    for (const [px, pz] of [[x - 6, z], [x + 6, z], [x, z + 4]]) pendant(px, pz, h); put(group, assets.artwork(0, 1.4, 1), x + 4.5, 1.75, z - 8.37); put(group, assets.label('12', 'A place to begin', 1.9, .62), x + 2.6, 1.9, z + 8.62);
    const homeLight = new THREE.PointLight('#fff0d2', 26, 19, 2); homeLight.position.set(x, 2.55, z + .3); group.add(homeLight);
    tabletopDetails(x + 5.5, z + .7, .78, 1);
    road(l.parking.x, l.parking.z, 22, 15, false); road(220, 517.5, 7.5, 22, false); road(220, 500, 5.5, 23, false);
    for (const side of [-1, 1]) furniture('porch-planter', assets.plant(2), x + side * 6.8, z + 10.9, 1.1, 1.1, 2.1); furniture('porch-bench', assets.bench(), x - 5.5, z + 11, 2.1, .8, 1.25);
  }
  function headquarters(l: ImmersiveLocation) {
    const { x, z } = l.center;
    for (const [px, pz] of [[-19, -15], [-15, -15], [16, -15], [20, -15]]) workDesk(x + px, z + pz);
    for (const side of [-1, 1]) shelf(x + side * 22, z - 19.6, 0, 4.1);
    noticeboard(x + 14, z - 13.8, 0, 'FIELD ASSIGNMENTS'); furniture('career-desk', assets.deskSet(), x - 14, z - 13.8, 2.2, .85, .9); furniture('team-sofa', assets.sofa('#849c8b', 3.6), x + 17, z + 12, 3.8, 1, 1.1); furniture('team-table', assets.table(2.2, 1.1, .5), x + 17, z + 9.5, 2.2, 1.1, .6); kitchen(x + 25, z + 13.7, 4, Math.PI / 2); furniture('week-desk', assets.deskSet(), x - 15, z + 12, 2.2, .85, .9, Math.PI);
    for (const px of [-19, 19]) { furniture('meeting-table', assets.table(4, 1.6), x + px, z + 3, 4, 1.6, .9); for (const side of [-1, 1]) for (const dx of [-1.1, 1.1]) furniture('meeting-chair', assets.chair(), x + px + dx, z + 3 + side * 1.4, .65, .65, 1.2, side > 0 ? 0 : Math.PI); }
  }
  function workshop(l: ImmersiveLocation) {
    const { x, z } = l.center;
    for (const [px, pz] of [[-23, -13], [-23, 13], [20, 13]]) { furniture('maker-workbench', assets.table(4.5, 1.4, .93, true), x + px, z + pz, 4.5, 1.4, 1.1); const tools = new THREE.Group(); put(tools, box(.55, .11, .38, '#788e7b'), 0, .12, 0); put(tools, box(.035, .35, .035, '#424d41'), 0, .35, -.12); put(tools, box(.4, .11, .16, '#4a5b4d'), 0, .56, -.12); put(group, tools, x + px + .7, .98, z + pz); for (let i = 0; i < 4; i++) put(group, cylinder(.08 + i % 2 * .035, .13, '#bf985f'), x + px - 1.2 + i * .27, 1.05, z + pz); }
    for (const side of [-1, 1]) { shelf(x + side * 23, z - 20.8, 0, 6); put(group, assets.artwork(side + 1, 2.8, 1.7), x + side * 21, 2.1, z - 22.85); }
    furniture('maker-display-table', assets.table(3.6, 1.8, .62), x, z - 14, 3.6, 1.8, .75); for (let i = 0; i < 5; i++) put(group, box(.7, .14, .7, i % 2 ? '#aa825b' : '#5c8070'), x, .7 + i * .18, z - 14).rotation.y = i * .34;
    thought(l, 'maker-works', 'Study the work in progress', 0, -11.5, 'Some projects are polished; others are still held together by tape and patience. The unfinished work often tells the more useful story.');
  }
  function gallery(l: ImmersiveLocation) {
    const { x, z } = l.center;
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) put(group, assets.artwork(i + (side > 0 ? 1 : 0), 3.2, 2.1), x + side * 33.85, 2.2, z - 15 + i * 8.5).rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (const [px, pz, i] of [[-21, -13, 0], [-21, 13, 1], [20, 13, 2]]) { block('gallery-plinth', x + px, .55, z + pz, 1.8, 1.1, 1.8, '#d7d6c5', 'furniture'); const sculpture = sphere(.68, ['#78684e', '#5d8477', '#b49b68'][i], 2); sculpture.scale.set(i === 1 ? .8 : 1, 1.5, .75); put(group, sculpture, x + px, 1.8, z + pz).rotation.y = i * .8; }
    furniture('gallery-seating', assets.bench(), x, z + 13, 2.2, .8, 1.25); thought(l, 'gallery-exhibit', 'Read the exhibition note', -20, -10, 'Made Here: twelve ways to notice a familiar place. Look for the detail that tells you a maker has been paying attention.');
  }
  function cafe(l: ImmersiveLocation) {
    const { x, z } = l.center; kitchen(x - 24, z - 15.7, 11.5); const machine = new THREE.Group(); put(machine, box(.9, .44, .42, '#68766c', .035), 0, .22, 0); put(machine, box(.88, .08, .48, '#3e5041'), 0, .03, .05); for (const side of [-1, 1]) put(machine, cylinder(.023, .2, '#b9c1ac'), side * .21, .11, .28); put(group, machine, x - 24, .95, z - 15.7);
    for (const px of [-24, -17, 17, 24]) for (const pz of [-10.5, 13.5]) furniture('cafe-table', assets.cafeSet(), x + px, z + pz, 1.4, 2.7, 1.2);
    shelf(x - 29, z - 20.8, 0, 4.2); put(group, assets.label('JUNCTION', 'Coffee • conversation • a little time', 5.8, 1.45, '#715b41'), x - 24, 2.25, z - 22.8); for (const side of [-1, 1]) furniture('cafe-plant', assets.plant(2), x + side * 31.5, z + 12, 1.2, 1.2, 2.1);
    thought(l, 'cafe-coffee', 'Pause for a coffee', -24, -13, 'You let the coffee cool while the room settles around you. At the next table, a conversation turns from deadlines to a project someone is quietly proud of.');
  }
  function archive(l: ImmersiveLocation) {
    const { x, z } = l.center; for (const px of [-28, -20, 17, 25]) for (const pz of [-15, 14]) shelf(x + px, z + pz, 0, 4.2);
    for (const px of [-22, 22]) { furniture('reading-table', assets.table(4.8, 1.6), x + px, z + 1.4, 4.8, 1.6, .9); for (const side of [-1, 1]) for (const dx of [-1.35, 1.35]) furniture('reading-chair', assets.chair('#879780'), x + px + dx, z + 1.4 + side * 1.4, .65, .65, 1.15, side > 0 ? 0 : Math.PI); for (let i = 0; i < 5; i++) put(group, box(.3, .03, .42, ['#b59e7b', '#5b7970', '#c7b593'][i % 3]), x + px - 1.6 + i * .7, .86, z + 1.4).rotation.y = i * .1; }
    if (tier === 2) for (let i = 0; i < 4; i++) { block('signal-cabinet', x - 29 + i * 2.5, 1, z - 20.3, 1.5, 2, 1.1, '#617266', 'furniture'); for (let row = 0; row < 5; row++) put(group, box(1.32, .22, .028, '#3c5146'), x - 29 + i * 2.5, .25 + row * .37, z - 19.73); }
    thought(l, 'archive-journal', 'Browse the reading table', -22, -1.6, tier === 2 ? 'Several records disagree about what happened, but they agree about who noticed. You make a note of the names that appear more than once.' : 'A margin note catches your eye before the published conclusion does. The person who wrote it has a sharper question than the author.');
  }
  function observatory(l: ImmersiveLocation) {
    const { x, z } = l.center, telescope = new THREE.Group(); for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, leg = cylinder(.055, 1.45, '#626f62'); leg.rotation.z = .36; leg.rotation.y = a; put(telescope, leg, Math.sin(a) * .35, .66, Math.cos(a) * .35); } put(telescope, cylinder(.34, 2.8, '#c5cabb', .31, 24), 0, 1.75, 0).rotation.z = .85; put(telescope, sphere(.22, '#526d5b', 2), 0, 1.75, 0); furniture('telescope', telescope, x, z - 12, 2.7, 2.2, 3.1);
    for (const side of [-1, 1]) { furniture('research-table', assets.table(5, 1.4), x + side * 22, z + 13, 5, 1.4, .9); for (let i = 0; i < 4; i++) put(group, assets.artwork(i, 2, 1.3), x + side * 22 - 6 + i * 4, 2.2, z - 22.8); }
    const geometry = new THREE.SphereGeometry(12, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2); ownedGeometries.push(geometry); put(group, new THREE.Mesh(geometry, mat('#8eaa99', .57, .18)), x, 6.75, z - 10).castShadow = true;
    thought(l, 'observatory-sky', 'Examine the telescope', 0, -9, 'The telescope is pointed at a patch of sky that looks empty from the road. Someone here knows what they expect to find.');
  }
  function pavilion(l: ImmersiveLocation) {
    const { x, z } = l.center; for (const px of [-22, 22]) for (const pz of [-12.5, 13]) furniture('pavilion-table', assets.cafeSet(), x + px, z + pz, 1.4, 2.7, 1.2); for (const px of [-28, 28]) for (const pz of [-15, 14]) furniture('pavilion-plant', assets.plant(2.6), x + px, z + pz, 1.3, 1.3, 2.6);
    const geometry = new THREE.TorusKnotGeometry(.75, .18, 80, 8); ownedGeometries.push(geometry); block('sculpture-plinth', x, .55, z - 13, 2, 1.1, 2, '#d3d6c4', 'furniture'); put(group, new THREE.Mesh(geometry, mat('#9a9166', .42, .32)), x, 1.9, z - 13);
    thought(l, 'pavilion-garden', 'Study the sculpture garden', 0, -10, 'From one angle it seems tangled. From another, the paths fit together. A researcher at the window says their work is much the same.');
  }
  function station(l: ImmersiveLocation) {
    const { x, z } = l.center; for (const px of [-26, -19, 19, 26]) for (const pz of [-13, 13]) furniture('waiting-bench', assets.bench(), x + px, z + pz, 2.2, .8, 1.25, pz < 0 ? Math.PI : 0); put(group, assets.label('LAST STOP', 'Arrivals • departures • things left behind', 7.3, 1.4), x, 2.6, z - 22.8);
    for (let i = 0; i < 5; i++) { block('station-locker', x - 29 + i * 1.8, 1.15, z - 20.5, 1.6, 2.3, .72, '#7a8978', 'furniture'); put(group, box(.17, .025, .035, '#d0b87c'), x - 29 + i * 1.8, 1.3, z - 20.1); }
    thought(l, 'station-timetable', 'Read the old timetable', 0, -19.5, 'One service has been crossed out by hand. The regulars can tell you when it stopped running, and who was waiting the last time it arrived.');
  }
  function market(l: ImmersiveLocation) {
    const { x, z } = l.center; for (const px of [-24, 22]) for (const pz of [-14, 14]) { furniture('market-stall', assets.table(5, 1.4, .9, true), x + px, z + pz, 5, 1.4, 1.05); block('market-awning', x + px, 2.45, z + pz, 5.7, .12, 2.2, px < 0 ? '#778d6b' : '#a98764', 'furniture'); for (const side of [-1, 1]) block('market-post', x + px + side * 2.65, 1.2, z + pz, .065, 2.4, .065, '#5c6450'); for (let i = 0; i < 6; i++) put(group, box(.38, .13 + i % 2 * .1, .42, ['#b69b65', '#758d6d', '#b58063'][i % 3]), x + px - 1.8 + i * .66, 1.05, z + pz); }
    put(group, assets.label('AFTER HOURS', 'Familiar faces. A different kind of work.', 9.2, 1.3), x, 2.45, z - 22.8); thought(l, 'market-note', 'Listen at the market', -23, -11, 'A repair, a favor, an introduction: the evening has its own economy. People talk more freely after you have taken the time to look around.');
  }
  function gas(l: ImmersiveLocation) {
    const { x, z } = l.center; kitchen(x - 6, z - 5.8, 8); shelf(x + 10.4, z - 2.5, -Math.PI / 2, 4.6); const px = l.parking.x, pz = l.parking.z;
    road(px, pz, 43, 31, false); road(px, (pz + 650) / 2, 11, 650 - pz + 4, false); block('fuel-canopy', px, 4.35, pz, 24, .3, 15, '#d4d7c1', 'building'); block('fuel-canopy-trim', px, 4.5, pz, 24.4, .1, 15.4, '#9d8656', 'building'); for (const side of [-1, 1]) block('fuel-column', px + side * 10.5, 2.1, pz, .22, 4.2, .22, '#858d76', 'building');
    for (const side of [-1, 1]) { const pump = new THREE.Group(); put(pump, box(.68, .8, .44, '#608977', .05), 0, .4, 0); put(pump, box(.66, .75, .42, '#d5d9bc', .06), 0, 1.14, 0); put(pump, assets.label('87', 'Regular', .5, .29), 0, 1.27, .23); put(pump, box(.21, .07, .026, '#607c6c'), .07, .92, .234); const geometry = new THREE.TorusGeometry(.22, .027, 6, 20, Math.PI * 1.55); ownedGeometries.push(geometry); put(pump, new THREE.Mesh(geometry, mat('#324d3e')), .37, .8, .02).rotation.z = -.1; put(pump, box(.06, .19, .08, '#314b3e'), .34, 1.13, .08); furniture('fuel-pump', pump, px + side * 4.1, pz, .9, .65, 1.6); block('fuel-island', px + side * 4.1, .055, pz, 1.2, .11, 2.5, '#b3baa2', 'furniture'); }
    put(group, assets.label('HIGHWAY FUEL', 'A full tank. A quieter road.', 8, 1.4), px + 18, 3.9, pz + 5); for (const column of [px + 15.2, px + 20.8]) put(group, cylinder(.055, 3.3, '#617661'), column, 1.65, pz + 5);
  }
  function building(l: ImmersiveLocation) {
    if (l.id === 5) { home(l); return; }
    const b = l.footprint, w = b.maxX - b.minX, d = b.maxZ - b.minZ, { x, z } = l.center, h = l.id === 4 ? 3.8 : l.theme === 'observatory' ? 6.4 : 4.6;
    block('venue-floor', x, .023, z, w, .046, d, floorMaterial(w, d, l.theme === 'gallery'), 'building', false); block('venue-roof', x, h + .12, z, w + .8, .24, d + .8, '#c9cdb9', 'building'); block('venue-roof-trim', x, h + .35, z, w + 1.05, .14, d + 1.05, '#627867', 'building');
    windowWall('venue-west', b.minX, z, d, false, wallColor, h); windowWall('venue-east', b.maxX, z, d, false, wallColor, h); windowWall('venue-rear', x, l.door.z > z ? b.minZ : b.maxZ, w, true, wallColor, h); entrance(l, w, h, l.id === 4 ? 2.4 : 3.6);
    if (l.id === 4) { gas(l); return; }
    for (const side of [-1, 1]) { block('venue-partition-back', x + side * 11, 1.55, z - 14.25, .16, 3.1, 14.5, '#dfdfce'); block('venue-partition-front', x + side * 11, 1.55, z + 16.25, .16, 3.1, 11.5, '#dfdfce'); block('venue-partition-header', x + side * 11, 2.82, z - 1.25, .16, .56, 12.5, '#dfdfce'); }
    for (const [dx, dz] of [[-22, -12], [0, -10], [22, -12], [-22, 13], [0, 13], [22, 13]]) pendant(x + dx, z + dz, h);
    const light = new THREE.PointLight(tier === 2 ? '#ffe5bc' : '#fff2d4', 16, 45, 2); light.position.set(x, 3.25, z); group.add(light);
    rug(x, z, 17.5, 32, tier === 2 ? '#6d8475' : '#acb39c'); noticeboard(x - 24, z + 15.4, Math.PI, tier === 2 ? 'LOCAL NOTES' : 'COMMUNITY'); for (const side of [-1, 1]) furniture('hall-plant', assets.plant(2.3), x + side * 8.8, z + 17, 1.1, 1.1, 2.2); workDesk(x + 24, z - 15.2);
    if (l.id === 0) headquarters(l); else if (l.theme === 'workshop') workshop(l); else if (l.theme === 'gallery') gallery(l); else if (l.theme === 'cafe') cafe(l); else if (l.theme === 'archive' || l.theme === 'signal') archive(l); else if (l.theme === 'observatory') observatory(l); else if (l.theme === 'pavilion') pavilion(l); else if (l.theme === 'station') station(l); else market(l);
    const receptionZ = z + (l.door.z > z ? 14 : -14);
    furniture('community-information-table', assets.table(4.5, 1.25, .86), x, receptionZ, 4.5, 1.25, 1.2);
    tabletopDetails(x, receptionZ, .86, l.id);
    put(group, assets.label(l.id === 0 ? 'WELCOME' : 'TAKE YOUR TIME', l.id === 0 ? 'Start with a thoughtful assignment' : 'Look around. Say hello. Listen.', 2.7, .55), x, 1.42, receptionZ).rotation.y = l.door.z > z ? 0 : Math.PI;
    if (!['cafe', 'archive', 'signal', 'market'].includes(l.theme)) for (const side of [-1, 1]) {
      furniture('project-table', assets.table(3.2, 1.3, .8), x + side * 18, z - 10, 3.2, 1.3, .95);
      tabletopDetails(x + side * 18, z - 10, .8, side + 2);
      for (const offset of [-.8, .8]) furniture('project-chair', assets.chair('#b3a07b'), x + side * 18 + offset, z - 8.35, .65, .65, 1.1);
    }
    for (const side of [-1, 1]) { shelf(x + side * (w / 2 - .7), z + 1.5, side > 0 ? -Math.PI / 2 : Math.PI / 2, 3.6); furniture('reading-sofa', assets.sofa('#9aab94', 3.1), x + side * 24, z + 17.7, 3.3, 1, 1.1); furniture('reading-lamp', assets.floorLamp(), x + side * 29, z + 18.8, .5, .5, 1.9); }
    const face = l.door.z > z ? 1 : -1; for (const side of [-1, 1]) furniture('porch-bench', assets.bench(), x + side * 9, l.door.z + face * 4, 2.2, .8, 1.25, face < 0 ? Math.PI : 0);
    road(l.parking.x, l.parking.z, 45, 25, false); for (let i = -3; i <= 3; i++) put(group, box(.1, .005, 5.7, '#e6dfbc'), x + i * 3.5, .042, l.parking.z + 5).castShadow = false; const access = x < 768 ? 500 : 1040; road((access + x) / 2, l.parking.z, Math.abs(access - x) + 12, 9.2, false);
    for (const side of [-1, 1]) { put(group, assets.label('P', 'Visitor parking', 1.15, .8), x + side * 19, 1.9, l.parking.z + 11); put(group, cylinder(.035, 1.9, '#566c5a'), x + side * 19, .95, l.parking.z + 11); }
  }
  locations.forEach(building);

  // A coherent neighborhood, not a few venues floating in an empty world.
  const accessRoads = locations.filter(l => l.id < 4).map(l => { const access = l.parking.x < 768 ? 500 : 1040; return { x: (access + l.parking.x) / 2, z: l.parking.z, width: Math.abs(access - l.parking.x) + 12, depth: 9.2 }; });
  const nearDriveway = (x: number, z: number, pad: number) => accessRoads.some(p => Math.abs(x - p.x) < p.width / 2 + pad && Math.abs(z - p.z) < p.depth / 2 + pad);
  const nearLocation = (x: number, z: number, pad = 40) => nearDriveway(x, z, 15) || locations.some(l => x > l.footprint.minX - pad && x < l.footprint.maxX + pad && z > l.footprint.minZ - pad && z < l.footprint.maxZ + pad || Math.hypot(x - l.parking.x, z - l.parking.z) < pad + 20);
  function neighborhoodBuilding(x: number, z: number, variant: number, facing: number) {
    const w = 12 + variant % 3 * 3.5, d = 11 + variant % 2 * 4, h = 3.2 + variant % 3 * 1.2, house = new THREE.Group(); house.rotation.y = facing;
    put(house, box(w, h, d, ['#d9cbb1', '#af8e75', '#9faea0', '#c8c6b2', '#aaa991'][variant % 5]), 0, h / 2, 0); put(house, box(w + .45, .12, d + .4, '#6b7964'), 0, h + .05, 0);
    if (variant % 3 !== 0) { const shape = new THREE.Shape(); shape.moveTo(-w / 2 - .3, 0); shape.lineTo(0, w * .28); shape.lineTo(w / 2 + .3, 0); shape.closePath(); const geometry = new THREE.ExtrudeGeometry(shape, { depth: d + .6, bevelEnabled: false }); ownedGeometries.push(geometry); put(house, new THREE.Mesh(geometry, mat(['#718473', '#85745c', '#607772'][variant % 3])), 0, h, -d / 2 - .3).castShadow = true; put(house, box(.7, 1.4, .7, '#9a7d64'), w / 4, h + 1, 1); }
    for (const px of [-w / 3, w / 3]) { put(house, box(2, 1.35, .055, '#526c60'), px, 1.85, d / 2 + .036); put(house, box(1.8, 1.15, .06, '#adc8b5'), px, 1.85, d / 2 + .077); put(house, box(2.03, .12, .18, '#e3d6b7'), px, 1.18, d / 2 + .09); put(house, box(.05, 1.15, .066, '#5a7461'), px, 1.85, d / 2 + .082); put(house, box(1.8, .05, .066, '#5a7461'), px, 1.85, d / 2 + .083); }
    put(house, box(1.1, 2.15, .055, '#537365'), 0, 1.075, d / 2 + .04); put(house, sphere(.045, '#bca26b'), -.36, 1.02, d / 2 + .094);
    if (variant % 3 === 0) put(house, assets.label(['RIVER & ROW', 'HARBOR BOOKS', 'FIELD SUPPLY', 'LANTERN REPAIR'][variant % 4], 'Independent since 1982', Math.min(8, w - 1), .9, '#456756'), 0, h - .55, d / 2 + .11);
    put(group, house, x, 0, z); const c = Math.abs(Math.cos(facing)), s = Math.abs(Math.sin(facing)); solid('neighborhood-building', x, z, w * c + d * s, d * c + w * s, h + w * .28, 0, 'building');
    const garden = new THREE.Vector3(w / 2 + 2, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), facing); furniture('garden-planter', assets.plant(2), x + garden.x, z + garden.z, 1.2, 1.2, 2.2);
  }
  let houseIndex = 0;
  for (const street of [500, 1040]) for (const side of [-1, 1]) for (let z = 165; z < 930; z += 67) { const x = street + side * 36; if (Math.abs(z - 350) < 32 || Math.abs(z - 650) < 32 || Math.abs(z - 525) < 24 || nearLocation(x, z)) continue; neighborhoodBuilding(x, z, houseIndex++, side > 0 ? Math.PI / 2 : -Math.PI / 2); }
  for (const street of [350, 650]) for (const side of [-1, 1]) for (let x = 185; x < 1370; x += 68) { const z = street + side * 38; if ([500, 768, 1040].some(v => Math.abs(x - v) < 37) || nearLocation(x, z, 22)) continue; neighborhoodBuilding(x, z, houseIndex++, side > 0 ? Math.PI : 0); }
  for (const x of [500, 768, 1040]) for (const z of [350, 650]) { for (const side of [-1, 1]) for (let stripe = -3; stripe <= 3; stripe++) put(group, box(.55, .008, 5.1, '#d8d9c4'), x + stripe, .04, z + side * 10).castShadow = false; const sign = new THREE.Group(); put(sign, cylinder(.045, 3.1, '#526951'), 0, 1.55, 0); put(sign, assets.label(x < 768 ? 'OLD QUARTER' : 'EAST DISTRICT', 'Slow down • look around', 4.5, 1.1), 0, 2.7, 0); furniture('route-sign', sign, x + 11, z + 12, .14, .14, 3.3); }
  for (const [x, z] of [[538, 475], [1002, 490], [710, 620], [1260, 370]]) { const stop = new THREE.Group(); put(stop, box(3.8, .12, 1.9, '#597160'), 0, 2.5, 0); for (const side of [-1, 1]) put(stop, cylinder(.04, 2.5, '#596b52'), side * 1.75, 1.25, .75); put(stop, box(3.8, 1.45, .018, glass), 0, 1.43, .78); put(stop, assets.bench(), 0, 0, .32); furniture('bus-shelter', stop, x, z, 3.9, 1.7, 2.7); put(group, assets.label('BUS', 'Take the scenic route', 1.1, .5), x + 2.5, 2.3, z); put(group, cylinder(.04, 2.4, '#667454'), x + 2.5, 1.2, z); }
  for (const x of [500, 1040]) for (let z = 145; z < 925; z += 46) if (!nearLocation(x + 10, z, 5) && ![110, 350, 525, 650, 950].some(crossing => Math.abs(z - crossing) < 12)) furniture('street-lamp', assets.streetLamp(), x + 10, z, .28, .28, 5.3);

  // The river sits east of the scenic walking path and west of the outer through-road.
  const riverGeometry = new THREE.PlaneGeometry(65, 650, 4, 20), riverMaterial = new THREE.MeshStandardMaterial({ color: '#739e9c', roughness: .28, metalness: .25, transparent: true, opacity: .93 }); ownedGeometries.push(riverGeometry); ownedMaterials.push(riverMaterial); const river = new THREE.Mesh(riverGeometry, riverMaterial); river.rotation.x = -Math.PI / 2; river.position.set(1354, -.045, 525); river.receiveShadow = true; group.add(river);
  road(1298, 530, 4.2, 735, false);
  for (let z = 230; z < 870; z += 125) { furniture('riverside-bench', assets.bench(), 1291, z, 2.2, .8, 1.25, Math.PI / 2); furniture('riverside-lamp', assets.streetLamp(), 1293, z + 18, .3, .3, 5.3); }
  interactables.push({ id: 'river-overlook', type: 'thought', label: 'Watch the river for a while', position: { x: 1290, z: 480 }, range: 4, locationId: -1, detail: 'The river keeps its own schedule. Behind you, the neighborhood carries on: doors opening, cups being set down, people finding their next piece of work.' });
  for (let z = 182; z < 880; z += 12) {
    if ([350, 650].some(crossing => z <= crossing + 16 && z + 12 >= crossing - 16)) continue;
    block('river-rail-post', 1308, .55, z, .12, 1.1, .12, '#796b4d', 'furniture'); block('river-rail', 1308, .72, z + 6, .09, .11, 12, '#8d7c58', 'furniture');
  }
  for (const z of [350, 650]) {
    // A real low bridge deck and side rails continue each street across the river.
    block('river-bridge-deck', 1354, -.2, z, 100, .32, 20, '#8c9b84', 'building');
    for (const side of [-1, 1]) {
      block('river-bridge-rail', 1347, .8, z + side * 10, 82, .13, .13, '#72836c', 'furniture');
      for (let x = 1306; x <= 1386; x += 8) block('river-bridge-post', x, .55, z + side * 10, .16, 1.1, .16, '#6b7e68', 'furniture');
    }
  }
  // Visible trunks have matching physical radii. Foliage creates shade, never an invisible ground barrier.
  let seed = 831 + tier * 271; const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const treePoints: { x: number; z: number; size: number; tint: number; angle: number }[] = [];
  const isRoad = (x: number, z: number, pad: number) => nearDriveway(x, z, pad) || WORLD_ROADS.some(p => Math.abs(x - p.x) < p.width / 2 + pad && Math.abs(z - p.z) < p.depth / 2 + pad);
  for (let i = 0; i < 1450; i++) { const x = 45 + rng() * 1445, z = 45 + rng() * 940; if (isRoad(x, z, 9) || nearLocation(x, z, 28) || x > 1280 && x < 1420 || Math.abs(z - 266) < 18 && (x > 325 && x < 525 || x > 1015 && x < 1240) || z > 690 && z < 790 && (x > 325 && x < 525 || x > 1015 && x < 1240)) continue; const size = 1.2 + rng() * 1.4; treePoints.push({ x, z, size, tint: rng(), angle: rng() * Math.PI * 2 }); solid('tree-trunk', x, z, .55 * size, .55 * size, 5.3 * size, 0, 'tree'); }
  const trunkGeometry = new THREE.CylinderGeometry(.14, .27, 4.3, 7), crownGeometry = new THREE.IcosahedronGeometry(2.8, 1); ownedGeometries.push(trunkGeometry, crownGeometry); const patches = new Map<string, typeof treePoints>(); treePoints.forEach(p => { const key = `${Math.floor(p.x / 240)}:${Math.floor(p.z / 240)}`, patch = patches.get(key) ?? []; patch.push(p); patches.set(key, patch); });
  const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), rot = new THREE.Quaternion(), scale = new THREE.Vector3();
  for (const points of patches.values()) { const trunks = new THREE.InstancedMesh(trunkGeometry, mat('#76664b'), points.length), crowns = new THREE.InstancedMesh(crownGeometry, mat('#648264'), points.length * 3); points.forEach((p, i) => { pos.set(p.x, p.size * 2.15, p.z); scale.setScalar(p.size); rot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.angle); matrix.compose(pos, rot, scale); trunks.setMatrixAt(i, matrix); for (let c = 0; c < 3; c++) { const a = c * Math.PI * 2 / 3 + p.angle; pos.set(p.x + Math.sin(a) * p.size * .8, p.size * (4.3 + c * .24), p.z + Math.cos(a) * p.size * .8); scale.set(p.size * (.8 + c * .06), p.size * (.75 + c * .09), p.size * .8); matrix.compose(pos, rot, scale); crowns.setMatrixAt(i * 3 + c, matrix); crowns.setColorAt(i * 3 + c, new THREE.Color().setHSL(.265 + p.tint * .06, .17 + p.tint * .1, .29 + p.tint * .12)); } }); trunks.castShadow = crowns.castShadow = trunks.receiveShadow = crowns.receiveShadow = true; trunks.computeBoundingSphere(); crowns.computeBoundingSphere(); group.add(trunks, crowns); }
  for (let i = 0; i < 18; i++) { const hill = sphere(100 + i % 4 * 30, ['#7b9276', '#8b9b7b', '#697f6c'][i % 3], 2); hill.scale.set(1.8, .6 + i % 3 * .1, 1.2); const angle = i / 18 * Math.PI * 2; put(group, hill, 768 + Math.sin(angle) * 1200, -15, 512 + Math.cos(angle) * 950).castShadow = false; }
  for (const z of [50, 985]) for (let x = 55; x < 1490; x += 25) { block('town-fence-post', x, .6, z, .16, 1.2, .16, '#8c8166', 'furniture'); block('town-fence-rail', x + 12.5, .8, z, 25, .14, .12, '#988869', 'furniture'); }
  for (const x of [50, 1485]) for (let z = 55; z < 985; z += 25) { block('town-fence-post', x, .6, z, .16, 1.2, .16, '#8c8166', 'furniture'); block('town-fence-rail', x, .8, z + 12.5, .12, .14, 25, '#988869', 'furniture'); }

  // Static detail shares spatial material batches; the animated residents keep their articulated parts.
  batchStaticGeometry(group, ownedGeometries);
  const paths: WorldPoint[][] = [
    [{ x: 508, z: 395 }, { x: 508, z: 435 }, { x: 508.3, z: 435 }, { x: 508.3, z: 395 }],
    [{ x: 1032, z: 548 }, { x: 1032, z: 588 }, { x: 1031.7, z: 588 }, { x: 1031.7, z: 548 }],
    [{ x: 1298, z: 330 }, { x: 1298, z: 410 }, { x: 1296, z: 410 }, { x: 1296, z: 330 }],
    [{ x: 800, z: 641.5 }, { x: 826, z: 641.5 }, { x: 826, z: 641 }, { x: 800, z: 641 }],
  ];
  paths.forEach((path, index) => { const person = createPerson({ avatar: index * 3 + tier }); group.add(person.group); residents.push({ person, path, distance: index * 13, speed: .9 + index % 2 * .15 }); });
  locations.filter(l => l.id > 0 && l.id < 4).forEach((l, index) => { const person = createPerson({ avatar: 7 + index }); group.add(person.group); residents.push({ person, path: [{ x: l.center.x - 4, z: l.center.z - 10 }, { x: l.center.x + 4, z: l.center.z - 10 }, { x: l.center.x + 4, z: l.center.z + 12 }, { x: l.center.x - 4, z: l.center.z + 12 }], distance: index * 11, speed: .6 }); });
  const update = (dt: number, elapsed: number) => { riverMaterial.color.setHSL(.48, .17, .51 + Math.sin(elapsed * .1) * .015); residents.forEach(r => { r.distance += Math.min(dt, .05) * r.speed; let total = 0; const lengths = r.path.map((a, i) => { const b = r.path[(i + 1) % r.path.length], length = Math.hypot(a.x - b.x, a.z - b.z); total += length; return length; }); let distance = r.distance % total; for (let i = 0; i < lengths.length; i++) { if (distance > lengths[i]) { distance -= lengths[i]; continue; } const a = r.path[i], b = r.path[(i + 1) % r.path.length], amount = distance / lengths[i]; r.person.group.position.set(a.x + (b.x - a.x) * amount, 0, a.z + (b.z - a.z) * amount); r.person.group.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z)); break; } r.person.update(r.speed, elapsed); }); };
  update(0, 0); let disposed = false;
  return { group, collisions, locations, interactables, homeSpawn: { ...HOME_SPAWN }, carSpawn: { ...HOME_CAR_SPAWN }, update, dispose: () => { if (disposed) return; disposed = true; residents.forEach(r => r.person.dispose()); assets.dispose(); new Set(ownedGeometries).forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); ownedTextures.forEach(t => t.dispose()); group.clear(); } };
}

function batchStaticGeometry(root: THREE.Group, owned: THREE.BufferGeometry[]) {
  root.updateMatrixWorld(true);
  const batches = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[]; meshes: THREE.Mesh[]; castShadow: boolean; receiveShadow: boolean }>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material) || object.material.transparent) return;
    const p = new THREE.Vector3(); object.getWorldPosition(p); const key = `${object.material.uuid}|${Math.floor(p.x / 240)}|${Math.floor(p.z / 240)}|${object.castShadow}`;
    const batch = batches.get(key) ?? { material: object.material, geometries: [] as THREE.BufferGeometry[], meshes: [] as THREE.Mesh[], castShadow: object.castShadow, receiveShadow: object.receiveShadow };
    const transformed = object.geometry.clone().applyMatrix4(object.matrixWorld); transformed.clearGroups(); const geometry = transformed.index ? transformed.toNonIndexed() : transformed; if (geometry !== transformed) transformed.dispose(); geometry.deleteAttribute('tangent');
    // All builders have position, normal and uv; procedural polyhedra also expose UV in Three.
    batch.geometries.push(geometry); batch.meshes.push(object); batches.set(key, batch);
  });
  for (const batch of batches.values()) { if (batch.meshes.length < 3) { batch.geometries.forEach(g => g.dispose()); continue; } const geometry = mergeGeometries(batch.geometries, false); batch.geometries.forEach(g => g.dispose()); if (!geometry) continue; geometry.computeBoundingSphere(); owned.push(geometry); const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = batch.castShadow; mesh.receiveShadow = batch.receiveShadow; root.add(mesh); batch.meshes.forEach(m => m.removeFromParent()); }
}
