import * as THREE from 'three';
import type { WorldPoint } from './immersive-runtime.ts';

export type RouteProgress = { distance: number; remaining: number; offRoute: number; segment: number; total: number };
export function routeProgress(points: readonly WorldPoint[], position: WorldPoint): RouteProgress {
  let travelled = 0, best = Infinity, projected = 0, segment = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < .001) continue;
    const t = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / (length * length)));
    const distance = Math.hypot(position.x - a.x - dx * t, position.z - a.z - dz * t);
    if (distance < best) { best = distance; projected = travelled + t * length; segment = i; }
    travelled += length;
  }
  return { distance: projected, remaining: Math.max(0, travelled - projected), offRoute: best, segment, total: travelled };
}
export const routeDistanceRemaining = (points: readonly WorldPoint[], position: WorldPoint) => routeProgress(points, position).remaining;
export function sampleRoute(points: readonly WorldPoint[], distance: number): (WorldPoint & { heading: number; untilTurn: number; segment: number }) | null {
  let left = Math.max(0, distance);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < .001) continue;
    if (left <= length) {
      const t = left / length;
      return { x: a.x + dx * t, z: a.z + dz * t, heading: Math.atan2(-dx, -dz), untilTurn: length - left, segment: i };
    }
    left -= length;
  }
  return null;
}

/** Instanced road chevrons sit in the travel lane, with amber before a junction. */
export function createRoadGuide() {
  const group = new THREE.Group(); group.name = 'Scouting route';
  const arrow = new THREE.Shape();
  arrow.moveTo(0, .9); arrow.lineTo(.78, -.1); arrow.lineTo(.42, -.35); arrow.lineTo(0, .15); arrow.lineTo(-.42, -.35); arrow.lineTo(-.78, -.1); arrow.closePath();
  const geometry = new THREE.ShapeGeometry(arrow);
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const mesh = new THREE.InstancedMesh(geometry, material, 40); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 2; group.add(mesh);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
  const rotation = new THREE.Quaternion(), horizontal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), up = new THREE.Vector3(0, 1, 0);
  const mint = new THREE.Color('#80dec1'), amber = new THREE.Color('#edb978');
  function update(route: readonly WorldPoint[], player: WorldPoint, elapsed: number) {
    const progress = routeProgress(route, player); let count = 0;
    if (progress.offRoute <= 42) for (let ahead = 10; ahead <= 310 && count < 40; ahead += 10) {
      const sample = sampleRoute(route, progress.distance + ahead); if (!sample) break;
      const lane = 2.3;
      position.set(sample.x + Math.cos(sample.heading) * lane, .075, sample.z - Math.sin(sample.heading) * lane);
      rotation.setFromAxisAngle(up, sample.heading).multiply(horizontal);
      matrix.compose(position, rotation, scale); mesh.setMatrixAt(count, matrix);
      mesh.setColorAt(count, sample.untilTurn < 45 && sample.segment < route.length - 2 ? amber : mint); count++;
    }
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    material.opacity = .74 + Math.sin(elapsed * 1.6) * .05;
  }
  return { group, update, dispose() { mesh.dispose(); geometry.dispose(); material.dispose(); } };
}
