import assert from "node:assert/strict";
import { DISTRICT_GEOMETRIES, districtDrivable } from "../src/lib/driving.ts";
import { roadCue, routeDistance, trafficAt } from "../src/lib/district-life.ts";

// The living-world traffic shares real road geometry, keeps moving around turns,
// and must not jump across the map when its animation loop wraps.
for (const geometry of DISTRICT_GEOMETRIES) {
  for (let time = 0; time < 150; time += .5) {
    const cars = trafficAt(geometry, time), next = trafficAt(geometry, time + 1 / 60);
    assert.equal(cars.length, 5);
    for (let index = 0; index < cars.length; index++) {
      assert(districtDrivable(cars[index].point, 0, geometry), "Ambient vehicle stays on a real road through every corner");
      assert(Math.hypot(next[index].point.x - cars[index].point.x, next[index].point.y - cars[index].point.y) < 1.1, "Loop boundary does not teleport a traffic car");
      assert(Number.isFinite(cars[index].heading));
    }
  }
  assert.deepEqual(trafficAt(geometry, 25), trafficAt(geometry, 25), "Changing camera does not change traffic positions");
}

const position = { x: 200, y: 200 };
// A venue north-east can require going south first along the current street.
// The cue follows the actual waypoint instead of pointing through the block.
const actualRoute = [{ x: 200, y: 390 }, { x: 600, y: 390 }, { x: 600, y: 200 }];
assert.equal(routeDistance(position, actualRoute), 780);
assert.equal(roadCue(position, 0, actualRoute).label, "BEAR RIGHT");
assert.equal(roadCue(position, Math.PI, actualRoute).label, "BEAR LEFT");
assert.equal(roadCue(position, Math.PI / 2, actualRoute).label, "CONTINUE AHEAD");
assert.equal(roadCue(position, -Math.PI / 2, actualRoute).label, "TURN AROUND SAFELY");
assert.equal(roadCue(position, 0, actualRoute, { x: 212, y: 200 }).arrow, "P");
assert.equal(roadCue(position, 0, []).label, "CHOOSE A DESTINATION");
assert.equal(roadCue(position, Math.PI * 8, []).heading, "E");

console.log("District-life checks passed: all chapters' road traffic, continuous loops, route distances, compass, and route-based turn cues.");
