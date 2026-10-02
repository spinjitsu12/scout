import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Resolve the extension supplied by the application bundler. The actual score
// and scheduler run here without a browser or a replacement audio engine.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './music-score' && context.parentURL?.endsWith('/audio.ts')) {
      return nextResolve(new URL('../src/lib/music-score.ts', import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { RADIO_STATIONS, RADIO_TRACKS } = await import('../src/lib/radio-score.ts');
const { MUSIC_TRACKS } = await import('../src/lib/music-score.ts');
const { scoutAudio, validateMusicTrack, scoreEventsInWindow, selectMusic, AUDIO_LIMITS } = await import('../src/lib/audio.ts');

assert.deepEqual(RADIO_STATIONS.map(station => station.name), ['GOLD FM', 'ASTER WAVES', 'MIDNIGHT SIGNAL']);
assert(RADIO_STATIONS.every(station => station.tagline.trim().length > 8));
assert.equal(typeof globalThis.window, 'undefined', 'Radio scores import safely during server rendering');
assert.equal(scoutAudio.getStatus().started, false, 'Loading radio data never unlocks or starts audio');

function foreground(track, startBar, barCount) {
  const start = startBar * 4;
  return track.events
    .filter(event => event.pan === 0.05 && ['pluck', 'bell'].includes(event.instrument) && event.beat >= start && event.beat < start + barCount * 4)
    .map(event => [event.beat - start, event.midi, event.duration, event.instrument]);
}

function conservativeMix(track) {
  // A full second of release for EVERY instrument deliberately overestimates
  // the engine's longest .65-second tail. Treat every active oscillator as
  // a unity-amplitude source at its peak gain throughout that entire window.
  // This is a score-level upper bound, not a copy of the synthesis envelope.
  const edges = [];
  for (let loop = 0; loop < 3; loop++) {
    for (const event of track.events) {
      const time = (loop * track.beats + event.beat) * 60 / track.bpm;
      const end = time + event.duration * 60 / track.bpm + 1;
      edges.push({ time, voices: 1, gain: event.gain }, { time: end, voices: -1, gain: -event.gain });
    }
  }
  edges.sort((a, b) => a.time - b.time || a.voices - b.voices);
  let voices = 0;
  let gain = 0;
  let maxVoices = 0;
  let maxGain = 0;
  for (const edge of edges) {
    voices += edge.voices;
    gain += edge.gain;
    maxVoices = Math.max(maxVoices, voices);
    maxGain = Math.max(maxGain, gain);
  }
  return { maxVoices, maxGain };
}

const backgroundBounds = Object.values(MUSIC_TRACKS).map(conservativeMix);
let scheduled = 0;
const radioBounds = [];
for (const station of [0, 1, 2]) {
  const track = RADIO_TRACKS[station];
  assert.deepEqual(validateMusicTrack(track), [], `${track.title}: safe sorted events on the rhythm grid`);
  assert.equal(track.tier, station);
  assert.equal(track.bpm, [110, 106, 104][station]);
  assert.equal(track.bars, 32);
  assert.equal(track.beats, 128);
  assert(new Set(track.events.map(event => event.instrument)).size >= 6, 'Radio includes the lead, accompaniment, bass and drum kit');
  assert(track.events.every(event => event.gain <= 0.12), 'Individual voices retain soft mix levels');
  assert.deepEqual(foreground(track, 24, 4), foreground(track, 0, 4), 'The last refrain recalls the original four-bar hook');
  assert.notDeepEqual(foreground(track, 16, 4), foreground(track, 0, 4), 'The middle section introduces a contrasting melodic phrase');
  for (let bar = 0; bar < 32; bar++) {
    const events = track.events.filter(event => event.beat >= bar * 4 && event.beat < (bar + 1) * 4);
    assert(events.some(event => event.instrument === 'bass'), 'Every bar keeps the bass groove');
    assert(events.some(event => event.instrument === 'kick'), 'Every bar keeps a clear dance pulse');
    assert(events.some(event => event.instrument === 'snare'), 'Every bar contains its backbeat');
  }

  const onsets = new Map();
  for (const event of track.events) {
    const onset = onsets.get(event.beat) ?? { count: 0, gain: 0 };
    onset.count++;
    onset.gain += event.gain;
    onsets.set(event.beat, onset);
  }
  assert(Math.max(...[...onsets.values()].map(onset => onset.count)) <= 8, 'Chord and drum starts do not form dense voice clumps');
  assert(Math.max(...[...onsets.values()].map(onset => onset.gain)) < 0.36, 'Simultaneous note attacks remain balanced');
  const bound = conservativeMix(track);
  radioBounds.push(bound);
  assert(bound.maxVoices * 2 <= AUDIO_LIMITS.musicVoices, 'Even two full radio arrangements fit the voice budget during a station fade');
  assert(bound.maxGain * AUDIO_LIMITS.musicLevel * 2 < 0.55, 'A conservative two-station fade retains ample clipping headroom');
  for (const background of backgroundBounds) {
    assert(bound.maxVoices + background.maxVoices <= AUDIO_LIMITS.musicVoices, 'Entering or leaving a car fits the music voice budget');
    assert((bound.maxGain + background.maxGain) * AUDIO_LIMITS.musicLevel < 0.55, 'The radio/background transition retains clipping headroom');
  }

  const origin = 17.375;
  const loopSeconds = track.beats * 60 / track.bpm;
  const end = origin + loopSeconds * 3;
  const expected = [];
  for (let loop = 0; loop < 3; loop++) {
    for (const event of track.events) {
      expected.push({ event, loop, time: origin + loop * loopSeconds + event.beat * 60 / track.bpm, duration: event.duration * 60 / track.bpm });
    }
  }
  const actual = [];
  const polls = [0.019, 0.083, 0.2, 0.517, 0.041];
  let cursor = origin - 0.015;
  let poll = 0;
  while (cursor < end) {
    const until = Math.min(end, cursor + polls[poll++ % polls.length]);
    actual.push(...scoreEventsInWindow(track, origin, cursor, until));
    cursor = until;
  }
  assert.equal(actual.length, expected.length, 'Three uninterrupted radio loops deliver every note once');
  actual.forEach((entry, index) => {
    const wanted = expected[index];
    assert.equal(entry.event, wanted.event, 'Every scheduled event preserves its score identity and order');
    assert.equal(entry.loop, wanted.loop, 'Every event belongs to the expected loop');
    assert(Math.abs(entry.time - wanted.time) < 1e-10, 'Beat-to-second scheduling agrees to subnanosecond precision');
    assert(Math.abs(entry.duration - wanted.duration) < 1e-12, 'Scheduling preserves each note length');
  });
  scheduled += actual.length;
  const boundary = origin + loopSeconds;
  const before = scoreEventsInWindow(track, origin, boundary - 0.3, boundary);
  const after = scoreEventsInWindow(track, origin, boundary, boundary + 0.3);
  assert(before.every(event => event.time < boundary));
  assert(after.every(event => event.time >= boundary));
  assert(after.some(event => event.loop === 1 && event.event.beat === 0), 'The next groove begins precisely at the loop boundary');
  const resumedAt = boundary + 29.3;
  const resumed = scoreEventsInWindow(track, origin, resumedAt, resumedAt + 0.2);
  assert(resumed.every(event => event.time >= resumedAt && event.time < resumedAt + 0.2), 'A late poll never dumps missed bars into one sound burst');
}

assert.equal(scoutAudio.setRadioTracks({ ...RADIO_TRACKS, 1: { ...RADIO_TRACKS[1], beats: 127 } }), false, 'Registration rejects an invalid station');
assert.equal(scoutAudio.setRadioTracks(RADIO_TRACKS), true);
assert.equal(scoutAudio.getStatus().started, false, 'Registering stations cannot start audio');
scoutAudio.setTier(2);
scoutAudio.setRadio(true, 0);
scoutAudio.setInVehicle(true);
assert.equal(scoutAudio.getStatus().radioTitle, RADIO_TRACKS[0].title);
assert.deepEqual(selectMusic(scoutAudio.getStatus(), true), { kind: 'radio', index: 0 }, 'The dream car can select GOLD FM independently of the tier');
scoutAudio.setInVehicle(false);
assert.deepEqual(selectMusic(scoutAudio.getStatus(), true), { kind: 'score', index: 2 }, 'Leaving the car restores the current tier soundtrack');
scoutAudio.setMusicEnabled(false);
assert.equal(selectMusic(scoutAudio.getStatus(), true), null, 'An enabled car radio does not play outside the car');
scoutAudio.setInVehicle(true);
assert.deepEqual(selectMusic(scoutAudio.getStatus(), true), { kind: 'radio', index: 0 }, 'The radio toggle remains independent of background music');
scoutAudio.setRadio(true, 1);
assert.deepEqual(selectMusic(scoutAudio.getStatus(), true), { kind: 'radio', index: 1 }, 'Changing stations selects the corresponding original track');
scoutAudio.setRadio(false);
assert.equal(selectMusic(scoutAudio.getStatus(), true), null);
scoutAudio.setMusicEnabled(true);
assert.deepEqual(selectMusic(scoutAudio.getStatus(), false), { kind: 'score', index: 2 }, 'An unavailable radio falls back to the background score');
scoutAudio.setInVehicle(false);
scoutAudio.setTier(0);
scoutAudio.stop();

const peaks = radioBounds.map(bound => `${bound.maxVoices} voices / ${(bound.maxGain * AUDIO_LIMITS.musicLevel * 2).toFixed(3)} fade bound`).join(', ');
console.log(`PASS: three original 32-bar radio tracks, recurring hooks, distinct bridges, ${scheduled} scheduled notes, car-only selection, station registration, and conservative mixer headroom (${peaks}).`);
