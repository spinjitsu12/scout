import * as THREE from 'three';
import { createAssetLibrary } from './immersive-assets.ts';
import { WORLD_ROADS } from './regional-roads.ts';
import type { PhysicsPropPose } from './immersive-physics.ts';
import { createTrafficSimulation, sampleTrafficRoute, type TrafficRoad, type TrafficPoint, type TrafficPlayer, type TrafficImpact, type TrafficHit, type TrafficCollider, type TrafficProp, type TrafficSimulation } from './traffic-data.ts';
export * from './traffic-data.ts';
export type TrafficWorld = { group: THREE.Group; simulation: TrafficSimulation; props: readonly TrafficProp[]; update: (dt: number, elapsed: number, player: TrafficPlayer) => void; render: (player: TrafficPlayer, elapsed: number, dt: number, alpha?: number) => void; applyPropPoses: (poses: readonly PhysicsPropPose[]) => void; nearbyCollisions: (point: TrafficPoint, radius?: number) => TrafficCollider[]; hit: (impact: TrafficImpact) => TrafficHit; dispose: () => void };
type CarPart = { mesh: THREE.InstancedMesh; local: THREE.Matrix4; role: 'body' | 'fixed' | 'brake'; crumple: boolean };
const CAR_COLORS = ['#487a89', '#e4d8bd', '#b86858', '#668d78', '#a88b63', '#7b819e', '#c9956b'], AXIS = new THREE.Vector3(0, 1, 0);

/** Shared instanced traffic geometry, continuous lane routes and physical breakaway fixtures. */
export function createTrafficWorld(options: { roads?: readonly TrafficRoad[]; maxCars?: number; visibilityDistance?: number } = {}): TrafficWorld {
  const simulation = createTrafficSimulation({ roads: options.roads ?? WORLD_ROADS, maxCars: options.maxCars }), group = new THREE.Group(); group.name = 'SCOUT regional traffic';
  const assets = createAssetLibrary(), { box, cylinder, sphere, put, mat } = assets, ownedGeometries = new Set<THREE.BufferGeometry>(), ownedMaterials = new Set<THREE.Material>();
  const unitBox = new THREE.BoxGeometry(1, 1, 1), tyreGeometry = new THREE.CylinderGeometry(.31, .31, .18, 10), hubGeometry = new THREE.CylinderGeometry(.16, .16, .19, 8); ownedGeometries.add(unitBox); ownedGeometries.add(tyreGeometry); ownedGeometries.add(hubGeometry);
  const material = (color: string, emissive = '#000000', intensity = 0) => { const result = new THREE.MeshStandardMaterial({ color, roughness: .64, metalness: .08, emissive, emissiveIntensity: intensity }); ownedMaterials.add(result); return result; };
  const paint = material('#ffffff'), windows = material('#405c6b'), metal = material('#b3b9ac'), bumper = material('#35434c'), rubber = material('#283238'), headlight = material('#ffe8b5', '#ffe7b5', .3), tail = material('#b8443e', '#d65c47', .3);
  const count = simulation.cars.length, parts: CarPart[] = [], matrix = new THREE.Matrix4(), transform = new THREE.Matrix4(), local = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1), hidden = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color('#ffffff'), litBrake = new THREE.Color('#ffb18b'), dimBrake = new THREE.Color('#b76257'), localPosition = new THREE.Vector3(), localQuaternion = new THREE.Quaternion(), localScale = new THREE.Vector3(1, 1, 1), fallAxis = new THREE.Vector3();
  const part = (geometry: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, role: CarPart['role'] = 'fixed', rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.InstancedMesh(geometry, surface, count); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = role === 'body'; mesh.receiveShadow = true;
    const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(width, height, depth));
    simulation.cars.forEach((car, index) => { mesh.setColorAt(index, role === 'body' ? new THREE.Color(CAR_COLORS[car.variant]) : white); mesh.setMatrixAt(index, hidden); }); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; group.add(mesh); parts.push({ mesh, local, role, crumple: role === 'body' && z < -.9 });
  };
  part(unitBox, paint, 0, .62, 0, 1.78, .5, 4.1, 'body'); part(unitBox, paint, 0, .95, -1.25, 1.7, .2, 1.25, 'body', -.07); part(unitBox, paint, 0, .95, 1.6, 1.7, .24, .68, 'body');
  part(unitBox, windows, 0, 1.2, .13, 1.54, .59, 1.81); part(unitBox, windows, 0, 1.19, -.9, 1.49, .58, .06, 'fixed', -.52); part(unitBox, paint, 0, 1.54, .21, 1.57, .11, 1.55, 'body'); part(unitBox, paint, 0, 1.16, .21, 1.57, .64, .08, 'body');
  for (const side of [-1, 1]) { part(unitBox, paint, side * .74, 1.18, -.69, .065, .7, .08, 'body', -.36); part(unitBox, paint, side * .74, 1.18, 1.02, .065, .7, .08, 'body', .25); part(unitBox, bumper, side * .94, 1.02, -.57, .2, .11, .24); part(unitBox, headlight, side * .61, .79, -2.064, .37, .2, .04); part(unitBox, tail, side * .62, .78, 2.065, .3, .22, .04, 'brake'); }
  part(unitBox, bumper, 0, .48, -2.02, 1.73, .18, .17); part(unitBox, bumper, 0, .49, 2.02, 1.73, .18, .17); part(unitBox, bumper, 0, .76, -2.064, .67, .16, .035); part(unitBox, metal, 0, .43, 2.116, .45, .12, .015);
  const wheels = new THREE.InstancedMesh(tyreGeometry, rubber, count * 4), hubs = new THREE.InstancedMesh(hubGeometry, metal, count * 4), hazards = new THREE.InstancedMesh(unitBox, material('#ffb862', '#ff9e46', .7), count * 4);
  for (const mesh of [wheels, hubs, hazards]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, hidden); group.add(mesh); }
  const wheelAngles = new Float64Array(count), visualPoses = simulation.cars.map(car => ({ x: car.x, z: car.z, heading: car.heading, visible: false }));
  const propViews = new Map<string, { group: THREE.Group; bulbs?: { mesh: THREE.Mesh; lit: THREE.MeshStandardMaterial; dim: THREE.MeshStandardMaterial; color: 'red' | 'yellow' | 'green' }[] }>();
  const bulbMaterials = (color: string) => ({ lit: material(color, color, 1.05), dim: material('#38494e') }), lens = { red: bulbMaterials('#f17966'), yellow: bulbMaterials('#f6cf70'), green: bulbMaterials('#8bd6b5') };
  for (const prop of simulation.props) {
    const model = new THREE.Group(); model.name = prop.id; model.position.set(prop.x, 0, prop.z); model.rotation.y = prop.heading; model.visible = false; group.add(model);
    if (prop.kind === 'bollard') { put(model, cylinder(.13, .94, '#557880', .1, 8), 0, .47, 0); put(model, cylinder(.115, .07, '#e7c77f', .115, 8), 0, .8, 0); put(model, cylinder(.17, .055, '#9eaaa0', .17, 8), 0, .03, 0); propViews.set(prop.id, { group: model }); continue; }
    put(model, cylinder(.11, prop.height, '#465e67', .075, 8), 0, prop.height / 2, 0); put(model, cylinder(.22, .18, '#748987', .19, 8), 0, .09, 0);
    if (prop.kind === 'lamp') { put(model, box(.1, .1, 1.3, '#465e67'), 0, prop.height - .08, -.57); put(model, box(.48, .13, .7, '#d2d9c4'), 0, prop.height - .16, -1.04); const warm = mat('#f3dfba'); warm.emissive.set('#efd4a0'); warm.emissiveIntensity = .35; put(model, box(.37, .012, .53, warm), 0, prop.height - .233, -1.04).castShadow = false; propViews.set(prop.id, { group: model }); }
    else { put(model, box(.1, .1, .77, '#465e67'), 0, prop.height - .08, -.3); put(model, box(.53, 1.5, .28, '#293f48', .07), 0, prop.height - .61, -.61); const bulbs = (['red', 'yellow', 'green'] as const).map((color, index) => { const y = prop.height - .16 - index * .45, materials = lens[color], mesh = put(model, sphere(.165, materials.dim, 1), 0, y, -.786); mesh.scale.z = .26; mesh.castShadow = false; put(model, box(.42, .05, .24, '#344c53'), 0, y + .23, -.79); return { mesh, ...materials, color }; }); propViews.set(prop.id, { group: model, bulbs }); }
  }
  const markings = new THREE.Group(); markings.name = 'Painted junction stop lines'; group.add(markings);
  simulation.network.signals.forEach(signal => { for (const forward of signal.approaches) { const ew = Math.abs(forward.x) > .5, breadth = ew ? signal.eastWestWidth : signal.northSouthWidth, cross = ew ? signal.northSouthWidth : signal.eastWestWidth, lane = Math.min(breadth * .25, 4.5), x = signal.x - forward.x * (cross / 2 + 4.4) - forward.z * lane, z = signal.z - forward.z * (cross / 2 + 4.4) + forward.x * lane, line = put(markings, box(ew ? .3 : breadth / 2 - .7, .012, ew ? breadth / 2 - .7 : .3, '#e7e4cc'), x, .034, z); line.castShadow = false; line.visible = false; } });
  const engineProps = new Map<string, PhysicsPropPose>(), propById = new Map(simulation.props.map(prop => [prop.id, prop]));
  const propCenter = new THREE.Vector3(), propPreviousQuaternion = new THREE.Quaternion(), propCurrentQuaternion = new THREE.Quaternion(), propOffset = new THREE.Vector3();
  const applyPropPoses = (poses: readonly PhysicsPropPose[]) => {
    if (disposed) return;
    for (const pose of poses) {
      const prop = propById.get(pose.id); if (!prop) continue;
      const valid = [pose.position.x, pose.position.y, pose.position.z, pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w,
        pose.previous.position.x, pose.previous.position.y, pose.previous.position.z, pose.previous.quaternion.x, pose.previous.quaternion.y, pose.previous.quaternion.z, pose.previous.quaternion.w, pose.height].every(Number.isFinite);
      if (!valid || pose.height <= 0 || pose.quaternion.x ** 2 + pose.quaternion.y ** 2 + pose.quaternion.z ** 2 + pose.quaternion.w ** 2 < 1e-12 || pose.previous.quaternion.x ** 2 + pose.previous.quaternion.y ** 2 + pose.previous.quaternion.z ** 2 + pose.previous.quaternion.w ** 2 < 1e-12) continue;
      engineProps.set(pose.id, pose);
      if (pose.fallen) prop.state = 'fallen';
    }
  };
  let disposed = false;
  const render = (player: TrafficPlayer, elapsed: number, dt: number, alpha = 1) => {
    if (disposed) return; const visibility = Math.max(100, Math.min(800, options.visibilityDistance ?? 560)), square = visibility ** 2, blink = Math.floor(elapsed * 2.4) % 2 === 0, response = 1 - Math.exp(-26 * Math.max(0, Math.min(.1, dt)));
    simulation.cars.forEach((car, index) => {
      const visible = (car.x - player.x) ** 2 + (car.z - player.z) ** 2 < square; wheelAngles[index] -= car.speed * Math.max(0, Math.min(.25, dt)) / .31;
      const pose = visualPoses[index], route = simulation.network.routes[car.route], span = (car.progress - car.previousProgress + route.length) % route.length, target = alpha < 1 ? sampleTrafficRoute(route, car.previousProgress + span * Math.max(0, alpha)) : car;
      if (!pose.visible || dt <= 0) { pose.x = target.x; pose.z = target.z; pose.heading = target.heading; } else { pose.x += (target.x - pose.x) * response; pose.z += (target.z - pose.z) * response; pose.heading += Math.atan2(Math.sin(target.heading - pose.heading), Math.cos(target.heading - pose.heading)) * response; } pose.visible = visible;
      if (visible) { position.set(pose.x, 0, pose.z); quaternion.setFromAxisAngle(AXIS, pose.heading); transform.compose(position, quaternion, scale); }
      for (const part of parts) { if (visible) { matrix.multiplyMatrices(transform, part.local); if (part.crumple && car.damage > 0) matrix.scale(localScale.set(1, 1 - car.damage * .3, 1 - car.damage * .24)); } part.mesh.setMatrixAt(index, visible ? matrix : hidden); if (part.role === 'brake') part.mesh.setColorAt(index, car.brake ? litBrake : dimBrake); }
      for (let wheel = 0; wheel < 4; wheel++) { const side = wheel % 2 ? 1 : -1, z = wheel < 2 ? -1.23 : 1.23; localPosition.set(side * .84, .32, z); localQuaternion.setFromEuler(new THREE.Euler(wheelAngles[index], 0, Math.PI / 2)); local.compose(localPosition, localQuaternion, scale); wheels.setMatrixAt(index * 4 + wheel, visible ? matrix.multiplyMatrices(transform, local) : hidden); hubs.setMatrixAt(index * 4 + wheel, visible ? matrix : hidden); localPosition.set(side * .78, .77, wheel < 2 ? -2.087 : 2.087); localQuaternion.identity(); localScale.set(.08, .12, .03); local.compose(localPosition, localQuaternion, localScale); hazards.setMatrixAt(index * 4 + wheel, visible && car.stoppedFor > 0 && blink ? matrix.multiplyMatrices(transform, local) : hidden); }
    });
    for (const part of parts) { part.mesh.instanceMatrix.needsUpdate = true; if (part.role === 'brake' && part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true; } wheels.instanceMatrix.needsUpdate = true; hubs.instanceMatrix.needsUpdate = true; hazards.instanceMatrix.needsUpdate = true;
    for (const prop of simulation.props) {
      const view = propViews.get(prop.id)!, pose = engineProps.get(prop.id), focusX = pose?.position.x ?? prop.x, focusZ = pose?.position.z ?? prop.z;
      view.group.visible = (focusX - player.x) ** 2 + (focusZ - player.z) ** 2 < square; if (!view.group.visible) continue;
      if (pose) {
        const amount = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
        propCenter.set(pose.previous.position.x + (pose.position.x - pose.previous.position.x) * amount, pose.previous.position.y + (pose.position.y - pose.previous.position.y) * amount, pose.previous.position.z + (pose.position.z - pose.previous.position.z) * amount);
        propPreviousQuaternion.set(pose.previous.quaternion.x, pose.previous.quaternion.y, pose.previous.quaternion.z, pose.previous.quaternion.w).normalize();
        propCurrentQuaternion.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w).normalize(); propPreviousQuaternion.slerp(propCurrentQuaternion, amount);
        propOffset.set(0, pose.height / 2, 0).applyQuaternion(propPreviousQuaternion);
        view.group.position.copy(propCenter).sub(propOffset); view.group.quaternion.copy(propPreviousQuaternion);
      } else if (prop.state === 'fallen') {
        const fraction = Math.min(1, prop.fallAge / .85), angle = Math.min(Math.PI / 2 - .02, (1 - Math.cos(fraction * Math.PI / 2)) * (Math.PI / 2 - .02)); fallAxis.set(prop.fallDirection.z, 0, -prop.fallDirection.x); quaternion.setFromAxisAngle(fallAxis, angle); view.group.quaternion.copy(quaternion).multiply(localQuaternion.setFromAxisAngle(AXIS, prop.heading));
      } else { const nudge = prop.impactAge < .65 ? Math.sin(prop.impactAge * 17) * .05 * (1 - prop.impactAge / .65) : 0; view.group.rotation.set(nudge, prop.heading, 0); }
      if (view.bulbs) { const phase = prop.state === 'standing' ? simulation.phase(prop.signalId!, prop.axis!) : undefined; for (const bulb of view.bulbs) bulb.mesh.material = phase === bulb.color ? bulb.lit : bulb.dim; }
    }
    for (const line of markings.children) line.visible = (line.position.x - player.x) ** 2 + (line.position.z - player.z) ** 2 < square;
  };
  const update = (dt: number, elapsed: number, player: TrafficPlayer) => { if (disposed) return; simulation.update(dt, elapsed, player); render(player, elapsed, dt); };
  const dispose = () => { if (disposed) return; disposed = true; engineProps.clear(); group.removeFromParent(); assets.dispose(); for (const part of parts) part.mesh.dispose(); wheels.dispose(); hubs.dispose(); hazards.dispose(); ownedGeometries.forEach(geometry => geometry.dispose()); ownedMaterials.forEach(material => material.dispose()); group.clear(); };
  return { group, simulation, props: simulation.props, update, render, applyPropPoses, nearbyCollisions: (point, radius = 40) => simulation.nearbyCollisions(point, radius), hit: impact => simulation.hit(impact), dispose };
}
