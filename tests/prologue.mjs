import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import {
  APARTMENT_OBSTACLES, APARTMENT_SPAWN, APARTMENT_STATIONS,
  DREAM_MAX_SPEED, DREAM_PITCHES, DREAM_ROUTE_LENGTH,
  advancePrologue, chooseProloguePitch, initialPrologue, skipPrologueDream,
  stepDreamDrive, validPrologue,
} from "../src/lib/prologue.ts";

let story = initialPrologue();
assert(validPrologue(story));
assert.equal(story.phase, "sky");
story = advancePrologue(advancePrologue(story));
assert.equal(story.phase, "meeting");
assert.equal(advancePrologue(story).phase, "meeting", "The meeting waits for a player choice");

for (const pitch of DREAM_PITCHES) {
  const selected = chooseProloguePitch(story, pitch.id);
  assert.equal(selected.choice, pitch.id);
  assert(pitch.reply.endsWith("I'm out."), "Every dream pitch rejects the offer in its own words");
  const reload = JSON.parse(JSON.stringify(selected));
  assert(validPrologue(reload));
  assert.equal(chooseProloguePitch(reload, DREAM_PITCHES.find(other => other.id !== pitch.id).id).choice, pitch.id, "Reload cannot erase a committed dialogue choice");
  const phone = advancePrologue(reload), wake = advancePrologue(phone), complete = advancePrologue(wake);
  assert.equal(phone.phase, "phone"); assert.equal(wake.phase, "wake"); assert.equal(complete.phase, "complete");
  assert.deepEqual(advancePrologue(complete), complete, "A completed career does not restart the dream");
  assert.equal(complete.choice, pitch.id);
}
assert.equal(skipPrologueDream(initialPrologue()).phase, "wake", "Skipping arrives at the playable apartment");
assert.deepEqual(skipPrologueDream({ phase: "complete", choice: null }), { phase: "complete", choice: null });
for (const bad of [null, [], {}, { phase: "office", choice: null }, { phase: "sky", choice: "salary" }, { phase: "meeting", choice: "hire" }]) assert.equal(validPrologue(bad), false);
assert.throws(() => chooseProloguePitch(initialPrologue(), "salary"));

let drive = { distance: 0, speed: 0, lane: 0 };
const coast = stepDreamDrive(drive, { throttle: false, brake: false, steering: 1 }, 1);
assert.deepEqual(coast, drive, "The car waits for throttle and cannot steer while stopped");
for (let frame = 0; frame < 900; frame++) drive = stepDreamDrive(drive, { throttle: true, brake: false, steering: 1 }, 1 / 60);
assert.equal(drive.distance, DREAM_ROUTE_LENGTH, "Sustained driving reaches the meeting in under fifteen seconds");
assert.equal(drive.speed, DREAM_MAX_SPEED); assert.equal(drive.lane, .72, "Intro lane limits keep the prologue forgiving");
for (let frame = 0; frame < 120; frame++) drive = stepDreamDrive(drive, { throttle: true, brake: true, steering: 0 }, 1 / 60);
assert.equal(drive.speed, 0, "Brakes take precedence over throttle");
assert.equal(stepDreamDrive({ distance: 0, speed: 10, lane: 0 }, { throttle: true, brake: false, steering: NaN }, Infinity).distance, 0, "Non-finite frame time cannot jump to the endpoint");

// The bedroom partition has an actual opening. Every prop is approached by
// walking around the bed, desk, sofa and kitchen rather than through them.
const source = await readFile(new URL("../src/lib/world.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { findPath, segmentIsClear, distance, pointIsWalkable } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
assert(pointIsWalkable(APARTMENT_SPAWN, APARTMENT_OBSTACLES, 8));
for (const station of APARTMENT_STATIONS) {
  assert(pointIsWalkable(station.approach, APARTMENT_OBSTACLES, 8), `${station.name} has a clear interaction approach`);
  const route = findPath(APARTMENT_SPAWN, station.approach, APARTMENT_OBSTACLES, 8);
  assert(route.length > 0, `${station.name} is reachable from the waking point`);
  let previous = APARTMENT_SPAWN;
  for (const waypoint of route) { assert(segmentIsClear(previous, waypoint, APARTMENT_OBSTACLES, 8), `${station.name} route clears the furniture`); previous = waypoint; }
  assert(distance(previous, station.approach) < 1, `${station.name} route reaches its actual interaction point`);
}

console.log("Prologue checks passed: persistent branching rejections, phone-to-apartment progression, driving/braking, and all apartment navigation routes.");
