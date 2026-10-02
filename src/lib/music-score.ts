import type { Tier } from "./game";

/** Original SCOUT score. All timing is in quarter-note beats; pitches are MIDI. */
export type Instrument = "pluck" | "bell" | "pad" | "bass" | "kick" | "snare" | "hat";
export type ScoreEvent = {
  beat: number;
  duration: number;
  midi: number;
  gain: number;
  instrument: Instrument;
  pan?: number;
  detune?: number;
};
export type MusicTrack = {
  tier: Tier;
  title: string;
  bpm: number;
  bars: 32;
  beatsPerBar: 4;
  beats: number;
  events: readonly ScoreEvent[];
};

type Harmony = { root: number; voices: readonly number[]; arp: readonly number[] };
const BAR = 4;
const BARS = 32;
const BEATS = BAR * BARS;

function pitch(name: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!match) throw new Error(`Invalid score pitch: ${name}`);
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + natural[match[1]] + accidental;
}

function harmony(root: string, voices: string[], arp: string[]): Harmony {
  return { root: pitch(root), voices: voices.map(pitch), arp: arp.map(pitch) };
}

function note(
  events: ScoreEvent[], bar: number, at: number, midi: number, duration: number,
  instrument: Instrument, gain: number, pan = 0, detune = 0,
) {
  events.push({ beat: bar * BAR + at, duration, midi, gain, instrument, pan, detune });
}

/** Compact notation makes each deliberately written melody bar easy to audit. */
function phrase(events: ScoreEvent[], bar: number, notation: string, instrument: Instrument, gain: number, pan: number) {
  let at = 0;
  for (const token of notation.split(" ")) {
    const [name, length] = token.split("/");
    const duration = Number(length);
    if (!(duration > 0)) throw new Error(`Invalid score duration: ${token}`);
    if (name !== "-") {
      const accent = at === 0 ? 1 : at % 1 === 0 ? 0.96 : 0.9;
      note(events, bar, at, pitch(name), Math.max(0.125, duration - 0.125), instrument, gain * accent, pan);
    }
    at += duration;
  }
  if (at !== BAR) throw new Error(`Melody bar ${bar + 1} has ${at} beats, expected ${BAR}.`);
}

function finish(tier: Tier, title: string, bpm: number, events: ScoreEvent[]): MusicTrack {
  events.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  return { tier, title, bpm, bars: BARS, beatsPerBar: BAR, beats: BEATS, events };
}

// The Company: C major, warm extended chords, a small syncopated rhythm section.
// A / A' / bridge / return; the secondary dominant A7 points back into D minor.
const OFFICE = {
  C: harmony("C2", ["E3", "B3", "D4", "G4"], ["E4", "G4", "B4", "D5"]),
  Am: harmony("A1", ["G3", "B3", "C4", "E4"], ["E4", "G4", "B4", "C5"]),
  Dm: harmony("D2", ["F3", "A3", "C4", "E4"], ["F4", "A4", "C5", "E5"]),
  G: harmony("G1", ["F3", "A3", "B3", "E4"], ["G4", "B4", "E5", "A4"]),
  Em: harmony("E2", ["G3", "B3", "D4"], ["E4", "G4", "B4", "D5"]),
  A7: harmony("A1", ["G3", "A3", "C#4", "E4"], ["E4", "G4", "A4", "C#5"]),
  F: harmony("F2", ["A3", "C4", "E4", "G4"], ["F4", "A4", "C5", "E5"]),
  C7: harmony("C2", ["Bb3", "C4", "E4", "G4"], ["E4", "G4", "Bb4", "C5"]),
};
const officeProgression: readonly (keyof typeof OFFICE)[] = [
  "C", "Am", "Dm", "G", "Em", "A7", "Dm", "G",
  "C", "Am", "F", "G", "Em", "A7", "Dm", "G",
  "F", "G", "Em", "Am", "Dm", "G", "C", "C7",
  "F", "G", "Em", "Am", "Dm", "G", "C", "G",
];
const officeMelody = [
  "-/.5 E5/.5 G5/.5 A5/.75 G5/.25 E5/1 -/.5",
  "G5/.5 E5/.5 C5/1 B4/.5 C5/.5 E5/1",
  "-/.5 F5/.5 A5/.5 G5/.5 E5/1 D5/.5 F5/.5",
  "G5/.75 B5/.25 A5/.5 G5/.5 E5/.75 D5/.25 B4/.5 -/.5",
  "G5/1 E5/.5 D5/.5 B4/.5 D5/.5 E5/1",
  "-/.5 E5/.5 G5/.75 E5/.25 C#5/1 B4/.5 A4/.5",
  "D5/.75 F5/.25 A5/1 G5/.5 F5/.5 E5/.5 D5/.5",
  "B4/.5 D5/.5 G5/.75 A5/.25 B5/.5 A5/.5 G5/.5 -/.5",
  "-/.5 E5/.5 G5/.5 B5/.5 A5/.75 G5/.25 E5/1",
  "C6/.75 B5/.25 A5/.5 G5/.5 E5/1 C5/.5 -/.5",
  "A5/1 G5/.5 E5/.5 F5/.75 E5/.25 C5/.5 A4/.5",
  "B4/.5 D5/.5 G5/.5 A5/.5 B5/1 -/.5 A5/.5",
  "G5/.75 E5/.25 D5/1 B4/.5 D5/.5 G5/1",
  "A5/.5 G5/.5 E5/.75 C#5/.25 B4/.5 C#5/.5 E5/.5 G5/.5",
  "F5/.5 E5/.5 D5/.75 F5/.25 A5/1 G5/.5 F5/.5",
  "E5/.5 D5/.5 B4/.5 D5/.5 G5/1 -/1",
  "A5/1 C6/.5 B5/.5 A5/.5 G5/.5 E5/1",
  "D6/.75 C6/.25 B5/1 A5/.5 G5/.5 E5/.5 D5/.5",
  "B5/.5 G5/.5 E5/1 D5/.75 E5/.25 G5/1",
  "A5/1 E5/.5 G5/.5 C6/.75 B5/.25 A5/.5 -/.5",
  "F5/1 A5/.75 G5/.25 F5/.5 E5/.5 D5/1",
  "G5/.5 A5/.5 B5/.5 D6/.5 C6/.75 B5/.25 A5/.5 G5/.5",
  "E5/.75 G5/.25 C6/1 B5/.5 G5/.5 E5/.5 D5/.5",
  "E5/.5 G5/.5 Bb5/.75 A5/.25 G5/1 E5/.5 -/.5",
  "-/.5 A5/.5 C6/.5 B5/.75 A5/.25 G5/1 -/.5",
  "B5/.5 A5/.5 G5/1 E5/.5 D5/.5 B4/1",
  "G5/.5 B5/.5 D6/.75 B5/.25 G5/1 E5/.5 -/.5",
  "E5/.75 G5/.25 A5/1 G5/.5 E5/.5 C5/1",
  "D5/.5 F5/.5 A5/.5 C6/.5 A5/.75 G5/.25 F5/.5 E5/.5",
  "D5/.5 G5/.5 B5/1 A5/.5 G5/.5 E5/.5 D5/.5",
  "E5/1 G5/.5 E5/.5 D5/.5 C5/.5 -/1",
  "B4/1 D5/.5 E5/.5 G5/1 -/1",
];

function company(): MusicTrack {
  const events: ScoreEvent[] = [];
  officeProgression.forEach((name, bar) => {
    const chord = OFFICE[name];
    const next = OFFICE[officeProgression[(bar + 1) % BARS]];
    const bridge = bar >= 16 && bar < 24;
    phrase(events, bar, officeMelody[bar], "pluck", bridge ? 0.091 : 0.083, 0.08);

    // Soft chord stabs leave room for the lead and its offbeat answers.
    for (const voice of chord.voices) {
      note(events, bar, 0.5, voice, 0.75, "pad", 0.016, -0.28);
      note(events, bar, bar % 2 ? 2.5 : 2.25, voice, 0.875, "pad", 0.013, -0.28);
    }
    [0.75, 1.75, 2.75, 3.75].forEach((at, i) => {
      note(events, bar, at, chord.arp[i], 0.125, "pluck", i === 0 ? 0.018 : 0.013, 0.38, -4);
    });
    if (bridge || bar % 4 === 3) {
      [0.25, 1.75, 3.25].forEach((at, i) => {
        note(events, bar, at, chord.voices[i % chord.voices.length] + 12, 0.5, "bell", 0.022, -0.4);
      });
    }

    note(events, bar, 0, chord.root, 0.75, "bass", 0.105);
    note(events, bar, 1.5, chord.root + 7, 0.25, "bass", 0.078);
    note(events, bar, 2, chord.root + 12, 0.5, "bass", 0.092);
    note(events, bar, 3, chord.root + 7, 0.25, "bass", 0.07);
    note(events, bar, 3.5, next.root - 1, 0.25, "bass", 0.065);

    note(events, bar, 0, 36, 0.25, "kick", 0.066);
    note(events, bar, 2, 36, 0.25, "kick", 0.052);
    if (bar % 2 === 1) note(events, bar, 3.5, 36, 0.125, "kick", 0.03);
    note(events, bar, 1, 38, 0.125, "snare", 0.033, 0.1);
    note(events, bar, 3, 38, 0.125, "snare", 0.036, 0.1);
    for (let step = 0; step < 8; step++) {
      note(events, bar, step * 0.5, step === 7 && bar % 4 === 3 ? 46 : 42,
        step === 7 && bar % 4 === 3 ? 0.25 : 0.125, "hat", step % 2 ? 0.014 : 0.009, 0.25);
    }
    if (bar % 8 === 7) note(events, bar, 3.75, 38, 0.125, "snare", 0.018, 0.1);
  });
  return finish(0, "Morning Commit", 104, events);
}

// Aster Institute: D Lydian colors, suspended space, clear bell phrases.
// The bridge lifts to F# minor before the opening motif finds its way home.
const ASTER = {
  D: harmony("D2", ["F#3", "C#4", "E4", "G#4"], ["F#4", "A4", "C#5", "E5"]),
  E: harmony("E2", ["G#3", "B3", "E4", "F#4"], ["E4", "G#4", "B4", "F#5"]),
  Bm: harmony("B1", ["F#3", "A3", "C#4", "D4"], ["F#4", "A4", "C#5", "D5"]),
  A: harmony("A1", ["G#3", "B3", "C#4", "E4"], ["E4", "G#4", "B4", "C#5"]),
  Fm: harmony("F#2", ["A3", "C#4", "E4", "G#4"], ["F#4", "A4", "C#5", "E5"]),
  Cm: harmony("C#2", ["G#3", "B3", "D#4", "E4"], ["E4", "G#4", "B4", "D#5"]),
};
const asterProgression: readonly (keyof typeof ASTER)[] = [
  "D", "D", "E", "E", "Bm", "A", "D", "E",
  "D", "Fm", "E", "Bm", "D", "A", "E", "A",
  "Bm", "Cm", "D", "E", "Fm", "A", "D", "E",
  "D", "D", "E", "Bm", "D", "A", "E", "A",
];
const asterMelody = [
  "-/.5 F#5/1 A5/.5 G#5/.5 E5/.5 F#5/.5 -/.5",
  "C#6/1.5 B5/.5 A5/1 -/1",
  "G#5/1 B5/.5 F#5/.5 E5/1 -/1",
  "-/.5 F#5/.5 G#5/1 B5/1 G#5/.5 E5/.5",
  "F#5/.5 A5/.5 C#6/1 D6/.75 C#6/.25 B5/.5 A5/.5",
  "G#5/1 E5/.5 F#5/.5 C#5/1 -/1",
  "D5/1 F#5/.5 A5/.5 G#5/1 F#5/.5 E5/.5",
  "G#5/1 B5/.5 C#6/.5 F#5/1 -/1",
  "-/.5 F#5/.5 A5/1 C#6/.75 B5/.25 A5/.5 G#5/.5",
  "E6/1 C#6/.5 B5/.5 A5/1 G#5/.5 F#5/.5",
  "G#5/.5 B5/.5 F#6/1 E6/.5 B5/.5 G#5/1",
  "D6/1 C#6/.5 A5/.5 F#5/1 -/1",
  "F#5/1 A5/.5 G#5/.5 E5/.75 F#5/.25 A5/1",
  "C#6/1.5 B5/.5 G#5/1 E5/.5 -/.5",
  "E5/.5 F#5/.5 G#5/1 B5/.75 G#5/.25 F#5/.5 E5/.5",
  "C#5/1 E5/.5 G#5/.5 B5/1 -/1",
  "-/.5 D6/1 C#6/.5 B5/.75 A5/.25 F#5/1",
  "G#5/.5 B5/.5 C#6/1 E6/1 D#6/.5 C#6/.5",
  "A5/1 C#6/.5 E6/.5 F#6/1 E6/.5 C#6/.5",
  "B5/1 G#5/.5 F#5/.5 E5/1 -/1",
  "A5/.75 C#6/.25 E6/1 C#6/.5 B5/.5 A5/1",
  "G#5/.5 B5/.5 C#6/1 E6/.75 C#6/.25 B5/.5 A5/.5",
  "F#5/1 E5/.5 D5/.5 A5/1 G#5/.5 F#5/.5",
  "E5/.5 G#5/.5 B5/1 F#5/1 -/1",
  "-/.5 F#5/1 A5/.5 G#5/.75 E5/.25 F#5/1",
  "C#6/1 B5/.5 A5/.5 G#5/1 -/1",
  "B5/.5 G#5/.5 F#5/1 E5/.75 F#5/.25 G#5/1",
  "A5/.5 C#6/.5 D6/1 C#6/.5 B5/.5 A5/.5 F#5/.5",
  "D5/1 F#5/.5 A5/.5 C#6/1 A5/.5 G#5/.5",
  "E5/1 G#5/.5 B5/.5 C#6/1 -/1",
  "G#5/.5 B5/.5 F#6/1 E6/.5 B5/.5 G#5/1",
  "E5/1 C#5/1 G#5/1 -/1",
];

function institute(): MusicTrack {
  const events: ScoreEvent[] = [];
  asterProgression.forEach((name, bar) => {
    const chord = ASTER[name];
    const next = ASTER[asterProgression[(bar + 1) % BARS]];
    const bridge = bar >= 16 && bar < 24;
    phrase(events, bar, asterMelody[bar], "bell", bridge ? 0.073 : 0.066, 0.12);

    chord.voices.forEach((voice, i) => {
      note(events, bar, i % 2 ? 0.25 : 0, voice, 3.5, "pad", 0.018, i % 2 ? 0.24 : -0.24, i % 2 ? 3 : -3);
    });
    [0.75, 1.5, 2.75, 3.5].forEach((at, i) => {
      const index = bar % 2 ? 3 - i : i;
      note(events, bar, at, chord.arp[index], 0.375, "pluck", i % 2 ? 0.017 : 0.022, -0.35, -3);
    });
    if (bar % 2 || bridge) {
      note(events, bar, 0.5, chord.arp[0], 1.25, "bell", 0.02, -0.42);
      note(events, bar, 2.5, chord.arp[2], 0.875, "bell", 0.017, -0.42);
    }
    note(events, bar, 0, chord.root, 1.5, "bass", 0.084);
    note(events, bar, 2.5, chord.root + 7, 0.75, "bass", 0.065);
    note(events, bar, 3.5, next.root, 0.375, "bass", 0.043);

    note(events, bar, 0, 36, 0.25, "kick", 0.043);
    if (bar % 2) note(events, bar, 2.5, 36, 0.25, "kick", 0.031);
    note(events, bar, 2, 38, 0.125, "snare", 0.023, 0.14);
    [0.5, 1.5, 2.5, 3.5].forEach((at, i) => {
      note(events, bar, at, 42, 0.125, "hat", i % 2 ? 0.01 : 0.008, 0.35);
    });
    if (bar % 8 === 7) {
      note(events, bar, 3.25, 42, 0.125, "hat", 0.007, 0.35);
      note(events, bar, 3.75, 46, 0.25, "hat", 0.011, 0.35);
    }
  });
  return finish(1, "Aster Afterglow", 96, events);
}

// The Veil: D minor, low broken-chord pulses and a question-and-answer lead.
// A7(b9) supplies the tension; the F-major bridge briefly opens the room.
const VEIL = {
  Dm: harmony("D2", ["F3", "A3", "C4", "E4"], ["D3", "A3", "E4", "F3", "C4"]),
  Bb: harmony("Bb1", ["F3", "A3", "Bb3", "D4"], ["Bb2", "F3", "C4", "D3", "A3"]),
  Gm: harmony("G1", ["G3", "Bb3", "D4", "F4"], ["G2", "D3", "A3", "Bb2", "F3"]),
  Asus: harmony("A1", ["G3", "A3", "D4", "E4"], ["A2", "E3", "D4", "G3", "D3"]),
  A7: harmony("A1", ["G3", "Bb3", "C#4", "E4"], ["A2", "E3", "Bb3", "C#3", "G3"]),
  F: harmony("F2", ["A3", "C4", "E4", "G4"], ["F3", "C4", "G4", "A3", "E4"]),
  Em: harmony("E2", ["G3", "Bb3", "D4", "E4"], ["E3", "Bb3", "D4", "G3", "Bb3"]),
};
const veilProgression: readonly (keyof typeof VEIL)[] = [
  "Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "Asus", "A7",
  "Dm", "Dm", "Bb", "Bb", "Gm", "Gm", "Asus", "A7",
  "F", "F", "Em", "A7", "Dm", "Bb", "Gm", "A7",
  "Dm", "Bb", "Gm", "A7", "Dm", "Bb", "Asus", "A7",
];
const veilMelody = [
  "-/1 D5/.5 F5/.5 E5/1 -/1",
  "C#5/.5 D5/1 A4/.5 -/2",
  "F5/.75 E5/.25 D5/1 A4/.5 Bb4/.5 -/1",
  "-/1 D5/.5 C5/.5 A4/1 -/1",
  "Bb4/.5 D5/.5 F5/1 E5/.5 D5/.5 -/1",
  "A4/1 Bb4/.5 D5/.5 G4/1 -/1",
  "E5/.5 D5/.5 A4/1 G4/.5 A4/.5 -/1",
  "Bb4/.5 A4/.5 G4/.5 E4/.5 C#5/1 -/1",
  "-/1 D5/.5 F5/.5 A5/.75 G5/.25 E5/1",
  "F5/.5 E5/.5 D5/1 A4/.75 C5/.25 D5/.5 -/.5",
  "A5/1 F5/.5 E5/.5 D5/1 -/1",
  "F5/.5 D5/.5 C5/1 A4/.5 Bb4/.5 -/1",
  "G4/.5 Bb4/.5 D5/1 F5/.75 E5/.25 D5/1",
  "Bb4/1 A4/.5 G4/.5 D5/1 -/1",
  "E5/.75 D5/.25 A4/1 G4/.5 D5/.5 E5/.5 -/.5",
  "C#5/1 Bb4/.5 A4/.5 G4/1 -/1",
  "A4/1 C5/.5 E5/.5 G5/1 -/1",
  "F5/.5 E5/.5 C5/1 A4/.75 C5/.25 E5/1",
  "G4/.5 Bb4/.5 D5/1 E5/.75 D5/.25 Bb4/1",
  "C#5/.5 E5/.5 G5/.75 E5/.25 Bb4/1 A4/.5 -/.5",
  "F5/1 E5/.5 D5/.5 C5/1 A4/.5 -/.5",
  "D5/1 F5/.5 A5/.5 G5/.75 F5/.25 D5/1",
  "Bb4/.5 D5/.5 G5/1 F5/.5 D5/.5 A4/.5 Bb4/.5",
  "E5/.5 C#5/.5 Bb4/.5 A4/.5 G4/1 -/1",
  "-/1 D5/.5 F5/.5 E5/1 -/1",
  "D5/.5 F5/.5 A5/1 F5/.5 D5/.5 -/1",
  "G4/.5 Bb4/.5 D5/1 A4/.75 Bb4/.25 D5/1",
  "E5/.5 G5/.5 Bb5/.75 A5/.25 E5/1 C#5/.5 -/.5",
  "D5/1 F5/.5 E5/.5 C5/1 A4/.5 -/.5",
  "Bb4/1 D5/.5 F5/.5 A4/1 -/1",
  "E5/1 D5/.5 A4/.5 G4/1 -/1",
  "Bb4/.5 A4/.5 E4/1 C#5/1 -/1",
];

function theVeil(): MusicTrack {
  const events: ScoreEvent[] = [];
  veilProgression.forEach((name, bar) => {
    const chord = VEIL[name];
    const bridge = bar >= 16 && bar < 24;
    phrase(events, bar, veilMelody[bar], "pluck", bridge ? 0.066 : 0.06, 0.05);
    chord.voices.forEach((voice, i) => {
      note(events, bar, 0.25, voice, 3.25, "pad", 0.012, i % 2 ? 0.22 : -0.22, i % 2 ? 4 : -4);
    });

    // Six measured pulses rather than a constant busy arpeggio.
    const pulse = [0, 1, 2, 0, 3, 4];
    [0, 0.5, 1.5, 2, 2.5, 3.5].forEach((at, i) => {
      note(events, bar, at, chord.arp[pulse[i]], 0.25, "pluck", i === 0 || i === 3 ? 0.035 : 0.026, -0.28, -6);
    });
    if (bar % 4 === 1 || bridge) {
      note(events, bar, 0.75, chord.voices[1] + 12, 1.25, "bell", 0.014, 0.42);
      note(events, bar, 3, chord.voices[2] + 12, 0.75, "bell", 0.012, 0.42);
    }
    note(events, bar, 0, chord.root, 1.5, "bass", 0.095);
    note(events, bar, 2, chord.root, 0.75, "bass", 0.079);
    note(events, bar, 3.25, chord.root + 7, 0.5, "bass", 0.057);

    note(events, bar, 0, 36, 0.25, "kick", 0.069);
    note(events, bar, 2.5, 36, 0.25, "kick", 0.044);
    note(events, bar, 2, 38, 0.125, "snare", 0.026, 0.08);
    [0.5, 1.5, 2.5, 3.5].forEach((at, i) => {
      note(events, bar, at, 42, 0.125, "hat", i % 2 ? 0.011 : 0.007, 0.25);
    });
    if (bar % 8 === 7) {
      note(events, bar, 3.25, 42, 0.125, "hat", 0.007, 0.25);
      note(events, bar, 3.75, 38, 0.125, "snare", 0.013, 0.08);
    }
  });
  return finish(2, "Below the Signal", 88, events);
}

/** Six musical parts: lead, chord bed, bass, arpeggio, answering voice and kit. */
export const MUSIC_TRACKS: Record<Tier, MusicTrack> = {
  0: company(),
  1: institute(),
  2: theVeil(),
};
