import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Node's native TypeScript support needs the extension that the app bundler supplies.
// No WebAudio mock is involved: these tests exercise the actual score and scheduler.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './music-score' && context.parentURL?.endsWith('/audio.ts')) {
      return nextResolve(new URL('../src/lib/music-score.ts', import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { MUSIC_TRACKS } = await import('../src/lib/music-score.ts');
const { scoutAudio, midiToFrequency, validateMusicTrack, scoreEventsInWindow, drivingMix, soundEffectPlan, selectMusic, AUDIO_LIMITS } = await import('../src/lib/audio.ts');
assert.equal(typeof globalThis.window, 'undefined', 'The audio module imports safely during server rendering');
assert.equal(scoutAudio.getStatus().started, false, 'Importing never starts audio');
assert.equal(scoutAudio.getStatus().playing, false);
assert.equal(midiToFrequency(69), 440);
assert.equal(midiToFrequency(81), 880);
assert(Math.abs(midiToFrequency(69, 100) / 440 - 2 ** (1 / 12)) < 1e-12);

let scheduledNotes = 0;
const scoreVoicePeaks = [];
for (const tier of [0, 1, 2]) {
  const track = MUSIC_TRACKS[tier];
  assert.deepEqual(validateMusicTrack(track), [], `${track.title} has safe, sorted, rhythmic score data`);
  assert.equal(track.tier, tier);
  assert.equal(track.bars, 32);
  assert.equal(track.beats, 128);
  assert(track.events.length >= 100, 'A full composition contains multiple layers');
  assert(new Set(track.events.map(event => event.instrument)).size >= 4, 'The arrangement contains distinct voices');
  const origin = 13.25;
  const beatSeconds = 60 / track.bpm;
  const loopSeconds = track.beats * beatSeconds;
  const end = origin + loopSeconds * 3;
  const expected = [];
  for (let loop = 0; loop < 3; loop++) {
    for (const event of track.events) {
      expected.push({ event, loop, time: origin + loop * loopSeconds + event.beat * beatSeconds, duration: event.duration * beatSeconds });
    }
  }
  // Uneven polls cross note, bar, and loop boundaries. Every event must occur once.
  const actual = [];
  const polls = [0.017, 0.09, 0.2, 1.03, 0.051];
  let cursor = origin - 0.01;
  let poll = 0;
  while (cursor < end) {
    const until = Math.min(end, cursor + polls[poll++ % polls.length]);
    actual.push(...scoreEventsInWindow(track, origin, cursor, until));
    cursor = until;
  }
  assert.deepEqual(actual, expected, 'Three continuous loops neither lose nor duplicate score events');
  scheduledNotes += actual.length;

  const boundary = origin + loopSeconds;
  const before = scoreEventsInWindow(track, origin, boundary - 0.4, boundary);
  const after = scoreEventsInWindow(track, origin, boundary, boundary + 0.4);
  assert(before.every(note => note.time < boundary));
  assert(after.every(note => note.time >= boundary));
  assert(after.some(note => note.loop === 1 && note.event.beat === 0), 'A new loop starts at its exact audio-clock boundary');
  assert.deepEqual(scoreEventsInWindow(track, origin, origin - 1, origin), []);
  assert.deepEqual(scoreEventsInWindow(track, origin, origin, origin), []);

  // A delayed poll asks only for future notes, so returning to a tab cannot burst
  // an entire missed measure into the speakers.
  const future = boundary + 12 * beatSeconds;
  assert(scoreEventsInWindow(track, origin, future, future + 0.2).every(note => note.time >= future));

  const invalid = { ...track, events: [{ ...track.events[0], beat: 0.13, midi: 140, gain: 2, duration: -1, pan: 3 }] };
  const errors = validateMusicTrack(invalid);
  for (const message of ['off rhythm grid', 'invalid pitch', 'invalid gain', 'invalid duration', 'invalid pan']) {
    assert(errors.some(error => error.includes(message)), `Rejects ${message}`);
  }
  assert(validateMusicTrack({ ...track, bpm: NaN }).includes('Invalid tempo'));
  assert(validateMusicTrack({ ...track, beats: 127 }).includes('Invalid loop length'));
  assert.throws(() => scoreEventsInWindow(track, origin, 2, 1), RangeError);
  assert.throws(() => scoreEventsInWindow(track, origin, 0, Infinity), RangeError);

  // Include both loop-boundary overlap and generous instrument tails. A tier
  // crossfade must fit without dropping any of these original score voices.
  const occupancy = [];
  for (let loop = 0; loop < 2; loop++) {
    for (const event of track.events) {
      const time = (loop * track.beats + event.beat) * beatSeconds;
      occupancy.push([time - 0.2, 1], [time + Math.max(0.035, event.duration * beatSeconds) + 0.68, -1]);
    }
  }
  occupancy.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let voices = 0;
  let peak = 0;
  for (const [, change] of occupancy) peak = Math.max(peak, voices += change);
  scoreVoicePeaks.push(peak);
}
for (const first of scoreVoicePeaks) for (const second of scoreVoicePeaks) {
  assert(first + second <= AUDIO_LIMITS.musicVoices, 'Two complete arrangements fit the music voice budget during a fade');
}

const example = MUSIC_TRACKS[0];
const held = { ...example, events: [{ beat: 127, duration: 4, midi: 60, gain: 0.05, instrument: 'pad' }] };
assert.deepEqual(validateMusicTrack(held), [], 'Sustained notes may ring through the loop boundary');
const heldEvents = scoreEventsInWindow(held, 0, 0, 128 * 60 / held.bpm);
assert.equal(heldEvents.length, 1);
assert(heldEvents[0].time + heldEvents[0].duration > 128 * 60 / held.bpm, 'The scheduler preserves the full natural tail');

for (const kind of ['standard', 'coupe', 'luxury']) {
  const parked = drivingMix(0, kind);
  assert.equal(parked.humGain, 0, 'A parked vehicle has no engine tone');
  assert.equal(parked.roadGain, 0, 'A parked vehicle has no road noise');
  let previous = parked;
  for (let step = 1; step <= 100; step++) {
    const mix = drivingMix(step / 100, kind);
    assert(Object.values(mix).every(Number.isFinite));
    assert(mix.fundamentalHz >= previous.fundamentalHz && mix.humGain >= previous.humGain);
    assert(mix.fundamentalHz >= 36 && mix.fundamentalHz <= 78, 'The rev stays in a soft low register');
    assert.equal(mix.harmonicHz, mix.fundamentalHz * 2);
    assert(mix.motorCutoffHz <= 800 && mix.roadCutoffHz <= 1250, 'Motor and road textures stay softened');
    assert(mix.humGain * (mix.fundamentalLevel + mix.harmonicLevel) + mix.roadGain < 0.016, 'Even full-speed driving stays below the foreground cue mix');
    previous = mix;
  }
}
for (const value of [NaN, Infinity, -Infinity, -1]) assert.equal(drivingMix(value).speed, 0);
assert.equal(drivingMix(2).speed, 1);
assert(drivingMix(1, 'luxury').roadGain < drivingMix(1).roadGain, 'The luxury cabin has a quieter road texture');
assert(drivingMix(1, 'coupe').harmonicLevel > drivingMix(1, 'luxury').harmonicLevel, 'The coupe has its own deeper, richer motor profile');
assert(AUDIO_LIMITS.drivingSources * AUDIO_LIMITS.drivingVoices <= 6, 'Continuous engine sources stay bounded during rapid pause/resume');

const effects = ['step', 'interact', 'recruit', 'success', 'error', 'week', 'prestige', 'enterCar', 'exitCar', 'arrival', 'paint', 'phone', 'wake', 'luxury', 'lowFuel', 'bump', 'refuel'];
for (const tier of [0, 1, 2]) for (const effect of effects) {
  const plan = soundEffectPlan(effect, tier);
  assert(plan.length >= 1 && plan.length <= 7, `${effect} is a short original cue`);
  assert(plan.length * 2 <= AUDIO_LIMITS.effectVoices, 'Two overlapping cues fit the effect voice budget');
  let conservativePeak = 0;
  for (const note of plan) {
    assert(Number.isFinite(note.midi) && note.midi >= 0 && note.midi <= 127);
    assert(Number.isFinite(note.offset) && note.offset >= 0 && note.offset <= 0.6);
    assert(note.duration > 0 && note.duration <= 0.6);
    assert(note.gain > 0 && note.gain <= 0.07);
    assert(Math.abs(note.pan) <= 1);
    conservativePeak += note.gain * AUDIO_LIMITS.effectLevel;
  }
  assert(conservativePeak < 0.2, 'Every cue has ample output headroom, including all natural tails');
}

for (const musicEnabled of [false, true]) for (const radioEnabled of [false, true]) {
  for (const inVehicle of [false, true]) for (const radioReady of [false, true]) {
    for (const tier of [0, 1, 2]) for (const radioStation of [0, 1, 2]) {
      const chosen = selectMusic({ musicEnabled, radioEnabled, inVehicle, radioStation, tier }, radioReady);
      const expected = radioEnabled && inVehicle && radioReady ? { kind: 'radio', index: radioStation }
        : musicEnabled ? { kind: 'score', index: tier } : null;
      assert.deepEqual(chosen, expected, 'Radio and background soundtrack are mutually exclusive, and radio works independently of background music');
    }
  }
}

assert.equal(scoutAudio.setRadioTracks(MUSIC_TRACKS), true);
scoutAudio.setMusicEnabled(false);
scoutAudio.setSoundEnabled(false);
scoutAudio.setEngineEnabled(false);
scoutAudio.setRadio(true, 2);
scoutAudio.setInVehicle(true);
scoutAudio.setEngineKind('coupe');
for (let step = 0; step < 1000; step++) scoutAudio.setDriving((step % 100) / 100);
for (const effect of effects) scoutAudio.sfx(effect);
const configured = scoutAudio.getStatus();
assert.equal(configured.started, false, 'Driving, radio registration and preference changes never unlock audio');
assert.equal(configured.radioEnabled, true);
assert.equal(configured.radioActive, false, 'Radio is silent until a user gesture starts audio');
assert.equal(configured.radioStation, 2);
assert.equal(configured.radioTitle, MUSIC_TRACKS[2].title);
assert.equal(configured.musicEnabled, false);
assert.equal(configured.soundEnabled, false);
assert.equal(configured.engineEnabled, false);
scoutAudio.setEngineEnabled(true);
assert.equal(scoutAudio.getStatus().soundEnabled, false, 'Enabling the motor does not reenable world sounds');
scoutAudio.setSoundEnabled(true);
scoutAudio.setEngineEnabled(false);
assert.equal(scoutAudio.getStatus().soundEnabled, true, 'Muting the motor leaves interaction cues enabled');
scoutAudio.setSuspended(true);
const menu = scoutAudio.getStatus();
assert.equal(menu.suspended, true);
assert.equal(menu.musicEnabled, false, 'Menu ambience never changes saved music preferences');
assert.equal(menu.radioEnabled, true, 'Opening a menu leaves the radio preference intact');
assert.equal(menu.muted, false, 'Gameplay suspension is independent of master mute');
assert.equal(menu.started, false, 'Menus cannot unlock audio without a player gesture');
scoutAudio.setSuspended(false);
assert.equal(scoutAudio.setRadioTracks({ ...MUSIC_TRACKS, 1: { ...MUSIC_TRACKS[1], bpm: NaN } }), false, 'Malformed station data cannot enter the scheduler');
scoutAudio.setDriving(0);
scoutAudio.setInVehicle(false);
scoutAudio.setRadio(false);
scoutAudio.setMusicEnabled(true);
scoutAudio.setSoundEnabled(true);
scoutAudio.setEngineEnabled(true);
scoutAudio.setEngineKind('standard');

const statuses = [];
const unsubscribe = scoutAudio.subscribe(status => statuses.push(status));
scoutAudio.setTier(2);
scoutAudio.setMuted(true);
assert.equal(statuses.at(-1).tier, 2);
assert.equal(statuses.at(-1).muted, true);
assert.equal(statuses.at(-1).playing, false);
assert.equal(statuses.at(-1).title, MUSIC_TRACKS[2].title);
const delivered = statuses.length;
unsubscribe();
scoutAudio.setTier(0);
scoutAudio.setMuted(false);
scoutAudio.stop();
assert.equal(statuses.length, delivered, 'Unsubscribed UI receives no later changes');
assert.equal(scoutAudio.getStatus().started, false);
console.log(`PASS: three original scores, ${scheduledNotes} continuously scheduled notes, exact loop boundaries, natural tails, ${effects.length} composed cues, quiet vehicle profiles, radio/music priority, separate world/engine settings, preference-preserving menu suspension, voice budgets, and gesture-only audio.`);
