export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Camera = {
  x: number; y: number; scale: number; offsetX: number; offsetY: number;
  viewWidth: number; viewHeight: number;
};

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 640;
export const PLAYER_RADIUS = 9;
export const WALK_BOUNDS: Rect = { x: 26, y: 164, width: 908, height: 450 };

// Source rectangles in the generated 1254×1254 atlas, including six pixels of transparent padding.
export const SPRITE_RECTS = [
  [117, 23, 180, 304], [404, 20, 162, 307], [686, 20, 169, 307], [975, 31, 165, 296],
  [120, 328, 158, 306], [385, 321, 186, 315], [677, 321, 186, 315], [977, 325, 159, 311],
  [108, 625, 185, 317], [400, 636, 157, 304], [684, 625, 175, 317], [973, 634, 167, 309],
  [118, 930, 171, 313], [390, 930, 174, 313], [693, 929, 163, 314], [968, 939, 179, 304],
] as const;

// The furnished islands are solid; the wide connecting aisles are walkable.
export const WORLD_COLLISIONS: readonly (readonly Rect[])[] = [
  [
    { x: 90, y: 150, width: 258, height: 126 },
    { x: 130, y: 302, width: 227, height: 162 },
    { x: 631, y: 145, width: 140, height: 91 },
    { x: 613, y: 291, width: 225, height: 189 },
    { x: 535, y: 340, width: 64, height: 66 },
    { x: 510, y: 410, width: 56, height: 45 },
    { x: 565, y: 488, width: 51, height: 83 },
    { x: 764, y: 489, width: 127, height: 90 },
  ],
  [
    { x: 131, y: 166, width: 212, height: 130 },
    { x: 126, y: 329, width: 218, height: 133 },
    { x: 665, y: 146, width: 177, height: 98 },
    { x: 612, y: 351, width: 194, height: 128 },
    { x: 818, y: 254, width: 115, height: 77 },
    { x: 551, y: 522, width: 300, height: 86 },
  ],
  [
    { x: 128, y: 140, width: 218, height: 113 },
    { x: 129, y: 320, width: 171, height: 111 },
    { x: 613, y: 154, width: 184, height: 76 },
    { x: 496, y: 319, width: 160, height: 89 },
    { x: 591, y: 400, width: 110, height: 75 },
    { x: 780, y: 262, width: 88, height: 55 },
    { x: 849, y: 354, width: 85, height: 60 },
    { x: 800, y: 429, width: 136, height: 68 },
    { x: 0, y: 594, width: 420, height: 46 },
    { x: 524, y: 594, width: 436, height: 46 },
  ],
];

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointIsWalkable(point: Point, obstacles: readonly Rect[], radius = PLAYER_RADIUS): boolean {
  if (point.x < WALK_BOUNDS.x + radius || point.x > WALK_BOUNDS.x + WALK_BOUNDS.width - radius ||
      point.y < WALK_BOUNDS.y + radius || point.y > WALK_BOUNDS.y + WALK_BOUNDS.height - radius) return false;
  return !obstacles.some(rect => point.x > rect.x - radius && point.x < rect.x + rect.width + radius &&
    point.y > rect.y - radius && point.y < rect.y + rect.height + radius);
}

export function segmentIsClear(start: Point, end: Point, obstacles: readonly Rect[], radius = PLAYER_RADIUS): boolean {
  const steps = Math.max(1, Math.ceil(distance(start, end) / 4));
  for (let step = 0; step <= steps; step++) {
    const amount = step / steps;
    if (!pointIsWalkable({ x: start.x + (end.x - start.x) * amount, y: start.y + (end.y - start.y) * amount }, obstacles, radius)) return false;
  }
  return true;
}

/** Axis sliding, with short substeps so a long animation frame cannot cross furniture. */
export function moveWithCollision(start: Point, delta: Point, obstacles: readonly Rect[], radius = PLAYER_RADIUS): Point {
  const point = { ...start };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / 4));
  for (let step = 0; step < steps; step++) {
    const x = { x: point.x + delta.x / steps, y: point.y };
    if (pointIsWalkable(x, obstacles, radius)) point.x = x.x;
    const y = { x: point.x, y: point.y + delta.y / steps };
    if (pointIsWalkable(y, obstacles, radius)) point.y = y.y;
  }
  return point;
}

const CELL = 16;
const COLUMNS = MAP_WIDTH / CELL;
const ROWS = MAP_HEIGHT / CELL;
const cellPoint = (index: number): Point => ({ x: (index % COLUMNS + .5) * CELL, y: (Math.floor(index / COLUMNS) + .5) * CELL });

export function nearestWalkable(point: Point, obstacles: readonly Rect[], radius = PLAYER_RADIUS): Point {
  if (pointIsWalkable(point, obstacles, radius)) return { ...point };
  let nearest: Point = { x: 472, y: 488 };
  let closest = Infinity;
  for (let index = 0; index < COLUMNS * ROWS; index++) {
    const option = cellPoint(index);
    const candidateDistance = distance(option, point);
    if (candidateDistance < closest && pointIsWalkable(option, obstacles, radius)) {
      nearest = option;
      closest = candidateDistance;
    }
  }
  return nearest;
}

/** Eight-direction A*, followed by line-of-sight smoothing through the actual collision geometry. */
export function findPath(start: Point, destination: Point, obstacles: readonly Rect[], radius = PLAYER_RADIUS): Point[] {
  const end = nearestWalkable(destination, obstacles, radius);
  if (segmentIsClear(start, end, obstacles, radius)) return [end];

  const walkable = Array.from({ length: COLUMNS * ROWS }, (_, index) => pointIsWalkable(cellPoint(index), obstacles, radius));
  const nearestCell = (point: Point) => {
    let index = -1;
    let closest = Infinity;
    for (let item = 0; item < walkable.length; item++) {
      if (!walkable[item]) continue;
      const nextDistance = distance(point, cellPoint(item));
      if (nextDistance < closest && segmentIsClear(point, cellPoint(item), obstacles, radius)) { index = item; closest = nextDistance; }
    }
    return index;
  };
  const first = nearestCell(start);
  const last = nearestCell(end);
  if (first < 0 || last < 0) return [];

  const open = new Set<number>([first]);
  const previous = new Map<number, number>();
  const cost = new Float64Array(walkable.length).fill(Infinity);
  const estimate = new Float64Array(walkable.length).fill(Infinity);
  cost[first] = 0;
  estimate[first] = distance(cellPoint(first), cellPoint(last));
  const closed = new Set<number>();
  while (open.size) {
    let current = -1;
    let best = Infinity;
    for (const item of open) if (estimate[item] < best) { current = item; best = estimate[item]; }
    if (current === last) {
      const indices = [current];
      while (previous.has(current)) { current = previous.get(current)!; indices.unshift(current); }
      const raw = [...indices.map(cellPoint), end];
      const smooth: Point[] = [];
      let anchor = start;
      let index = 0;
      while (index < raw.length) {
        let furthest = index;
        for (let look = raw.length - 1; look > index; look--) {
          if (segmentIsClear(anchor, raw[look], obstacles, radius)) { furthest = look; break; }
        }
        smooth.push(raw[furthest]);
        anchor = raw[furthest];
        index = furthest + 1;
      }
      return smooth;
    }
    open.delete(current);
    closed.add(current);
    const cx = current % COLUMNS;
    const cy = Math.floor(current / COLUMNS);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLUMNS || ny >= ROWS) continue;
      const next = ny * COLUMNS + nx;
      if (!walkable[next] || closed.has(next)) continue;
      if (dx && dy && (!walkable[cy * COLUMNS + nx] || !walkable[ny * COLUMNS + cx])) continue;
      const proposed = cost[current] + (dx && dy ? Math.SQRT2 : 1) * CELL;
      if (proposed >= cost[next]) continue;
      previous.set(next, current);
      cost[next] = proposed;
      estimate[next] = proposed + distance(cellPoint(next), cellPoint(last));
      open.add(next);
    }
  }
  return [];
}

export function directionVector(keys: ReadonlySet<string>): Point {
  const x = Number(keys.has("ArrowRight") || keys.has("d")) - Number(keys.has("ArrowLeft") || keys.has("a"));
  const y = Number(keys.has("ArrowDown") || keys.has("s")) - Number(keys.has("ArrowUp") || keys.has("w"));
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/** Desktop shows the entire room. Small screens keep people at a useful size and follow the player. */
export function cameraForView(width: number, height: number, player: Point): Camera {
  if (width >= 760) {
    const scale = Math.min(width / MAP_WIDTH, height / MAP_HEIGHT);
    return { x: 0, y: 0, scale, offsetX: (width - MAP_WIDTH * scale) / 2, offsetY: (height - MAP_HEIGHT * scale) / 2, viewWidth: MAP_WIDTH, viewHeight: MAP_HEIGHT };
  }
  const scale = Math.max(width / (width < 600 ? 470 : 700), height / MAP_HEIGHT);
  const viewWidth = Math.min(MAP_WIDTH, width / scale);
  const viewHeight = Math.min(MAP_HEIGHT, height / scale);
  return {
    x: Math.max(0, Math.min(MAP_WIDTH - viewWidth, player.x - viewWidth / 2)),
    y: Math.max(0, Math.min(MAP_HEIGHT - viewHeight, player.y - viewHeight * .53)),
    scale, offsetX: 0, offsetY: 0, viewWidth, viewHeight,
  };
}

export function worldToScreen(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) * camera.scale + camera.offsetX, y: (point.y - camera.y) * camera.scale + camera.offsetY };
}

export function screenToWorld(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.offsetX) / camera.scale + camera.x, y: (point.y - camera.offsetY) / camera.scale + camera.y };
}
