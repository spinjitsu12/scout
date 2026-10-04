import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  if (['./music-score', './audio-credits'].includes(specifier) && context.parentURL?.endsWith('/audio.ts'))
    return nextResolve(new URL('../src/lib/' + specifier.slice(2) + '.ts', import.meta.url).href, context);
  return nextResolve(specifier, context);
} });
const { ScoutAudio, AUDIO_LIMITS } = await import('../src/lib/audio.ts');

// Exercise the real Web Audio graph, buses and lifecycle without claiming a
// hardware listening result. The audio clock advances independently of frames.
class Param {
  value = 0;
  ramps = [];
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value, at) { this.value = value; this.ramps.push({ value, at }); }
  cancelAndHoldAtTime() {}
  cancelScheduledValues() {}
}
class Node {
  connections = [];
  gain = new Param(); frequency = new Param(); Q = new Param(); pan = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  starts = 0; stopped = false; onended = null;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
  start() { this.starts++; }
  stop() { this.stopped = true; }
}
class Context {
  state = 'suspended'; currentTime = 1; sampleRate = 8000; destination = new Node();
  nodes = []; oscillators = [];
  node() { const value = new Node(); this.nodes.push(value); return value; }
  createGain() { return this.node(); }
  createDynamicsCompressor() { return this.node(); }
  createWaveShaper() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createOscillator() { const value = this.node(); this.oscillators.push(value); return value; }
  createStereoPanner() { return this.node(); }
  createBufferSource() { return this.node(); }
  createBuffer(_channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
  async decodeAudioData() { return { duration: .6 }; }
  async resume() { this.state = 'running'; this.onstatechange?.(); }
  async suspend() { this.state = 'suspended'; this.onstatechange?.(); }
  async close() { this.state = 'closed'; this.onstatechange?.(); }
}
const globals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
const handlers = new Map();
globalThis.window = { AudioContext: Context, addEventListener(name, fn) { handlers.set(name, fn); }, removeEventListener(name) { handlers.delete(name); } };
globalThis.document = { visibilityState: 'visible', baseURI: 'file:///SCOUT/dist/index.html', addEventListener(name, fn) { handlers.set(name, fn); }, removeEventListener(name) { handlers.delete(name); } };
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
const audio = new ScoutAudio(), settle = () => new Promise(resolve => setTimeout(resolve, 110));
try {
  audio.setMusicEnabled(false);
  audio.setVolumes({ music: 0, ambient: 0, engine: 0, effects: .7 });
  audio.setPoliceResponse(true, Infinity);
  audio.setPoliceResponse(true, .4);
  assert.equal(audio.getStatus().started, false, 'A police event cannot unlock sound');
  assert.equal(audio.context, null, 'No browser graph is allocated before player input');
  assert.equal(await audio.start(0), true);
  const context = audio.context, first = audio.police;
  assert(first, 'A pending response becomes audible after the player unlocks audio');
  assert.equal(first.sources.length, AUDIO_LIMITS.policeSources);
  assert.equal(first.nodes.length, 5);
  assert(first.sources.every(source => source.starts === 1));
  assert(first.gain.connections.includes(audio.effects), 'The siren uses the effects slider and master limiter');
  assert(first.sources[1].connections[0].connections.includes(first.sources[0].frequency), 'A continuous sweep modulates the carrier rather than playing a note jingle');
  const farGain = first.gain.gain.value, allocated = context.nodes.length;
  for (let i = 0; i < 3000; i++) {
    audio.setPoliceResponse(true, (i % 100) / 100);
    context.currentTime += .005;
    audio.tick();
  }
  assert.equal(audio.police, first, 'A moving police response reuses its existing voice');
  assert.equal(context.nodes.length, allocated, 'Proximity updates and frame ticks do not allocate nodes');
  audio.setPoliceResponse(true, 2); audio.tick();
  assert(first.gain.gain.value > farGain && first.gain.gain.value <= .18, 'Proximity is bounded and attenuates distant sirens');
  audio.setPoliceResponse(false); audio.tick();
  assert.equal(first.gain.gain.value, 0);
  assert(first.gain.gain.ramps.at(-1).at > context.currentTime, 'A response fades before disconnecting');
  assert(first.sources.every(source => !source.stopped));
  context.currentTime += .08;
  audio.setPoliceResponse(true, .7); audio.tick();
  assert.equal(audio.police, first, 'An interrupted fade resumes without overlapping voices');
  audio.setPoliceResponse(false); audio.tick(); context.currentTime += .2; audio.tick();
  assert.equal(audio.police, null);
  assert(first.sources.every(source => source.stopped));
  assert(first.nodes.every(node => node.connections.length === 0), 'Completed responses release every node');

  audio.setPoliceResponse(true); audio.tick();
  const paused = audio.police;
  audio.setSuspended(true); await settle();
  assert.equal(context.state, 'suspended');
  assert.equal(audio.police, null);
  assert(paused.sources.every(source => source.stopped));
  assert.equal(audio.getStatus().volumes.effects, .7, 'Pause retains the effects preference');
  audio.setSuspended(false); await Promise.resolve();
  assert(audio.police, 'The pending event resumes after pause');
  const zeroed = audio.police;
  audio.setVolumes({ effects: 0 }); await settle();
  assert.equal(audio.effects.gain.value, 0);
  assert.equal(audio.police, null);
  assert(zeroed.sources.every(source => source.stopped), 'Zero effects volume releases silent siren sources');
  audio.setVolumes({ effects: .7 }); await Promise.resolve();
  assert(audio.police);
  const disabled = audio.police;
  audio.setSoundEnabled(false); await settle();
  assert.equal(audio.police, null);
  assert(disabled.sources.every(source => source.stopped), 'Disabling effects also disables the continuous emergency voice');
  audio.setSoundEnabled(true); await Promise.resolve();
  const muted = audio.police;
  audio.setMuted(true); await settle();
  assert.equal(audio.police, null);
  assert(muted.sources.every(source => source.stopped));
  assert.equal(audio.getStatus().volumes.effects, .7, 'Mute preserves the effects slider');
  audio.setMuted(false); await Promise.resolve();
  assert(audio.police);
  const hidden = audio.police;
  document.visibilityState = 'hidden'; handlers.get('visibilitychange')(); await settle();
  assert.equal(audio.police, null);
  assert(hidden.sources.every(source => source.stopped), 'A background window has no active siren graph');
  document.visibilityState = 'visible'; handlers.get('visibilitychange')(); await Promise.resolve();
  assert(audio.police);
  audio.setPoliceResponse(true, NaN); audio.tick(); context.currentTime += .2; audio.tick();
  assert.equal(audio.police, null, 'Invalid proximity cannot produce an unbounded or stuck tone');
  audio.setPoliceResponse(true); audio.tick();
  const final = audio.police;
  audio.stop();
  assert(final.sources.every(source => source.stopped));
  assert.equal(audio.police, null);
  assert.equal(audio.policeRequested, false, 'Ending a career cannot carry a siren into the next one');
  assert.equal(audio.getDiagnostics().contextState, 'closed');
} finally {
  audio.stop();
  for (const [name, value] of Object.entries(globals)) {
    if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
  }
}
console.log('PASS: gesture-only original emergency wail, bounded reusable graph, proximity attenuation, existing effects/master routing, smooth retire/restart, and silent pause/zero volume/background/stop cleanup. Hardware listening remains a release check.');
