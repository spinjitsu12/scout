import type { MusicTrack, ScoreEvent, Instrument } from "./music-score";

/** Original in-car music. These stations share the score engine, not its melodies. */
export const RADIO_STATIONS = [
  { name: "GOLD FM", tagline: "City funk. Windows down." },
  { name: "ASTER WAVES", tagline: "Neon pop for the late drive." },
  { name: "MIDNIGHT SIGNAL", tagline: "Low lights. Deep grooves." },
] as const;

type Station = 0 | 1 | 2;
type Chord = { root: number; third: number; seventh: number; voices: number[]; arp: number[] };
type Chart = Record<string, Chord>;
const BAR = 4;
const BARS = 32;

function midi(name: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!match) throw new Error(`Invalid radio pitch: ${name}`);
  const naturals: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (Number(match[3]) + 1) * 12 + naturals[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
}

function h(root: string, third: number, seventh: number, voices: string[], arp: string[]): Chord {
  const base = midi(root);
  return { root: base, third: base + third, seventh: base + seventh, voices: voices.map(midi), arp: arp.map(midi) };
}

function add(events: ScoreEvent[], bar: number, at: number, pitch: number, length: number, instrument: Instrument, gain: number, pan = 0, detune = 0) {
  events.push({ beat: bar * BAR + at, midi: pitch, duration: length, instrument, gain, pan, detune });
}

function lead(events: ScoreEvent[], bar: number, phrase: string, station: Station, gain: number) {
  let at = 0;
  for (const cell of phrase.split(" ")) {
    const [pitch, beats] = cell.split("/");
    const length = Number(beats);
    if (!(length > 0)) throw new Error(`Invalid radio duration: ${cell}`);
    if (pitch !== "-") {
      const accent = at % 1 === 0 ? 1 : 0.92;
      add(events, bar, at, midi(pitch), Math.max(0.125, length - 0.125), station === 1 ? "bell" : "pluck", gain * accent, 0.05);
    }
    at += length;
  }
  if (at !== BAR) throw new Error(`Radio melody bar ${bar + 1} has ${at} beats, expected four.`);
}

// GOLD FM — E Mixolydian funk, extended major chords and an eight-bar hook.
// The bridge follows a G#7 → C# minor → F# minor → B turnaround.
const GOLD = {
  E: h("E2", 4, 10, ["G#3", "D4", "F#4"], ["G#4", "B4", "D5", "F#5"]),
  A: h("A1", 4, 10, ["C#4", "G4", "B4"], ["E4", "G4", "B4", "F#5"]),
  Cm: h("C#2", 3, 10, ["E4", "B4", "D#5"], ["E4", "G#4", "B4", "D#5"]),
  Fm: h("F#2", 3, 10, ["A3", "E4", "G#4"], ["C#4", "E4", "G#4", "A4"]),
  B: h("B1", 4, 10, ["D#4", "A4", "C#5"], ["F#4", "A4", "C#5", "G#4"]),
  G7: h("G#1", 4, 10, ["C4", "D#4", "F#4"], ["G#4", "C5", "D#5", "F#5"]),
  AM: h("A1", 4, 11, ["C#4", "G#4", "B4"], ["E4", "G#4", "B4", "C#5"]),
};
const goldChanges = [
  "E", "E", "A", "A", "Cm", "Fm", "B", "B",
  "E", "E", "A", "A", "Cm", "Fm", "B", "B",
  "G7", "Cm", "Fm", "B", "AM", "B", "E", "B",
  "E", "E", "A", "A", "Cm", "Fm", "B", "B",
];
const goldHook = [
  "-/.25 B4/.25 D5/.5 E5/.5 -/.25 G#5/.25 F#5/.5 E5/.5 D5/.5 B4/.5",
  "E5/.75 D5/.25 B4/.5 A4/.5 G#4/.5 B4/.5 D5/.5 -/.5",
  "-/.25 C#5/.25 E5/.5 F#5/.5 -/.25 A5/.25 G5/.5 F#5/.5 E5/.5 C#5/.5",
  "F#5/.75 E5/.25 C#5/.5 B4/.5 A4/.5 C#5/.5 E5/.5 -/.5",
  "G#5/.5 E5/.5 D#5/.75 E5/.25 G#5/.5 B5/.5 G#5/.5 E5/.5",
  "A5/.75 G#5/.25 F#5/.5 E5/.5 C#5/.5 E5/.5 F#5/.5 -/.5",
  "F#5/.5 A5/.5 G#5/.75 F#5/.25 D#5/.5 F#5/.5 A5/.5 G#5/.5",
  "F#5/.5 D#5/.5 B4/.75 C#5/.25 D#5/.5 F#5/.5 -/1",
];
const goldMelody = [
  ...goldHook,
  goldHook[0], goldHook[1], goldHook[2],
  "A5/.75 G5/.25 F#5/.5 E5/.5 C#5/.5 B4/.5 A4/.5 -/.5",
  "B5/.5 G#5/.5 E5/.75 D#5/.25 E5/.5 G#5/.5 B5/.5 G#5/.5",
  "F#5/.5 A5/.5 G#5/.75 F#5/.25 E5/.5 C#5/.5 E5/.5 -/.5",
  goldHook[6], "A5/.5 G#5/.5 F#5/.5 D#5/.5 B4/1 -/1",
  "G#5/1 F#5/.5 D#5/.5 C5/1 -/1",
  "E5/.5 G#5/.5 B5/1 G#5/.5 E5/.5 D#5/.5 C#5/.5",
  "C#5/1 E5/.5 G#5/.5 A5/.75 G#5/.25 F#5/.5 -/.5",
  "F#5/.5 A5/.5 D#6/.75 C#6/.25 B5/.5 A5/.5 G#5/.5 F#5/.5",
  "E5/1 G#5/.5 B5/.5 A5/.75 G#5/.25 E5/.5 C#5/.5",
  "D#5/.5 F#5/.5 A5/1 G#5/.5 F#5/.5 D#5/.5 B4/.5",
  "E5/.75 G#5/.25 B5/1 A5/.5 G#5/.5 E5/1",
  "D#5/.5 F#5/.5 A5/.5 G#5/.5 F#5/.75 D#5/.25 -/1",
  goldHook[0], goldHook[1], goldHook[2], goldHook[3],
  "G#5/.5 B5/.5 C#6/.75 B5/.25 G#5/.5 E5/.5 D#5/.5 C#5/.5",
  "A5/.75 G#5/.25 F#5/.5 E5/.5 C#5/.5 E5/.5 A5/.5 -/.5",
  "F#5/.5 A5/.5 G#5/.75 F#5/.25 D#5/.5 F#5/.5 B5/.5 A5/.5",
  "G#5/.5 F#5/.5 D#5/.5 B4/.5 F#5/.5 D#5/.5 -/1",
];

// ASTER WAVES — F# minor electropop: a repeatable singable hook over
// F#m9 / Dmaj9 / Amaj9 / Eadd9, with a half-time B-minor bridge.
const WAVES = {
  Fm: h("F#2", 3, 10, ["A3", "C#4", "E4", "G#4"], ["C#4", "E4", "G#4", "A4"]),
  D: h("D2", 4, 11, ["F#3", "C#4", "E4", "A4"], ["F#4", "A4", "C#5", "E5"]),
  A: h("A1", 4, 11, ["C#4", "E4", "G#4", "B4"], ["E4", "G#4", "B4", "C#5"]),
  E: h("E2", 4, 11, ["G#3", "B3", "E4", "F#4"], ["E4", "G#4", "B4", "F#5"]),
  Bm: h("B1", 3, 10, ["D4", "F#4", "A4", "C#5"], ["F#4", "A4", "C#5", "D5"]),
  Cm: h("C#2", 3, 10, ["E4", "G#4", "B4", "C#5"], ["E4", "G#4", "B4", "C#5"]),
};
const wavesChanges = [
  "Fm", "Fm", "D", "D", "A", "A", "E", "E",
  "Fm", "Fm", "D", "D", "A", "A", "E", "E",
  "Bm", "Bm", "D", "E", "Cm", "Fm", "D", "E",
  "Fm", "Fm", "D", "D", "A", "A", "E", "E",
];
const wavesHook = [
  "C#5/.5 F#5/.75 G#5/.25 A5/.5 G#5/.5 F#5/.5 E5/.5 C#5/.5",
  "F#5/1 A5/.5 C#6/.5 B5/.75 A5/.25 G#5/.5 -/.5",
  "A5/.5 F#5/.75 E5/.25 D5/.5 E5/.5 F#5/.5 A5/.5 C#6/.5",
  "B5/1 A5/.5 F#5/.5 E5/.75 F#5/.25 A5/.5 -/.5",
  "E5/.5 A5/.75 B5/.25 C#6/.5 B5/.5 A5/.5 G#5/.5 E5/.5",
  "A5/1 C#6/.5 E6/.5 C#6/.75 B5/.25 G#5/.5 -/.5",
  "B5/.5 G#5/.75 F#5/.25 E5/.5 F#5/.5 G#5/.5 B5/.5 E6/.5",
  "C#6/1 B5/.5 G#5/.5 F#5/.75 G#5/.25 E5/.5 -/.5",
];
const wavesMelody = [
  ...wavesHook,
  wavesHook[0], "F#5/.5 A5/.5 C#6/1 E6/.75 C#6/.25 B5/.5 -/.5",
  wavesHook[2], "A5/1 F#5/.5 E5/.5 D5/.75 E5/.25 F#5/.5 -/.5",
  wavesHook[4], "C#6/.5 E6/.5 F#6/1 E6/.75 C#6/.25 B5/.5 -/.5",
  wavesHook[6], "B5/1 G#5/.5 F#5/.5 E5/1 -/1",
  "F#5/1 A5/.5 C#6/.5 D6/.75 C#6/.25 B5/.5 -/.5",
  "D6/.5 C#6/.5 A5/1 F#5/.5 E5/.5 D5/.5 F#5/.5",
  "A5/1 C#6/.5 E6/.5 F#6/.75 E6/.25 C#6/.5 -/.5",
  "B5/.5 G#5/.5 F#5/1 E5/.75 F#5/.25 G#5/.5 -/.5",
  "E5/1 G#5/.5 B5/.5 C#6/.75 B5/.25 G#5/.5 E5/.5",
  "F#5/.5 A5/.5 C#6/1 E6/.75 C#6/.25 A5/.5 -/.5",
  "F#5/1 A5/.5 C#6/.5 B5/.75 A5/.25 F#5/.5 E5/.5",
  "G#5/.5 B5/.5 E6/1 B5/.5 G#5/.5 F#5/.5 -/.5",
  wavesHook[0], wavesHook[1], wavesHook[2], wavesHook[3],
  wavesHook[4], "E6/.5 C#6/.5 B5/.75 A5/.25 G#5/.5 E5/.5 C#6/.5 -/.5",
  "B5/.5 G#5/.75 F#5/.25 E5/.5 F#5/.5 G#5/.5 B5/.5 G#5/.5",
  "F#5/.5 G#5/.5 B5/.5 G#5/.5 E5/1 -/1",
];

// MIDNIGHT SIGNAL — C-minor noir funk. F9 adds a Dorian lift; G7(b9)
// turns each refrain back home. The bridge visits the relative-major side.
const MIDNIGHT = {
  Cm: h("C2", 3, 10, ["Eb3", "Bb3", "D4"], ["C4", "G4", "D5", "Eb4", "Bb4"]),
  F: h("F2", 4, 10, ["A3", "Eb4", "G4"], ["F3", "C4", "G4", "A3", "Eb4"]),
  Ab: h("Ab1", 4, 11, ["C4", "G4", "Bb4"], ["Ab3", "Eb4", "Bb4", "C4", "G4"]),
  G7: h("G1", 4, 10, ["B3", "F4", "Ab4"], ["G3", "D4", "Ab4", "B3", "F4"]),
  Bb: h("Bb1", 4, 10, ["D4", "Ab4", "C5"], ["Bb3", "F4", "C5", "D4", "Ab4"]),
  Gm: h("G1", 3, 10, ["Bb3", "D4", "F4"], ["G3", "D4", "F4", "Bb3", "D4"]),
  C7: h("C2", 4, 10, ["E4", "Bb4", "Db5"], ["C4", "G4", "Db5", "E4", "Bb4"]),
  Fm: h("F2", 3, 10, ["Ab3", "Eb4", "G4"], ["F3", "C4", "G4", "Ab3", "Eb4"]),
  Eb: h("Eb2", 4, 11, ["G3", "D4", "F4"], ["Eb4", "Bb4", "F5", "G4", "D5"]),
};
const midnightChanges = [
  "Cm", "Cm", "F", "F", "Ab", "G7", "Cm", "G7",
  "Cm", "Cm", "F", "F", "Ab", "G7", "Cm", "G7",
  "Ab", "Bb", "Gm", "C7", "Fm", "Bb", "Eb", "G7",
  "Cm", "Cm", "F", "F", "Ab", "G7", "Cm", "G7",
];
const midnightHook = [
  "C5/.5 Eb5/.5 G5/.75 F5/.25 Eb5/.5 D5/.5 C5/.5 -/.5",
  "Bb4/.5 C5/.5 Eb5/.5 G5/.5 A5/.75 G5/.25 Eb5/.5 -/.5",
  "A4/.5 C5/.5 Eb5/.75 D5/.25 C5/.5 A4/.5 G4/.5 -/.5",
  "C5/.5 Eb5/.5 G5/.5 A5/.5 G5/.75 Eb5/.25 D5/.5 -/.5",
  "Eb5/.75 G5/.25 Bb5/.5 G5/.5 Eb5/.5 C5/.5 Bb4/.5 -/.5",
  "D5/.5 F5/.5 Ab5/.75 G5/.25 D5/.5 B4/.5 G4/.5 -/.5",
  "C5/.5 Eb5/.5 G5/1 F5/.5 Eb5/.5 D5/.5 C5/.5",
  "B4/.5 D5/.5 F5/.75 Eb5/.25 D5/.5 B4/.5 -/1",
];
const midnightMelody = [
  ...midnightHook,
  midnightHook[0], "Eb5/.5 G5/.5 Bb5/1 A5/.75 G5/.25 Eb5/.5 -/.5",
  midnightHook[2], "A5/.5 G5/.5 Eb5/.75 D5/.25 C5/.5 A4/.5 G4/.5 -/.5",
  "G5/.75 Bb5/.25 C6/.5 Bb5/.5 G5/.5 Eb5/.5 C5/.5 -/.5",
  midnightHook[5], "G5/.5 Eb5/.5 D5/1 C5/.5 Bb4/.5 G4/.5 C5/.5",
  "F5/.5 D5/.5 B4/.5 G4/.5 B4/1 -/1",
  "G5/1 Bb5/.5 C6/.5 Bb5/.75 G5/.25 Eb5/.5 -/.5",
  "D5/.5 F5/.5 Ab5/1 G5/.5 F5/.5 D5/.5 Bb4/.5",
  "Bb4/.5 D5/.5 F5/1 G5/.75 F5/.25 D5/.5 -/.5",
  "E5/.5 G5/.5 Bb5/.75 Ab5/.25 G5/.5 E5/.5 Db5/.5 C5/.5",
  "C5/1 Eb5/.5 G5/.5 Ab5/.75 G5/.25 F5/.5 -/.5",
  "F5/.5 Ab5/.5 C6/1 Bb5/.5 Ab5/.5 G5/.5 F5/.5",
  "G5/.75 Bb5/.25 D6/1 C6/.5 Bb5/.5 G5/.5 F5/.5",
  "F5/.5 Ab5/.5 B5/.75 Ab5/.25 G5/.5 D5/.5 -/1",
  midnightHook[0], midnightHook[1], midnightHook[2], midnightHook[3],
  midnightHook[4], midnightHook[5],
  "G5/.5 Eb5/.5 D5/.75 C5/.25 Bb4/.5 G4/.5 C5/.5 -/.5",
  "B4/.5 D5/.5 F5/.5 Ab5/.5 G5/.5 D5/.5 -/1",
];

function goldGroove(events: ScoreEvent[], bar: number, c: Chord, next: Chord, bridge: boolean) {
  c.voices.forEach(pitch => {
    add(events, bar, 0.5, pitch, bridge ? 1.25 : 0.375, "pad", 0.014, -0.24);
    add(events, bar, 2.5, pitch, 0.375, "pad", 0.012, -0.24);
    if (!bridge && bar % 2) add(events, bar, 3.5, pitch, 0.125, "pad", 0.008, -0.24);
  });
  [0.25, 1.25, 2.25, 3.25].forEach((at, i) => add(events, bar, at, c.arp[i], 0.125, "pluck", i % 2 ? 0.011 : 0.016, 0.35, -4));
  if (bar % 2) {
    add(events, bar, 0.75, c.voices[0] + 12, 0.375, "bell", 0.018, -0.4);
    add(events, bar, 2.75, c.voices[1], 0.375, "bell", 0.017, -0.4);
  }
  const bass = [c.root, c.root + 7, c.root + 12, c.root, c.seventh, c.root + 7, next.root - 1];
  [0, 0.75, 1.25, 2, 2.75, 3.25, 3.75].forEach((at, i) => {
    add(events, bar, at, bass[i], i === 0 || i === 3 ? 0.375 : 0.125, "bass", i === 0 || i === 3 ? 0.112 : 0.083);
  });
  [0, 1.5, 2, 3.25].forEach((at, i) => add(events, bar, at, 36, 0.125, "kick", i % 2 ? 0.045 : 0.077));
  [1, 3].forEach(at => add(events, bar, at, 38, 0.125, "snare", 0.041, 0.12));
  for (let i = 0; i < 8; i++) {
    if (bridge && i % 2 === 0) continue;
    add(events, bar, i * 0.5, i === 7 && bar % 4 === 3 ? 46 : 42, 0.125, "hat", i % 2 ? 0.014 : 0.008, 0.28);
  }
  if (bar % 8 === 7) add(events, bar, 3.75, 38, 0.125, "snare", 0.02, 0.12);
}

function wavesGroove(events: ScoreEvent[], bar: number, c: Chord, next: Chord, bridge: boolean) {
  c.voices.forEach((pitch, i) => add(events, bar, 0.25, pitch, 3.25, "pad", 0.016, i % 2 ? -0.24 : 0.24, i % 2 ? -3 : 3));
  [0.75, 1.75, 2.75, 3.75].forEach((at, i) => add(events, bar, at, c.arp[bar % 2 ? 3 - i : i], 0.125, "pluck", 0.018, -0.36, -4));
  if (bar % 2 || bridge) {
    add(events, bar, 1.25, c.arp[0], 0.375, "pluck", 0.022, 0.4);
    add(events, bar, 3.25, c.arp[2], 0.375, "pluck", 0.018, 0.4);
  }
  if (bridge) {
    [0, 1.5, 2.5, 3.5].forEach((at, i) => add(events, bar, at, [c.root, c.root + 7, c.root + 12, next.root - 1][i], 0.375, "bass", i === 0 ? 0.108 : 0.078));
    [0, 2.5].forEach(at => add(events, bar, at, 36, 0.125, "kick", 0.072));
    add(events, bar, 2, 38, 0.125, "snare", 0.043, 0.12);
  } else {
    const bass = [c.root, c.root + 12, c.root, c.root + 7, c.root, c.root + 12, c.root + 7, next.root + 7];
    bass.forEach((pitch, i) => add(events, bar, i * 0.5, pitch, 0.25, "bass", i % 2 ? 0.078 : 0.102));
    [0, 1, 2, 3].forEach(at => add(events, bar, at, 36, 0.125, "kick", at % 2 ? 0.063 : 0.075));
    [1, 3].forEach(at => add(events, bar, at, 38, 0.125, "snare", 0.037, 0.12));
  }
  for (let i = 0; i < 8; i++) {
    add(events, bar, i * 0.5, i === 7 && bar % 4 === 3 ? 46 : 42, 0.125, "hat", i % 2 ? 0.015 : 0.006, 0.3);
  }
  if (bar % 8 === 7) add(events, bar, 3.75, 42, 0.125, "hat", 0.009, 0.3);
}

function midnightGroove(events: ScoreEvent[], bar: number, c: Chord, next: Chord, bridge: boolean) {
  c.voices.forEach(pitch => {
    add(events, bar, 0.75, pitch, bridge ? 1 : 0.375, "pad", 0.013, -0.25, -3);
    add(events, bar, 2.75, pitch, 0.375, "pad", 0.011, -0.25, -3);
  });
  [0.25, 1.25, 1.75, 2.25, 3.25, 3.75].forEach((at, i) => {
    add(events, bar, at, c.arp[[0, 1, 2, 0, 3, 4][i]], 0.125, "pluck", i % 3 ? 0.017 : 0.024, -0.38, -5);
  });
  if (bar % 4 === 1 || bridge) {
    add(events, bar, 0.5, c.voices[0] + 12, 0.875, "bell", 0.018, 0.4);
    add(events, bar, 2.5, c.voices[2], 0.375, "bell", 0.014, 0.4);
  }
  const bass = [c.root, c.root + 12, c.root + 7, c.root, c.seventh, next.root - 1];
  [0, 0.75, 1.5, 2, 2.75, 3.5].forEach((at, i) => add(events, bar, at, bass[i], i === 0 || i === 3 ? 0.5 : 0.25, "bass", i === 0 || i === 3 ? 0.114 : 0.085));
  [0, 1.75, 2.5].forEach((at, i) => add(events, bar, at, 36, 0.125, "kick", i === 0 ? 0.079 : 0.05));
  [1, 3].forEach(at => add(events, bar, at, 38, 0.125, "snare", 0.043, 0.1));
  for (let i = 0; i < 8; i++) {
    add(events, bar, i * 0.5, 42, 0.125, "hat", i % 2 ? 0.012 : 0.006, 0.28);
  }
  if (bar % 4 === 3) add(events, bar, 3.75, 38, 0.125, "snare", 0.016, 0.1);
}

function compose(station: Station, title: string, bpm: number, chart: Chart, changes: string[], melody: string[]): MusicTrack {
  if (changes.length !== BARS || melody.length !== BARS) throw new Error("A radio chart must contain 32 complete bars.");
  const events: ScoreEvent[] = [];
  changes.forEach((name, bar) => {
    const chord = chart[name];
    const next = chart[changes[(bar + 1) % BARS]];
    if (!chord || !next) throw new Error(`Unknown radio chord: ${name}`);
    const bridge = bar >= 16 && bar < 24;
    lead(events, bar, melody[bar], station, [bridge ? 0.086 : 0.096, bridge ? 0.075 : 0.083, bridge ? 0.08 : 0.087][station]);
    [goldGroove, wavesGroove, midnightGroove][station](events, bar, chord, next, bridge);
  });
  events.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  return { tier: station, title, bpm, bars: BARS, beatsPerBar: BAR, beats: BAR * BARS, events };
}

/** Six arranged parts: recurring lead hook, chords, bass, arp, answer and kit. */
export const RADIO_TRACKS: Record<Station, MusicTrack> = {
  0: compose(0, "Green Light Gold", 110, GOLD, goldChanges, goldMelody),
  1: compose(1, "Neon in the Rearview", 106, WAVES, wavesChanges, wavesMelody),
  2: compose(2, "Velvet Frequency", 104, MIDNIGHT, midnightChanges, midnightMelody),
};
