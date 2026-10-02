import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/world.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const world = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const { WORLD_COLLISIONS, cameraForView, directionVector, distance, findPath, moveWithCollision, nearestWalkable, pointIsWalkable, screenToWorld, segmentIsClear, worldToScreen } = world;

// A click on the opposite side of a furnished island takes a real walk around it.
for (const obstacles of WORLD_COLLISIONS) {
  const start = { x: 464, y: 494 };
  const goal = { x: 914, y: 343 };
  const route = findPath(start, goal, obstacles);
  assert.ok(route.length, "Each chapter's lounge is reachable from the entry aisle");
  let anchor = start;
  for (const waypoint of route) {
    assert.ok(segmentIsClear(anchor, waypoint, obstacles), "Every smoothed segment clears furniture including player radius");
    anchor = waypoint;
  }
  assert.ok(distance(anchor, goal) < 1);
}

const table = [{ x: 240, y: 280, width: 160, height: 120 }];
const start = { x: 180, y: 330 };
const end = { x: 450, y: 330 };
assert.equal(segmentIsClear(start, end, table), false);
const detour = findPath(start, end, table);
assert.ok(detour.length > 1, "A furnished table produces a detour, rather than direct movement through it");
let total = 0;
let anchor = start;
for (const point of detour) { assert.ok(segmentIsClear(anchor, point, table)); total += distance(anchor, point); anchor = point; }
assert.ok(total > distance(start, end));

const blocked = moveWithCollision(start, { x: 420, y: 0 }, table);
assert.ok(blocked.x <= 231, "A long frame cannot tunnel through a desk");
const sliding = moveWithCollision({ x: 230, y: 330 }, { x: 35, y: 25 }, table);
assert.ok(sliding.x <= 231 && sliding.y > 330, "Movement slides along a furniture edge");
assert.ok(pointIsWalkable(nearestWalkable({ x: 290, y: 320 }, table), table), "Clicking a prop chooses a nearby walkable destination");

const diagonal = directionVector(new Set(["w", "d"]));
assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < .00001, "Diagonal keyboard movement is no faster than axial movement");
assert.deepEqual(directionVector(new Set(["w", "s"])), { x: 0, y: 0 });

const desktop = cameraForView(1440, 900, { x: 850, y: 560 });
assert.equal(desktop.viewWidth, 960);
assert.equal(desktop.viewHeight, 640);
assert.equal(desktop.x, 0);
const phone = cameraForView(390, 780, { x: 850, y: 490 });
assert.ok(phone.viewWidth < 470 && phone.x > 500, "The phone camera crops the room and follows the player");
const point = { x: 822, y: 345 };
const roundTrip = screenToWorld(worldToScreen(point, phone), phone);
assert.ok(distance(point, roundTrip) < .00001, "Touch coordinates follow the scrolling camera exactly");
assert.ok(phone.x + phone.viewWidth <= 960.001 && phone.y + phone.viewHeight <= 640.001);

console.log("World navigation checks passed: chapter routes, click detours, collision sliding, diagonal speed, and phone camera mapping.");
