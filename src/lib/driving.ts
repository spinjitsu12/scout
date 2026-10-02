/** Collision, movement and camera math for the playable scouting district. */
export type DrivePoint = { x: number; y: number };
export type DriveRect = DrivePoint & { width: number; height: number };
export type DriveCamera = { x: number; y: number; scale: number; width: number; height: number };
export type DistrictGeometry = { roads: readonly DriveRect[]; solids: readonly DriveRect[] };
export type VehicleMotion = { position: DrivePoint; velocity: DrivePoint; heading: number };
export const DISTRICT_SIZE = { width: 1536, height: 1024 };
const roadGrid = (left: number, middle: number, right: number, top: number, cross: number, bottom: number, widths: readonly [number, number, number, number, number, number]): DriveRect[] => [
  { x: left - widths[0] / 2, y: top - widths[0] / 2, width: right - left + widths[0], height: widths[0] },
  { x: left - widths[1] / 2, y: cross - widths[1] / 2, width: right - left + widths[1], height: widths[1] },
  { x: left - widths[2] / 2, y: bottom - widths[2] / 2, width: right - left + widths[2], height: widths[2] },
  { x: left - widths[3] / 2, y: top - widths[0] / 2, width: widths[3], height: bottom - top + (widths[0] + widths[2]) / 2 },
  { x: middle - widths[4] / 2, y: top - widths[0] / 2, width: widths[4], height: bottom - top + (widths[0] + widths[2]) / 2 },
  { x: right - widths[5] / 2, y: top - widths[0] / 2, width: widths[5], height: bottom - top + (widths[0] + widths[2]) / 2 },
  // A legal fuel forecourt joins the central road; both tow and free driving can leave it.
  { x: middle - widths[4] / 2, y: 590, width: 940 - middle + widths[4] / 2, height: 104 },
];
export const DISTRICT_GEOMETRIES: readonly DistrictGeometry[] = [
  { roads: roadGrid(202, 768, 1336, 266, 486, 718, [58, 64, 62, 82, 80, 92]), solids: [
    { x: 147, y: 24, width: 450, height: 139 }, { x: 912, y: 23, width: 496, height: 161 },
    { x: 105, y: 776, width: 515, height: 108 }, { x: 915, y: 776, width: 485, height: 128 },
  ] },
  { roads: roadGrid(263, 768, 1276, 275, 508, 752, [71, 70, 76, 86, 92, 86]), solids: [
    { x: 150, y: 26, width: 444, height: 143 }, { x: 943, y: 28, width: 463, height: 145 },
    { x: 151, y: 811, width: 444, height: 94 }, { x: 943, y: 811, width: 463, height: 104 },
  ] },
  { roads: roadGrid(209, 768, 1335, 266, 480, 702, [60, 64, 64, 78, 78, 84]), solids: [
    { x: 138, y: 24, width: 486, height: 143 }, { x: 912, y: 24, width: 508, height: 142 },
    { x: 125, y: 766, width: 501, height: 119 }, { x: 944, y: 776, width: 466, height: 123 },
  ] },
];
export const DEFAULT_GEOMETRY = DISTRICT_GEOMETRIES[0];
export const ROAD_RECTS = DEFAULT_GEOMETRY.roads;
export const DISTRICT_SOLIDS = DEFAULT_GEOMETRY.solids;
export const VEHICLE_SCALE = .58;
export const WALK_SPEED = 165;
export const DRIVE_SPEED = 310;
const EPSILON = .00001;
export const driveDistance = (a: DrivePoint, b: DrivePoint) => Math.hypot(a.x - b.x, a.y - b.y);
const inRect = (point: DrivePoint, rect: DriveRect) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
const insideBounds = (point: DrivePoint, radius: number) => point.x >= radius + 12 && point.y >= radius + 12 && point.x <= DISTRICT_SIZE.width - radius - 12 && point.y <= DISTRICT_SIZE.height - radius - 12;
export function districtWalkable(point: DrivePoint, radius = 10, geometry: DistrictGeometry = DEFAULT_GEOMETRY): boolean {
  return insideBounds(point, radius) && !geometry.solids.some(rect => point.x > rect.x - radius && point.x < rect.x + rect.width + radius && point.y > rect.y - radius && point.y < rect.y + rect.height + radius);
}
/** Clearance for navigation centers. Live cars use their oriented rectangle below. */
export function districtDrivable(point: DrivePoint, radius = 13, geometry: DistrictGeometry = DEFAULT_GEOMETRY): boolean {
  if (!insideBounds(point, radius)) return false;
  for (let angle = 0; angle < Math.PI * 2 - EPSILON; angle += Math.PI / 4) {
    const edge = { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
    if (!geometry.roads.some(rect => inRect(edge, rect))) return false;
  }
  return geometry.roads.some(rect => inRect(point, rect));
}
export function districtMove(start: DrivePoint, delta: DrivePoint, driving = false, geometry: DistrictGeometry = DEFAULT_GEOMETRY): DrivePoint {
  const valid = (point: DrivePoint) => driving ? districtDrivable(point, 13, geometry) : districtWalkable(point, 10, geometry);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / 5));
  const point = { ...start };
  for (let i = 0; i < steps; i++) {
    const x = { x: point.x + delta.x / steps, y: point.y };
    if (valid(x)) point.x = x.x;
    const y = { x: point.x, y: point.y + delta.y / steps };
    if (valid(y)) point.y = y.y;
  }
  return point;
}
export function driveInput(keys: ReadonlySet<string>): DrivePoint {
  const x = Number(keys.has('d') || keys.has('ArrowRight')) - Number(keys.has('a') || keys.has('ArrowLeft'));
  const y = Number(keys.has('s') || keys.has('ArrowDown')) - Number(keys.has('w') || keys.has('ArrowUp'));
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
export function shortestAngle(from: number, to: number): number {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}
/** Exponential response makes acceleration/braking stable across display refresh rates. */
export function stepVehicle(motion: VehicleMotion, input: DrivePoint, seconds: number, brake = false, geometry: DistrictGeometry = DEFAULT_GEOMETRY): VehicleMotion {
  const dt = Math.max(0, Math.min(seconds, .1));
  const length = Math.hypot(input.x, input.y);
  const normalized = length > 1 ? { x: input.x / length, y: input.y / length } : input;
  const target = brake ? { x: 0, y: 0 } : { x: normalized.x * DRIVE_SPEED, y: normalized.y * DRIVE_SPEED };
  const response = brake ? 15 : length ? 5.1 : 4.8;
  const amount = 1 - Math.exp(-response * dt);
  let velocity = { x: motion.velocity.x + (target.x - motion.velocity.x) * amount, y: motion.velocity.y + (target.y - motion.velocity.y) * amount };
  if (!length && Math.hypot(velocity.x, velocity.y) < 2) velocity = { x: 0, y: 0 };
  const delta = { x: velocity.x * dt, y: velocity.y * dt };
  const position = districtMove(motion.position, delta, true, geometry);
  if (Math.abs(position.x - motion.position.x - delta.x) > .01) velocity.x = 0;
  if (Math.abs(position.y - motion.position.y - delta.y) > .01) velocity.y = 0;
  const speed = Math.hypot(velocity.x, velocity.y);
  const targetHeading = speed > 3 ? Math.atan2(velocity.y, velocity.x) : motion.heading;
  const heading = (motion.heading + shortestAngle(motion.heading, targetHeading) * (1 - Math.exp(-10 * dt)) + Math.PI * 2) % (Math.PI * 2);
  return { position, velocity, heading };
}
export type SteeringInput = { throttle: number; steer: number; brake: boolean };
export function steeringInput(keys: ReadonlySet<string>): SteeringInput {
  return {
    throttle: Number(keys.has('w') || keys.has('ArrowUp')) - Number(keys.has('s') || keys.has('ArrowDown')),
    steer: Number(keys.has('d') || keys.has('ArrowRight')) - Number(keys.has('a') || keys.has('ArrowLeft')),
    brake: keys.has(' ') || keys.has('Space') || keys.has('Shift'),
  };
}
/** Rectangle corners and edge samples follow the rendered car, rather than an oversized circle. */
export function vehicleFootprintFits(position: DrivePoint, heading: number, kind: 'compact' | 'wagon' | 'coupe', geometry: DistrictGeometry = DEFAULT_GEOMETRY): boolean {
  const halfLength = (kind === 'wagon' ? 43 : kind === 'coupe' ? 41 : 37) * VEHICLE_SCALE;
  const halfWidth = 22 * VEHICLE_SCALE;
  const c = Math.cos(heading), s = Math.sin(heading);
  for (const x of [-halfLength, 0, halfLength]) for (const y of [-halfWidth, 0, halfWidth]) {
    const point = { x: position.x + x * c - y * s, y: position.y + x * s + y * c };
    if (!insideBounds(point, 0) || !geometry.roads.some(rect => inRect(point, rect))) return false;
  }
  return true;
}
export function stepSteeredVehicle(motion: VehicleMotion, input: SteeringInput, seconds: number, kind: 'compact' | 'wagon' | 'coupe' = 'compact', geometry: DistrictGeometry = DEFAULT_GEOMETRY): VehicleMotion {
  const dt = Math.max(0, Math.min(seconds, .1));
  const forward = { x: Math.cos(motion.heading), y: Math.sin(motion.heading) };
  let speed = motion.velocity.x * forward.x + motion.velocity.y * forward.y;
  const target = input.brake ? 0 : Math.max(-1, Math.min(1, input.throttle)) * (input.throttle < 0 ? 120 : DRIVE_SPEED);
  speed += (target - speed) * (1 - Math.exp(-(input.brake ? 14 : input.throttle ? 2.8 : 3.5) * dt));
  if (Math.abs(speed) < 1.5 && !input.throttle) speed = 0;
  const direction = speed < -3 ? -1 : 1;
  const rotation = Math.max(-1, Math.min(1, input.steer)) * (1 + Math.min(1, Math.abs(speed) / 70) * 1.5) * direction * dt;
  let heading = (motion.heading + rotation + Math.PI * 2) % (Math.PI * 2);
  if (!vehicleFootprintFits(motion.position, heading, kind, geometry)) heading = motion.heading;
  const velocity = { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed };
  const steps = Math.max(1, Math.ceil(Math.abs(speed) * dt / 3));
  const position = { ...motion.position };
  let blocked = false;
  for (let i = 0; i < steps; i++) {
    const next = { x: position.x + velocity.x * dt / steps, y: position.y + velocity.y * dt / steps };
    if (!vehicleFootprintFits(next, heading, kind, geometry)) { blocked = true; break; }
    position.x = next.x; position.y = next.y;
  }
  return { position, velocity: blocked ? { x: 0, y: 0 } : velocity, heading };
}
export function exitVehicle(position: DrivePoint, heading: number, geometry: DistrictGeometry = DEFAULT_GEOMETRY): DrivePoint | null {
  for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
    const direction = heading + offset;
    const point = { x: position.x + Math.cos(direction) * 49, y: position.y + Math.sin(direction) * 49 };
    if (districtWalkable(point, 10, geometry)) return point;
  }
  return null;
}
export function districtCamera(width: number, height: number, focus: DrivePoint): DriveCamera {
  // Characters remain readable on phones; the camera follows rather than shrinking the map.
  const scale = width < 600 ? 1.18 : Math.min(1.32, Math.max(1.08, width / 1220));
  const viewWidth = Math.min(DISTRICT_SIZE.width, width / scale);
  const viewHeight = Math.min(DISTRICT_SIZE.height, height / scale);
  return { x: Math.max(0, Math.min(DISTRICT_SIZE.width - viewWidth, focus.x - viewWidth / 2)), y: Math.max(0, Math.min(DISTRICT_SIZE.height - viewHeight, focus.y - viewHeight / 2 + 25)), scale, width, height };
}
export const districtToScreen = (point: DrivePoint, camera: DriveCamera): DrivePoint => ({ x: (point.x - camera.x) * camera.scale, y: (point.y - camera.y) * camera.scale });
export const districtToWorld = (point: DrivePoint, camera: DriveCamera): DrivePoint => ({ x: point.x / camera.scale + camera.x, y: point.y / camera.scale + camera.y });

const CELL = 24;
const COLS = Math.ceil(DISTRICT_SIZE.width / CELL);
const ROWS = Math.ceil(DISTRICT_SIZE.height / CELL);
const cellPoint = (index: number): DrivePoint => ({ x: (index % COLS + .5) * CELL, y: (Math.floor(index / COLS) + .5) * CELL });
export function districtSegmentClear(start: DrivePoint, end: DrivePoint, driving = false, geometry: DistrictGeometry = DEFAULT_GEOMETRY): boolean {
  const valid = (point: DrivePoint) => driving ? districtDrivable(point, 13, geometry) : districtWalkable(point, 10, geometry);
  const steps = Math.max(1, Math.ceil(driveDistance(start, end) / 6));
  for (let i = 0; i <= steps; i++) {
    if (!valid({ x: start.x + (end.x - start.x) * i / steps, y: start.y + (end.y - start.y) * i / steps })) return false;
  }
  return true;
}
export function nearestDistrictPoint(point: DrivePoint, driving = false, geometry: DistrictGeometry = DEFAULT_GEOMETRY): DrivePoint {
  const valid = (option: DrivePoint) => driving ? districtDrivable(option, 13, geometry) : districtWalkable(option, 10, geometry);
  if (valid(point)) return { ...point };
  let nearest = { x: 360, y: 320 };
  let best = Infinity;
  for (let index = 0; index < COLS * ROWS; index++) {
    const option = cellPoint(index);
    const gap = driveDistance(point, option);
    if (gap < best && valid(option)) { nearest = option; best = gap; }
  }
  return nearest;
}
/** A* for genuine walk/click routes and opt-in assisted driving. GPS never moves the player. */
export function districtPath(start: DrivePoint, requested: DrivePoint, driving = false, geometry: DistrictGeometry = DEFAULT_GEOMETRY): DrivePoint[] {
  const goal = nearestDistrictPoint(requested, driving, geometry);
  if (districtSegmentClear(start, goal, driving, geometry)) return [goal];
  const valid = (point: DrivePoint) => driving ? districtDrivable(point, 13, geometry) : districtWalkable(point, 10, geometry);
  const walkable = Array.from({ length: COLS * ROWS }, (_, i) => valid(cellPoint(i)));
  const nearestCell = (point: DrivePoint) => {
    let nearest = -1; let best = Infinity;
    for (let i = 0; i < walkable.length; i++) {
      if (!walkable[i]) continue;
      const gap = driveDistance(point, cellPoint(i));
      if (gap < best && districtSegmentClear(point, cellPoint(i), driving, geometry)) { nearest = i; best = gap; }
    }
    return nearest;
  };
  const first = nearestCell(start), last = nearestCell(goal);
  if (first < 0 || last < 0) return [];
  const open = new Set([first]); const closed = new Set<number>(); const came = new Map<number, number>();
  const costs = new Float64Array(COLS * ROWS).fill(Infinity); const estimates = new Float64Array(COLS * ROWS).fill(Infinity);
  costs[first] = 0; estimates[first] = driveDistance(cellPoint(first), cellPoint(last));
  while (open.size) {
    let current = -1, best = Infinity;
    for (const i of open) if (estimates[i] < best) { current = i; best = estimates[i]; }
    if (current === last) {
      const indices = [current];
      while (came.has(indices[0])) indices.unshift(came.get(indices[0])!);
      const raw = [start, ...indices.map(cellPoint), goal];
      const route: DrivePoint[] = []; let anchor = 0;
      while (anchor < raw.length - 1) {
        let next = raw.length - 1;
        while (next > anchor + 1 && !districtSegmentClear(raw[anchor], raw[next], driving, geometry)) next--;
        route.push(raw[next]); anchor = next;
      }
      return route;
    }
    open.delete(current); closed.add(current);
    const cx = current % COLS, cy = Math.floor(current / COLS);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const next = ny * COLS + nx;
      if (!walkable[next] || closed.has(next) || !districtSegmentClear(cellPoint(current), cellPoint(next), driving, geometry)) continue;
      const cost = costs[current] + CELL * (dx && dy ? Math.SQRT2 : 1);
      if (cost >= costs[next]) continue;
      came.set(next, current); costs[next] = cost; estimates[next] = cost + driveDistance(cellPoint(next), cellPoint(last)); open.add(next);
    }
  }
  return [];
}
/** Caller translates to the car's center. Cars face east before heading rotation. */
export function drawPixelCar(ctx: CanvasRenderingContext2D, kind: 'compact' | 'wagon' | 'coupe', paint: string, heading = 0, plate?: string): void {
  ctx.save();
  ctx.rotate(Math.round(heading / (Math.PI / 4)) * Math.PI / 4);
  const long = kind === 'wagon' ? 80 : kind === 'coupe' ? 76 : 68;
  const rear = -long / 2, front = long / 2;
  ctx.fillStyle = '#0e2029'; ctx.fillRect(rear - 2, -15, long + 4, 30); ctx.fillRect(rear + 8, -22, 12, 8); ctx.fillRect(front - 21, -22, 12, 8); ctx.fillRect(rear + 8, 14, 12, 8); ctx.fillRect(front - 21, 14, 12, 8);
  ctx.fillStyle = '#334752'; ctx.fillRect(rear + 10, -22, 8, 3); ctx.fillRect(front - 19, -22, 8, 3); ctx.fillRect(rear + 10, 19, 8, 3); ctx.fillRect(front - 19, 19, 8, 3);
  ctx.fillStyle = paint; ctx.fillRect(rear, -15, long, 30); ctx.fillRect(rear + 4, -18, long - 8, 36);
  ctx.fillStyle = '#c8ede3'; ctx.globalAlpha = .45; ctx.fillRect(rear + 7, -16, long - 15, 3); ctx.globalAlpha = 1;
  ctx.fillStyle = '#203b48'; const cabinWidth = kind === 'wagon' ? 43 : kind === 'coupe' ? 31 : 32;
  const cabinX = rear + (kind === 'coupe' ? 11 : 12); ctx.fillRect(cabinX, -13, cabinWidth, 26);
  ctx.fillStyle = '#789daf'; ctx.fillRect(cabinX + cabinWidth - 7, -11, 5, 22); ctx.fillStyle = '#486b7c'; ctx.fillRect(cabinX + 2, -11, 5, 22);
  ctx.fillStyle = paint; ctx.fillRect(cabinX + 9, -13, cabinWidth - 18, 26); ctx.fillStyle = '#bedcd3'; ctx.globalAlpha = .35; ctx.fillRect(cabinX + 10, -11, cabinWidth - 20, 3); ctx.globalAlpha = 1;
  if (kind === 'wagon') { ctx.fillStyle = '#425560'; ctx.fillRect(cabinX + 10, -11, 25, 2); ctx.fillRect(cabinX + 10, 9, 25, 2); }
  if (kind === 'coupe') { ctx.fillStyle = '#334852'; ctx.fillRect(rear + 2, -16, 4, 32); }
  ctx.fillStyle = '#eff4c6'; ctx.fillRect(front - 3, -13, 5, 7); ctx.fillRect(front - 3, 6, 5, 7);
  ctx.fillStyle = '#ec8975'; ctx.fillRect(rear - 1, -13, 4, 6); ctx.fillRect(rear - 1, 7, 4, 6);
  ctx.fillStyle = '#37505b'; ctx.fillRect(rear - 3, -6, 3, 12); ctx.fillRect(front, -7, 3, 14);
  ctx.fillStyle = '#e7e8cd'; ctx.fillRect(rear, -4, 3, 8);
  if (plate && kind === 'wagon') { ctx.fillStyle = '#26454d'; ctx.fillRect(cabinX + 13, -5, 22, 10); ctx.fillStyle = '#e2efd4'; ctx.font = '7px ScoutPixel, monospace'; ctx.textAlign = 'center'; ctx.fillText(plate.slice(0, 5), cabinX + 24, 3); }
  ctx.restore();
}

export function fuelAfterDistance(fuel: number, distance: number, kind: 'compact' | 'wagon' | 'coupe'): number {
  const pixelsPerGallon = { compact: 650, wagon: 520, coupe: 600 }[kind];
  return Math.max(0, Math.min(12, fuel) - Math.max(0, distance) / pixelsPerGallon);
}

/** Road-center graph keeps GPS corner pivots away from curbs. */
export function districtRoadRoute(start: DrivePoint, requested: DrivePoint, geometry: DistrictGeometry = DEFAULT_GEOMETRY): DrivePoint[] {
  const goal = nearestDistrictPoint(requested, true, geometry);
  const nodes: DrivePoint[] = [{ ...start }, goal];
  const add = (point: DrivePoint) => {
    if (!districtDrivable(point, 13, geometry)) return -1;
    const found = nodes.findIndex(node => driveDistance(point, node) < .1);
    if (found >= 0) return found;
    nodes.push(point); return nodes.length - 1;
  };
  const lines = geometry.roads.map(road => road.width > road.height ? { horizontal: true, start: { x: road.x + 14, y: road.y + road.height / 2 }, end: { x: road.x + road.width - 14, y: road.y + road.height / 2 } } : { horizontal: false, start: { x: road.x + road.width / 2, y: road.y + 14 }, end: { x: road.x + road.width / 2, y: road.y + road.height - 14 } });
  for (const line of lines) {
    for (const point of [start, goal]) {
      add(line.horizontal ? { x: Math.max(line.start.x, Math.min(line.end.x, point.x)), y: line.start.y } : { x: line.start.x, y: Math.max(line.start.y, Math.min(line.end.y, point.y)) });
    }
    for (const other of lines) {
      if (line.horizontal === other.horizontal) continue;
      const horizontal = line.horizontal ? line : other, vertical = line.horizontal ? other : line;
      const point = { x: vertical.start.x, y: horizontal.start.y };
      if (point.x >= horizontal.start.x && point.x <= horizontal.end.x && point.y >= vertical.start.y && point.y <= vertical.end.y) add(point);
    }
  }
  const costs = new Float64Array(nodes.length).fill(Infinity), came = new Map<number, number>(), visited = new Set<number>();
  costs[0] = 0;
  while (visited.size < nodes.length) {
    let current = -1, best = Infinity;
    for (let index = 0; index < nodes.length; index++) if (!visited.has(index) && costs[index] < best) { current = index; best = costs[index]; }
    if (current < 0) break;
    if (current === 1) {
      const indices = [1]; while (came.has(indices[0])) indices.unshift(came.get(indices[0])!);
      return indices.slice(1).map(index => nodes[index]);
    }
    visited.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (visited.has(next) || next === current) continue;
      const a = nodes[current], b = nodes[next];
      const onLine = Math.abs(a.x - b.x) < .1 || Math.abs(a.y - b.y) < .1;
      // Only the first and last short attachment may leave a centerline.
      if (!onLine && current !== 0 && next !== 1) continue;
      if (!onLine && driveDistance(a, b) > 45) continue;
      if (!districtSegmentClear(a, b, true, geometry)) continue;
      const cost = best + driveDistance(a, b);
      if (cost < costs[next]) { costs[next] = cost; came.set(next, current); }
    }
  }
  return districtPath(start, goal, true, geometry);
}

export function assistedSteering(motion: VehicleMotion, waypoint: DrivePoint, final: boolean): SteeringInput {
  const gap = driveDistance(motion.position, waypoint);
  const desired = Math.atan2(waypoint.y - motion.position.y, waypoint.x - motion.position.x);
  const forwardAngle = shortestAngle(motion.heading, desired), backwardAngle = shortestAngle(motion.heading, desired + Math.PI);
  const reversing = Math.abs(backwardAngle) + .16 < Math.abs(forwardAngle);
  const angle = reversing ? backwardAngle : forwardAngle;
  const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
  const signedSpeed = motion.velocity.x * Math.cos(motion.heading) + motion.velocity.y * Math.sin(motion.heading);
  const pivot = Math.abs(angle) > .17;
  return {
    throttle: pivot ? 0 : (reversing ? -1 : 1) * Math.min(reversing ? .85 : .7, gap / (final ? 75 : 65)),
    steer: Math.max(-1, Math.min(1, angle * 4)) * (signedSpeed < -3 ? -1 : 1),
    brake: pivot && speed > 3 || gap < Math.max(2, speed / 11 + .8),
  };
}

export function assistedWaypointReached(motion: VehicleMotion, waypoint: DrivePoint): boolean {
  return driveDistance(motion.position, waypoint) < 3.2 && Math.hypot(motion.velocity.x, motion.velocity.y) < 4;
}
