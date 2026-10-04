import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/immersive-performance.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createImmersivePerformance, advanceImmersivePerformance } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const near = (actual, expected, message, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} vs ${expected}`);
const observe = (initial, intervals, options = {}) => {
  let state = initial, changes = [];
  for (const seconds of intervals) {
    const next = advanceImmersivePerformance(state, seconds, options);
    state = next.state;
    if (next.changed) changes.push({ ratio: next.pixelRatio, shadows: next.shadows });
    assert.ok(state.pixelRatio > 0 && Number.isFinite(state.averageFrameSeconds), 'Timing and quality remain finite');
  }
  return { state, changes };
};
const frames = (fps, seconds) => Array(Math.round(fps * seconds)).fill(1 / fps);

for (const fps of [60, 120, 144]) {
  const steady = observe(createImmersivePerformance('auto', 2), frames(fps, 60));
  assert.equal(steady.changes.length, 0, `${fps}Hz stable presentation never reallocates the renderer`);
  near(steady.state.pixelRatio, 1.25, 'Automatic quality respects the display cap');
  assert.equal(steady.state.shadows, true, 'Nominal frames retain shadows');
}
const jitter = observe(createImmersivePerformance('auto', 2), Array.from({ length: 600 }, (_, frame) => frame % 4 === 0 ? .034 : .014));
assert.equal(jitter.changes.length, 0, 'Brief timing fluctuations never ratchet quality down');
for (const interval of [.4, 1, 90]) {
  const isolated = observe(createImmersivePerformance('auto', 2), [interval, ...frames(60, 20)]);
  assert.equal(isolated.changes.length, 0, 'An isolated long frame followed by normal rendering does not lower quality');
}
let first = observe(createImmersivePerformance('auto', 2), [.4, .4]);
assert.equal(first.changes.length, 0, 'Two severe frames cannot trigger a quality reallocation');
let severe = observe(first.state, [.4]);
assert.equal(severe.changes.length, 1, 'Sustained frames beyond 250ms are observed rather than ignored');
assert.ok(severe.state.pixelRatio < 1.25, 'Severe rendering pressure lowers resolution');
assert.equal(severe.state.shadows, false, 'Severe rendering pressure removes shadows alongside the first reduction');
const cooldown = observe(severe.state, [.4, .4]);
assert.equal(cooldown.changes.length, 0, 'Renderer allocations cannot happen on consecutive severe samples');
const prolonged = observe(cooldown.state, Array(60).fill(.4));
near(prolonged.state.pixelRatio, .7, 'Sustained low throughput reaches a bounded quality floor');
assert.equal(prolonged.state.shadows, false);
assert.ok(prolonged.changes.length <= 2, 'Reaching the floor stops quality churn');
const floor = observe(prolonged.state, Array(60).fill(.6));
assert.equal(floor.changes.length, 0, 'Very slow rendering at the quality floor does not repeatedly resize');
const recoveryEarly = observe(floor.state, frames(60, 10));
assert.equal(recoveryEarly.changes.length, 0, 'Quality waits for sustained recovered performance');
const recovery = observe(recoveryEarly.state, frames(60, 6));
assert.equal(recovery.changes.length, 1, 'Healthy 60Hz rendering can gradually recover quality');
assert.ok(recovery.state.pixelRatio > .7 && recovery.state.pixelRatio < .8, 'Recovery uses a small bounded change');
assert.equal(recovery.state.shadows, false, 'Shadow recovery waits until enough resolution headroom returns');
const fullyRecovered = observe(recovery.state, frames(60, 100));
near(fullyRecovered.state.pixelRatio, 1.25, 'Long healthy rendering restores the automatic cap');
assert.equal(fullyRecovered.state.shadows, true, 'Shadow rendering eventually restores with sustained headroom');
const moderate = observe(createImmersivePerformance('auto', 2), frames(30, 30));
near(moderate.state.pixelRatio, .7, 'Sustained ordinary slow frames are handled as well as severe stalls');

const paused = advanceImmersivePerformance(severe.state, 90, { active: false });
assert.equal(paused.changed, false, 'A pause cannot change quality');
assert.equal(paused.state.slowSeconds, 0); assert.equal(paused.state.fastSeconds, 0);
near(paused.state.cooldownSeconds, severe.state.cooldownSeconds, 'Unseen time never consumes the allocation cooldown');
const wake = advanceImmersivePerformance(paused.state, 1 / 60);
assert.equal(wake.changed, false, 'Resuming does not replay pre-pause pressure');
for (const seconds of [Number.NaN, Number.POSITIVE_INFINITY, -.4, 0]) {
  const invalid = advanceImmersivePerformance(severe.state, seconds);
  assert.equal(invalid.changed, false);
  assert.deepEqual(invalid.state, severe.state, 'Invalid clock samples never mutate quality evidence');
}
for (const [quality, cap, shadows] of [['low', 1, false], ['high', 1.65, true]]) {
  const manual = observe(createImmersivePerformance(quality, 2), Array(80).fill(.6));
  assert.equal(manual.changes.length, 0, 'Manual quality is not overridden by the automatic policy');
  near(manual.state.pixelRatio, cap, 'Manual quality preserves its requested cap');
  assert.equal(manual.state.shadows, shadows);
}
const low = advanceImmersivePerformance(prolonged.state, .4, { quality: 'low', devicePixelRatio: 2 });
near(low.pixelRatio, 1, 'Switching quality applies the new cap'); assert.equal(low.shadows, false);
const high = advanceImmersivePerformance(low.state, .4, { quality: 'high', devicePixelRatio: 2 });
near(high.pixelRatio, 1.65, 'Switching to high restores its explicit resolution'); assert.equal(high.shadows, true);
const reducedDisplay = observe(createImmersivePerformance('auto', .5), Array(30).fill(.4));
near(reducedDisplay.state.pixelRatio, .5, 'A low-DPI display is never raised above its own pixel ratio');
assert.equal(reducedDisplay.state.shadows, false, 'Shadows can still be removed when display resolution is already bounded');
const newDisplay = advanceImmersivePerformance(reducedDisplay.state, 0, { devicePixelRatio: 3 });
near(newDisplay.pixelRatio, 1.25, 'A display change reapplies the appropriate cap');
near(createImmersivePerformance('auto', Number.NaN).pixelRatio, 1, 'Invalid device ratios have a finite fallback');

console.log('Render quality checks passed: nominal/jitter stability, sustained >250ms and ordinary slow samples, bounded floor/cooldowns, delayed gradual 60Hz recovery with shadows, explicit pause discard, manual modes and display caps.');
