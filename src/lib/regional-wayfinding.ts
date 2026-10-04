import * as THREE from 'three';
import type { AssetLibrary } from './immersive-assets.ts';
import type { ImmersiveLocation, WorldCollision, WorldPoint } from './immersive-locations.ts';
import { REGIONAL_SERVICE_POINTS, REGIONAL_SETTLEMENTS, WORLD_ROADS, WORLD_SIZE, type RegionalRoad, type RegionalSettlement } from './regional-roads.ts';

type SignArrow = 'left' | 'right' | 'straight' | 'none';
type SignMotif = RegionalSettlement['character'] | 'service' | 'route';
export type RoadsideSign = {
  id: string; roadId: string; kind: 'exit' | 'welcome' | 'service' | 'venue'; position: WorldPoint;
  facing: number; direction: 1 | -1; title: string; subtitle: string; arrow: SignArrow; motif: SignMotif;
  width: number; height: number; faceY: number; accent: string;
};
const INK = '#234b56', CREAM = '#f3e8ce', BRASS = '#d2ae69';
const TILE_WIDTH = 512, TILE_HEIGHT = 128, ATLAS_COLUMNS = 4;
const roadById = (id: string) => WORLD_ROADS.find(road => road.id === id)!;
const horizontal = (road: RegionalRoad) => road.width > road.depth;

/** Boards face the incoming lane and stand outside both the lane and its sidewalk strip. */
function approach(id: string, roadId: string, along: number, direction: 1 | -1, content: Pick<RoadsideSign, 'kind' | 'title' | 'subtitle' | 'arrow' | 'motif' | 'accent'>): RoadsideSign {
  const road = roadById(roadId), across = (horizontal(road) ? road.depth : road.width) / 2 + 8.5;
  const highway = content.kind === 'exit', width = highway ? 6.8 : content.kind === 'welcome' ? 5.8 : 5.2;
  return {
    id, roadId, ...content, direction, width, height: highway ? 1.7 : 1.45, faceY: highway ? 3.85 : 2.7,
    position: horizontal(road) ? { x: along, z: road.z + direction * across } : { x: road.x - direction * across, z: along },
    facing: horizontal(road) ? -direction * Math.PI / 2 : direction > 0 ? Math.PI : 0,
  };
}

/** Original region wayfinding; coordinates follow the road contract rather than floating destination labels. */
export function regionalWayfindingPlan(locations: readonly ImmersiveLocation[]): RoadsideSign[] {
  const signs: RoadsideSign[] = [];
  const exits: [string, string, number, string, string, SignMotif][] = [
    ['eastmere', 'interstate-7', 3150, 'Eastmere Campus', 'EXIT 3 · COLLEGE AVENUE', 'campus'],
    ['bellweather', 'interstate-7', 4900, 'Bellweather', 'EXIT 5 · STUDIOS & OLD TOWN', 'arts'],
    ['aster', 'interstate-7', 6500, 'Aster Bay', 'COASTAL PARKWAY', 'coast'],
    ['meridian', 'interstate-7', 10000, 'Meridian City', 'CITY & LIGHTHOUSE COAST', 'city'],
    ['juniper', 'interstate-19', 6100, 'Juniper Vale', 'VALLEY ROUTE · WEST', 'village'],
    ['larkspur', 'interstate-19', 8200, 'Larkspur Gardens', 'SCENIC ROUTE · EAST', 'garden'],
  ];
  exits.forEach(([id, roadId, junction, title, subtitle, motif]) => {
    for (const direction of [1, -1] as const) {
      const road = roadById(roadId), axis = horizontal(road) ? 'x' : 'z', extent = horizontal(road) ? road.width : road.depth;
      const approachLength = direction > 0 ? junction - (road[axis] - extent / 2) : road[axis] + extent / 2 - junction;
      // The northbound Larkspur junction has only 100 m of road beyond it. Keep its advance board on that actual approach.
      const advance = Math.min(190, Math.max(0, approachLength - 20));
      const toRight = roadId === 'interstate-7' || id === 'juniper';
      signs.push(approach(`${id}-exit-${direction}`, roadId, junction - direction * advance, direction, { kind: 'exit', title, subtitle, arrow: toRight === (direction === 1) ? 'right' : 'left', motif, accent: BRASS }));
    }
  });
  const gateways: [string, string, number, 1 | -1][] = [
    ['cirrus', 'harbor-office', 1010, -1], ['cirrus', 'harbor-east', 1030, -1],
    ['eastmere', 'eastmere-avenue', 1210, 1], ['eastmere', 'eastmere-avenue', 1890, -1],
    ['bellweather', 'bellweather-exit', 2260, 1], ['bellweather', 'bellweather-exit', 3200, -1],
    ['aster', 'coastal-parkway', 2250, 1], ['aster', 'coastal-parkway', 3460, -1],
    ['juniper', 'valley-route', 2140, 1], ['juniper', 'valley-route', 3240, -1],
    ['larkspur', 'garden-route', 5860, 1], ['larkspur', 'garden-route', 7140, -1],
    ['meridian', 'meridian-route', 5700, 1], ['meridian', 'meridian-route', 7260, -1],
  ];
  gateways.forEach(([id, roadId, along, direction]) => {
    const region = REGIONAL_SETTLEMENTS.find(region => region.id === id)!;
    const subtitle: Record<RegionalSettlement['character'], string> = { harbor: 'BY THE RIVER · BY THE SEA', campus: 'A PLACE FOR CURIOSITY', arts: 'MADE BY HAND · SHARED WITH CARE', coast: 'THE TIDEGLASS COAST', village: 'ORCHARDS · OLD MILL · OPEN DOORS', garden: 'GROW AT YOUR OWN PACE', city: 'CIVIC QUARTER · CITY GARDENS' };
    signs.push(approach(`${id}-welcome-${roadId}-${direction}`, roadId, along, direction, { kind: 'welcome', title: region.name, subtitle: subtitle[region.character], arrow: 'none', motif: region.character, accent: region.colors[2] }));
  });
  REGIONAL_SERVICE_POINTS.forEach(service => {
    const roadId = service.id === 'highway-fuel' ? 'harbor-center' : service.id === 'eastmere-fuel' ? 'interstate-19' : service.id === 'bellweather-fuel' ? 'bellweather-exit' : service.id === 'aster-fuel' ? 'coastal-parkway' : 'meridian-route';
    for (const direction of [1, -1] as const) signs.push(approach(`${service.id}-sign-${direction}`, roadId, service.access.z - direction * 60, direction, { kind: 'service', title: service.name, subtitle: 'FUEL · REPAIRS', arrow: direction === 1 ? 'left' : 'right', motif: 'service', accent: '#d77b64' }));
  });
  locations.filter(location => location.id >= 1 && location.id <= 3).forEach(location => {
    const roadId = location.id === 1 ? 'eastmere-avenue' : location.id === 2 ? 'bellweather-avenue' : 'coastal-parkway';
    const region = REGIONAL_SETTLEMENTS.find(region => region.id === location.regionId)!;
    for (const direction of [1, -1] as const) signs.push(approach(`venue-${location.id}-sign-${direction}`, roadId, location.access.z - direction * 55, direction, { kind: 'venue', title: location.name, subtitle: 'VISITOR PARKING', arrow: direction === 1 ? 'left' : 'right', motif: region.character, accent: region.colors[2] }));
  });
  return signs;
}

export function roadsideSignPosts(sign: RoadsideSign): WorldPoint[] {
  const dx = Math.cos(sign.facing) * sign.width * .36, dz = -Math.sin(sign.facing) * sign.width * .36;
  const offsetX = -.065 * Math.sin(sign.facing), offsetZ = -.065 * Math.cos(sign.facing);
  return [{ x: sign.position.x - dx + offsetX, z: sign.position.z - dz + offsetZ }, { x: sign.position.x + dx + offsetX, z: sign.position.z + dz + offsetZ }];
}

function safePlacement(sign: RoadsideSign, collisions: readonly WorldCollision[]): RoadsideSign | undefined {
  const road = roadById(sign.roadId), longAxis = horizontal(road) ? 'x' : 'z', extent = horizontal(road) ? road.width : road.depth;
  // Shift along the same shoulder if a pre-existing tree or wall occupies a support, without crossing a junction.
  for (const shift of [0, -12, 12, -24, 24, -36, 36, -48, 48, -60, 60]) {
    const candidate = { ...sign, position: { ...sign.position, [longAxis]: sign.position[longAxis] + shift } };
    if (Math.abs(candidate.position[longAxis] - road[longAxis]) > extent / 2 - 14) continue;
    const safe = roadsideSignPosts(candidate).every(point => point.x > 10 && point.z > 10 && point.x < WORLD_SIZE.width - 10 && point.z < WORLD_SIZE.depth - 10
      && !WORLD_ROADS.some(other => Math.abs(point.x - other.x) < other.width / 2 + 3.3 && Math.abs(point.z - other.z) < other.depth / 2 + 3.3)
      && !collisions.some(solid => solid.minY < 1.8 && solid.maxY > .2 && point.x > solid.minX - .8 && point.x < solid.maxX + .8 && point.z > solid.minZ - .8 && point.z < solid.maxZ + .8));
    if (safe) return candidate;
  }
  return undefined;
}

function motif(ctx: CanvasRenderingContext2D, kind: SignMotif, accent: string, x: number, y: number) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 3.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (points: number[][]) => { ctx.beginPath(); points.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke(); };
  const leaf = (px: number, py: number, rotation: number) => { ctx.save(); ctx.translate(px, py); ctx.rotate(rotation); ctx.beginPath(); ctx.ellipse(0, 0, 5, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  if (kind === 'campus') { line([[-24, 17], [-24, -10], [-2, -6], [-2, 22], [-24, 17], [0, 22], [24, 17], [24, -10], [2, -6], [2, 22]]); line([[-16, -1], [-9, 1]]); line([[9, 1], [16, -1]]); }
  else if (kind === 'city') { for (const [px, top, width] of [[-19, -7, 10], [-3, -22, 12], [15, 0, 10]]) { ctx.strokeRect(px, top, width, 25 - top); for (let yy = top + 8; yy < 20; yy += 9) line([[px + 4, yy], [px + width - 4, yy]]); } }
  else if (kind === 'service') { ctx.strokeRect(-18, -22, 25, 42); ctx.strokeRect(-13, -16, 15, 11); line([[8, -12], [16, -6], [16, 14], [24, 14], [24, -12], [18, -19]]); line([[-23, 22], [13, 22]]); }
  else if (kind === 'arts') { ctx.beginPath(); ctx.arc(-2, 0, 22, .3, Math.PI * 1.88); ctx.stroke(); for (const [px, py] of [[-11, -10], [4, -13], [12, -1]]) { ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); } line([[3, 16], [23, -14]]); }
  else if (kind === 'garden' || kind === 'village') { line([[0, 24], [0, -22]]); leaf(-9, 6, -.7); leaf(9, -5, .7); if (kind === 'garden') { for (let i = 0; i < 5; i++) { const angle = i * Math.PI * 2 / 5; leaf(Math.sin(angle) * 9, -19 + Math.cos(angle) * 9, -angle); } } else { line([[-24, 21], [-24, 9], [-16, 3], [-8, 9], [-8, 21]]); } }
  else if (kind === 'harbor' || kind === 'coast') { for (const yy of [9, 22]) { ctx.beginPath(); ctx.moveTo(-26, yy); ctx.bezierCurveTo(-18, yy - 9, -10, yy + 9, -2, yy); ctx.bezierCurveTo(6, yy - 9, 14, yy + 9, 26, yy); ctx.stroke(); } if (kind === 'harbor') { line([[-7, -1], [-4, -21], [4, -21], [7, -1]]); line([[-13, -10], [-21, -10]]); line([[13, -10], [21, -10]]); } else { ctx.beginPath(); ctx.arc(0, -11, 12, Math.PI, Math.PI * 2); ctx.stroke(); } }
  else { line([[-16, 26], [-10, -24]]); line([[16, 26], [10, -24]]); line([[0, 22], [0, 13]]); line([[0, 1], [0, -7]]); }
  ctx.restore();
}

function drawSign(ctx: CanvasRenderingContext2D, sign: RoadsideSign, originX: number, originY: number) {
  ctx.save(); ctx.translate(originX, originY);
  const light = sign.kind === 'welcome', foreground = light ? INK : CREAM;
  ctx.fillStyle = light ? CREAM : INK; ctx.fillRect(0, 0, TILE_WIDTH, TILE_HEIGHT);
  ctx.strokeStyle = light ? sign.accent : CREAM; ctx.lineWidth = 2; ctx.strokeRect(7, 7, TILE_WIDTH - 14, TILE_HEIGHT - 14);
  ctx.fillStyle = sign.accent; ctx.fillRect(79, 96, 40, 3);
  motif(ctx, sign.motif, light ? sign.accent : BRASS, 41, 60);
  const available = sign.arrow === 'none' ? 416 : 344;
  ctx.fillStyle = foreground; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let font = 34; ctx.font = `600 ${font}px Arial, sans-serif`; while (font > 22 && ctx.measureText(sign.title).width > available) { ctx.font = `600 ${--font}px Arial, sans-serif`; }
  ctx.fillText(sign.title, 79, 48, available);
  ctx.font = '600 16px Arial, sans-serif'; ctx.fillText(sign.subtitle, 80, 82, available);
  if (sign.arrow !== 'none') { ctx.save(); ctx.translate(467, 52); if (sign.arrow === 'left') ctx.rotate(Math.PI); if (sign.arrow === 'straight') ctx.rotate(-Math.PI / 2); ctx.fillStyle = foreground; ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(4, -6); ctx.lineTo(4, -17); ctx.lineTo(23, 0); ctx.lineTo(4, 17); ctx.lineTo(4, 6); ctx.lineTo(-22, 6); ctx.closePath(); ctx.fill(); ctx.restore(); }
  ctx.restore();
}

/** A single bounded, locally drawn atlas serves every board; shared posts join the world's material batches. */
export function buildRegionalWayfinding(options: {
  group: THREE.Group; assets: AssetLibrary; collisions: WorldCollision[]; locations: readonly ImmersiveLocation[];
  ownedGeometries: THREE.BufferGeometry[]; ownedMaterials: THREE.Material[];
}): RoadsideSign[] {
  const signs = regionalWayfindingPlan(options.locations).map(sign => safePlacement(sign, options.collisions)).filter((sign): sign is RoadsideSign => !!sign);
  const rows = Math.ceil(signs.length / ATLAS_COLUMNS), textureHeight = Math.max(TILE_HEIGHT, rows * TILE_HEIGHT);
  let texture: THREE.CanvasTexture | undefined;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = ATLAS_COLUMNS * TILE_WIDTH; canvas.height = textureHeight;
    const ctx = canvas.getContext('2d'); if (ctx) { signs.forEach((sign, index) => drawSign(ctx, sign, index % ATLAS_COLUMNS * TILE_WIDTH, Math.floor(index / ATLAS_COLUMNS) * TILE_HEIGHT)); texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; }
  }
  // Basic face shading keeps text readable against a bright sky; the plate and supports still receive scene lighting.
  const faceMaterial = new THREE.MeshBasicMaterial({ color: texture ? '#ffffff' : CREAM, map: texture ?? null }); faceMaterial.name = 'SCOUT shared wayfinding atlas';
  if (texture) faceMaterial.addEventListener('dispose', () => texture!.dispose());
  options.ownedMaterials.push(faceMaterial);
  signs.forEach((sign, index) => {
    const signGroup = new THREE.Group(); signGroup.name = `Roadside wayfinding ${sign.id}`; signGroup.position.set(sign.position.x, 0, sign.position.z); signGroup.rotation.y = sign.facing;
    const plate = options.assets.put(signGroup, options.assets.box(sign.width + .1, sign.height + .1, .12, INK, .035), 0, sign.faceY, 0); plate.castShadow = false;
    const geometry = new THREE.PlaneGeometry(1, 1), uv = geometry.getAttribute('uv');
    const left = (index % ATLAS_COLUMNS * TILE_WIDTH + 2) / (ATLAS_COLUMNS * TILE_WIDTH), right = (index % ATLAS_COLUMNS * TILE_WIDTH + TILE_WIDTH - 2) / (ATLAS_COLUMNS * TILE_WIDTH);
    const top = 1 - (Math.floor(index / ATLAS_COLUMNS) * TILE_HEIGHT + 2) / textureHeight, bottom = 1 - (Math.floor(index / ATLAS_COLUMNS) * TILE_HEIGHT + TILE_HEIGHT - 2) / textureHeight;
    for (let vertex = 0; vertex < uv.count; vertex++) uv.setXY(vertex, uv.getX(vertex) ? right : left, uv.getY(vertex) ? top : bottom);
    options.ownedGeometries.push(geometry);
    const face = new THREE.Mesh(geometry, faceMaterial); face.name = `Wayfinding face ${sign.id}`; face.scale.set(sign.width, sign.height, 1); face.position.set(0, sign.faceY, .067); signGroup.add(face);
    const postHeight = sign.faceY + sign.height / 2 - .15;
    for (const side of [-1, 1]) {
      options.assets.put(signGroup, options.assets.box(.12, postHeight, .12, '#617e7d'), side * sign.width * .36, postHeight / 2, -.065);
      options.assets.put(signGroup, options.assets.box(.42, .16, .42, '#c7cebf', .025), side * sign.width * .36, .08, -.065);
      const point = roadsideSignPosts(sign)[side === -1 ? 0 : 1];
      options.collisions.push({ id: `regional-wayfinding-${sign.id}-${side}`, kind: 'furniture', minX: point.x - .24, maxX: point.x + .24, minZ: point.z - .24, maxZ: point.z + .24, minY: 0, maxY: postHeight });
    }
    options.group.add(signGroup);
  });
  options.group.userData.roadsideSigns = signs;
  return signs;
}
