/** Regional coordinates are metres, with X east and Z south. */
export type RegionalPoint = { x: number; z: number };
export type RegionalRoad = { id: string; name: string; kind: 'street' | 'highway' | 'country' | 'access'; x: number; z: number; width: number; depth: number; speedLimit: number; regionId?: string };
export type RegionalSettlement = { id: string; name: string; center: RegionalPoint; radiusX: number; radiusZ: number; character: 'harbor' | 'campus' | 'arts' | 'coast' | 'village' | 'garden' | 'city'; colors: readonly [string, string, string] };
export const WORLD_SIZE = Object.freeze({ width: 12000, depth: 10000 });
export const REGIONAL_SETTLEMENTS: readonly RegionalSettlement[] = [
  { id: 'cirrus', name: 'Cirrus Harbor', center: { x: 760, z: 550 }, radiusX: 670, radiusZ: 470, character: 'harbor', colors: ['#e8d5b3', '#3a7978', '#bb6953'] },
  { id: 'eastmere', name: 'Eastmere Campus', center: { x: 3150, z: 1550 }, radiusX: 510, radiusZ: 430, character: 'campus', colors: ['#eee3c9', '#426f7a', '#cf8562'] },
  { id: 'bellweather', name: 'Bellweather', center: { x: 5050, z: 2800 }, radiusX: 620, radiusZ: 520, character: 'arts', colors: ['#e6ceb5', '#728f93', '#c5624c'] },
  { id: 'aster', name: 'Aster Bay', center: { x: 6620, z: 2850 }, radiusX: 520, radiusZ: 540, character: 'coast', colors: ['#e4e5cf', '#408b89', '#cf8a66'] },
  { id: 'juniper', name: 'Juniper Vale', center: { x: 2640, z: 6100 }, radiusX: 420, radiusZ: 410, character: 'village', colors: ['#dac89e', '#73916c', '#ae7155'] },
  { id: 'larkspur', name: 'Larkspur Gardens', center: { x: 6500, z: 7920 }, radiusX: 570, radiusZ: 480, character: 'garden', colors: ['#efdebf', '#809792', '#cf9282'] },
  { id: 'meridian', name: 'Meridian City', center: { x: 10000, z: 6500 }, radiusX: 670, radiusZ: 640, character: 'city', colors: ['#dadfd6', '#50848b', '#bd6954'] },
] as const;
export const REGIONAL_VENUE_ANCHORS = Object.freeze({
  1: { parking: { x: 3300, z: 1500 }, access: { x: 3150, z: 1500 }, regionId: 'eastmere' },
  2: { parking: { x: 5280, z: 2800 }, access: { x: 5050, z: 2800 }, regionId: 'bellweather' },
  3: { parking: { x: 6710, z: 2850 }, access: { x: 6500, z: 2850 }, regionId: 'aster' },
} as const);
export const REGIONAL_SERVICE_POINTS = [
  { id: 'highway-fuel', name: 'Highway Fuel', parking: { x: 840, z: 620 }, access: { x: 840, z: 650 }, locationId: 4 },
  { id: 'eastmere-fuel', name: 'Eastmere Roadside', parking: { x: 3045, z: 2100 }, access: { x: 3000, z: 2100 }, locationId: -1 },
  { id: 'bellweather-fuel', name: 'Lantern Road Services', parking: { x: 4945, z: 2040 }, access: { x: 4900, z: 2040 }, locationId: -1 },
  { id: 'aster-fuel', name: 'Tideglass Services', parking: { x: 6545, z: 4740 }, access: { x: 6500, z: 4740 }, locationId: -1 },
  { id: 'meridian-fuel', name: 'Meridian Motor Stop', parking: { x: 10045, z: 7440 }, access: { x: 10000, z: 7440 }, locationId: -1 },
] as const;
const horizontal = (id: string, name: string, fromX: number, toX: number, z: number, width = 12, kind: RegionalRoad['kind'] = 'street', regionId?: string): RegionalRoad => ({ id, name, kind, x: (fromX + toX) / 2, z, width: Math.abs(toX - fromX), depth: width, speedLimit: kind === 'highway' ? 29 : kind === 'country' ? 22 : kind === 'access' ? 8 : 13.4, regionId });
const vertical = (id: string, name: string, x: number, fromZ: number, toZ: number, width = 12, kind: RegionalRoad['kind'] = 'street', regionId?: string): RegionalRoad => ({ id, name, kind, x, z: (fromZ + toZ) / 2, width, depth: Math.abs(toZ - fromZ), speedLimit: kind === 'highway' ? 29 : kind === 'country' ? 22 : kind === 'access' ? 8 : 13.4, regionId });
/** Renderer, navigation, collision checks and traffic use this shared road contract. */
export const WORLD_ROADS: readonly RegionalRoad[] = [
  vertical('harbor-west', 'West Harbor Road', 125, 110, 950, 12, 'street', 'cirrus'),
  vertical('harbor-east', 'Riverside Road', 1400, 110, 1100, 12, 'street', 'cirrus'),
  horizontal('harbor-north', 'Lighthouse Avenue', 119, 1406, 110, 12, 'street', 'cirrus'),
  horizontal('harbor-south', 'Harbor Promenade', 119, 1406, 950, 12, 'street', 'cirrus'),
  vertical('harbor-office', 'Company Avenue', 500, 110, 1100, 12, 'street', 'cirrus'),
  vertical('harbor-market', 'Market Street', 1040, 110, 950, 12, 'street', 'cirrus'),
  horizontal('harbor-cross-north', 'Willow Street', 119, 1406, 350, 14, 'street', 'cirrus'),
  horizontal('harbor-cross-south', 'Juniper Street', 119, 1406, 650, 14, 'street', 'cirrus'),
  vertical('harbor-center', 'Foundry Road', 768, 110, 950, 14, 'street', 'cirrus'),
  horizontal('home-lane', 'Apartment Lane', 125, 505, 525, 9, 'access', 'cirrus'),
  horizontal('harbor-east-lane', 'River Lane', 858, 1260, 480, 9, 'access', 'cirrus'),
  ...[266, 275].map((z, i) => horizontal(`office-lane-${i}`, 'Company Forecourt', 375, 500, z, 9.2, 'access', 'cirrus')),
  vertical('home-parking', 'Apartment Forecourt', 220, 510, 525, 9, 'access', 'cirrus'),
  horizontal('fuel-lane', 'Highway Fuel Approach', 768, 840, 650, 11, 'access', 'cirrus'),
  vertical('fuel-parking', 'Highway Fuel Forecourt', 840, 620, 650, 11, 'access', 'cirrus'),
  horizontal('interstate-7', 'Interstate 7 · Coastbound', 500, 11000, 1100, 26, 'highway'),
  vertical('interstate-19', 'Interstate 19 · Valleybound', 3000, 1100, 8300, 26, 'highway'),
  vertical('coastal-parkway', 'Coastal Parkway', 6500, 1100, 8300, 22, 'country'),
  horizontal('valley-route', 'Juniper Valley Route', 1600, 10400, 6100, 22, 'country'),
  horizontal('garden-route', 'Larkspur Scenic Route', 1600, 11000, 8200, 20, 'country'),
  vertical('meridian-route', 'Meridian Expressway', 10000, 1100, 8200, 24, 'highway'),
  vertical('eastmere-avenue', 'College Avenue · Exit 3', 3150, 1100, 1940, 14, 'street', 'eastmere'),
  horizontal('eastmere-north', 'Library Walk', 2740, 3560, 1280, 11, 'street', 'eastmere'),
  horizontal('eastmere-center', 'Eastmere Green', 2740, 3560, 1640, 12, 'street', 'eastmere'),
  horizontal('eastmere-south', 'Faculty Row', 2740, 3560, 1780, 11, 'street', 'eastmere'),
  vertical('eastmere-west', 'West College Drive', 2820, 1280, 1870, 11, 'street', 'eastmere'),
  vertical('eastmere-east', 'East College Drive', 3470, 1280, 1870, 11, 'street', 'eastmere'),
  vertical('bellweather-exit', 'Bellweather Road · Exit 5', 4900, 1100, 3250, 16, 'country', 'bellweather'),
  vertical('bellweather-avenue', 'Lantern Avenue', 5050, 2350, 3260, 14, 'street', 'bellweather'),
  vertical('bellweather-west', 'Atelier Street', 4620, 2400, 3180, 12, 'street', 'bellweather'),
  vertical('bellweather-east', 'Terrace Street', 5510, 2400, 3180, 12, 'street', 'bellweather'),
  horizontal('bellweather-north', 'Old Tram Road', 4540, 5600, 2430, 13, 'street', 'bellweather'),
  horizontal('bellweather-center', 'Palette Boulevard', 4540, 5600, 2670, 14, 'street', 'bellweather'),
  horizontal('bellweather-south', 'Evening Market Road', 4540, 5600, 3130, 12, 'street', 'bellweather'),
  horizontal('aster-north', 'Tideglass Avenue', 6140, 7090, 2470, 12, 'street', 'aster'),
  horizontal('aster-center', 'Aster Bay Esplanade', 6140, 7090, 2700, 14, 'street', 'aster'),
  horizontal('aster-south', 'Research Quay', 6140, 7090, 3240, 12, 'street', 'aster'),
  vertical('aster-west', 'West Bay Road', 6230, 2380, 3330, 12, 'street', 'aster'),
  vertical('aster-east', 'East Bay Road', 6980, 2380, 3330, 12, 'street', 'aster'),
  horizontal('juniper-north', 'Orchard Lane', 2300, 3080, 5860, 10, 'street', 'juniper'),
  horizontal('juniper-south', 'Mill Lane', 2300, 3080, 6380, 10, 'street', 'juniper'),
  vertical('juniper-square', 'Juniper Village Green', 2630, 5800, 6460, 12, 'street', 'juniper'),
  vertical('juniper-west', 'Old Mill Road', 2350, 5800, 6460, 10, 'street', 'juniper'),
  horizontal('larkspur-north', 'Camellia Avenue', 6000, 7040, 7610, 12, 'street', 'larkspur'),
  horizontal('larkspur-center', 'Garden Boulevard', 6000, 7040, 7890, 14, 'street', 'larkspur'),
  vertical('larkspur-east', 'Conservatory Drive', 6900, 7520, 8320, 12, 'street', 'larkspur'),
  vertical('larkspur-center-north', 'Larkspur Approach', 6650, 7610, 8320, 12, 'street', 'larkspur'),
  vertical('larkspur-west', 'Rose Terrace', 6140, 7520, 8320, 11, 'street', 'larkspur'),
  horizontal('meridian-north', 'Civic Avenue', 9430, 10580, 6100, 16, 'street', 'meridian'),
  horizontal('meridian-center', 'Meridian Central', 9430, 10580, 6500, 16, 'street', 'meridian'),
  horizontal('meridian-south', 'Station Boulevard', 9430, 10580, 6920, 16, 'street', 'meridian'),
  vertical('meridian-west', 'West Civic Road', 9560, 5940, 7090, 14, 'street', 'meridian'),
  vertical('meridian-east', 'East Civic Road', 10400, 5940, 7090, 14, 'street', 'meridian'),
  horizontal('coast-access', 'Lighthouse Coast Road', 10000, 11100, 4800, 16, 'country'),
  vertical('coast-overlook', 'Lighthouse Overlook', 11000, 1100, 8700, 16, 'country'),
  ...Object.entries(REGIONAL_VENUE_ANCHORS).map(([id, anchor]) => horizontal(`venue-${id}-access`, 'Visitor Forecourt', anchor.access.x, anchor.parking.x, anchor.parking.z, 9.2, 'access', anchor.regionId)),
  ...REGIONAL_SERVICE_POINTS.filter(service => service.locationId === -1).map(service => horizontal(`${service.id}-lane`, service.name, service.access.x, service.parking.x, service.parking.z, 12, 'access')),
] as const;

export function regionalSettlementAt(point: RegionalPoint): RegionalSettlement | undefined { return REGIONAL_SETTLEMENTS.find(region => Math.abs(point.x - region.center.x) <= region.radiusX && Math.abs(point.z - region.center.z) <= region.radiusZ); }
export function regionalPointOnRoad(point: RegionalPoint, pad = 0, roads = WORLD_ROADS): boolean { return roads.some(road => Math.abs(point.x - road.x) <= road.width / 2 + pad && Math.abs(point.z - road.z) <= road.depth / 2 + pad); }
export function regionalRoadEndpoints(road: RegionalRoad): [RegionalPoint, RegionalPoint] { return road.width > road.depth ? [{ x: road.x - road.width / 2, z: road.z }, { x: road.x + road.width / 2, z: road.z }] : [{ x: road.x, z: road.z - road.depth / 2 }, { x: road.x, z: road.z + road.depth / 2 }]; }
export type RegionalRouteSegment = { from: RegionalPoint; to: RegionalPoint; roadId: string; name: string; kind: RegionalRoad['kind']; speedLimit: number };
export type RegionalRoute = { points: RegionalPoint[]; segments: RegionalRouteSegment[]; distance: number };
type GraphEdge = { from: number; to: number; road: RegionalRoad; length: number };
type RoadGraph = { nodes: RegionalPoint[]; edges: GraphEdge[]; adjacency: Map<number, GraphEdge[]> };
const graphCache = new WeakMap<readonly RegionalRoad[], RoadGraph>();
const distance = (a: RegionalPoint, b: RegionalPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const between = (value: number, a: number, b: number) => value >= Math.min(a, b) - .01 && value <= Math.max(a, b) + .01;
function roadGraph(roads: readonly RegionalRoad[]): RoadGraph {
  const cached = graphCache.get(roads); if (cached) return cached;
  const splits = roads.map(road => regionalRoadEndpoints(road));
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    const [a0, a1] = regionalRoadEndpoints(roads[a]), [b0, b1] = regionalRoadEndpoints(roads[b]), ah = a0.z === a1.z, bh = b0.z === b1.z;
    if (ah !== bh) { const h0 = ah ? a0 : b0, h1 = ah ? a1 : b1, v0 = ah ? b0 : a0, v1 = ah ? b1 : a1; if (between(v0.x, h0.x, h1.x) && between(h0.z, v0.z, v1.z)) { const point = { x: v0.x, z: h0.z }; splits[a].push(point); splits[b].push(point); } }
    else if (ah ? a0.z === b0.z : a0.x === b0.x) { for (const point of [a0, a1]) if (ah ? between(point.x, b0.x, b1.x) : between(point.z, b0.z, b1.z)) splits[b].push(point); for (const point of [b0, b1]) if (ah ? between(point.x, a0.x, a1.x) : between(point.z, a0.z, a1.z)) splits[a].push(point); }
  }
  const nodes: RegionalPoint[] = [], ids = new Map<string, number>(), edges: GraphEdge[] = [], adjacency = new Map<number, GraphEdge[]>();
  const node = (point: RegionalPoint) => { const key = `${point.x.toFixed(2)},${point.z.toFixed(2)}`, found = ids.get(key); if (found !== undefined) return found; const id = nodes.length; nodes.push({ ...point }); ids.set(key, id); return id; };
  const add = (edge: GraphEdge) => { edges.push(edge); const neighbors = adjacency.get(edge.from) ?? []; neighbors.push(edge); adjacency.set(edge.from, neighbors); };
  splits.forEach((points, index) => { const h = roads[index].width > roads[index].depth; points.sort((a, b) => h ? a.x - b.x : a.z - b.z); for (let i = 1; i < points.length; i++) { const from = node(points[i - 1]), to = node(points[i]), length = distance(points[i - 1], points[i]); if (length < .01) continue; add({ from, to, length, road: roads[index] }); add({ from: to, to: from, length, road: roads[index] }); } });
  const graph = { nodes, edges, adjacency }; graphCache.set(roads, graph); return graph;
}
function projectOnSegment(point: RegionalPoint, a: RegionalPoint, b: RegionalPoint): RegionalPoint { const dx = b.x - a.x, dz = b.z - a.z, square = dx * dx + dz * dz, fraction = square ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / square)) : 0; return { x: a.x + dx * fraction, z: a.z + dz * fraction }; }
/** Missed turns are reprojected onto the current road, never routed across fields. */
export function findRegionalRoute(start: RegionalPoint, target: RegionalPoint, roads: readonly RegionalRoad[] = WORLD_ROADS): RegionalRoute {
  if (![start.x, start.z, target.x, target.z].every(Number.isFinite) || !roads.length) return { points: [], segments: [], distance: Infinity };
  const graph = roadGraph(roads), nodes = [...graph.nodes], adjacency = new Map([...graph.adjacency].map(([id, edges]) => [id, [...edges]]));
  const nearest = (point: RegionalPoint) => { let result: { edge: GraphEdge; point: RegionalPoint; distance: number } | undefined; for (const edge of graph.edges) { const projection = projectOnSegment(point, nodes[edge.from], nodes[edge.to]), d = distance(point, projection); if (!result || d < result.distance) result = { edge, point: projection, distance: d }; } return result; };
  const source = nearest(start), destination = nearest(target); if (!source || !destination) return { points: [], segments: [], distance: Infinity };
  const attach = (connection: NonNullable<typeof source>) => { const id = nodes.length; nodes.push(connection.point); adjacency.set(id, []); for (const neighbor of [connection.edge.from, connection.edge.to]) { const length = distance(connection.point, nodes[neighbor]), forward = { from: id, to: neighbor, length, road: connection.edge.road }, backward = { ...forward, from: neighbor, to: id }; adjacency.get(id)!.push(forward); adjacency.get(neighbor)!.push(backward); } return id; };
  const sourceId = attach(source), targetId = attach(destination);
  if (source.edge.road.id === destination.edge.road.id && ((source.edge.from === destination.edge.from && source.edge.to === destination.edge.to) || (source.edge.from === destination.edge.to && source.edge.to === destination.edge.from))) { adjacency.get(sourceId)!.push({ from: sourceId, to: targetId, length: distance(source.point, destination.point), road: source.edge.road }); adjacency.get(targetId)!.push({ from: targetId, to: sourceId, length: distance(source.point, destination.point), road: source.edge.road }); }
  const costs = new Map<number, number>([[sourceId, 0]]), previous = new Map<number, GraphEdge>(), open = new Set([sourceId]);
  while (open.size) { let current = -1, lowest = Infinity; for (const id of open) if ((costs.get(id) ?? Infinity) < lowest) { current = id; lowest = costs.get(id)!; } if (current === targetId) break; open.delete(current); for (const edge of adjacency.get(current) ?? []) { const cost = lowest + edge.length; if (cost + .001 >= (costs.get(edge.to) ?? Infinity)) continue; costs.set(edge.to, cost); previous.set(edge.to, edge); open.add(edge.to); } }
  if (!costs.has(targetId)) return { points: [], segments: [], distance: Infinity };
  const routeEdges: GraphEdge[] = []; let cursor = targetId; while (cursor !== sourceId) { const edge = previous.get(cursor); if (!edge) return { points: [], segments: [], distance: Infinity }; routeEdges.push(edge); cursor = edge.from; } routeEdges.reverse();
  const segments: RegionalRouteSegment[] = [], points: RegionalPoint[] = [{ ...start }];
  const append = (from: RegionalPoint, to: RegionalPoint, road: RegionalRoad) => { if (distance(from, to) < .01) return; segments.push({ from: { ...from }, to: { ...to }, roadId: road.id, name: road.name, kind: road.kind, speedLimit: road.speedLimit }); points.push({ ...to }); };
  append(start, source.point, source.edge.road); routeEdges.forEach(edge => append(nodes[edge.from], nodes[edge.to], edge.road)); append(destination.point, target, destination.edge.road);
  return { points, segments, distance: segments.reduce((total, segment) => total + distance(segment.from, segment.to), 0) };
}
