import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (['./music-score', './audio-credits'].includes(specifier) && context.parentURL?.endsWith('/audio.ts')) {
    return nextResolve(new URL('../src/lib/' + specifier.slice(2) + '.ts', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
} });
const { ScoutAudio, RECORDED_TRACKS, FOLEY_FILES, AUDIO_LIMITS } = await import('../src/lib/audio.ts');
const { AUDIO_REGIONS, REGIONAL_PLAYLISTS, sceneMusicPlaylist, sceneTrackAt, scoreBreathingSeconds, soundscapeMix, ambienceMotion, footstepSurface } = await import('../src/lib/audio-scene.ts');
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/audio/manifest.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 2);
assert.equal(manifest.policy.commercialGameUse, true);
assert.equal(manifest.policy.offlineBundled, true);
assert.equal(manifest.policy.sourceFilesModified, false);
assert.equal(manifest.music.length + manifest.foley.length, RECORDED_TRACKS.length + FOLEY_FILES.length);
const allowedLicenses = new Set(['CC BY 4.0', 'CC0 1.0', 'LicenseRef-SCOUT-Original']);
for (const item of [...manifest.music, ...manifest.foley]) {
  assert(allowedLicenses.has(item.license), `Unexpected asset rights: ${item.file}`);
  assert(item.title && item.author && item.sourceUrl && item.licenseUrl && item.attribution && item.licenseFile);
  assert.equal(item.sourceFilesModified, false);
  const bytes = await fs.readFile(path.join(root, 'public', item.file));
  assert.equal(bytes.length, item.bytes, `Bundled audio byte count must match its manifest: ${item.file}`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256, `Original audio must stay intact: ${item.file}`);
  assert(manifest.licenseDocuments.some(notice => notice.file === item.licenseFile), 'Every recording has an offline license notice');
  if (item.author === 'SCOUT') {
    assert.equal(item.license, 'LicenseRef-SCOUT-Original', 'Do not silently relicense original game assets');
    assert.equal(item.retrievedOn, null);
  } else {
    assert.match(item.sourceUrl, /^https:\/\/(www\.scottbuckley\.com\.au|kenney\.nl|opengameart\.org)\//);
    assert.match(item.retrievedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(item.verifiedOn, manifest.verifiedOn);
  }
}
for (const notice of manifest.licenseDocuments) {
  const bytes = await fs.readFile(path.join(root, 'public', notice.file));
  assert.equal(bytes.length, notice.bytes, `Original license bytes must stay intact across checkout and packaging: ${notice.file}`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), notice.sha256, `Original license hash must match its manifest: ${notice.file}`);
}
for (const region of AUDIO_REGIONS) {
  const tracks = REGIONAL_PLAYLISTS[region];
  assert(tracks.length >= 3 && new Set(tracks).size === tracks.length);
  assert(tracks.every(id => RECORDED_TRACKS.some(track => track.id === id)));
  for (const timeOfDay of [0, 5, 9, 18, 22, NaN, Infinity]) {
    const selection = sceneMusicPlaylist({ region, timeOfDay });
    assert(selection.tracks.every(id => RECORDED_TRACKS.some(track => track.id === id)));
    assert.notEqual(sceneTrackAt(selection.tracks, 0, selection.tracks[0]), selection.tracks[0], 'Regional changes cannot immediately repeat the same recording');
  }
  for (const elapsed of [0, .5, 3, 8, 17, 30, 10000, NaN, Infinity]) {
    const motion = ambienceMotion({ region }, elapsed);
    assert(Object.values(motion).every(Number.isFinite));
    assert(motion.wind >= .5 && motion.wind <= 1.01);
    assert(motion.traffic >= .2 && motion.traffic <= 1);
    assert(Math.abs(motion.pan) <= .61);
  }
}
assert.match(sceneMusicPlaylist({ region: 'campus', timeOfDay: 22 }).key, /^night:/);
assert.equal(sceneMusicPlaylist({ region: 'city', timeOfDay: 18 }).tracks[0], 'golden-hour');
assert.equal(scoreBreathingSeconds({ scene: 'menu' }, 0), 4);
assert(scoreBreathingSeconds({ region: 'country' }, 0) >= 20);
assert.throws(() => sceneTrackAt([]), RangeError);
assert.equal(footstepSurface({ scene: 'apartment' }), 'wood');
assert.equal(footstepSurface({ scene: 'interior' }), 'carpet');
assert.equal(footstepSurface({ scene: 'outdoors', surface: 'grass' }), 'grass');
assert.equal(soundscapeMix({ region: 'highway' }).birds, 0);
assert(soundscapeMix({ region: 'garden' }).birds > soundscapeMix({ region: 'city' }).birds);
assert(soundscapeMix({ region: 'highway' }).traffic > soundscapeMix({ region: 'country' }).traffic);
for (const region of AUDIO_REGIONS) {
  assert.equal(soundscapeMix({ scene: 'interior', region }).birds, 0);
  assert.equal(soundscapeMix({ region, weather: 'rain' }).birds, 0);
  assert.equal(soundscapeMix({ region, timeOfDay: 22 }).birds, 0);
  assert(soundscapeMix({ region }, true).traffic < soundscapeMix({ region }).traffic);
}

// Exercise the real mixer with a small audio-clock fixture. No browser, GPU,
// network or audio hardware is required for routing and lifecycle assertions.
class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  cancelAndHoldAtTime() {}
  cancelScheduledValues() {}
}
class Node {
  connections = [];
  gain = new Param(); frequency = new Param(); Q = new Param(); pan = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  loop = false;
  stopped = false;
  onended = null;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
  start(...args) { this.startArguments = args; }
  stop() { this.stopped = true; }
}
class Context {
  state = 'suspended'; currentTime = 1; sampleRate = 8000; destination = new Node();
  createGain() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createWaveShaper() { return new Node(); }
  createBiquadFilter() { return new Node(); }
  createOscillator() { return new Node(); }
  createStereoPanner() { return new Node(); }
  createBufferSource() { return new Node(); }
  createMediaElementSource() { return new Node(); }
  createBuffer(channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
  async decodeAudioData() { return { duration: 31 }; }
  async resume() { this.state = 'running'; this.onstatechange?.(); }
  async suspend() { this.state = 'suspended'; this.onstatechange?.(); }
  async close() { this.state = 'closed'; this.onstatechange?.(); }
}
const elements = [];
class Recording {
  paused = true; ended = false; currentTime = 0;
  constructor() { elements.push(this); }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  load() {}
}
const globals = { window: globalThis.window, document: globalThis.document, Audio: globalThis.Audio, fetch: globalThis.fetch };
globalThis.window = { AudioContext: Context, addEventListener() {}, removeEventListener() {} };
globalThis.document = { visibilityState: 'visible', baseURI: 'file:///SCOUT/dist/index.html', addEventListener() {}, removeEventListener() {} };
globalThis.Audio = Recording;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
const audio = new ScoutAudio();
try {
  audio.setEnvironment({ scene: 'outdoors', region: 'campus', surface: 'grass', timeOfDay: 9 });
  assert.equal(elements.length, 0, 'Setting a regional scene never unlocks audio');
  assert.equal(await audio.start(0), true);
  const first = elements[0];
  assert.match(first.src, /simplicity\.mp3$/);
  first.currentTime = 73;
  audio.setEnvironment({ scene: 'interior', region: 'city', surface: 'carpet', conversation: true });
  audio.setTier(2);
  assert.equal(elements.length, 1, 'Doors, towns, progression and dialogue cannot restart the active song');
  assert.equal(first.currentTime, 73);
  assert(audio.music.gain.value < .05, 'Conversation ducks the score');
  audio.setVolumes({ music: 0 });
  assert.equal(first.paused, true, 'Music volume zero pauses streaming immediately');
  assert.equal(audio.music.gain.value, 0);
  audio.setVolumes({ music: .38 });
  assert.equal(first.paused, false);
  assert.equal(first.currentTime, 73, 'Music resumes at the prior playback position');
  audio.setEnvironment({ scene: 'outdoors', region: 'coast', surface: 'grass', conversation: false, timeOfDay: 18 });
  first.ended = true;
  first.onended();
  assert.equal(audio.getDiagnostics().recordings, 0);
  audio.tick();
  assert.equal(elements.length, 1, 'A complete arrangement leaves a short interval for world sound');
  audio.context.currentTime = audio.nextScoreAt + .1;
  audio.tick();
  assert.equal(elements.length, 2);
  assert.match(elements[1].src, /golden-hour\.mp3$/, 'The next song follows the new region and evening mood');
  for (const file of FOLEY_FILES) audio.sampleBuffers.set(file, { marker: file, duration: file.includes('park-birds') ? 31 : .6 });
  audio.context.currentTime += 1;
  audio.sfx('step');
  const step = [...audio.effectsPlaying].at(-1);
  assert.match(step.source.buffer.marker, /footstep_grass_000\.ogg$/, 'The real mixer uses the actual floor material');
  audio.setEnvironment({ region: 'garden', timeOfDay: 9 });
  audio.context.currentTime += 7;
  audio.tick();
  assert(audio.weather.sources.length <= AUDIO_LIMITS.ambientSources);
  const birds = audio.weather.birdSource;
  assert(birds && birds.loop === false && birds.startArguments[2] <= 10, 'Birds are short field-recording excerpts, not a looping chirp bed');
  audio.setEnvironment({ region: 'highway' });
  audio.tick();
  assert.equal(audio.weather.birdGain.gain.value, 0, 'Highways do not retain foreground park birds');
  audio.setInVehicle(true);
  audio.setVehicleTelemetry({ normalizedSpeed: .3, normalizedEngine: 0, engineLoad: 0, engineRunning: false, engineRpm: 0 });
  audio.tick();
  assert.equal(audio.engine.gain.gain.value, 0, 'An incapacitated engine has no combustion hum');
  assert(audio.engine.secondaryGain.gain.value > 0, 'A damaged car still makes tire noise while coasting');
  for (let i = 0; i < 30; i++) audio.setRadio(true, i % 3);
  assert(audio.getDiagnostics().recordings <= AUDIO_LIMITS.musicVoices, 'Rapid station changes stay within two streaming voices');
  audio.setSuspended(true);
  assert(elements.every(element => element.paused), 'Pausing the game silences every recording');
  assert.equal(audio.master.gain.value, 0);
  await new Promise(resolve => setTimeout(resolve, 110));
  assert.equal(audio.context.state, 'suspended');
  assert.equal(audio.getDiagnostics().engine, 0);
  assert.equal(audio.getDiagnostics().ambience, 0);
  audio.setSuspended(false);
  await Promise.resolve();
  audio.setVolumes({ music: 0, ambient: 0, effects: 0, engine: 0 });
  await new Promise(resolve => setTimeout(resolve, 110));
  assert.equal(audio.context.state, 'suspended', 'Muting every mix channel stops the silent audio clock and its sources');
  audio.setVolumes({ music: .38, ambient: .6, effects: .7, engine: .35 });
  await Promise.resolve();
  audio.setMuted(true);
  assert(elements.every(element => element.paused));
  assert.equal(audio.master.gain.value, 0);
} finally {
  audio.stop();
  for (const [name, value] of Object.entries(globals)) {
    if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
  }
}
assert.equal(audio.getDiagnostics().recordings, 0);
console.log('PASS: regional recording continuity and pacing, mood routing, floor-aware footsteps, quiet sparse wildlife/traffic, silent pause/zero volume/broken motor, bounded audio voices, and intact commercial-compatible rights with offline license hashes.');
