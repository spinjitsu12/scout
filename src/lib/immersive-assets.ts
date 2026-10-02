import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* Original, locally generated SCOUT geometry and textures. No CDN or online asset service is required. */
export const WORLD_PALETTE = { plaster: '#e8e1d2', warmWhite: '#f2eadc', concrete: '#bcbdb3', asphalt: '#4a5154', wood: '#ad8157', darkWood: '#634b38', brick: '#a77462', moss: '#698169', leaves: '#587859', deepLeaves: '#375b49', iron: '#354543', teal: '#397c77', glass: '#bedadd', ink: '#273e41', rust: '#b26948', brass: '#bc9862', fabric: '#809e94', cream: '#d8c7a9' };
function random(seed: number) { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }
function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); if (!ctx) return undefined;
  draw(ctx); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
export function createLabelTexture(title: string, subtitle = '', foreground = '#f6eedc', background = '#294d49'): THREE.CanvasTexture | undefined {
  return canvasTexture(1024, 256, ctx => { ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256); ctx.strokeStyle = foreground; ctx.globalAlpha = .45; ctx.lineWidth = 2; ctx.strokeRect(20, 20, 984, 216); ctx.globalAlpha = 1; ctx.fillStyle = foreground; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${Math.min(82, Math.floor(1408 / Math.max(6, title.length)))}px Arial, sans-serif`; ctx.fillText(title, 512, subtitle ? 100 : 130); if (subtitle) { ctx.globalAlpha = .8; ctx.font = '26px Arial'; ctx.fillText(subtitle.toUpperCase(), 512, 182); } });
}
type Surface = 'wood' | 'stone' | 'brick' | 'grass' | 'asphalt';
function surfaceTexture(kind: Surface): THREE.Texture | undefined {
  const rand = random(kind.charCodeAt(0) * 199), texture = canvasTexture(512, 512, ctx => {
    ctx.fillStyle = { wood: '#ad835e', stone: '#bfc0b6', brick: '#a57d6a', grass: '#87936c', asphalt: '#515659' }[kind]; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < (kind === 'grass' ? 9000 : 5000); i++) { ctx.fillStyle = rand() > .5 ? 'rgba(255,255,255,.075)' : 'rgba(0,0,0,.075)'; ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 2, kind === 'wood' ? 10 + rand() * 85 : 1 + rand() * 3); }
    if (kind === 'wood') { ctx.strokeStyle = 'rgba(73,40,20,.18)'; ctx.lineWidth = 2; for (let x = 0; x < 512; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); } }
    if (kind === 'brick') { ctx.strokeStyle = '#cab8a1'; ctx.lineWidth = 4; for (let y = 0; y <= 512; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); for (let x = y / 40 % 2 * 42; x <= 512; x += 84) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40); ctx.stroke(); } } }
  });
  if (texture) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(kind === 'grass' ? 100 : kind === 'asphalt' ? 10 : 1, kind === 'grass' ? 100 : kind === 'asphalt' ? 10 : 1); } return texture;
}
export type AssetLibrary = ReturnType<typeof createAssetLibrary>;
export function createAssetLibrary() {
  const materials = new Map<string, THREE.MeshStandardMaterial>(), geometries = new Map<string, THREE.BufferGeometry>(), textures = new Set<THREE.Texture>();
  const mat = (color: string, roughness = .86, metalness = 0) => { const key = `${color}|${roughness}|${metalness}`; if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness })); return materials.get(key)!; };
  const textured = (kind: Surface) => { const key = `surface-${kind}`; if (!materials.has(key)) { const texture = surfaceTexture(kind); if (texture) textures.add(texture); materials.set(key, new THREE.MeshStandardMaterial({ map: texture ?? null, color: texture ? '#ffffff' : kind === 'grass' ? WORLD_PALETTE.moss : kind === 'stone' ? WORLD_PALETTE.concrete : WORLD_PALETTE[kind], roughness: .95 })); } return materials.get(key)!; };
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => { const result = new THREE.Mesh(geometry, material); result.castShadow = result.receiveShadow = true; return result; };
  const box = (w: number, h: number, d: number, material: THREE.Material | string, bevel = 0) => { const key = `box-${w}-${h}-${d}-${bevel}`; if (!geometries.has(key)) geometries.set(key, bevel ? new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d)); return mesh(geometries.get(key)!, typeof material === 'string' ? mat(material) : material); };
  const cylinder = (radius: number, height: number, material: THREE.Material | string, topRadius = radius, segments = 12) => { const key = `cylinder-${radius}-${height}-${topRadius}-${segments}`; if (!geometries.has(key)) geometries.set(key, new THREE.CylinderGeometry(topRadius, radius, height, segments)); return mesh(geometries.get(key)!, typeof material === 'string' ? mat(material) : material); };
  const sphere = (radius: number, material: THREE.Material | string, detail = 1) => { const key = `sphere-${radius}-${detail}`; if (!geometries.has(key)) geometries.set(key, new THREE.IcosahedronGeometry(radius, detail)); return mesh(geometries.get(key)!, typeof material === 'string' ? mat(material) : material); };
  const put = <T extends THREE.Object3D>(group: THREE.Group, object: T, x: number, y: number, z: number) => { object.position.set(x, y, z); group.add(object); return object; };
  const label = (title: string, subtitle = '', width = 5, height = 1.25, background = '#294d49') => { const texture = createLabelTexture(title, subtitle, background === '#e5dfc7' ? '#35453d' : '#f6eedc', background); if (texture) textures.add(texture); const material = new THREE.MeshStandardMaterial({ map: texture ?? null, color: texture ? '#ffffff' : '#c8d4b8', roughness: .7 }); materials.set(`label-${materials.size}`, material); return box(width, height, .05, material); };
  const plant = (size = 1) => { const g = new THREE.Group(); put(g, cylinder(.22 * size, .38 * size, '#ad7457', .28 * size), 0, .19 * size, 0); put(g, cylinder(.23 * size, .035 * size, '#554b3b'), 0, .38 * size, 0); for (let i = 0; i < 7; i++) { const a = i * 2.399, leaf = sphere(.26 * size, i % 2 ? WORLD_PALETTE.leaves : WORLD_PALETTE.deepLeaves); leaf.scale.set(.45, 1.5, .65); leaf.rotation.z = Math.sin(a) * .45; put(g, leaf, Math.sin(a) * .18 * size, (.6 + i * .045) * size, Math.cos(a) * .16 * size); } return g; };
  const chair = (color = WORLD_PALETTE.fabric, office = false) => { const g = new THREE.Group(); put(g, box(.57, .12, .58, color, .055), 0, .5, 0); put(g, box(.57, .6, .1, color, .04), 0, .84, .23).rotation.x = -.08; if (office) { put(g, cylinder(.045, .46, mat('#565e5c', .5, .5)), 0, .23, 0); for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5, leg = box(.035, .045, .36, '#394544'); leg.rotation.y = a; put(g, leg, Math.sin(a) * .15, .065, Math.cos(a) * .15); } for (const side of [-1, 1]) { put(g, box(.05, .25, .04, '#394544'), side * .32, .63, 0); put(g, box(.08, .05, .3, '#394544', .02), side * .32, .76, -.02); } } else for (const x of [-.22, .22]) for (const z of [-.22, .22]) put(g, box(.045, .46, .045, '#594f41'), x, .23, z); return g; };
  const table = (width = 2, depth = 1.05, height = .78, dark = false) => { const g = new THREE.Group(); put(g, box(width, .09, depth, dark ? WORLD_PALETTE.darkWood : textured('wood'), .035), 0, height, 0); for (const x of [-width / 2 + .12, width / 2 - .12]) for (const z of [-depth / 2 + .12, depth / 2 - .12]) put(g, box(.07, height, .07, '#3e4f4a'), x, height / 2, z); return g; };
  const laptop = () => { const g = new THREE.Group(); put(g, box(.52, .035, .35, mat('#b5b8b1', .34, .65), .015), 0, .02, 0); const display = new THREE.Group(); display.rotation.x = -.13; put(g, display, 0, .035, -.15); put(display, box(.52, .32, .025, '#343d3f', .01), 0, .16, 0);
    const texture = canvasTexture(512, 320, ctx => { ctx.fillStyle = '#183a3d'; ctx.fillRect(0, 0, 512, 320); ctx.fillStyle = '#dbecd4'; ctx.font = '600 34px Arial'; ctx.fillText('SCOUT', 26, 50); ctx.fillStyle = '#76a195'; for (let i = 0; i < 5; i++) ctx.fillRect(26, 80 + i * 37, i % 2 ? 260 : 330, 10); ctx.fillStyle = '#d8b677'; ctx.fillRect(380, 90, 95, 170); }); if (texture) textures.add(texture); const material = new THREE.MeshStandardMaterial({ map: texture ?? null, color: texture ? '#ffffff' : '#75a69b', emissive: '#407a6e', emissiveIntensity: .25, roughness: .45 }); materials.set(`screen-${materials.size}`, material); put(display, box(.47, .265, .007, material), 0, .16, .017);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) put(g, box(.035, .005, .025, '#50565b'), -.2 + c * .044, .042, -.085 + r * .037); put(g, box(.15, .003, .08, '#868f90'), 0, .043, .1); return g; };
  const bookshelf = (width = 2, height = 2.2) => { const g = new THREE.Group(), wood = textured('wood'); for (const x of [-width / 2, width / 2]) put(g, box(.08, height, .45, wood), x, height / 2, 0); put(g, box(width, height, .055, '#8a7056'), 0, height / 2, -.2); for (let l = 0; l < 5; l++) { put(g, box(width + .08, .055, .45, wood), 0, .08 + l * (height - .12) / 4, 0); if (l < 4) for (let b = 0; b < Math.floor(width * 7); b++) { const h = .24 + (b * 13 + l * 11) % 10 * .018; put(g, box(.075 + b % 3 * .014, h, .22, ['#485f64', '#a06545', '#e3ceaa', '#667b61', '#ac9459'][b % 5]), -width / 2 + .15 + b * .13, .12 + l * (height - .12) / 4 + h / 2, .025).rotation.z = b % 9 === 0 ? .15 : 0; } } return g; };
  const sofa = (color = '#7c9385', width = 2.2) => { const g = new THREE.Group(); for (const x of [-width / 2 + .13, width / 2 - .13]) for (const z of [-.35, .35]) put(g, cylinder(.04, .2, '#494c42'), x, .1, z); put(g, box(width, .25, .85, color, .09), 0, .36, 0); put(g, box(width, .58, .18, color, .09), 0, .72, .36); for (const side of [-1, 1]) put(g, box(.22, .5, .9, color, .1), side * (width / 2 - .07), .61, 0); for (let i = 0; i < 3; i++) put(g, box((width - .35) / 3 - .025, .17, .65, '#94a897', .07), (i - 1) * (width - .35) / 3, .55, -.02); put(g, box(.38, .32, .1, '#e0c393', .055), -width / 2 + .4, .82, .19).rotation.z = .12; return g; };
  const deskSet = (withLaptop = true) => { const g = table(2.2, .85); if (withLaptop) put(g, laptop(), .3, .835, -.04); put(g, box(.25, .04, .33, '#425e62'), -.55, .845, -.15); put(g, box(.21, .055, .3, '#dbcdac'), -.56, .885, -.16).rotation.y = .12; put(g, cylinder(.045, .08, '#bd8358'), -.1, .88, .13); put(g, plant(.38), -.85, .83, -.21); return g; };
  const floorLamp = () => { const g = new THREE.Group(); put(g, cylinder(.23, .04, '#494c43'), 0, .02, 0); put(g, cylinder(.025, 1.65, '#655846'), 0, .85, 0); put(g, cylinder(.32, .35, '#e5cfaa', .19, 16), 0, 1.68, 0); put(g, sphere(.07, '#fff3d2'), 0, 1.66, 0); return g; };
  const bed = () => { const g = new THREE.Group(); put(g, box(1.75, .35, 2.15, textured('wood'), .04), 0, .23, 0); put(g, box(1.7, .23, 2.05, '#e0d9c7', .1), 0, .51, 0); put(g, box(1.69, .11, 1.4, '#879f99', .06), 0, .64, .31); put(g, box(1.78, 1, .12, textured('wood'), .04), 0, .59, -.99); for (const x of [-.43, .43]) put(g, box(.61, .17, .41, '#f3e8ce', .08), x, .7, -.68).rotation.y = x * .1; return g; };
  const bench = () => { const g = new THREE.Group(); for (const x of [-.85, .85]) { put(g, box(.1, .53, .7, '#43574d'), x, .26, 0); put(g, box(.075, .9, .075, '#43574d'), x, .65, .28); } for (let i = 0; i < 4; i++) put(g, box(2.05, .07, .13, textured('wood'), .018), 0, .56, -.25 + i * .16); for (let i = 0; i < 3; i++) put(g, box(2.05, .12, .065, textured('wood'), .018), 0, .79 + i * .15, .31); return g; };
  const streetLamp = () => { const g = new THREE.Group(); put(g, cylinder(.13, .3, '#3b4846'), 0, .15, 0); put(g, cylinder(.045, 5.2, '#40514d', .035), 0, 2.6, 0); put(g, box(.09, .08, 1.3, '#40514d'), 0, 5.15, -.5); put(g, box(.38, .12, .68, '#4c5851', .06), 0, 5.1, -1.03); const light = mat('#f9e5bd'); light.emissive.set('#ffe7b6'); light.emissiveIntensity = .5; put(g, box(.29, .015, .52, light), 0, 5.026, -1.03); return g; };
  const cafeSet = () => { const g = new THREE.Group(); put(g, cylinder(.68, .07, textured('wood'), .68, 24), 0, .77, 0); put(g, cylinder(.045, .72, '#364741'), 0, .36, 0); put(g, cylinder(.32, .04, '#364741'), 0, .03, 0); for (const z of [-1, 1]) { const c = chair('#a47e53'); c.rotation.y = z > 0 ? 0 : Math.PI; put(g, c, 0, 0, z * .98); } put(g, cylinder(.08, .09, '#ded4ba'), -.2, .85, 0); put(g, cylinder(.08, .09, '#ded4ba'), .2, .85, 0); put(g, plant(.28), 0, .81, -.15); return g; };
  const artwork = (variant = 0, width = 1.5, height = 1.2) => { const g = new THREE.Group(); put(g, box(width + .1, height + .1, .09, '#6b5843'), 0, 0, 0); const texture = canvasTexture(512, 512, ctx => { const colors = [['#d7bb89', '#40675e', '#a56f52'], ['#d8ded0', '#48677b', '#b18662'], ['#e2c99f', '#927153', '#5a7363']][variant % 3]; ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, 512, 512); ctx.fillStyle = colors[1]; ctx.beginPath(); ctx.moveTo(0, 390); ctx.bezierCurveTo(130, 80, 290, 510, 512, 130); ctx.lineTo(512, 512); ctx.lineTo(0, 512); ctx.fill(); ctx.fillStyle = colors[2]; ctx.beginPath(); ctx.arc(360, 150, 70, 0, Math.PI * 2); ctx.fill(); }); if (texture) textures.add(texture); const material = new THREE.MeshStandardMaterial({ map: texture ?? null, color: texture ? '#ffffff' : '#ac987b', roughness: 1 }); materials.set(`art-${materials.size}`, material); put(g, box(width, height, .013, material), 0, 0, .05); return g; };
  const dispose = () => { materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); };
  return { mat, textured, box, cylinder, sphere, put, label, plant, chair, table, laptop, bookshelf, sofa, deskSet, floorLamp, bed, bench, streetLamp, cafeSet, artwork, dispose };
}

export type VehicleModel = { group: THREE.Group; steeringWheel: THREE.Group; wheels: THREE.Group[]; cockpitEye: THREE.Vector3; update: (speed: number, steering: number, dt: number) => void; dispose: () => void };
/** Original Juniper82 compact. Forward is -Z; wheels physically touch y=0. */
export function createVehicle(options: { paint?: string; plate?: string } = {}): VehicleModel {
  const assets = createAssetLibrary(), { put, box, cylinder, sphere, mat } = assets;
  const group = new THREE.Group(); group.name = 'Juniper 82 compact';
  const paint = mat(options.paint ?? '#8ba99a', .36, .38), rubber = mat('#202729', .9), bumper = mat('#515b56', .5, .2), chrome = mat('#bfc5bc', .26, .75);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#c0d2d1', roughness: .12, metalness: .08, transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide });
  const ownGeometry: THREE.BufferGeometry[] = [];
  const torus = (radius: number, tube: number, material: THREE.Material, arc = Math.PI * 2) => { const geometry = new THREE.TorusGeometry(radius, tube, 8, 32, arc); ownGeometry.push(geometry); return new THREE.Mesh(geometry, material); };
  put(group, box(1.73, .56, 3.83, paint, .13), 0, .68, .01); put(group, box(1.64, .15, 1.16, paint, .07), 0, .99, -1.25).rotation.x = -.035; put(group, box(1.67, .16, .7, paint, .07), 0, 1, 1.6);
  for (const side of [-1, 1]) {
    put(group, box(.09, .43, 2.06, paint, .035), side * .85, 1.02, .32); put(group, box(.055, .22, 1.68, '#424e49', .02), side * .79, 1.02, .32); put(group, box(.035, .07, .24, chrome, .02), side * .904, 1.16, .43);
    put(group, box(.055, .67, .07, paint), side * .76, 1.42, -.66).rotation.x = -.43; put(group, box(.06, .58, .08, paint), side * .8, 1.47, .5); put(group, box(.075, .58, .07, paint), side * .75, 1.43, 1.21).rotation.x = .38;
    put(group, box(.11, .045, 2.07, paint), side * .79, 1.2, .29); put(group, box(.23, .13, .17, paint, .055), side * .96, 1.23, -.52).rotation.y = side * -.15; put(group, box(.18, .085, .008, chrome), side * .96, 1.23, -.429);
    put(group, box(.007, .48, .87, glass), side * .797, 1.45, -.1);
  }
  put(group, box(1.54, .075, 1.64, paint, .035), 0, 1.775, .3); put(group, box(1.58, .04, 1.65, '#c9c8b9'), 0, 1.724, .3);
  put(group, box(1.44, .57, .008, glass), 0, 1.466, -.7).rotation.x = -.43; put(group, box(1.43, .55, .009, glass), 0, 1.465, 1.26).rotation.x = .37;
  put(group, box(1.69, .16, .22, bumper, .045), 0, .53, -1.94); put(group, box(1.69, .15, .17, bumper, .04), 0, .54, 1.97); put(group, box(.85, .2, .035, '#2c3532'), 0, .74, -1.945);
  for (let r = 0; r < 4; r++) put(group, box(.78, .009, .02, chrome), 0, .66 + r * .042, -1.972);
  const headlight = mat('#f3e8cb', .3); headlight.emissive.set('#f8dfac'); headlight.emissiveIntensity = .15;
  for (const side of [-1, 1]) { put(group, box(.34, .23, .055, headlight, .04), side * .61, .86, -1.97); put(group, box(.26, .25, .055, '#a1433b', .025), side * .66, .86, 1.982); put(group, box(.09, .12, .061, '#dfae60', .015), side * .785, .89, -1.965); }
  const frontPlate = assets.label((options.plate ?? 'SCOUT').toUpperCase(), '', .48, .12, '#e5dfc7'); put(group, frontPlate, 0, .52, -2.065).rotation.y = Math.PI; put(group, assets.label((options.plate ?? 'SCOUT').toUpperCase(), '', .48, .12, '#e5dfc7'), 0, .58, 2.075);
  const wheels: THREE.Group[] = [], spins: THREE.Group[] = [];
  for (const z of [-1.23, 1.2]) for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); put(group, pivot, side * .84, .35, z); wheels.push(pivot); const wheel = new THREE.Group(); pivot.add(wheel); spins.push(wheel);
    const tyre = cylinder(.345, .19, rubber, .345, 24); tyre.rotation.z = Math.PI / 2; wheel.add(tyre); const rim = cylinder(.225, .2, chrome, .225, 16); rim.rotation.z = Math.PI / 2; wheel.add(rim); const hub = cylinder(.07, .22, '#68766e', .07, 16); hub.rotation.z = Math.PI / 2; wheel.add(hub);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, spoke = box(.01, .055, .17, '#78857b'); spoke.position.set(side * .105, Math.sin(a) * .12, Math.cos(a) * .12); spoke.rotation.x = -a; wheel.add(spoke); }
    const arch = torus(.39, .043, bumper, Math.PI); arch.rotation.y = Math.PI / 2; put(group, arch, side * .9, .37, z);
  }
  for (const x of [-.42, .42]) { put(group, box(.58, .16, .57, '#6b7c70', .075), x, .74, .28); put(group, box(.58, .59, .14, '#6b7c70', .07), x, 1.06, .55).rotation.x = -.12; put(group, box(.29, .18, .1, '#617364', .04), x, 1.42, .62); }
  put(group, box(1.28, .22, .57, '#69796c', .07), 0, .74, 1.07); put(group, box(1.28, .51, .16, '#69796c', .06), 0, 1.02, 1.36); put(group, box(.17, .24, .72, '#3d4b43', .04), 0, .82, .04); put(group, cylinder(.018, .17, '#767d70'), 0, 1, .015); put(group, sphere(.045, '#282e2b', 2), 0, 1.1, .015);
  // Hooded instrument cluster, speedometer, tachometer, physical radio and vents.
  put(group, box(1.55, .28, .31, '#37463e', .06), 0, 1.06, -.43); put(group, box(.54, .05, .2, '#263c31', .03), -.43, 1.245, -.36);
  const cluster = new THREE.Group(); put(group, cluster, -.42, 1.125, -.258); const needles: { mesh: THREE.Mesh; factor: number }[] = [];
  for (const [x, radius, factor] of [[-.12, .085, 1], [.11, .073, .7]] as const) {
    put(cluster, torus(radius, .006, chrome), x, 0, 0); put(cluster, cylinder(radius * .95, .005, '#192f26', radius * .95, 24), x, 0, -.001).rotation.x = Math.PI / 2;
    for (let i = 0; i < 9; i++) { const a = (-.77 + i * .19) * Math.PI; put(cluster, box(.005, .012, .005, '#d8dfc0'), x + Math.sin(a) * radius * .76, Math.cos(a) * radius * .76, .008).rotation.z = -a; }
    const needle = box(.004, radius * .76, .004, '#e4a260'); needle.geometry = needle.geometry.clone().translate(0, radius * .29, 0); ownGeometry.push(needle.geometry); put(cluster, needle, x, 0, .013); needles.push({ mesh: needle, factor });
  }
  put(group, box(.22, .012, .016, '#c3d4b4'), -.43, 1.025, -.27);
  for (const x of [-.72, .35, .65]) { put(group, box(.13, .085, .012, '#1e3328'), x, 1.095, -.26); for (let i = 0; i < 3; i++) put(group, box(.12, .006, .013, '#8b9e89'), x, 1.073 + i * .019, -.25); }
  put(group, box(.21, .07, .016, '#1a332a'), .035, 1.09, -.26); for (const x of [-.045, .12]) put(group, cylinder(.015, .025, '#b9c3ac'), x, 1.092, -.24).rotation.x = Math.PI / 2; put(group, box(.18, .055, .015, '#cfb96d'), .035, 1.015, -.258);
  const steeringWheel = new THREE.Group(); put(group, steeringWheel, -.43, 1.03, -.13); steeringWheel.rotation.x = -.22; steeringWheel.add(torus(.185, .024, mat('#28392f'))); put(steeringWheel, box(.29, .048, .04, '#778271', .015), 0, -.015, 0); put(steeringWheel, box(.052, .17, .038, '#778271', .015), 0, -.09, 0); put(steeringWheel, box(.095, .07, .05, '#314939', .02), 0, 0, .006);
  put(group, box(.24, .074, .035, '#344335', .015), 0, 1.6, -.61); put(group, box(.2, .05, .006, chrome), 0, 1.6, -.587); for (const side of [-1, 1]) put(group, box(.36, .13, .025, '#b8baa5', .02), side * .41, 1.625, -.55);
  group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  let angle = 0;
  const update = (speed: number, steering: number, dt: number) => { angle += speed * dt / .345; steeringWheel.rotation.z = -steering * 14; spins.forEach(w => { w.rotation.x = angle; }); wheels.forEach((w, i) => { if (i < 2) w.rotation.y = -steering; }); needles.forEach(n => { n.mesh.rotation.z = .78 * Math.PI - Math.min(Math.abs(speed) * 3.6 / 150, 1) * 1.56 * Math.PI * n.factor; }); };
  return { group, steeringWheel, wheels, cockpitEye: new THREE.Vector3(-.43, 1.38, .25), update, dispose: () => { assets.dispose(); glass.dispose(); ownGeometry.forEach(g => g.dispose()); } };
}

export type PersonModel = { group: THREE.Group; head: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; update: (speed: number, elapsed: number, activity?: 'idle' | 'phone' | 'work') => void; dispose: () => void };
/** Articulated, metre-scale people: skin/outfit variations, individual limbs, gait and a held-phone animation. */
export function createPerson(options: { avatar?: number; variant?: number } = {}): PersonModel {
  const assets = createAssetLibrary(), { box, sphere, cylinder, put } = assets;
  const avatar = Math.abs(options.avatar ?? options.variant ?? 0) % 16, group = new THREE.Group(); group.name = `Scout character ${avatar + 1}`;
  const skin = ['#e0b998', '#b78162', '#815941', '#cfa37b'][avatar % 4], top = ['#567b71', '#bc9877', '#667a92', '#aa7967', '#88936d', '#7c7994', '#597d87', '#ceae78'][avatar % 8], pants = ['#3b5153', '#555348', '#5a6573', '#65534a'][Math.floor(avatar / 4)], hair = ['#4f3e30', '#795b3b', '#b59661', '#292f2c'][Math.floor(avatar / 4)];
  const torso = put(group, box(.43, .56, .27, top, .07), 0, 1.14, 0); put(group, box(.37, .22, .25, pants, .045), 0, .82, 0); put(group, cylinder(.072, .1, skin), 0, 1.475, 0);
  const head = new THREE.Group(); put(group, head, 0, 1.57, 0); put(head, sphere(.16, skin, 2), 0, 0, 0).scale.set(.8, 1.08, .86); put(head, sphere(.165, hair, 2), 0, .055, .025).scale.set(.87, .76, .83); if (avatar % 3 === 1) put(head, sphere(.125, hair), 0, -.04, .1).scale.set(.9, 1.35, .7);
  for (const x of [-.05, .05]) { put(head, sphere(.014, '#273b36'), x, .003, -.13).scale.set(.8, .7, .4); put(head, box(.035, .009, .01, hair), x, .035, -.12).rotation.z = x > 0 ? -.06 : .06; }
  put(head, sphere(.02, skin), 0, -.028, -.132).scale.set(.5, .75, 1); put(head, box(.042, .005, .006, '#9b6b56'), 0, -.071, -.13); for (const x of [-.135, .135]) put(head, sphere(.03, skin), x, -.01, .005).scale.set(.5, 1, .75);
  const leftArm = new THREE.Group(), rightArm = new THREE.Group(), forearms: THREE.Group[] = [], legs: THREE.Group[] = [], shins: THREE.Group[] = [];
  leftArm.name = 'left-upper-arm'; rightArm.name = 'right-upper-arm';
  for (const [side, arm] of [[-1, leftArm], [1, rightArm]] as const) {
    put(group, arm, side * .27, 1.35, 0); put(arm, cylinder(.076, .29, top, .08, 10), 0, -.13, 0).rotation.z = side * .04;
    const forearm = new THREE.Group(); put(arm, forearm, side * .01, -.27, 0); forearms.push(forearm); put(forearm, cylinder(.051, .23, skin, .059, 10), 0, -.105, 0); put(forearm, sphere(.056, skin), 0, -.23, -.006).scale.set(.75, 1.15, .6);
    const leg = new THREE.Group(); put(group, leg, side * .11, .76, 0); legs.push(leg); put(leg, cylinder(.087, .35, pants, .097, 10), 0, -.16, 0);
    const shin = new THREE.Group(); put(leg, shin, 0, -.33, 0); shins.push(shin); put(shin, cylinder(.065, .34, pants, .078, 10), 0, -.155, 0); put(shin, box(.15, .095, .27, '#333e37', .035), 0, -.352, -.065);
  }
  put(group, box(.39, .035, .26, '#445149'), 0, .9, 0); put(group, box(.044, .037, .012, '#cfb077'), 0, .899, -.143);
  if (avatar % 2 === 0) { put(group, box(.08, .1, .008, '#decf97'), -.13, 1.2, -.145); put(group, box(.05, .01, .009, '#789b94'), -.13, 1.21, -.151); }
  if (avatar % 4 === 3) { for (const x of [-.05, .05]) put(head, box(.07, .04, .008, '#535744', .012), x, .003, -.142); put(head, box(.035, .006, .012, '#535744'), 0, .007, -.146); }
  const phone = put(forearms[1], box(.065, .11, .011, '#223d38', .009), 0, -.19, -.034); phone.name = 'held-phone'; phone.visible = false;
  const update = (speed: number, elapsed: number, activity: 'idle' | 'phone' | 'work' = 'idle') => {
    const gait = elapsed * Math.min(7, 3 + Math.abs(speed) * 2), walk = Math.min(1, Math.abs(speed) / 1.4), cycle = Math.sin(gait);
    leftArm.rotation.x = cycle * .42 * walk; rightArm.rotation.x = -cycle * .42 * walk; leftArm.rotation.z = -.06; rightArm.rotation.z = .06;
    legs[0].rotation.x = -cycle * .44 * walk; legs[1].rotation.x = cycle * .44 * walk; shins[0].rotation.x = Math.max(0, cycle) * .38 * walk; shins[1].rotation.x = Math.max(0, -cycle) * .38 * walk; forearms[0].rotation.x = -.12 - walk * .12; forearms[1].rotation.x = -.12 - walk * .12;
    torso.position.y = 1.14 + Math.cos(gait * 2) * .015 * walk + Math.sin(elapsed * 1.3) * .005; head.rotation.y = Math.sin(elapsed * .35 + avatar) * .04 * (1 - walk); phone.visible = activity === 'phone';
    if (activity === 'phone') { rightArm.rotation.x = -1.06; rightArm.rotation.z = -.13; forearms[1].rotation.x = -1.3; }
    if (activity === 'work') { leftArm.rotation.x = -.75; rightArm.rotation.x = -.85 + Math.sin(elapsed * 1.4) * .04; }
  };
  update(0, 0); return { group, head, leftArm, rightArm, update, dispose: assets.dispose };
}
