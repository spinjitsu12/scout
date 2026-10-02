import type { DistrictGeometry, DrivePoint } from "./driving";

export type TrafficCar = { point: DrivePoint; heading: number; kind: "compact" | "wagon" | "coupe"; paint: string };
export type RoadCue = { label: string; arrow: "↑" | "←" | "→" | "↶" | "P"; distance: number; heading: string };
export const DISTRICT_NAMES = ["CIRRUS QUARTER", "ASTER CAMPUS", "THE OLD DISTRICT"] as const;
const gap = (a: DrivePoint, b: DrivePoint) => Math.hypot(b.x - a.x, b.y - a.y);

/** Every driving view samples the same closed routes: cars turn at junctions,
 * rather than disappearing halfway along a street when a camera changes. */
export function trafficAt(geometry: DistrictGeometry, time: number): TrafficCar[] {
  const [top, , bottom, left, , right] = geometry.roads;
  if (!top || !bottom || !left || !right) return [];
  const lane = 9;
  return Array.from({ length: 5 }, (_, index) => {
    const clockwise = index % 2 === 0;
    const inset = clockwise ? lane : -lane;
    const x1 = left.x + left.width / 2 + inset, x2 = right.x + right.width / 2 - inset;
    const y1 = top.y + top.height / 2 + inset, y2 = bottom.y + bottom.height / 2 - inset;
    const turn = 19;
    const corners: DrivePoint[] = [
      { x: x1 + turn, y: y1 }, { x: x2 - turn, y: y1 }, { x: x2, y: y1 + turn },
      { x: x2, y: y2 - turn }, { x: x2 - turn, y: y2 }, { x: x1 + turn, y: y2 },
      { x: x1, y: y2 - turn }, { x: x1, y: y1 + turn },
    ];
    const route = clockwise ? corners : [...corners].reverse();
    const lengths = route.map((point, part) => gap(point, route[(part + 1) % route.length]));
    const perimeter = lengths.reduce((sum, length) => sum + length, 0);
    let travelled = ((time * (39 + index * 5) + index * 681) % perimeter + perimeter) % perimeter;
    let part = 0;
    while (travelled > lengths[part] && part < route.length - 1) { travelled -= lengths[part]; part++; }
    const a = route[part], b = route[(part + 1) % route.length], amount = travelled / Math.max(1, lengths[part]);
    return { point: { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount }, heading: Math.atan2(b.y - a.y, b.x - a.x), kind: index === 3 ? "coupe" : index % 2 ? "wagon" : "compact", paint: ["#dab5a1", "#aabdc9", "#c9cda6", "#989db7", "#7caaa0"][index] };
  });
}

export function routeDistance(position: DrivePoint, route: readonly DrivePoint[]): number {
  let previous = position, total = 0;
  for (const point of route) { total += gap(previous, point); previous = point; }
  return total;
}

/** Compass and next steering cue come from the real road route, not the venue's
 * straight-line direction, which can point a player into a building. */
export function roadCue(position: DrivePoint, heading: number, route: readonly DrivePoint[], destination?: DrivePoint): RoadCue {
  const labels = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
  const compass = labels[((Math.round(heading / (Math.PI / 4)) % 8) + 8) % 8];
  if (destination && gap(position, destination) < 85) return { label: "PARK & STEP OUT", arrow: "P", distance: 0, heading: compass };
  const ahead = route.find(point => gap(position, point) > 65) || route[route.length - 1];
  if (!ahead) return { label: "CHOOSE A DESTINATION", arrow: "↑", distance: 0, heading: compass };
  const angle = Math.atan2(ahead.y - position.y, ahead.x - position.x);
  const turn = Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading));
  const magnitude = Math.abs(turn);
  return { label: magnitude > 2.35 ? "TURN AROUND SAFELY" : magnitude > .5 ? turn > 0 ? "BEAR RIGHT" : "BEAR LEFT" : "CONTINUE AHEAD", arrow: magnitude > 2.35 ? "↶" : magnitude > .5 ? turn > 0 ? "→" : "←" : "↑", distance: Math.round(routeDistance(position, route)), heading: compass };
}
