import type { FieldState, ScoutStyle } from "@/lib/expedition";
import { FIELD_LOCATIONS, FUEL_CAPACITY, GAS_PRICES, PAINTS } from "@/lib/expedition";
import type { Tier } from "@/lib/game";
import type { DistrictGeometry, DrivePoint, DriveRect } from "@/lib/driving";
import { trafficAt, type TrafficCar } from "@/lib/district-life";
import { SPRITE_RECTS } from "@/lib/world";

export type DrivingView = "cockpit" | "chase" | "far";
export type PerspectiveCamera = { origin: DrivePoint; forward: DrivePoint; side: DrivePoint; focal: number; horizon: number; height: number; width: number };
type LocalPoint = { side: number; depth: number };
type CameraOptions = { width: number; height: number; field: FieldState; tier: Tier; style: ScoutStyle; geometry: DistrictGeometry; mode: DrivingView; speed: number; time: number; gps?: readonly DrivePoint[]; people?: readonly { point: DrivePoint; sprite: number; name: string }[]; atlas?: HTMLImageElement | null };
const buffers = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();

export function perspectiveCamera(width: number, height: number, position: DrivePoint, heading: number, mode: DrivingView): PerspectiveCamera {
  const forward = { x: Math.cos(heading), y: Math.sin(heading) };
  const focal = Math.max(width * .82, height * .88);
  const offset = mode === "cockpit" ? -8 : mode === "far" ? 330 : 190;
  return { origin: { x: position.x - forward.x * offset, y: position.y - forward.y * offset }, forward, side: { x: -forward.y, y: forward.x }, focal, horizon: height * .29, height: mode === "cockpit" ? 19 : height * (mode === "far" ? .37 : .41) * offset / focal, width };
}
export function localPoint(point: DrivePoint, camera: PerspectiveCamera): LocalPoint {
  const dx = point.x - camera.origin.x, dy = point.y - camera.origin.y;
  return { side: dx * camera.side.x + dy * camera.side.y, depth: dx * camera.forward.x + dy * camera.forward.y };
}
export function projectPoint(point: DrivePoint, camera: PerspectiveCamera, elevation = 0): DrivePoint | null {
  const local = localPoint(point, camera);
  if (local.depth < 8) return null;
  return { x: camera.width / 2 + local.side * camera.focal / local.depth, y: camera.horizon + (camera.height - elevation) * camera.focal / local.depth };
}
export function clipNear(points: readonly LocalPoint[], near = 8): LocalPoint[] {
  const result: LocalPoint[] = [];
  for (let index = 0; index < points.length; index++) {
    const current = points[index], previous = points[(index + points.length - 1) % points.length];
    const inside = current.depth >= near, prevInside = previous.depth >= near;
    if (inside !== prevInside) {
      const factor = (near - previous.depth) / (current.depth - previous.depth);
      result.push({ side: previous.side + (current.side - previous.side) * factor, depth: near });
    }
    if (inside) result.push(current);
  }
  return result;
}
function groundPolygon(ctx: CanvasRenderingContext2D, points: readonly DrivePoint[], camera: PerspectiveCamera, color: string) {
  const clipped = clipNear(points.map(point => localPoint(point, camera)));
  if (clipped.length < 3) return;
  ctx.fillStyle = color; ctx.beginPath();
  clipped.forEach((point, index) => {
    const x = Math.round(camera.width / 2 + point.side * camera.focal / point.depth);
    const y = Math.round(camera.horizon + camera.height * camera.focal / point.depth);
    if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.closePath(); ctx.fill();
}
function groundRect(ctx: CanvasRenderingContext2D, rect: DriveRect, camera: PerspectiveCamera, color: string) {
  groundPolygon(ctx, [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }], camera, color);
}
type ElevatedPoint = DrivePoint & { elevation: number };
/** Clip walls and roofs against the camera plane. A building continues off-screen
 * naturally instead of popping out or stretching a top-down picture into a wall. */
function worldPolygon(ctx: CanvasRenderingContext2D, points: readonly ElevatedPoint[], camera: PerspectiveCamera, color: string) {
  const polygon = points.map(point => ({ ...localPoint(point, camera), elevation: point.elevation }));
  const clipped: typeof polygon = [];
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index], previous = polygon[(index + polygon.length - 1) % polygon.length];
    const inside = current.depth >= 8, previousInside = previous.depth >= 8;
    if (inside !== previousInside) { const fraction = (8 - previous.depth) / (current.depth - previous.depth); clipped.push({ side: previous.side + (current.side - previous.side) * fraction, depth: 8, elevation: previous.elevation + (current.elevation - previous.elevation) * fraction }); }
    if (inside) clipped.push(current);
  }
  if (clipped.length < 3) return;
  ctx.fillStyle = color; ctx.beginPath();
  clipped.forEach((point, index) => { const x = Math.round(camera.width / 2 + point.side * camera.focal / point.depth), y = Math.round(camera.horizon + (camera.height - point.elevation) * camera.focal / point.depth); if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath(); ctx.fill();
}
function wallPanel(ctx: CanvasRenderingContext2D, a: DrivePoint, b: DrivePoint, bottom: number, top: number, camera: PerspectiveCamera, color: string) {
  worldPolygon(ctx, [{ ...a, elevation: bottom }, { ...b, elevation: bottom }, { ...b, elevation: top }, { ...a, elevation: top }], camera, color);
}
function facade(ctx: CanvasRenderingContext2D, a: DrivePoint, b: DrivePoint, height: number, camera: PerspectiveCamera, wall: string, trim: string, window: string, front: boolean) {
  wallPanel(ctx, a, b, 0, height, camera, wall);
  wallPanel(ctx, a, b, height - 9, height, camera, trim);
  wallPanel(ctx, a, b, 0, 6, camera, trim);
  const span = Math.hypot(b.x - a.x, b.y - a.y), panes = Math.max(2, Math.floor(span / 48));
  const at = (fraction: number): DrivePoint => ({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
  for (let part = 0; part < panes; part++) {
    if (front && Math.abs((part + .5) / panes - .5) < .14) continue;
    const left = at((part + .2) / panes), right = at((part + .76) / panes);
    wallPanel(ctx, left, right, 20, height - 23, camera, "#233c46");
    wallPanel(ctx, at((part + .25) / panes), at((part + .7) / panes), 24, height - 26, camera, window);
    wallPanel(ctx, left, right, height * .55, height * .55 + 2, camera, trim);
  }
  if (front) {
    wallPanel(ctx, at(.46), at(.54), 0, height * .69, camera, "#162a35");
    wallPanel(ctx, at(.47), at(.494), 7, height * .66, camera, "#699499");
    wallPanel(ctx, at(.506), at(.53), 7, height * .66, camera, "#699499");
    wallPanel(ctx, at(.44), at(.56), height * .72, height * .78, camera, window);
  }
}
function building(ctx: CanvasRenderingContext2D, rect: DriveRect, index: number, tier: Tier, camera: PerspectiveCamera) {
  const height = [84, 75, 65, 68][index % 4] + (tier === 1 ? 21 : 0);
  const nw = { x: rect.x, y: rect.y }, ne = { x: rect.x + rect.width, y: rect.y }, se = { x: rect.x + rect.width, y: rect.y + rect.height }, sw = { x: rect.x, y: rect.y + rect.height };
  const palette = tier === 0 ? ["#ae8569", "#746453", "#40525a", "#e7ca86"] : tier === 1 ? ["#82979b", "#58717b", "#354657", "#bdd3d0"] : ["#627369", "#41574f", "#243c3c", "#dcc08a"];
  // Show only faces the camera can see, preserving the collision footprint.
  if (camera.origin.y < rect.y) facade(ctx, ne, nw, height, camera, palette[1], palette[2], palette[3], index > 1);
  if (camera.origin.x < rect.x) facade(ctx, nw, sw, height, camera, palette[1], palette[2], palette[3], false);
  if (camera.origin.x > rect.x + rect.width) facade(ctx, se, ne, height, camera, palette[1], palette[2], palette[3], false);
  if (camera.origin.y > rect.y + rect.height) facade(ctx, sw, se, height, camera, palette[0], palette[2], palette[3], true);
  if (camera.height > height) worldPolygon(ctx, [nw, ne, se, sw].map(point => ({ ...point, elevation: height })), camera, palette[2]);
  // Architectural roof details give each organization a different skyline.
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  if (tier === 1 && index === 2) { const dome = projectPoint(middle, camera, height + 15); const local = localPoint(middle, camera); if (dome && local.depth > 20) { const size = Math.max(2, Math.round(48 * camera.focal / local.depth)); ctx.fillStyle = "#b2c9c6"; ctx.fillRect(Math.round(dome.x - size / 2), Math.round(dome.y - size / 2), size, Math.max(3, size / 3)); ctx.fillRect(Math.round(dome.x - size / 3), Math.round(dome.y - size * .7), size * .67, size * .4); } }
  const sign = projectPoint({ x: middle.x, y: camera.origin.y < rect.y ? rect.y : rect.y + rect.height }, camera, height + 8), depth = localPoint(middle, camera).depth;
  if (sign && depth > 75 && depth < 1050) { const size = Math.max(6, Math.min(9, 1300 / depth)); pixelText(ctx, FIELD_LOCATIONS[tier][index]?.name.toUpperCase() || "", sign.x, sign.y, tier === 2 ? "#ddc397" : "#e5edc7", size); }
}
function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#ecedc2", size = 7) {
  ctx.font = `${size}px ScoutPixel, monospace`; ctx.textAlign = "center";
  ctx.fillStyle = "#14222a"; ctx.fillText(text, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = color; ctx.fillText(text, Math.round(x), Math.round(y));
}
function rearCar(ctx: CanvasRenderingContext2D, style: ScoutStyle, x: number, y: number, scale: number, speed: number, paintOverride?: string) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
  const paint = paintOverride || PAINTS[style.paint], width = style.car === "wagon" ? 64 : style.car === "coupe" ? 68 : 58;
  ctx.fillStyle = "#0e1b25"; ctx.fillRect(-width / 2 - 8, -18, width + 16, 21);
  ctx.fillStyle = "#253842"; ctx.fillRect(-width / 2 - 3, -25, 11, 27); ctx.fillRect(width / 2 - 8, -25, 11, 27);
  ctx.fillStyle = paint; ctx.fillRect(-width / 2, -33, width, 33); ctx.fillRect(-width / 2 + 6, -53, width - 12, 28);
  ctx.fillStyle = "#233d4c"; ctx.fillRect(-width / 2 + 9, -49, width - 18, 20);
  ctx.fillStyle = "#749cad"; ctx.fillRect(-width / 2 + 11, -47, width - 23, 4);
  ctx.fillStyle = "#abc6c2"; ctx.globalAlpha = .55; ctx.fillRect(-width / 2 + 3, -31, width - 6, 3); ctx.globalAlpha = 1;
  ctx.fillStyle = speed > 240 ? "#ffcc88" : "#ed9d85"; ctx.fillRect(-width / 2 + 3, -22, 12, 7); ctx.fillRect(width / 2 - 15, -22, 12, 7);
  ctx.fillStyle = "#dfe4c4"; ctx.fillRect(-15, -17, 30, 8); ctx.fillStyle = "#2c4548"; ctx.font = "6px ScoutPixel, monospace"; ctx.textAlign = "center"; ctx.fillText(style.plate, 0, -10);
  ctx.fillStyle = "#1c313e"; ctx.fillRect(-width / 2 - 2, -8, width + 4, 7);
  if (style.car === "wagon") { ctx.fillStyle = "#253b45"; ctx.fillRect(-23, -57, 46, 3); ctx.fillRect(-20, -61, 4, 6); ctx.fillRect(16, -61, 4, 6); }
  if (style.car === "coupe") { ctx.fillStyle = "#263b45"; ctx.fillRect(-width / 2 - 4, -29, width + 8, 4); }
  ctx.restore();
}
function trafficCar(ctx: CanvasRenderingContext2D, vehicle: TrafficCar, style: ScoutStyle, camera: PerspectiveCamera) {
  const point = projectPoint(vehicle.point, camera), local = localPoint(vehicle.point, camera);
  if (!point || local.depth < 38 || local.depth > 1350) return;
  const size = camera.focal / local.depth;
  const facing = Math.cos(vehicle.heading - Math.atan2(vehicle.point.y - camera.origin.y, vehicle.point.x - camera.origin.x));
  if (Math.abs(facing) > .65) rearCar(ctx, { ...style, car: vehicle.kind, plate: "LOCAL" }, point.x, point.y, size * .65, 40, vehicle.paint);
  else {
    const w = Math.round(48 * size), h = Math.round(23 * size), x = Math.round(point.x - w / 2), y = Math.round(point.y - h);
    ctx.fillStyle = "#172530"; ctx.fillRect(x + w * .1, y + h * .72, w * .18, h * .29); ctx.fillRect(x + w * .72, y + h * .72, w * .18, h * .29);
    ctx.fillStyle = vehicle.paint; ctx.fillRect(x, y + h * .42, w, h * .44); ctx.fillRect(x + w * .22, y, w * .5, h * .6);
    ctx.fillStyle = "#355766"; ctx.fillRect(x + w * .28, y + h * .12, w * .18, h * .34); ctx.fillRect(x + w * .5, y + h * .12, w * .17, h * .34);
    ctx.fillStyle = "#ecc692"; ctx.fillRect(x + w * .9, y + h * .5, Math.max(1, w * .07), Math.max(1, h * .12));
  }
}
function cockpit(ctx: CanvasRenderingContext2D, width: number, height: number, field: FieldState, style: ScoutStyle, speed: number, time: number) {
  const dash = Math.round(height * .77), paint = PAINTS[style.paint];
  // Stepped windshield pillars and a low dashboard leave most of the road visible.
  ctx.fillStyle = "#14212c"; ctx.fillRect(0, dash, width, height - dash);
  ctx.fillStyle = "#42545a"; ctx.fillRect(0, dash, width, 4); ctx.fillStyle = paint; ctx.fillRect(0, dash + 4, width, 3);
  for (let y = 0; y < dash; y += 4) {
    const pillar = Math.round(5 + Math.abs(y - dash * .6) / dash * 10);
    ctx.fillStyle = "#21323c"; ctx.fillRect(0, y, pillar, 4); ctx.fillRect(width - pillar, y, pillar, 4);
    ctx.fillStyle = paint; ctx.fillRect(pillar - 3, y, 3, 4); ctx.fillRect(width - pillar, y, 3, 4);
  }
  const wheelX = Math.round(width * .28), wheelY = Math.round(height * .93), wheel = Math.min(width * .12, 33);
  ctx.fillStyle = "#070f19";
  ctx.fillRect(wheelX - wheel, wheelY - wheel, wheel * 2, 8); ctx.fillRect(wheelX - wheel, wheelY - wheel + 7, 8, wheel * 2 - 15); ctx.fillRect(wheelX + wheel - 8, wheelY - wheel + 7, 8, wheel * 2 - 15); ctx.fillRect(wheelX - wheel, wheelY + wheel - 8, wheel * 2, 8);
  ctx.fillStyle = "#53616a"; ctx.fillRect(wheelX - 4, wheelY - wheel + 8, 8, wheel - 5); ctx.fillRect(wheelX - wheel + 8, wheelY - 3, wheel * 2 - 16, 6); ctx.fillStyle = "#273e46"; ctx.fillRect(wheelX - 10, wheelY - 9, 20, 17);
  const panelX = Math.round(width * .54), panelW = Math.round(width * .29);
  ctx.fillStyle = "#080f19"; ctx.fillRect(panelX, dash + 13, panelW, 30);
  pixelText(ctx, `${Math.round(speed / 6)} MPH`, panelX + panelW / 2, dash + 24, "#bdedb7", 8);
  ctx.fillStyle = "#374c50"; ctx.fillRect(panelX + 7, dash + 31, panelW - 14, 5);
  ctx.fillStyle = field.fuel < 2 ? "#ee9c78" : "#a8d7a6"; ctx.fillRect(panelX + 7, dash + 31, Math.max(0, (panelW - 14) * field.fuel / FUEL_CAPACITY), 5);
  // A small mirror reflects the sky rather than repeating the front view.
  ctx.fillStyle = "#132735"; ctx.fillRect(width * .41, 8, width * .18, 15); ctx.fillStyle = "#597d87"; ctx.fillRect(width * .41 + 3, 11, width * .18 - 6, 9);
  if (speed > 2) { ctx.fillStyle = "#f8eac6"; ctx.globalAlpha = .2; ctx.fillRect(panelX + panelW - 6, dash + 18 + Math.floor(Math.sin(time * 8) * 2), 2, 5); ctx.globalAlpha = 1; }
}

/** Three distinct perspective views, rendered to a small pixel buffer, then scaled sharply. */
export function renderDrivingCamera(target: CanvasRenderingContext2D, options: CameraOptions): void {
  const pixelScale = options.width < 600 ? 2 : 3;
  let buffer = buffers.get(target);
  if (!buffer) { buffer = document.createElement("canvas"); buffers.set(target, buffer); }
  const width = Math.max(160, Math.ceil(options.width / pixelScale)), height = Math.max(180, Math.ceil(options.height / pixelScale));
  if (buffer.width !== width || buffer.height !== height) { buffer.width = width; buffer.height = height; }
  const ctx = buffer.getContext("2d"); if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const { field, tier, style, geometry, mode, speed, time } = options;
  const camera = perspectiveCamera(width, height, field.car, field.heading, mode);
  const palette = [
    { sky: "#819ea6", cloud: "#d2d8ba", distant: "#71888a", land: "#5d7860", path: "#a59b79", road: "#465458", light: "#d2c9a0" },
    { sky: "#303c64", cloud: "#59617e", distant: "#485770", land: "#405c65", path: "#92969d", road: "#425469", light: "#c6bcdb" },
    { sky: "#1b333f", cloud: "#294b52", distant: "#30504e", land: "#354f47", path: "#766b58", road: "#34484c", light: "#d5b783" },
  ][tier];
  ctx.fillStyle = palette.sky; ctx.fillRect(0, 0, width, height);
  if (tier) {
    ctx.fillStyle = "#b4bcae";
    for (let i = 0; i < 35; i++) ctx.fillRect((i * 73 + 31) % width, (i * 37 + 9) % Math.max(1, Math.floor(camera.horizon - 10)), i % 7 ? 1 : 2, 1);
  } else {
    ctx.fillStyle = palette.cloud;
    for (let i = 0; i < 4; i++) { const x = (i * width / 3 + 21) % width; ctx.fillRect(x, camera.horizon * .38 + i % 2 * 8, 36, 4); ctx.fillRect(x + 7, camera.horizon * .38 - 4 + i % 2 * 8, 19, 4); }
  }
  ctx.fillStyle = palette.distant;
  for (let i = -1; i < 20; i++) { const x = i * 27 - (field.heading * 16 % 27), size = 8 + (i * i * 7 % 23); ctx.fillRect(x, camera.horizon - size, 23, size + 2); }
  ctx.fillStyle = palette.land; ctx.fillRect(0, Math.floor(camera.horizon), width, height);
  for (let y = 0; y < 1024; y += 128) for (let x = 0; x < 1536; x += 128) {
    if ((x + y) / 128 % 2) groundRect(ctx, { x, y, width: 128, height: 128 }, camera, tier === 0 ? "#607c64" : tier === 1 ? "#435f67" : "#37534a");
  }
  for (const road of geometry.roads) groundRect(ctx, { x: road.x - 13, y: road.y - 13, width: road.width + 26, height: road.height + 26 }, camera, palette.path);
  for (const road of geometry.roads) groundRect(ctx, road, camera, palette.road);
  for (const road of geometry.roads) {
    const horizontal = road.width > road.height;
    const length = horizontal ? road.width : road.height;
    for (let offset = 0; offset < length; offset += 56) {
      const stripe = horizontal ? { x: road.x + offset, y: road.y + road.height / 2 - 1, width: Math.min(23, length - offset), height: 2 } : { x: road.x + road.width / 2 - 1, y: road.y + offset, width: 2, height: Math.min(23, length - offset) };
      groundRect(ctx, stripe, camera, palette.light);
    }
  }
  // GPS is painted onto the same projected roadway; it never relocates the car.
  const route = [field.car, ...(options.gps || [])];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i]; const length = Math.hypot(b.x - a.x, b.y - a.y); const count = Math.ceil(length / 28);
    for (let part = 1; part <= count; part++) {
      const factor = part / Math.max(1, count); const p = { x: a.x + (b.x - a.x) * factor, y: a.y + (b.y - a.y) * factor };
      groundRect(ctx, { x: p.x - 3, y: p.y - 3, width: 6, height: 6 }, camera, "#b8e89a");
    }
  }
  const billboards: { point: DrivePoint; kind: "building" | "tree" | "pump" | "lamp" | "person" | "car"; solid?: DriveRect; index?: number; name?: string; vehicle?: TrafficCar }[] = geometry.solids.map((solid, index) => ({ point: { x: solid.x + solid.width / 2, y: solid.y + solid.height / 2 }, kind: "building", solid, index }));
  for (let x = 100; x < 1460; x += 158) for (const y of [110, 425, 665, 960]) {
    const point = { x: x + y % 31, y }; if (!geometry.solids.some(rect => point.x > rect.x - 40 && point.x < rect.x + rect.width + 40 && point.y > rect.y - 30 && point.y < rect.y + rect.height + 30) && !geometry.roads.some(rect => point.x > rect.x - 8 && point.x < rect.x + rect.width + 8 && point.y > rect.y - 8 && point.y < rect.y + rect.height + 8)) billboards.push({ point, kind: "tree" });
  }
  // Lamps follow the real curb grid. Small warm pixels give dusk/night chapters
  // readable street edges without obscuring the GPS route.
  for (const road of geometry.roads.slice(0, 3)) for (let x = road.x + 65; x < road.x + road.width - 50; x += 165) {
    if (geometry.roads.slice(3, 6).some(vertical => x > vertical.x - 30 && x < vertical.x + vertical.width + 30)) continue;
    billboards.push({ point: { x, y: road.y - 16 }, kind: "lamp" });
  }
  for (const person of options.people || []) billboards.push({ point: person.point, kind: "person", index: person.sprite, name: person.name });
  for (const vehicle of trafficAt(geometry, time)) billboards.push({ point: vehicle.point, kind: "car", vehicle });
  billboards.push({ point: FIELD_LOCATIONS[tier][4].door, kind: "pump" });
  billboards.sort((a, b) => localPoint(b.point, camera).depth - localPoint(a.point, camera).depth);
  for (const item of billboards) {
    const local = localPoint(item.point, camera), projected = projectPoint(item.point, camera);
    if (item.kind === "building" && item.solid) { building(ctx, item.solid, item.index || 0, tier, camera); continue; }
    if (!projected || local.depth < 35 || local.depth > 1650) continue;
    const scale = camera.focal / local.depth;
    if (item.kind === "tree") {
      // Third-person cameras may pass through a park as they trail the car.
      // Cut away near foliage between the camera and player instead of filling
      // the entire screen with a tree behind the vehicle.
      if (mode !== "cockpit" && local.depth < localPoint(field.car, camera).depth + 30 && Math.abs(local.side) < 62) continue;
      const trunk = Math.max(1, Math.round(7 * scale)), treeW = Math.round(56 * scale), treeH = Math.round(90 * scale), x = Math.round(projected.x), y = Math.round(projected.y);
      if (x + treeW < 0 || x - treeW > width) continue;
      ctx.fillStyle = "#695c49"; ctx.fillRect(x - trunk / 2, y - treeH / 2, trunk, treeH / 2);
      ctx.fillStyle = tier === 1 ? "#506f82" : "#365e4c"; ctx.fillRect(x - treeW / 2, y - treeH * .8, treeW, treeH * .45); ctx.fillRect(x - treeW * .34, y - treeH, treeW * .68, treeH * .4);
      ctx.fillStyle = tier === 0 ? "#739565" : "#648575"; ctx.fillRect(x - treeW * .29, y - treeH * .9, treeW * .45, Math.max(2, treeH * .13));
      ctx.fillStyle = tier === 0 ? "#8aa871" : "#748f81";
      for (let patch = 0; patch < 5; patch++) { const px = x - treeW * .3 + (patch * 17 % 39) / 50 * treeW, py = y - treeH * .86 + (patch * 13 % 27) / 95 * treeH; ctx.fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(8 * scale)), Math.max(1, Math.round(5 * scale))); }
    } else if (item.kind === "lamp") {
      const x = Math.round(projected.x), y = Math.round(projected.y), height = Math.round(68 * scale), pole = Math.max(1, Math.round(3 * scale));
      ctx.fillStyle = "#263c43"; ctx.fillRect(x - pole / 2, y - height, pole, height); ctx.fillRect(x - pole * 1.5, y - 3 * pole, pole * 3, 3 * pole);
      ctx.fillStyle = tier === 0 ? "#e8c27e" : "#f0d29b"; ctx.fillRect(x - 4 * scale, y - height - 6 * scale, 8 * scale, 7 * scale); ctx.fillStyle = "#eff0c8"; ctx.fillRect(x - 2 * scale, y - height - 5 * scale, 4 * scale, 5 * scale);
    } else if (item.kind === "car" && item.vehicle) {
      trafficCar(ctx, item.vehicle, style, camera);
    } else if (item.kind === "person" && item.index !== undefined && options.atlas) {
      const source = SPRITE_RECTS[item.index % SPRITE_RECTS.length], h = Math.round(48 * scale), w = Math.round(h * source[2] / source[3]);
      if (projected.x + w < 0 || projected.x - w > width || h < 3) continue;
      ctx.fillStyle = "#20353d"; ctx.fillRect(Math.round(projected.x - w * .45), Math.round(projected.y - 2), Math.max(1, w * .9), Math.max(1, h * .05));
      ctx.drawImage(options.atlas, source[0], source[1], source[2], source[3], Math.round(projected.x - w / 2), Math.round(projected.y - h), w, h);
      if (h > 22) pixelText(ctx, item.name || "", projected.x, projected.y - h - 5, "#e8e8c3", 6);
    } else if (item.kind === "pump") {
      const w = Math.round(110 * scale), h = Math.round(65 * scale), x = Math.round(projected.x - w / 2), y = Math.round(projected.y - h);
      ctx.fillStyle = "#d3c99e"; ctx.fillRect(x + w * .1, y + h * .1, w * .08, h * .9); ctx.fillRect(x + w * .82, y + h * .1, w * .08, h * .9); ctx.fillStyle = "#c46f5d"; ctx.fillRect(x, y, w, h * .2); ctx.fillStyle = "#142632"; ctx.fillRect(x + w * .23, y + h * .5, w * .15, h * .45); ctx.fillRect(x + w * .63, y + h * .5, w * .15, h * .45); ctx.fillStyle = "#badbaa"; ctx.fillRect(x + w * .26, y + h * .55, w * .09, h * .12);
      if (scale > .25) { pixelText(ctx, "HIGHWAY FUEL", projected.x, y - 13, "#f3cf9c", 7); pixelText(ctx, `$${GAS_PRICES[tier].toFixed(2)}/GAL`, projected.x, y - 5, "#dde6b2", 6); }
    }
  }
  // Distant haze keeps horizon details quiet while preserving the readable road.
  ctx.fillStyle = palette.sky; ctx.globalAlpha = .18; ctx.fillRect(0, camera.horizon - 3, width, 10); ctx.globalAlpha = 1;
  if (mode === "cockpit") cockpit(ctx, width, height, field, style, speed, time);
  else {
    const point = projectPoint(field.car, camera);
    if (point) rearCar(ctx, style, point.x, point.y, camera.focal / localPoint(field.car, camera).depth, speed);
  }
  target.save(); target.setTransform(1, 0, 0, 1, 0, 0); target.imageSmoothingEnabled = false;
  target.drawImage(buffer, 0, 0, target.canvas.width, target.canvas.height); target.restore();
}
