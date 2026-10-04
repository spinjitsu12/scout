/** Metre-scale road traffic, independent of Three.js and the DOM. */
export type TrafficPoint = { x: number; z: number };
export type TrafficRoad = TrafficPoint & { id?: string; regionId?: string; kind?: 'street' | 'highway' | 'country' | 'access'; width: number; depth: number; speedLimit?: number };
export type TrafficSignal = TrafficPoint & { id: string; offset: number; eastWestWidth: number; northSouthWidth: number; approaches: TrafficPoint[] };
export type TrafficSignalColor = 'red' | 'yellow' | 'green';
export type TrafficRoutePoint = TrafficPoint & { distance: number; speedLimit: number };
export type TrafficStop = { distance: number; signalId: string; axis: 'east-west' | 'north-south' };
export type TrafficRoute = { id: string; length: number; points: TrafficRoutePoint[]; stops: TrafficStop[]; kind: 'town' | 'regional' };
export type TrafficProp = TrafficPoint & { id: string; kind: 'lamp' | 'bollard' | 'signal'; height: number; radius: number; heading: number; signalId?: string; axis?: TrafficStop['axis']; state: 'standing' | 'fallen'; fallAge: number; fallDirection: TrafficPoint; impactAge: number };
export type TrafficCar = TrafficPoint & { id: string; route: number; progress: number; previousProgress: number; speed: number; heading: number; brake: number; variant: number; damage: number; stoppedFor: number; impactAge: number };
export type TrafficCollider = { id: string; kind: 'vehicle' | 'prop'; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };
export type TrafficImpact = { collider: { id?: string }; position: TrafficPoint; heading?: number; speed: number; normalSpeed?: number; severity?: number };
export type TrafficHit = { handled: boolean; knockedDown: boolean; firstImpact: boolean; kind?: 'vehicle' | TrafficProp['kind']; speed: number };
export type TrafficPlayer = TrafficPoint & { heading?: number; speed?: number; driving?: boolean };
export type TrafficNetwork = { roads: readonly TrafficRoad[]; routes: TrafficRoute[]; signals: TrafficSignal[]; props: TrafficProp[] };
export const TRAFFIC_CAR = Object.freeze({ width: 1.82, length: 4.35, acceleration: 1.65, braking: 4.1, standstillGap: 2.1, maxCars: 96 });
export const TRAFFIC_SIGNAL_CYCLE = 58;
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, finite(value)));
const wrap = (value: number, length: number) => length > 0 ? (finite(value) % length + length) % length : 0;
const distance = (a: TrafficPoint, b: TrafficPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const keyOf = (point: TrafficPoint) => `${point.x.toFixed(2)},${point.z.toFixed(2)}`;
const hash = (text: string) => { let value = 2166136261; for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619); return value >>> 0; };
const between = (n: number, a: number, b: number) => n >= Math.min(a, b) - .01 && n <= Math.max(a, b) + .01;

/** Protected phases include amber warning and two seconds with every approach red. */
export function trafficSignalPhase(seconds: number, axis: TrafficStop['axis'], offset = 0): TrafficSignalColor {
  const time = wrap(finite(seconds) + finite(offset), TRAFFIC_SIGNAL_CYCLE);
  if (axis === 'north-south') return time < 24 ? 'green' : time < 27 ? 'yellow' : 'red';
  return time >= 29 && time < 53 ? 'green' : time >= 53 && time < 56 ? 'yellow' : 'red';
}
type RoadInfo = { road: TrafficRoad; id: string; horizontal: boolean; a: TrafficPoint; b: TrafficPoint; breadth: number; cuts: TrafficPoint[] };
type Node = TrafficPoint & { id: number; roads: Set<number> };
type Edge = { id: number; from: number; to: number; roadIndex: number; forward: TrafficPoint; start: TrafficPoint; end: TrafficPoint; speedLimit: number; endPad: number };
function roadInfo(road: TrafficRoad, index: number): RoadInfo {
  const horizontal = road.width > road.depth, breadth = horizontal ? road.depth : road.width;
  const a = { x: road.x - (horizontal ? road.width / 2 : 0), z: road.z - (horizontal ? 0 : road.depth / 2) }, b = { x: road.x + (horizontal ? road.width / 2 : 0), z: road.z + (horizontal ? 0 : road.depth / 2) };
  return { road, id: road.id ?? `road-${index}`, horizontal, breadth, a, b, cuts: [a, b] };
}
/** Lane trajectories follow the rectangles that draw the map; forecourts stay clear. */
export function buildTrafficNetwork(roads: readonly TrafficRoad[]): TrafficNetwork {
  const infos = roads.filter(road => road.kind !== 'access' && [road.x, road.z, road.width, road.depth].every(Number.isFinite) && Math.max(road.width, road.depth) >= 45 && Math.min(road.width, road.depth) >= 7).map(roadInfo);
  for (let a = 0; a < infos.length; a++) for (let b = a + 1; b < infos.length; b++) {
    const left = infos[a], right = infos[b];
    if (left.horizontal !== right.horizontal) {
      const h = left.horizontal ? left : right, v = left.horizontal ? right : left;
      if (between(v.a.x, h.a.x, h.b.x) && between(h.a.z, v.a.z, v.b.z)) { const point = { x: v.a.x, z: h.a.z }; left.cuts.push(point); right.cuts.push(point); }
    } else if (left.horizontal ? Math.abs(left.a.z - right.a.z) < .01 : Math.abs(left.a.x - right.a.x) < .01) {
      for (const point of [left.a, left.b]) if (left.horizontal ? between(point.x, right.a.x, right.b.x) : between(point.z, right.a.z, right.b.z)) right.cuts.push(point);
      for (const point of [right.a, right.b]) if (left.horizontal ? between(point.x, left.a.x, left.b.x) : between(point.z, left.a.z, left.b.z)) left.cuts.push(point);
    }
  }
  const nodes: Node[] = [], nodeIds = new Map<string, number>();
  const nodeId = (point: TrafficPoint, roadIndex: number) => { const key = keyOf(point); let id = nodeIds.get(key); if (id === undefined) { id = nodes.length; nodes.push({ ...point, id, roads: new Set() }); nodeIds.set(key, id); } nodes[id].roads.add(roadIndex); return id; };
  infos.forEach((info, index) => info.cuts.forEach(point => nodeId(point, index)));
  const signals: TrafficSignal[] = [], signalByNode = new Map<number, TrafficSignal>();
  for (const node of nodes) {
    const on = [...node.roads].map(index => infos[index]); if (on.some(info => info.road.kind === 'highway' || info.road.kind === 'country')) continue;
    const ew = on.filter(info => info.horizontal), ns = on.filter(info => !info.horizontal); if (!ew.length || !ns.length) continue;
    const approaches: TrafficPoint[] = [];
    if (ew.some(info => node.x > info.a.x + .1)) approaches.push({ x: 1, z: 0 }); if (ew.some(info => node.x < info.b.x - .1)) approaches.push({ x: -1, z: 0 });
    if (ns.some(info => node.z > info.a.z + .1)) approaches.push({ x: 0, z: 1 }); if (ns.some(info => node.z < info.b.z - .1)) approaches.push({ x: 0, z: -1 });
    const id = `signal-${keyOf(node)}`, signal = { id, x: node.x, z: node.z, offset: hash(id) % TRAFFIC_SIGNAL_CYCLE, eastWestWidth: Math.max(...ew.map(info => info.breadth)), northSouthWidth: Math.max(...ns.map(info => info.breadth)), approaches };
    signals.push(signal); signalByNode.set(node.id, signal);
  }
  const edges: Edge[] = [], adjacency = new Map<number, Edge[]>();
  const nodePad = (node: Node, breadth: number) => node.roads.size > 1 ? Math.max(...[...node.roads].map(index => infos[index].breadth)) / 2 + 2.8 : breadth * .52;
  const addEdge = (from: number, to: number, roadIndex: number) => {
    const info = infos[roadIndex], a = nodes[from], b = nodes[to], length = distance(a, b), forward = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }, lane = Math.min(info.breadth * .25, 4.5), factor = Math.min(1, (length - 4) / (nodePad(a, info.breadth) + nodePad(b, info.breadth))), fromPad = nodePad(a, info.breadth) * factor, endPad = nodePad(b, info.breadth) * factor;
    const edge = { id: edges.length, from, to, roadIndex, forward, start: { x: a.x + forward.x * fromPad - forward.z * lane, z: a.z + forward.z * fromPad + forward.x * lane }, end: { x: b.x - forward.x * endPad - forward.z * lane, z: b.z - forward.z * endPad + forward.x * lane }, endPad, speedLimit: clamp(info.road.speedLimit ?? 12, 3, 29) };
    edges.push(edge); const neighbors = adjacency.get(from) ?? []; neighbors.push(edge); adjacency.set(from, neighbors);
  };
  infos.forEach((info, index) => { const cuts = [...new Map(info.cuts.map(point => [keyOf(point), point])).values()].sort((a, b) => info.horizontal ? a.x - b.x : a.z - b.z); for (let i = 1; i < cuts.length; i++) { if (distance(cuts[i - 1], cuts[i]) < 18) continue; const from = nodeIds.get(keyOf(cuts[i - 1]))!, to = nodeIds.get(keyOf(cuts[i]))!; addEdge(from, to, index); addEdge(to, from, index); } });
  // Bidirectional regional graphs make continuous itineraries with no visible respawns.
  const groupOf = (edge: Edge) => infos[edge.roadIndex].road.kind === 'street' || !infos[edge.roadIndex].road.kind ? `town-${infos[edge.roadIndex].road.regionId ?? 'local'}` : 'regional';
  const unused = new Set(edges.map(edge => edge.id)), routes: TrafficRoute[] = [];
  while (unused.size) {
    const first = edges[unused.values().next().value!], group = groupOf(first), stack: { node: number; via?: Edge }[] = [{ node: first.from }], reversed: Edge[] = [];
    while (stack.length) { const top = stack[stack.length - 1], prior = top.via, choices = (adjacency.get(top.node) ?? []).filter(edge => unused.has(edge.id) && groupOf(edge) === group); choices.sort((a, b) => Number(a.to === prior?.from) - Number(b.to === prior?.from) || a.roadIndex - b.roadIndex); const next = choices[0]; if (next) { unused.delete(next.id); stack.push({ node: next.to, via: next }); } else { const finished = stack.pop()!; if (finished.via) reversed.push(finished.via); } }
    const sequence = reversed.reverse(); if (!sequence.length) continue;
    const points: TrafficRoutePoint[] = [], stops: TrafficStop[] = [];
    const append = (point: TrafficPoint, speedLimit: number) => { const last = points[points.length - 1], span = last ? distance(last, point) : 0; if (last && span < .001) { last.speedLimit = speedLimit; return; } points.push({ ...point, distance: (last?.distance ?? 0) + span, speedLimit }); };
    for (let i = 0; i < sequence.length; i++) {
      const edge = sequence[i], next = sequence[(i + 1) % sequence.length]; append(edge.start, edge.speedLimit); append(edge.end, edge.speedLimit);
      const signal = signalByNode.get(edge.to); if (signal) stops.push({ signalId: signal.id, distance: Math.max(0, points[points.length - 1].distance - TRAFFIC_CAR.length / 2 - 1.4), axis: Math.abs(edge.forward.x) > .5 ? 'east-west' : 'north-south' });
      const dot = edge.forward.x * next.forward.x + edge.forward.z * next.forward.z, curveSpeed = dot > .95 ? Math.min(edge.speedLimit, next.speedLimit) : dot < -.8 ? 2.4 : 4.5; points[points.length - 1].speedLimit = curveSpeed;
      const handle = Math.min(12, edge.endPad * 1.1, distance(edge.end, next.start) * .7), a = edge.end, b = { x: a.x + edge.forward.x * handle, z: a.z + edge.forward.z * handle }, d = next.start, c = { x: d.x - next.forward.x * handle, z: d.z - next.forward.z * handle }, samples = Math.max(6, Math.ceil(distance(a, d) / .9));
      for (let sample = 1; sample <= samples; sample++) { const t = sample / samples, u = 1 - t; append({ x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, z: u ** 3 * a.z + 3 * u * u * t * b.z + 3 * u * t * t * c.z + t ** 3 * d.z }, curveSpeed); }
    }
    const length = points[points.length - 1]?.distance ?? 0; if (length > 30) routes.push({ id: `${group}-${routes.length}`, points, stops, length, kind: group === 'regional' ? 'regional' : 'town' });
  }
  const props: TrafficProp[] = [];
  const prop = (kind: TrafficProp['kind'], point: TrafficPoint, heading: number, id: string, signalId?: string, axis?: TrafficStop['axis']) => props.push({ ...point, id: `traffic-prop-${id}`, kind, heading, signalId, axis, height: kind === 'bollard' ? .95 : kind === 'signal' ? 4.8 : 5.4, radius: kind === 'bollard' ? .13 : .17, state: 'standing', fallAge: 0, fallDirection: { x: 0, z: 1 }, impactAge: Infinity });
  signals.forEach(signal => { for (const forward of signal.approaches) { const ew = Math.abs(forward.x) > .5, breadth = ew ? signal.eastWestWidth : signal.northSouthWidth, cross = ew ? signal.northSouthWidth : signal.eastWestWidth, right = { x: -forward.z, z: forward.x }, position = { x: signal.x - forward.x * (cross / 2 + 4) + right.x * (breadth / 2 + 1), z: signal.z - forward.z * (cross / 2 + 4) + right.z * (breadth / 2 + 1) }, suffix = `${signal.id}-${forward.x}-${forward.z}`; prop('signal', position, Math.atan2(-forward.x, -forward.z) + Math.PI, suffix, signal.id, ew ? 'east-west' : 'north-south'); prop('bollard', { x: position.x - forward.x * 3.5, z: position.z - forward.z * 3.5 }, 0, `${suffix}-bollard`); } });
  for (const info of infos.filter(info => info.road.kind === 'street' || !info.road.kind)) { const length = distance(info.a, info.b), count = Math.max(1, Math.floor(length / 250)); for (let i = 0; i < count; i++) { const fraction = (i + .5) / count, side = i % 2 ? -1 : 1, point = { x: info.a.x + (info.b.x - info.a.x) * fraction + (info.horizontal ? 0 : side * (info.breadth / 2 + 1.4)), z: info.a.z + (info.b.z - info.a.z) * fraction + (info.horizontal ? side * (info.breadth / 2 + 1.4) : 0) }; if (signals.some(signal => distance(point, signal) < 30)) continue; prop('lamp', point, info.horizontal ? side > 0 ? Math.PI : 0 : side > 0 ? Math.PI / 2 : -Math.PI / 2, `${info.id}-lamp-${i}`); } }
  return { roads, routes, signals, props };
}
function samplePoint(route: TrafficRoute, requested: number): { x: number; z: number; speedLimit: number } {
  const progress = wrap(requested, route.length), points = route.points; let lo = 0, hi = points.length - 1; while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (points[mid].distance <= progress) lo = mid; else hi = mid; }
  const a = points[lo], b = points[hi], fraction = (progress - a.distance) / Math.max(.001, b.distance - a.distance); return { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction, speedLimit: a.speedLimit };
}
export function sampleTrafficRoute(route: TrafficRoute, progress: number): TrafficPoint & { heading: number; speedLimit: number } { const point = samplePoint(route, progress), before = samplePoint(route, progress - .45), after = samplePoint(route, progress + .45); return { ...point, heading: Math.atan2(before.x - after.x, before.z - after.z) }; }

export class TrafficSimulation {
  readonly network: TrafficNetwork;
  readonly cars: TrafficCar[] = [];
  readonly props: TrafficProp[];
  private signalIds: Map<string, TrafficSignal>;
  private objectIds: Map<string, TrafficCar | TrafficProp>;
  elapsed = 0;
  constructor(options: { roads: readonly TrafficRoad[]; maxCars?: number }) {
    this.network = buildTrafficNetwork(options.roads); this.props = this.network.props; this.signalIds = new Map(this.network.signals.map(signal => [signal.id, signal]));
    const routes = this.network.routes, budget = Math.floor(clamp(options.maxCars ?? 80, 0, TRAFFIC_CAR.maxCars)), counts = routes.map(() => 0);
    for (let total = 0; total < budget && routes.length; total++) { let selected = -1, score = -Infinity; routes.forEach((route, index) => { const capacity = Math.min(route.kind === 'town' ? 22 : 20, Math.floor(route.length / 65)); if (counts[index] >= capacity) return; const weight = route.kind === 'town' ? route.id.includes('cirrus') ? 3 : 1.4 : 2, priority = weight / (counts[index] + 1); if (priority > score) { score = priority; selected = index; } }); if (selected < 0) break; counts[selected]++; }
    counts.forEach((count, routeIndex) => { const route = routes[routeIndex]; for (let i = 0; i < count; i++) { const progress = wrap((i + .33) * route.length / count, route.length), point = sampleTrafficRoute(route, progress); this.cars.push({ id: `traffic-car-${this.cars.length}`, route: routeIndex, progress, previousProgress: progress, ...point, speed: Math.min(12, point.speedLimit * .75), brake: 0, variant: this.cars.length % 7, damage: 0, stoppedFor: 0, impactAge: Infinity }); } });
    this.objectIds = new Map<string, TrafficCar | TrafficProp>([...this.cars.map(car => [car.id, car] as const), ...this.props.map(prop => [prop.id, prop] as const)]);
  }
  phase(signalId: string, axis: TrafficStop['axis']): TrafficSignalColor { return trafficSignalPhase(this.elapsed, axis, this.signalIds.get(signalId)?.offset); }
  /** Capped substeps protect smooth traffic and prevent hidden-tab teleportation. */
  update(seconds: number, elapsed = this.elapsed + finite(seconds), player?: TrafficPlayer): void {
    const total = clamp(seconds, 0, .25), steps = Math.max(1, Math.ceil(total / (1 / 30))), dt = total / steps; this.elapsed = Math.max(0, finite(elapsed, this.elapsed));
    for (let tick = 0; tick < steps; tick++) this.tick(dt, player); for (const prop of this.props) { prop.impactAge += total; if (prop.state === 'fallen') prop.fallAge += total; }
  }
  private tick(dt: number, player?: TrafficPlayer): void {
    const old = this.cars.map(car => ({ ...car })), cells = new Map<string, number[]>(); old.forEach((car, index) => { const key = `${Math.floor(car.x / 32)},${Math.floor(car.z / 32)}`, cell = cells.get(key) ?? []; cell.push(index); cells.set(key, cell); });
    this.cars.forEach((car, index) => {
      const prior = old[index], route = this.network.routes[car.route], forward = { x: -Math.sin(prior.heading), z: -Math.cos(prior.heading) }, right = { x: -forward.z, z: forward.x }; car.impactAge += dt; car.stoppedFor = Math.max(0, car.stoppedFor - dt);
      let target = sampleTrafficRoute(route, car.progress).speedLimit * (.79 + car.variant * .025), hardGap = Infinity;
      for (const ahead of [8, 18, 36]) { const limit = sampleTrafficRoute(route, car.progress + ahead).speedLimit; target = Math.min(target, Math.sqrt(limit * limit + 2 * 2.3 * ahead)); }
      for (const stop of route.stops) { const ahead = wrap(stop.distance - car.progress, route.length); if (ahead > 95) continue; const phase = this.phase(stop.signalId, stop.axis), committedAmber = phase === 'yellow' && ahead < prior.speed * prior.speed / (2 * TRAFFIC_CAR.braking) + 2; if (phase !== 'green' && !committedAmber) { target = Math.min(target, Math.sqrt(2 * 2.8 * Math.max(0, ahead - .35))); hardGap = Math.min(hardGap, Math.max(0, ahead)); } }
      const consider = (other: TrafficPoint & { heading?: number; speed?: number; driving?: boolean }, otherIndex: number, isPlayer = false) => {
        const dx = other.x - prior.x, dz = other.z - prior.z, ahead = dx * forward.x + dz * forward.z, lateral = Math.abs(dx * right.x + dz * right.z), pedestrian = isPlayer && other.driving === false;
        if (ahead > 0 && ahead < 65 && lateral < (pedestrian ? 1.5 : isPlayer ? 2 : 1.85)) { const gap = Math.max(0, ahead - (pedestrian ? TRAFFIC_CAR.length / 2 + 1.25 : TRAFFIC_CAR.length + TRAFFIC_CAR.standstillGap)), direction = other.heading === undefined ? 1 : Math.cos(other.heading - prior.heading), leadSpeed = !pedestrian && direction > .6 ? Math.max(0, finite(other.speed ?? 0)) : 0; target = Math.min(target, leadSpeed + Math.sqrt(2 * 2.6 * gap), gap / Math.max(.65, prior.speed > 12 ? 1.3 : .8)); hardGap = Math.min(hardGap, gap); }
        if (otherIndex < index && !isPlayer && ahead > 0 && ahead < 22 && lateral < 22 && other.heading !== undefined && Math.abs(Math.cos(other.heading - prior.heading)) < .55) { const ox = -Math.sin(other.heading) * (other.speed ?? 0), oz = -Math.cos(other.heading) * (other.speed ?? 0), vx = forward.x * prior.speed - ox, vz = forward.z * prior.speed - oz, square = vx * vx + vz * vz, closest = square > .1 ? clamp((dx * vx + dz * vz) / square, 0, 2.4) : 0; if (closest > .1 && Math.hypot(dx - vx * closest, dz - vz * closest) < 4.8) { target = 0; hardGap = Math.min(hardGap, Math.max(0, Math.hypot(dx, dz) - 7)); } }
      };
      const cx = Math.floor(prior.x / 32), cz = Math.floor(prior.z / 32); for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) for (const other of cells.get(`${x},${z}`) ?? []) if (other !== index) consider(old[other], other); if (player) consider(player, -1, true); if (car.stoppedFor > 0) target = 0;
      const speed = Math.max(0, prior.speed + clamp(target - prior.speed, -TRAFFIC_CAR.braking * dt, TRAFFIC_CAR.acceleration * dt)), travel = Math.min((prior.speed + speed) / 2 * dt, hardGap); car.speed = hardGap < .08 ? 0 : speed; car.brake = target < prior.speed - .12 || (target < .08 && hardGap < 1) || hardGap < .3 ? 1 : 0;
      car.previousProgress = car.progress; car.progress = wrap(car.progress + Math.max(0, travel), route.length); const position = sampleTrafficRoute(route, car.progress); car.x = position.x; car.z = position.z; car.heading = position.heading;
    });
  }
  /** Only nearby cars and standing poles enter the physical driving sweep. */
  nearbyCollisions(point: TrafficPoint, radius = 40): TrafficCollider[] {
    const result: TrafficCollider[] = [], square = Math.max(1, finite(radius, 40)) ** 2;
    for (const car of this.cars) { if ((car.x - point.x) ** 2 + (car.z - point.z) ** 2 > square) continue; const sine = Math.abs(Math.sin(car.heading)), cosine = Math.abs(Math.cos(car.heading)), halfX = sine * TRAFFIC_CAR.length / 2 + cosine * TRAFFIC_CAR.width / 2, halfZ = cosine * TRAFFIC_CAR.length / 2 + sine * TRAFFIC_CAR.width / 2; result.push({ id: car.id, kind: 'vehicle', minX: car.x - halfX, maxX: car.x + halfX, minZ: car.z - halfZ, maxZ: car.z + halfZ, minY: 0, maxY: 1.65 }); }
    for (const prop of this.props) if (prop.state === 'standing' && (prop.x - point.x) ** 2 + (prop.z - point.z) ** 2 <= square) result.push({ id: prop.id, kind: 'prop', minX: prop.x - prop.radius, maxX: prop.x + prop.radius, minZ: prop.z - prop.radius, maxZ: prop.z + prop.radius, minY: 0, maxY: prop.height }); return result;
  }
  hit(impact: TrafficImpact): TrafficHit {
    const object = impact.collider.id ? this.objectIds.get(impact.collider.id) : undefined, speed = Math.max(0, finite(impact.normalSpeed ?? impact.speed)); if (!object) return { handled: false, knockedDown: false, firstImpact: false, speed };
    if ('route' in object) { const firstImpact = speed > .7 && object.impactAge > 1.2; if (firstImpact) { object.speed = 0; object.brake = 1; object.damage = clamp(object.damage + Math.max(.035, (speed / 25) ** 2 * .75), 0, 1); object.stoppedFor = Math.max(object.stoppedFor, 12 + Math.min(28, speed * .8)); object.impactAge = 0; } return { handled: true, knockedDown: false, firstImpact, kind: 'vehicle', speed }; }
    if (object.state === 'fallen') return { handled: true, knockedDown: true, firstImpact: false, kind: object.kind, speed };
    const threshold = object.kind === 'bollard' ? 1.8 : 3.4, firstImpact = speed > .7 && object.impactAge > 1.2; if (firstImpact) object.impactAge = 0;
    if (speed >= threshold) { object.state = 'fallen'; object.fallAge = 0; const dx = object.x - impact.position.x, dz = object.z - impact.position.z, length = Math.hypot(dx, dz); object.fallDirection = length > .05 ? { x: dx / length, z: dz / length } : { x: -Math.sin(impact.heading ?? 0), z: -Math.cos(impact.heading ?? 0) }; }
    return { handled: true, knockedDown: object.state === 'fallen', firstImpact, kind: object.kind, speed };
  }
}
export function createTrafficSimulation(options: { roads: readonly TrafficRoad[]; maxCars?: number }): TrafficSimulation { return new TrafficSimulation(options); }
