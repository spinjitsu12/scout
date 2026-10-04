import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/immersive-motion.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createImmersiveClock, advanceImmersiveClock, interpolateImmersivePose, smoothImmersiveValue,
  smoothImmersiveAngle, stepImmersiveWalk, springImmersiveValue } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const near = (actual, expected, message, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} vs ${expected}`);
for (const fps of [30, 60, 120, 144]) {
  let clock = createImmersiveClock(), ticks = 0;
  for (let frame = 0; frame < fps * 10; frame++) {
    const next = advanceImmersiveClock(clock, 1 / fps); clock = next.clock; ticks += next.steps;
    assert.ok(next.alpha >= 0 && next.alpha < 1, 'Render interpolation stays bounded');
  }
  assert.equal(ticks, 1200, `${fps}Hz renders the same 1200 physics ticks`);
  near(clock.remainder, 0, `${fps}Hz leaves no clock drift`);
}
let clock = advanceImmersiveClock(createImmersiveClock(), .003).clock;
assert.ok(clock.remainder > 0, 'Sub-tick time is accumulated');
const paused = advanceImmersiveClock(clock, .2, false);
assert.equal(paused.steps, 0); assert.equal(paused.clock.remainder, 0); assert.equal(paused.alpha, 1);
const hidden = advanceImmersiveClock(clock, 90, false);
assert.equal(hidden.steps, 0, 'A hidden window discards unseen time'); assert.equal(hidden.clock.remainder, 0);
const resumed = advanceImmersiveClock(hidden.clock, 1 / 60);
assert.equal(resumed.steps, 2, 'The first fresh interval resumes normal ticking without a hidden backlog');
for (const seconds of [.26, .4, 1.4, 90, Number.MAX_VALUE]) {
  const stalled = advanceImmersiveClock(clock, seconds);
  assert.equal(stalled.steps, 12, `${seconds}s active stalls still move through a bounded 100ms budget`);
  assert.ok(stalled.alpha >= 0 && stalled.alpha < 1, 'Stalls leave interpolation bounded');
  const fresh = advanceImmersiveClock(stalled.clock, 1 / 60);
  assert.equal(fresh.steps, 2, 'Discarded active time is never replayed on later frames');
}
let slowClock = createImmersiveClock(), slowVelocity = { x: 0, z: 0 }, slowPosition = { x: 0, z: 0 };
for (let frame = 0; frame < 30; frame++) {
  const timing = advanceImmersiveClock(slowClock, .4); slowClock = timing.clock;
  for (let tick = 0; tick < timing.steps; tick++) {
    const next = stepImmersiveWalk(slowVelocity, { x: 1, z: 0 }, timing.stepSeconds);
    slowVelocity = next.velocity; slowPosition.x += next.displacement.x;
  }
}
near(slowPosition.x, 2.15 * (3 - (1 - Math.exp(-14 * 3)) / 14), 'Sustained 400ms rendering still advances walking through three bounded simulation seconds');
assert.ok(slowPosition.x < 7, 'Slow rendering never replays all twelve seconds of wall time');
assert.equal(advanceImmersiveClock(clock, Number.NaN).steps, 0); assert.equal(advanceImmersiveClock(clock, -.1).steps, 0);
assert.ok(advanceImmersiveClock(clock, .24).steps <= 12, 'Catch-up is bounded to 100ms');
const middle = interpolateImmersivePose({ x: 0, z: 2, heading: Math.PI - .04 }, { x: 10, z: 4, heading: -Math.PI + .04 }, .5);
near(middle.x, 5, 'Pose interpolation uses both snapshots'); near(middle.z, 3, 'Pose interpolation preserves the straight path');
near(Math.abs(middle.heading), Math.PI, 'Angle wrapping follows the shortest arc');
const walking = fps => {
  let velocity = { x: 0, z: 0 }, position = { x: 0, z: 0 };
  for (const [seconds, direction] of [[2, { x: 0, z: -1 }], [1, { x: 1, z: -1 }], [.5, { x: 0, z: 0 }]]) {
    for (let frame = 0; frame < seconds * fps; frame++) {
      const next = stepImmersiveWalk(velocity, direction, 1 / fps);
      velocity = next.velocity; position.x += next.displacement.x; position.z += next.displacement.z;
      assert.ok(next.speed <= 2.15 + 1e-9, 'Diagonal movement never gets a speed bonus');
    }
  }
  return { velocity, position };
};
const reference = walking(120);
for (const fps of [30, 60]) {
  const motion = walking(fps);
  near(motion.position.x, reference.position.x, `${fps}Hz walking distance X`);
  near(motion.position.z, reference.position.z, `${fps}Hz walking distance Z`);
  near(motion.velocity.z, reference.velocity.z, `${fps}Hz walking rest velocity`);
}
assert.ok(Math.hypot(reference.velocity.x, reference.velocity.z) < .0001, 'Walking responds promptly to key release');
const starting = stepImmersiveWalk({ x: 0, z: 0 }, { x: 0, z: -1 }, 1 / 60);
assert.ok(starting.speed > .3 && starting.speed < .6, 'Walking builds speed smoothly on the first frame');
const offClock = stepImmersiveWalk({ x: 0, z: 0 }, { x: 1, z: 1 }, Number.NaN);
near(offClock.displacement.x, 0, 'Invalid walking clocks cannot move the player');
for (const fps of [30, 60, 120]) {
  let value = 0, yaw = Math.PI - .1, spring = { position: 0, velocity: 0 }, previous = 0;
  for (let frame = 0; frame < fps; frame++) {
    value = smoothImmersiveValue(value, 1, 8, 1 / fps); yaw = smoothImmersiveAngle(yaw, -Math.PI + .1, 8, 1 / fps);
    spring = springImmersiveValue(spring.position, spring.velocity, 1, 10, 1 / fps);
    assert.ok(spring.position >= previous && spring.position <= 1, 'The cockpit spring does not oscillate'); previous = spring.position;
  }
  near(value, 1 - Math.exp(-8), `${fps}Hz camera damping`); near(yaw, -Math.PI + .1 - .2 * Math.exp(-8), `${fps}Hz angle damping`);
  near(spring.position, 1 - 11 * Math.exp(-10), `${fps}Hz suspension displacement`);
}
console.log('Smooth motion checks passed: identical 30/60/120/144Hz fixed clocks, bounded active stalls without freezing or replay, explicit hidden/pause discard, shortest-arc interpolation, exact walking distances, gentle starts and stops, diagonal normalization, refresh-independent camera damping and suspension.');
