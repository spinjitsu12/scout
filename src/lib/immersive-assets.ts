import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Original, locally generated SCOUT geometry and textures. No CDN or online asset service is required. */
/** Original Sunward Coast palette: cream stone, sea glass and vermilion shopfronts. */
export const WORLD_PALETTE = { plaster: '#efe4cb', warmWhite: '#fff1d9', concrete: '#c7cebf', asphalt: '#4b6070', wood: '#bd9565', darkWood: '#65554a', brick: '#cd8b73', moss: '#8fa873', leaves: '#74a47d', deepLeaves: '#407c71', iron: '#354d59', teal: '#387f87', glass: '#b4dbe3', ink: '#234b56', rust: '#d77b64', brass: '#d2ae69', fabric: '#7aa69c', cream: '#f3e8ce', coastalBlue: '#9ecfdf', celadon: '#79a98b' };
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
    ctx.fillStyle = { wood: '#bd9565', stone: '#d0d4c4', brick: '#cd8b73', grass: '#91aa73', asphalt: '#506477' }[kind]; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 160; i++) { ctx.fillStyle = rand() > .5 ? (kind === 'asphalt' ? 'rgba(255,250,222,.012)' : 'rgba(255,250,222,.045)') : (kind === 'asphalt' ? 'rgba(29,66,74,.009)' : 'rgba(29,66,74,.035)'); ctx.beginPath(); ctx.ellipse(rand() * 512, rand() * 512, 12 + rand() * 80, 3 + rand() * 16, kind === 'wood' ? Math.PI / 2 : rand() * Math.PI, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 900; i++) { ctx.fillStyle = rand() > .5 ? 'rgba(255,255,255,.045)' : 'rgba(32,66,68,.035)'; ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 2, kind === 'wood' ? 10 + rand() * 55 : 1 + rand() * 3); }
    if (kind === 'wood') { ctx.strokeStyle = 'rgba(79,56,39,.12)'; ctx.lineWidth = 2; for (let x = 0; x < 512; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 3, 170, x - 2, 350, x, 512); ctx.stroke(); } }
    if (kind === 'stone') { ctx.strokeStyle = 'rgba(66,94,93,.10)'; ctx.lineWidth = 2; for (let y = 0; y <= 512; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); for (let x = y / 128 % 2 * 128; x <= 512; x += 256) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 128); ctx.stroke(); } } }
    if (kind === 'brick') { ctx.strokeStyle = '#e8c8a7'; ctx.lineWidth = 3; for (let y = 0; y <= 512; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); for (let x = y / 40 % 2 * 42; x <= 512; x += 84) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40); ctx.stroke(); } } }
  });
  if (texture) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(kind === 'grass' ? 100 : kind === 'asphalt' ? 10 : 1, kind === 'grass' ? 100 : kind === 'asphalt' ? 10 : 1); } return texture;
}
export type AssetLibrary = ReturnType<typeof createAssetLibrary>;
export function createAssetLibrary() {
  const materials = new Map<string, THREE.MeshStandardMaterial>(), geometries = new Map<string, THREE.BufferGeometry>(), textures = new Set<THREE.Texture>();
  const mat = (color: string, roughness = .86, metalness = 0) => { const key = `${color}|${roughness}|${metalness}`; if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness })); return materials.get(key)!; };
  const textured = (kind: Surface) => {
    const key = `surface-${kind}`;
    if (!materials.has(key)) {
      const texture = surfaceTexture(kind); if (texture) textures.add(texture);
      const material = new THREE.MeshStandardMaterial({ map: texture ?? null, color: texture ? '#ffffff' : kind === 'grass' ? WORLD_PALETTE.moss : kind === 'stone' ? WORLD_PALETTE.concrete : WORLD_PALETTE[kind], roughness: .95 });
      if (texture && (kind === 'grass' || kind === 'asphalt')) {
        // Consistent metre-scale brush detail on kilometre-long roads and adjoining segments.
        material.onBeforeCompile = shader => { shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
          #include <uv_vertex>
          #ifdef USE_MAP
            vMapUv = (modelMatrix * vec4(position, 1.0)).xz * ${kind === 'asphalt' ? '0.24' : '0.085'};
          #endif
        `); };
        material.customProgramCacheKey = () => `scout-world-projected-${kind}-v1`;
      }
      materials.set(key, material);
    }
    return materials.get(key)!;
  };
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
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.clear(); geometries.clear(); textures.clear(); };
  return { mat, textured, box, cylinder, sphere, put, label, plant, chair, table, laptop, bookshelf, sofa, deskSet, floorLamp, bed, bench, streetLamp, cafeSet, artwork, dispose };
}

export type VehicleDashboardTelemetry = { speedMps: number; fuelGallons: number; damage?: number; gear?: 'D' | 'R'; engineRpm?: number; gearNumber?: number };
export type VehicleDashboardState = { mph: number; fuelFraction: number; conditionFraction: number; rpm: number; gear: string; lowFuel: boolean; needsRepair: boolean };
const dashboardClamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
export function vehicleDashboardState(telemetry: VehicleDashboardTelemetry): VehicleDashboardState {
  const mph = dashboardClamp(Math.abs(telemetry.speedMps) * 2.2369362921, 0, 120), fuelFraction = dashboardClamp(telemetry.fuelGallons / 12, 0, 1), conditionFraction = 1 - dashboardClamp(telemetry.damage ?? 0, 0, 1);
  return { mph, fuelFraction, conditionFraction, rpm: dashboardClamp(telemetry.engineRpm ?? (fuelFraction > 0 ? 850 + Math.abs(telemetry.speedMps) * 90 : 0), 0, 6000), gear: telemetry.gear === 'R' ? 'R' : `D${telemetry.gearNumber ? dashboardClamp(Math.round(telemetry.gearNumber), 1, 6) : ''}`, lowFuel: fuelFraction < .13, needsRepair: conditionFraction < .45 };
}
export type VehicleModel = { group: THREE.Group; steeringWheel: THREE.Group; wheels: THREE.Group[]; cockpitEye: THREE.Vector3; updateDashboard: (telemetry: VehicleDashboardTelemetry) => void; update: (speed: number, steering: number, dt: number) => void; dispose: () => void };
/** Original Juniper82 compact. Forward is -Z; wheels physically touch y=0. */
export function createVehicle(options: { paint?: string; plate?: string } = {}): VehicleModel {
  const assets = createAssetLibrary(), { put, box, cylinder, sphere, mat } = assets;
  const group = new THREE.Group(); group.name = 'Juniper 82 compact';
  const paint = mat(options.paint ?? '#86b7a8', .32, .3), rubber = mat('#26333b', .95), bumper = mat('#3e565d', .64, .15), chrome = mat('#d1d9cf', .3, .62);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#c0d2d1', roughness: .12, metalness: .08, transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide });
  const ownGeometry: THREE.BufferGeometry[] = [], ownMaterials: THREE.Material[] = [], ownTextures: THREE.Texture[] = [];
  const torus = (radius: number, tube: number, material: THREE.Material, arc = Math.PI * 2) => { const geometry = new THREE.TorusGeometry(radius, tube, 8, 32, arc); ownGeometry.push(geometry); return new THREE.Mesh(geometry, material); };
  put(group, box(1.73, .56, 3.83, paint, .13), 0, .68, .01);
  const bonnet = put(group, box(1.64, .15, 1.16, paint, .07), 0, .99, -1.25); bonnet.name = 'Juniper compact dentable bonnet'; bonnet.rotation.x = -.035; bonnet.geometry = bonnet.geometry.clone(); ownGeometry.push(bonnet.geometry);
  const undamagedBonnet = new Float32Array(bonnet.geometry.getAttribute('position').array); let damageStage = -1;
  put(group, box(1.67, .16, .7, paint, .07), 0, 1, 1.6);
  for (const side of [-1, 1]) {
    put(group, box(.09, .43, 2.06, paint, .035), side * .85, 1.02, .32); put(group, box(.055, .22, 1.68, '#424e49', .02), side * .79, 1.02, .32); put(group, box(.035, .07, .24, chrome, .02), side * .904, 1.16, .43);
    const frontPillar = put(group, box(.055, .67, .07, paint), side * .76, 1.42, -.66); frontPillar.name = `Juniper compact front pillar ${side}`; frontPillar.rotation.x = .43;
    put(group, box(.06, .58, .08, paint), side * .8, 1.47, .5);
    const rearPillar = put(group, box(.075, .58, .07, paint), side * .75, 1.43, 1.21); rearPillar.name = `Juniper compact rear pillar ${side}`; rearPillar.rotation.x = -.38;
    put(group, box(.11, .045, 2.07, paint), side * .79, 1.2, .29); put(group, box(.23, .13, .17, paint, .055), side * .96, 1.23, -.52).rotation.y = side * -.15; put(group, box(.18, .085, .008, chrome), side * .96, 1.23, -.429);
    put(group, box(.007, .48, .87, glass), side * .797, 1.45, -.1);
  }
  const roof = put(group, box(1.54, .075, 1.64, paint, .035), 0, 1.775, .3); roof.name = 'Juniper compact roof'; put(group, box(1.58, .04, 1.65, '#c9c8b9'), 0, 1.724, .3);
  // Both panes lean toward the roof; the front tilt matches Cannon's contact surface.
  const windshield = put(group, box(1.44, .57, .008, glass), 0, 1.466, -.7); windshield.name = 'Juniper compact windshield'; windshield.rotation.x = .43;
  const rearWindow = put(group, box(1.43, .55, .009, glass), 0, 1.465, 1.26); rearWindow.name = 'Juniper compact rear window'; rearWindow.rotation.x = -.37;
  const frontBumper = put(group, box(1.69, .16, .22, bumper, .045), 0, .53, -1.94); frontBumper.name = 'Juniper compact damaged bumper'; put(group, box(1.69, .15, .17, bumper, .04), 0, .54, 1.97); put(group, box(.85, .2, .035, '#2c3532'), 0, .74, -1.945);
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
  // Instruments live in the cockpit instead of a duplicate screen overlay.
  put(group, box(1.55, .28, .31, '#34565b', .065), 0, 1.06, -.43); put(group, box(1.47, .028, .035, '#d0b887', .011), 0, .963, -.261);
  put(group, box(.76, .035, .19, '#233e48', .025), -.406, 1.301, -.365);
  const cluster = new THREE.Group(); cluster.name = 'Physical dashboard instruments'; put(group, cluster, -.42, 1.168, -.258);
  put(cluster, box(.73, .294, .013, '#263f49', .025), .014, -.014, -.009);
  type Gauge = { needle: THREE.Mesh; key: 'mph' | 'rpm' | 'fuelFraction' | 'conditionFraction'; maximum: number; current: number };
  const gauges: Gauge[] = [];
  const gauge = (title: string, x: number, y: number, radius: number, key: Gauge['key'], maximum: number, numbers: string[]) => {
    const face = canvasTexture(512, 512, ctx => {
      ctx.fillStyle = '#203d48'; ctx.fillRect(0, 0, 512, 512); ctx.strokeStyle = '#f3e8ce'; ctx.fillStyle = '#f3e8ce'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const ticks = (numbers.length - 1) * 2;
      for (let i = 0; i <= ticks; i++) { const a = (.76 - i / ticks * 1.52) * Math.PI, major = i % 2 === 0; ctx.lineWidth = major ? 5 : 2; ctx.beginPath(); ctx.moveTo(256 - Math.sin(a) * (major ? 199 : 209), 256 - Math.cos(a) * (major ? 199 : 209)); ctx.lineTo(256 - Math.sin(a) * 227, 256 - Math.cos(a) * 227); ctx.stroke(); if (major) { ctx.font = `600 ${numbers.length > 5 ? 40 : 47}px Arial, sans-serif`; ctx.fillText(numbers[i / 2], 256 - Math.sin(a) * 169, 256 - Math.cos(a) * 169); } }
      ctx.font = `700 ${title.length > 7 ? 31 : 41}px Arial, sans-serif`; ctx.fillStyle = '#adcac5'; ctx.fillText(title, 256, 359); ctx.fillStyle = '#d2ae69'; ctx.beginPath(); ctx.arc(256, 256, 8, 0, Math.PI * 2); ctx.fill();
    });
    if (face) ownTextures.push(face);
    const faceMaterial = new THREE.MeshBasicMaterial({ map: face ?? null, color: face ? '#ffffff' : '#203d48', toneMapped: false }); ownMaterials.push(faceMaterial);
    const faceGeometry = new THREE.CircleGeometry(radius, 40); ownGeometry.push(faceGeometry); put(cluster, new THREE.Mesh(faceGeometry, faceMaterial), x, y, 0); put(cluster, torus(radius * 1.04, .0045, chrome), x, y, .003);
    const needle = box(radius * .05, radius * .81, .004, '#f4bb76'); needle.name = `Dashboard needle ${key}`; needle.geometry = needle.geometry.clone().translate(0, radius * .28, 0); ownGeometry.push(needle.geometry); needle.castShadow = false; put(cluster, needle, x, y, .011);
    put(cluster, sphere(radius * .075, '#d2ae69', 1), x, y, .014).scale.set(1, 1, .35); gauges.push({ needle, key, maximum, current: key === 'fuelFraction' || key === 'conditionFraction' ? 1 : 0 });
  };
  gauge('MPH', -.16, .007, .105, 'mph', 120, ['0', '20', '40', '60', '80', '100', '120']);
  gauge('RPM ×1000', .085, .025, .081, 'rpm', 6000, ['0', '1', '2', '3', '4', '5', '6']);
  gauge('FUEL', .266, .06, .041, 'fuelFraction', 1, ['E', '½', 'F']); gauge('CAR', .266, -.039, .036, 'conditionFraction', 1, ['!', '½', '✓']);
  let lcdContext: CanvasRenderingContext2D | null = null, lcdTexture: THREE.CanvasTexture | undefined, lastReadout = '';
  if (typeof document !== 'undefined') { const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 144; lcdContext = canvas.getContext('2d'); if (lcdContext) { lcdTexture = new THREE.CanvasTexture(canvas); lcdTexture.colorSpace = THREE.SRGBColorSpace; ownTextures.push(lcdTexture); } }
  const lcdMaterial = new THREE.MeshBasicMaterial({ map: lcdTexture ?? null, color: lcdTexture ? '#ffffff' : '#8cbbad', toneMapped: false }); ownMaterials.push(lcdMaterial); put(cluster, box(.176, .039, .007, lcdMaterial, .003), .01, -.079, .006);
  const warningMaterial = new THREE.MeshBasicMaterial({ color: '#8ca891', toneMapped: false }); ownMaterials.push(warningMaterial); const warning = put(cluster, sphere(.008, warningMaterial, 1), .327, -.039, .015); warning.name = 'Dashboard warning lamp';
  let dashboard = vehicleDashboardState({ speedMps: 0, fuelGallons: 12 });
  const updateDashboard = (telemetry: VehicleDashboardTelemetry) => {
    dashboard = vehicleDashboardState(telemetry); const text = `${Math.round(dashboard.mph)} MPH  ${dashboard.gear}`;
    if (lcdContext && lcdTexture && text !== lastReadout) { lcdContext.fillStyle = '#bed7ba'; lcdContext.fillRect(0, 0, 640, 144); lcdContext.fillStyle = '#243f43'; lcdContext.font = '700 90px Arial, sans-serif'; lcdContext.textAlign = 'center'; lcdContext.textBaseline = 'middle'; lcdContext.fillText(text, 320, 78); lcdTexture.needsUpdate = true; lastReadout = text; }
    warningMaterial.color.set(dashboard.needsRepair ? '#ef7863' : dashboard.lowFuel ? '#f4bf70' : '#739a80');
    const nextDamageStage = Math.round((1 - dashboard.conditionFraction) * 12);
    if (nextDamageStage !== damageStage) { damageStage = nextDamageStage; const damage = damageStage / 12, vertices = bonnet.geometry.getAttribute('position');
      for (let i = 0; i < vertices.count; i++) { const x = undamagedBonnet[i * 3], y = undamagedBonnet[i * 3 + 1], z = undamagedBonnet[i * 3 + 2], dent = Math.exp(-((x + .25) ** 2 * 3.5 + (z + .25) ** 2 * 5)); vertices.setXYZ(i, x, y - damage * .12 * dent * Math.max(0, (y + .075) / .15), z + damage * .07 * dent); }
      vertices.needsUpdate = true; bonnet.geometry.computeVertexNormals(); bonnet.geometry.computeBoundingSphere(); frontBumper.rotation.z = damage * .04; frontBumper.position.y = .53 - damage * .045; headlight.emissiveIntensity = .15 * (1 - damage * .85);
    }
  };
  updateDashboard({ speedMps: 0, fuelGallons: 12 });
  for (const x of [-.72, .35, .65]) { put(group, box(.13, .085, .012, '#1e3328'), x, 1.095, -.26); for (let i = 0; i < 3; i++) put(group, box(.12, .006, .013, '#8b9e89'), x, 1.073 + i * .019, -.25); }
  put(group, box(.21, .07, .016, '#1a332a'), .035, 1.09, -.26); for (const x of [-.045, .12]) put(group, cylinder(.015, .025, '#b9c3ac'), x, 1.092, -.24).rotation.x = Math.PI / 2; put(group, box(.18, .055, .015, '#cfb96d'), .035, 1.015, -.258);
  const steeringWheel = new THREE.Group(); put(group, steeringWheel, -.43, 1.03, -.13); steeringWheel.rotation.x = -.22; steeringWheel.add(torus(.185, .024, mat('#28392f'))); put(steeringWheel, box(.29, .048, .04, '#778271', .015), 0, -.015, 0); put(steeringWheel, box(.052, .17, .038, '#778271', .015), 0, -.09, 0); put(steeringWheel, box(.095, .07, .05, '#314939', .02), 0, 0, .006);
  put(group, box(.24, .074, .035, '#344335', .015), 0, 1.6, -.61); put(group, box(.2, .05, .006, chrome), 0, 1.6, -.587); for (const side of [-1, 1]) put(group, box(.36, .13, .025, '#b8baa5', .02), side * .41, 1.625, -.55);
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const opaque = (Array.isArray(o.material) ? o.material : [o.material]).every(material => !material.transparent || material.opacity >= 1);
    // Ordinary shadow depth treats transparent glass as opaque. Keep the cockpit lit.
    o.castShadow = opaque && !gauges.some(gauge => gauge.needle === o); o.receiveShadow = opaque;
  });
  let angle = 0, visualSteering = 0, disposed = false;
  // Forward is -Z around an X axle, so the rolling surface moves +Z at the ground.
  const update = (speed: number, steering: number, dt: number) => { const frameDt = dashboardClamp(dt, 0, .1), blend = 1 - Math.exp(-frameDt * 14); angle = (angle - speed * frameDt / .345) % (Math.PI * 2); visualSteering += (steering - visualSteering) * blend; steeringWheel.rotation.z = -visualSteering * 14;
    spins.forEach(w => { w.rotation.x = angle; }); wheels.forEach((w, i) => { if (i < 2) w.rotation.y = -visualSteering; }); gauges.forEach(g => { g.current += (dashboard[g.key] - g.current) * blend; g.needle.rotation.z = (.76 - dashboardClamp(g.current / g.maximum, 0, 1) * 1.52) * Math.PI; }); };
  return { group, steeringWheel, wheels, cockpitEye: new THREE.Vector3(-.43, 1.38, .25), updateDashboard, update, dispose: () => { if (disposed) return; disposed = true; assets.dispose(); glass.dispose(); ownGeometry.forEach(g => g.dispose()); ownMaterials.forEach(m => m.dispose()); ownTextures.forEach(t => t.dispose()); } };
}

export const PERSON_PART_NAMES = ['pelvis', 'torso', 'head', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'upperLegL', 'lowerLegL', 'upperLegR', 'lowerLegR'] as const;
export type PersonPartName = typeof PERSON_PART_NAMES[number];
export type PersonPartPose = { position: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number } };
export type PersonRagdollPose = { previous: Record<PersonPartName, PersonPartPose>; parts: Record<PersonPartName, PersonPartPose> };
export type PersonRigPart = { object: THREE.Object3D; pivotFromCenter: THREE.Vector3 };
export type PersonModel = { group: THREE.Group; head: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; rig: Record<PersonPartName, PersonRigPart>; resetPose: () => void; setRagdoll: (active: boolean) => void; update: (speed: number, elapsed: number, activity?: 'idle' | 'phone' | 'work') => void; dispose: () => void };
/** Articulated, metre-scale people: skin/outfit variations, individual limbs, gait and a held-phone animation. */
export function createPerson(options: { avatar?: number; variant?: number } = {}): PersonModel {
  const assets = createAssetLibrary(), { box, sphere, cylinder, put } = assets;
  const avatar = Math.abs(options.avatar ?? options.variant ?? 0) % 16, group = new THREE.Group(); group.name = `Scout character ${avatar + 1}`;
  const skin = ['#e7bba0', '#bc8266', '#815a49', '#d6a77f'][avatar % 4], top = ['#4c8990', '#daa877', '#728cc1', '#ce877b', '#88a57d', '#8e83b7', '#62a5af', '#deb96f'][avatar % 8], pants = ['#334f61', '#53615f', '#52667c', '#635463'][Math.floor(avatar / 4)], hair = ['#51413e', '#885e46', '#cba16a', '#293e47'][Math.floor(avatar / 4)], ownedGeometry: THREE.BufferGeometry[] = [];
  const torso = put(group, box(.43, .56, .27, top, .07), 0, 1.14, 0), pelvis = put(group, box(.37, .22, .25, pants, .045), 0, .82, 0); put(group, cylinder(.072, .1, skin), 0, 1.475, 0);
  const head = new THREE.Group(); put(group, head, 0, 1.57, 0); put(head, sphere(.16, skin, 2), 0, 0, 0).scale.set(.82, 1.08, .89); put(head, sphere(.165, hair, 2), 0, .064, .025).scale.set(.89, .77, .86); if (avatar % 3 === 1) put(head, sphere(.125, hair), 0, -.04, .1).scale.set(.9, 1.35, .7);
  for (const x of [-.052, .052]) { put(head, sphere(.024, '#fff2db', 2), x, .006, -.127).scale.set(1, .68, .26); put(head, sphere(.017, ['#436a72', '#73634e', '#526f63', '#62576f'][avatar % 4], 2), x + .001, .006, -.135).scale.set(.67, .86, .24); put(head, sphere(.0105, '#24343d', 1), x + .001, .006, -.14).scale.set(.65, .92, .25); put(head, sphere(.0055, '#fff9e7', 1), x - .004, .012, -.143).scale.set(.8, .8, .25); put(head, box(.038, .008, .01, hair), x, .039, -.122).rotation.z = x > 0 ? -.09 : .09; }
  for (let tuft = 0; tuft < 3; tuft++) { const fringe = put(head, sphere(.059, hair, 1), -.077 + tuft * .063, .094 - tuft * .012, -.078); fringe.scale.set(.63, 1.2 - tuft * .1, .58); fringe.rotation.z = -.28; }
  put(head, sphere(.02, skin), 0, -.028, -.134).scale.set(.5, .75, 1); put(head, box(.043, .006, .006, '#aa796b'), 0, -.071, -.132); for (const x of [-.135, .135]) put(head, sphere(.03, skin), x, -.01, .005).scale.set(.5, 1, .75);
  for (const side of [-1, 1]) put(group, box(.095, .11, .025, '#f3e8ce', .015), side * .07, 1.372, -.135).rotation.z = side * -.32;
  put(group, box(.02, .40, .009, '#d4c09a'), 0, 1.146, -.144); put(group, box(.093, .097, .019, top, .015), .119, 1.184, -.149); put(group, box(.086, .008, .008, '#f3e8ce'), .119, 1.215, -.164);
  const leftArm = new THREE.Group(), rightArm = new THREE.Group(), forearms: THREE.Group[] = [], legs: THREE.Group[] = [], shins: THREE.Group[] = [];
  leftArm.name = 'left-upper-arm'; rightArm.name = 'right-upper-arm';
  for (const [side, arm] of [[-1, leftArm], [1, rightArm]] as const) {
    put(group, arm, side * .27, 1.35, 0); put(arm, cylinder(.076, .29, top, .08, 10), 0, -.13, 0).rotation.z = side * .04;
    const forearm = new THREE.Group(); put(arm, forearm, side * .01, -.27, 0); forearms.push(forearm); put(forearm, cylinder(.051, .23, skin, .059, 10), 0, -.105, 0); put(forearm, sphere(.056, skin), 0, -.23, -.006).scale.set(.75, 1.15, .6);
    const leg = new THREE.Group(); put(group, leg, side * .11, .76, 0); legs.push(leg); put(leg, cylinder(.087, .35, pants, .097, 10), 0, -.16, 0);
    const shin = new THREE.Group(); put(leg, shin, 0, -.33, 0); shins.push(shin); put(shin, cylinder(.065, .34, pants, .078, 10), 0, -.155, 0); put(shin, box(.15, .095, .27, '#333e37', .035), 0, -.352, -.065);
  }
  put(group, box(.39, .035, .26, '#445149'), 0, .9, 0); put(group, box(.044, .037, .012, '#cfb077'), 0, .899, -.143);
  if (avatar % 2 === 0) { put(group, box(.078, .10, .008, '#f3e8ce', .01), -.13, 1.2, -.145); put(group, box(.055, .016, .009, '#387f87'), -.13, 1.217, -.151); put(group, box(.02, .022, .01, '#d77b64'), -.148, 1.177, -.151); }
  if (avatar % 4 === 2) { put(group, box(.055, .5, .03, '#c99e70', .015), -.164, 1.15, -.15).rotation.z = -.15; put(group, box(.25, .20, .14, '#a0805d', .03), -.18, .835, .12); }
  if (avatar % 4 === 3) { for (const x of [-.05, .05]) put(head, box(.07, .04, .008, '#535744', .012), x, .003, -.142); put(head, box(.035, .006, .012, '#535744'), 0, .007, -.146); }
  const phone = put(forearms[1], box(.065, .11, .011, '#223d38', .009), 0, -.19, -.034); phone.name = 'held-phone'; phone.visible = false;
  let ragdollActive = false;
  const update = (speed: number, elapsed: number, activity: 'idle' | 'phone' | 'work' = 'idle') => {
    if (ragdollActive) return;
    const gait = elapsed * Math.min(7, 3 + Math.abs(speed) * 2), walk = Math.min(1, Math.abs(speed) / 1.4), cycle = Math.sin(gait);
    leftArm.rotation.x = cycle * .42 * walk; rightArm.rotation.x = -cycle * .42 * walk; leftArm.rotation.z = -.06; rightArm.rotation.z = .06;
    legs[0].rotation.x = -cycle * .44 * walk; legs[1].rotation.x = cycle * .44 * walk; shins[0].rotation.x = Math.max(0, cycle) * .38 * walk; shins[1].rotation.x = Math.max(0, -cycle) * .38 * walk; forearms[0].rotation.x = -.12 - walk * .12; forearms[1].rotation.x = -.12 - walk * .12;
    torso.position.y = 1.14 + Math.cos(gait * 2) * .015 * walk + Math.sin(elapsed * 1.3) * .005; head.rotation.y = Math.sin(elapsed * .35 + avatar) * .04 * (1 - walk); phone.visible = activity === 'phone';
    if (activity === 'phone') { rightArm.rotation.x = -1.06; rightArm.rotation.z = -.13; forearms[1].rotation.x = -1.3; }
    if (activity === 'work') { leftArm.rotation.x = -.75; rightArm.rotation.x = -.85 + Math.sin(elapsed * 1.4) * .04; }
  };
  // Fixed facial details batch per material; joints and phone remain independent.
  const headBatches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const object of [...head.children]) { if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) continue; const batch = headBatches.get(object.material) ?? []; batch.push(object); headBatches.set(object.material, batch); }
  headBatches.forEach((meshes, material) => { if (meshes.length < 2) return;
    const parts = meshes.map(mesh => { mesh.updateMatrix(); const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrix), part = transformed.index ? transformed.toNonIndexed() : transformed; if (part !== transformed) transformed.dispose(); return part; });
    const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose()); if (!geometry) return;
    ownedGeometry.push(geometry); const merged = new THREE.Mesh(geometry, material); merged.castShadow = merged.receiveShadow = true; head.add(merged); meshes.forEach(mesh => mesh.removeFromParent());
  });
  // Shirt seams, collar, badge, belt and bag belong to physical torso/pelvis
  // pieces. Otherwise an articulated fall would leave outfit details standing.
  group.updateMatrixWorld(true);
  for (const detail of [...group.children]) if (detail instanceof THREE.Mesh && detail !== torso && detail !== pelvis) (detail.position.y > .98 ? torso : pelvis).attach(detail);
  const rig: PersonModel['rig'] = {
    pelvis: { object: pelvis, pivotFromCenter: new THREE.Vector3() }, torso: { object: torso, pivotFromCenter: new THREE.Vector3() }, head: { object: head, pivotFromCenter: new THREE.Vector3() },
    upperArmL: { object: leftArm, pivotFromCenter: new THREE.Vector3(0, .13, 0) }, lowerArmL: { object: forearms[0], pivotFromCenter: new THREE.Vector3(-.01, .105, 0) },
    upperArmR: { object: rightArm, pivotFromCenter: new THREE.Vector3(0, .13, 0) }, lowerArmR: { object: forearms[1], pivotFromCenter: new THREE.Vector3(.01, .105, 0) },
    upperLegL: { object: legs[0], pivotFromCenter: new THREE.Vector3(0, .16, 0) }, lowerLegL: { object: shins[0], pivotFromCenter: new THREE.Vector3(0, .155, 0) },
    upperLegR: { object: legs[1], pivotFromCenter: new THREE.Vector3(0, .16, 0) }, lowerLegR: { object: shins[1], pivotFromCenter: new THREE.Vector3(0, .155, 0) },
  };
  for (const name of PERSON_PART_NAMES) rig[name].object.name = `person-${name}`;
  const rest = PERSON_PART_NAMES.map(name => ({ object: rig[name].object, position: rig[name].object.position.clone(), quaternion: rig[name].object.quaternion.clone(), scale: rig[name].object.scale.clone() }));
  const resetPose = () => { ragdollActive = false; group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1); group.userData.ragdoll = false; rest.forEach(part => { part.object.position.copy(part.position); part.object.quaternion.copy(part.quaternion); part.object.scale.copy(part.scale); }); phone.visible = false; update(0, 0); };
  const setRagdoll = (active: boolean) => { ragdollActive = active; group.userData.ragdoll = active; if (active) phone.visible = false; };
  let disposed = false; update(0, 0); return { group, head, leftArm, rightArm, rig, resetPose, setRagdoll, update, dispose: () => { if (disposed) return; disposed = true; assets.dispose(); ownedGeometry.forEach(geometry => geometry.dispose()); } };
}

// Reused math storage: applying eleven interpolated engine bodies does not
// allocate vectors, quaternions or geometry in the render loop.
const rigPosition = new THREE.Vector3(), rigOffset = new THREE.Vector3(), rigQuaternion = new THREE.Quaternion(), rigPreviousQuaternion = new THREE.Quaternion(), rigScale = new THREE.Vector3(1, 1, 1), rigWorld = new THREE.Matrix4(), rigLocal = new THREE.Matrix4();
const validPart = (part: PersonPartPose | undefined): part is PersonPartPose => !!part && Number.isFinite(part.position.x) && Number.isFinite(part.position.y) && Number.isFinite(part.position.z) && Number.isFinite(part.quaternion.x) && Number.isFinite(part.quaternion.y) && Number.isFinite(part.quaternion.z) && Number.isFinite(part.quaternion.w) && part.quaternion.x ** 2 + part.quaternion.y ** 2 + part.quaternion.z ** 2 + part.quaternion.w ** 2 > 1e-12;
/** Bind actual jointed clothing/limbs to an established engine's world poses. */
export function applyPersonRagdollPose(model: PersonModel, pose: PersonRagdollPose, alpha = 1): boolean {
  if (PERSON_PART_NAMES.some(name => !validPart(pose.parts[name]) || !validPart(pose.previous[name]))) return false;
  const amount = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  model.setRagdoll(true); model.group.position.set(0, 0, 0); model.group.quaternion.identity(); model.group.scale.set(1, 1, 1); model.group.updateWorldMatrix(true, false);
  for (const name of PERSON_PART_NAMES) {
    const previous = pose.previous[name], current = pose.parts[name], part = model.rig[name];
    rigPosition.set(previous.position.x + (current.position.x - previous.position.x) * amount, previous.position.y + (current.position.y - previous.position.y) * amount, previous.position.z + (current.position.z - previous.position.z) * amount);
    rigPreviousQuaternion.set(previous.quaternion.x, previous.quaternion.y, previous.quaternion.z, previous.quaternion.w).normalize();
    rigQuaternion.set(current.quaternion.x, current.quaternion.y, current.quaternion.z, current.quaternion.w).normalize(); rigPreviousQuaternion.slerp(rigQuaternion, amount);
    rigPosition.add(rigOffset.copy(part.pivotFromCenter).applyQuaternion(rigPreviousQuaternion)); rigWorld.compose(rigPosition, rigPreviousQuaternion, rigScale);
    part.object.parent!.updateWorldMatrix(true, false); rigLocal.copy(part.object.parent!.matrixWorld).invert().multiply(rigWorld).decompose(part.object.position, part.object.quaternion, part.object.scale); part.object.updateMatrixWorld(true);
  }
  return true;
}
