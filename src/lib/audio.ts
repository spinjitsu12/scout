import { MUSIC_TRACKS, type Instrument, type MusicTrack, type ScoreEvent } from "./music-score";
import type { Tier } from "./game";

export type SoundEffect = "step" | "interact" | "recruit" | "success" | "error" | "week" | "prestige" | "enterCar" | "exitCar" | "arrival" | "paint" | "phone" | "wake" | "luxury" | "lowFuel" | "bump" | "refuel";
export type SfxKind = SoundEffect;
export type EngineKind = "standard" | "coupe" | "luxury";
export type AudioStatus = {
  started: boolean;
  muted: boolean;
  tier: Tier;
  playing: boolean;
  supported: boolean;
  title: string;
  error: string | null;
  musicEnabled: boolean;
  soundEnabled: boolean;
  engineEnabled: boolean;
  suspended: boolean;
  radioEnabled: boolean;
  radioActive: boolean;
  radioStation: Tier;
  radioTitle: string;
  inVehicle: boolean;
};
export type ScheduledScoreEvent = { event: ScoreEvent; loop: number; time: number; duration: number };
export type EffectNote = { midi: number; offset: number; duration: number; gain: number; instrument: Instrument; pan: number };
export type DrivingMix = { speed: number; fundamentalHz: number; harmonicHz: number; humGain: number; roadGain: number; roadCutoffHz: number; fundamentalLevel: number; harmonicLevel: number; motorCutoffHz: number };
export type MusicSelection = { kind: "score" | "radio"; index: Tier } | null;

export function selectMusic(preferences: Pick<AudioStatus, "musicEnabled" | "radioEnabled" | "inVehicle" | "radioStation" | "tier">, radioReady: boolean): MusicSelection {
  if (preferences.radioEnabled && preferences.inVehicle && radioReady) return { kind: "radio", index: preferences.radioStation };
  if (preferences.musicEnabled) return { kind: "score", index: preferences.tier };
  return null;
}

const INSTRUMENTS: readonly Instrument[] = ["pluck", "bell", "pad", "bass", "kick", "snare", "hat"];
const EPSILON = 0.0001;
const LOOKAHEAD = 0.2;
const POLL_MS = 25;
const MUSIC_LEVEL = 0.2;
const EFFECT_LEVEL = 0.45;
const MENU_MUSIC_LEVEL = 0.65;
export const AUDIO_LIMITS = { musicVoices: 64, effectVoices: 16, drivingSources: 3, drivingVoices: 2, musicLevel: MUSIC_LEVEL, effectLevel: EFFECT_LEVEL } as const;

/** A soft original motor texture, kept below the foreground music and cues. */
export function drivingMix(value: number, kind: EngineKind = "standard"): DrivingMix {
  const speed = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const profile = kind === "coupe" ? { low: 37, rev: 30, gain: 0.012, road: 0.001, fundamental: 0.68, harmonic: 0.23 }
    : kind === "luxury" ? { low: 36, rev: 25, gain: 0.009, road: 0.0006, fundamental: 0.8, harmonic: 0.1 }
      : { low: 46, rev: 32, gain: 0.01, road: 0.0014, fundamental: 0.76, harmonic: 0.14 };
  const fundamentalHz = profile.low + profile.rev * speed ** 0.65;
  return {
    speed, fundamentalHz, harmonicHz: fundamentalHz * 2,
    humGain: speed > 0 ? 0.002 + speed * profile.gain : 0,
    roadGain: speed > 0 ? 0.00025 + speed * profile.road : 0,
    roadCutoffHz: 350 + speed * 900,
    fundamentalLevel: profile.fundamental, harmonicLevel: profile.harmonic,
    motorCutoffHz: 280 + speed * (kind === "coupe" ? 480 : 300),
  };
}

/** Small composed cues in seconds, inspectable without a browser audio mock. */
export function soundEffectPlan(kind: SoundEffect, tier: number = 0): EffectNote[] {
  const root = toTier(tier) === 0 ? 60 : 62;
  const third = toTier(tier) === 2 ? 3 : 4;
  const note = (midi: number, offset: number, duration: number, gain: number, instrument: Instrument = "bell", pan = 0): EffectNote => ({ midi, offset, duration, gain, instrument, pan });
  switch (kind) {
    case "step": return [note(36, 0, 0.02, 0.024, "kick")];
    case "interact": return [note(root + 19, 0, 0.035, 0.042, "pluck"), note(root + 24, 0.055, 0.04, 0.032, "pluck")];
    case "recruit": return [third, 7, 12].map((interval, index) => note(root + 12 + interval, index * 0.075, 0.075, 0.065));
    case "success": return [0, third, 7, 12].map((interval, index) => note(root + 12 + interval, index * 0.085, 0.1, 0.065));
    case "error": return [note(root + 1, 0, 0.06, 0.05, "bass"), note(root, 0.095, 0.08, 0.04, "bass")];
    case "week": return [0, 7, 12].map((interval, index) => note(root + interval, index * 0.09, 0.1, 0.05, "pluck"));
    case "prestige": return [
      ...[0, third, 7, 11, 14, 19].map((interval, index) => note(root + 12 + interval, index * 0.11, 0.15, 0.058, "bell", (index % 2 ? 1 : -1) * 0.18)),
      note(root, 0, 0.6, 0.035, "pad"),
    ];
    case "enterCar": return [note(36, 0, 0.025, 0.028, "kick"), note(root + 7, 0.03, 0.035, 0.025, "pluck"), note(root + 12, 0.085, 0.045, 0.022, "pluck")];
    case "exitCar": return [note(root + 12, 0, 0.045, 0.025, "pluck"), note(root + 7, 0.055, 0.035, 0.02, "pluck"), note(36, 0.115, 0.025, 0.024, "kick")];
    case "arrival": return [note(root + 19, 0, 0.07, 0.046), note(root + 12 + third, 0.085, 0.09, 0.04), note(root + 24, 0.18, 0.15, 0.05)];
    case "paint": return [note(42, 0, 0.025, 0.015, "hat"), ...[7, 12, 19].map((interval, index) => note(root + 12 + interval, 0.04 + index * 0.055, 0.055, 0.032 - index * 0.004))];
    case "phone": return [note(77, 0, 0.07, 0.043, "pluck"), note(84, 0.07, 0.065, 0.036, "pluck"), note(77, 0.3, 0.07, 0.043, "pluck"), note(84, 0.37, 0.065, 0.036, "pluck"), note(38, 0, 0.035, 0.014, "snare"), note(38, 0.3, 0.035, 0.014, "snare")];
    case "wake": return [0, 0.14, 0.28].map(offset => note(root + 12, offset, 0.075, 0.035, "pluck"));
    case "luxury": return [note(root - 12, 0, 0.3, 0.028, "pad"), note(root + 7, 0.035, 0.18, 0.032), note(root + 12, 0.1, 0.18, 0.036), note(root + 12 + third, 0.18, 0.22, 0.034), note(root + 19, 0.28, 0.2, 0.028)];
    case "lowFuel": return [note(root + 7, 0, 0.08, 0.035, "pluck"), note(root + 3, 0.18, 0.1, 0.03, "pluck")];
    case "bump": return [note(36, 0, 0.025, 0.022, "kick"), note(38, 0.012, 0.018, 0.008, "snare")];
    case "refuel": return [note(42, 0, 0.025, 0.012, "hat"), note(root + 7, 0.14, 0.035, 0.025, "pluck"), note(root + 12, 0.22, 0.05, 0.022, "pluck")];
  }
}

export function midiToFrequency(midi: number, detune = 0) {
  return 440 * 2 ** ((midi - 69) / 12 + detune / 1200);
}

/** Data validation also keeps a malformed score out of the realtime scheduler. */
export function validateMusicTrack(track: MusicTrack): string[] {
  const errors: string[] = [];
  if (!track.title.trim()) errors.push("Missing title");
  if (!Number.isFinite(track.bpm) || track.bpm < 40 || track.bpm > 220) errors.push("Invalid tempo");
  if (![0, 1, 2].includes(track.tier)) errors.push("Invalid tier");
  if (track.bars < 16 || track.bars > 32 || track.beatsPerBar !== 4 || track.beats !== track.bars * track.beatsPerBar) errors.push("Invalid loop length");
  if (!track.events.length || track.events.length > 4096) errors.push("Invalid event count");
  let previousBeat = -Infinity;
  track.events.forEach((event, index) => {
    const prefix = `Event ${index}`;
    if (!Number.isFinite(event.beat) || event.beat < 0 || event.beat >= track.beats) errors.push(`${prefix}: outside loop`);
    if (event.beat < previousBeat) errors.push(`${prefix}: unsorted`);
    if (Math.abs(event.beat * 4 - Math.round(event.beat * 4)) > 1e-7) errors.push(`${prefix}: off rhythm grid`);
    if (!Number.isFinite(event.duration) || event.duration <= 0 || event.duration > 16) errors.push(`${prefix}: invalid duration`);
    if (!Number.isFinite(event.midi) || event.midi < 0 || event.midi > 127) errors.push(`${prefix}: invalid pitch`);
    if (!Number.isFinite(event.gain) || event.gain <= 0 || event.gain > 0.25) errors.push(`${prefix}: invalid gain`);
    if (!INSTRUMENTS.includes(event.instrument)) errors.push(`${prefix}: unknown instrument`);
    if (event.pan !== undefined && (!Number.isFinite(event.pan) || Math.abs(event.pan) > 1)) errors.push(`${prefix}: invalid pan`);
    if (event.detune !== undefined && (!Number.isFinite(event.detune) || Math.abs(event.detune) > 100)) errors.push(`${prefix}: invalid detune`);
    previousBeat = event.beat;
  });
  return errors;
}

function lowerBound(events: readonly ScoreEvent[], beat: number) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].beat < beat) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** A half-open audio-clock window: adjacent windows cannot double-play a note. */
export function scoreEventsInWindow(track: MusicTrack, origin: number, from: number, until: number): ScheduledScoreEvent[] {
  if (![origin, from, until, track.bpm, track.beats].every(Number.isFinite) || until < from || track.bpm <= 0 || track.beats <= 0) throw new RangeError("Invalid score window");
  const result: ScheduledScoreEvent[] = [];
  if (until <= origin || until === from) return result;
  const beatSeconds = 60 / track.bpm;
  const loopSeconds = track.beats * beatSeconds;
  const firstLoop = Math.max(0, Math.floor((from - origin) / loopSeconds));
  const lastLoop = Math.max(0, Math.floor((until - origin) / loopSeconds));
  for (let loop = firstLoop; loop <= lastLoop; loop++) {
    const loopTime = origin + loop * loopSeconds;
    // Search a little before the boundary, then compare the actual audio time.
    // This avoids a floating-point division dropping a note exactly at `from`.
    const index = lowerBound(track.events, (from - loopTime) / beatSeconds - 1e-9);
    for (let i = index; i < track.events.length; i++) {
      const event = track.events[i];
      const time = loopTime + event.beat * beatSeconds;
      if (time >= until) break;
      if (time >= from) result.push({ event, loop, time, duration: event.duration * beatSeconds });
    }
  }
  return result;
}

type Session = { track: MusicTrack; key: string; gain: GainNode; origin: number; cursor: number; retireAt: number | null };
type Voice = { sources: AudioScheduledSourceNode[]; nodes: AudioNode[]; envelope: GainNode; session: Session | null; effect: boolean; disposed: boolean };
type DrivingVoice = {
  sources: [OscillatorNode, OscillatorNode, AudioBufferSourceNode]; nodes: AudioNode[];
  hum: GainNode; road: GainNode; filter: BiquadFilterNode; speed: number;
  lowLevel: GainNode; highLevel: GainNode; motorFilter: BiquadFilterNode;
  lastUpdate: number; releaseAt: number | null; disposed: boolean;
};

function ramp(param: AudioParam, value: number, now: number, seconds: number) {
  if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
  else {
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
  }
  param.linearRampToValueAtTime(value, now + seconds);
}

function toTier(value: number): Tier {
  return (Number.isFinite(value) ? Math.max(0, Math.min(2, Math.round(value))) : 0) as Tier;
}

class ScoutAudio {
  private status: AudioStatus = {
    started: false, muted: false, tier: 0, playing: false, supported: true, title: MUSIC_TRACKS[0].title, error: null,
    musicEnabled: true, soundEnabled: true, engineEnabled: true, suspended: false, radioEnabled: false, radioActive: false, radioStation: 0, radioTitle: "Station 01", inVehicle: false,
  };
  private listeners = new Set<(status: AudioStatus) => void>();
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sessions: Session[] = [];
  private voices = new Set<Voice>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;
  private visibilityInstalled = false;
  private focused = true;
  private lastEffect = new Map<SoundEffect, number>();
  private drivingSpeed = 0;
  private engineKind: EngineKind = "standard";
  private engine: DrivingVoice | null = null;
  private engines = new Set<DrivingVoice>();
  private radioTracks: Record<Tier, MusicTrack> | null = null;

  getStatus = (): AudioStatus => ({ ...this.status });

  subscribe = (listener: (status: AudioStatus) => void) => {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => { this.listeners.delete(listener); };
  };

  private publish() {
    this.status.playing = Boolean(this.context?.state === "running" && this.shouldPlay());
    const selected = this.desiredTrack();
    this.status.radioActive = this.status.playing && selected?.key.startsWith("radio:") === true;
    this.status.title = selected?.track.title ?? MUSIC_TRACKS[this.status.tier].title;
    this.status.radioTitle = this.radioTracks?.[this.status.radioStation].title ?? `Station 0${this.status.radioStation + 1}`;
    const status = this.getStatus();
    for (const listener of this.listeners) {
      try { listener(status); } catch { /* UI subscribers must not interrupt audio. */ }
    }
  }

  private shouldPlay() {
    return this.status.started && !this.status.muted && this.focused && (this.status.soundEnabled || (this.status.engineEnabled && this.status.inVehicle && !this.status.suspended) || this.desiredTrack() !== null) && (typeof document === "undefined" || document.visibilityState !== "hidden");
  }

  private desiredTrack(): { track: MusicTrack; key: string } | null {
    const selected = selectMusic(this.status, this.radioTracks !== null);
    if (!selected) return null;
    const track = selected.kind === "radio" ? this.radioTracks![selected.index] : MUSIC_TRACKS[selected.index];
    return { track, key: `${selected.kind}:${selected.index}` };
  }

  private synchronizePreferences() {
    const context = this.context;
    if (context && context.state !== "closed") {
      if (context.state !== "running" && this.sessions.find(session => session.retireAt === null)?.key !== this.desiredTrack()?.key) this.clearSessions();
      if (this.shouldPlay()) void this.resume();
      else this.pause();
    }
    this.publish();
  }

  /** Call directly from a click/tap handler so mobile browsers can unlock audio. */
  start = async (tier: number = this.status.tier): Promise<boolean> => {
    this.status.tier = toTier(tier);
    this.status.muted = false;
    this.status.error = null;
    if (typeof window === "undefined") return false;
    try {
      if (!this.context || this.context.state === "closed") this.createContext();
      this.status.started = true;
      this.installVisibility();
      await this.resume();
      return this.status.playing;
    } catch {
      this.status.error = this.status.supported ? "Open sound settings to try again." : "Audio is unavailable on this device.";
      this.publish();
      return false;
    }
  };

  setTier = (tier: number) => {
    const next = toTier(tier);
    if (next === this.status.tier) return;
    this.status.tier = next;
    this.synchronizePreferences();
  };

  setMuted = (muted: boolean) => {
    if (this.status.muted === muted) return;
    this.status.muted = muted;
    if (muted) this.pause();
    else if (this.status.started && this.context) void this.resume();
    this.publish();
  };

  /** Normalized vehicle speed; zero is silent. This never unlocks or creates audio. */
  setDriving = (speed: number) => {
    const normalized = drivingMix(speed, this.engineKind).speed;
    if (normalized === this.drivingSpeed) return;
    this.drivingSpeed = normalized;
    if (normalized === 0 || !this.engine) this.updateDriving();
  };

  setEngineKind = (kind: EngineKind | string) => {
    const next: EngineKind = kind === "coupe" || kind === "luxury" ? kind : "standard";
    if (next === this.engineKind) return;
    this.engineKind = next;
    if (this.engine) { this.engine.speed = -1; this.engine.lastUpdate = -Infinity; }
    this.updateDriving();
  };

  setMusicEnabled = (enabled: boolean) => {
    if (this.status.musicEnabled === enabled) return;
    this.status.musicEnabled = enabled;
    this.synchronizePreferences();
  };

  setSoundEnabled = (enabled: boolean) => {
    if (this.status.soundEnabled === enabled) return;
    this.status.soundEnabled = enabled;
    if (!enabled) this.releaseEffects(0.035);
    if (this.context && this.effects && this.context.state !== "closed") ramp(this.effects.gain, enabled ? EFFECT_LEVEL : 0, this.context.currentTime, 0.07);
    this.synchronizePreferences();
  };

  /** The motor has its own saved switch; UI cues remain independently audible. */
  setEngineEnabled = (enabled: boolean) => {
    if (this.status.engineEnabled === enabled) return;
    this.status.engineEnabled = enabled;
    if (!enabled) this.releaseEngine(0.06);
    this.synchronizePreferences();
  };

  /** Menus pause the vehicle and soften the score without changing any preference. */
  setSuspended = (suspended: boolean) => {
    if (this.status.suspended === suspended) return;
    this.status.suspended = suspended;
    if (suspended) this.releaseEngine(0.06);
    if (this.context && this.music && this.context.state !== "closed") {
      ramp(this.music.gain, MUSIC_LEVEL * (suspended ? MENU_MUSIC_LEVEL : 1), this.context.currentTime, 0.18);
    }
    this.synchronizePreferences();
  };

  setRadio = (enabled: boolean, station: number = this.status.radioStation) => {
    const normalized = toTier(station);
    if (this.status.radioEnabled === enabled && this.status.radioStation === normalized) return;
    this.status.radioEnabled = enabled;
    this.status.radioStation = normalized;
    this.synchronizePreferences();
  };

  setInVehicle = (inVehicle: boolean) => {
    if (this.status.inVehicle === inVehicle) return;
    this.status.inVehicle = inVehicle;
    if (!inVehicle) { this.drivingSpeed = 0; this.releaseEngine(0.06); }
    this.synchronizePreferences();
  };

  /** Register the composer's three original stations; registration cannot unlock audio. */
  setRadioTracks = (tracks: Record<Tier, MusicTrack>): boolean => {
    if ([0, 1, 2].some(index => !tracks[index as Tier] || validateMusicTrack(tracks[index as Tier]).length > 0)) return false;
    this.radioTracks = tracks;
    this.synchronizePreferences();
    return true;
  };

  stop = () => {
    this.status.started = false;
    this.revision++;
    this.stopTimer();
    this.cancelPause();
    if (this.visibilityInstalled && typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.visibilityInstalled && typeof window !== "undefined") {
      window.removeEventListener("blur", this.onBlur);
      window.removeEventListener("focus", this.onFocus);
    }
    this.visibilityInstalled = false;
    this.focused = true;
    const context = this.context;
    const master = this.master;
    const sessions = [...this.sessions];
    const voices = [...this.voices];
    const engines = [...this.engines];
    for (const voice of voices) this.voices.delete(voice);
    this.engines.clear();
    this.engine = null;
    this.drivingSpeed = 0;
    this.context = null;
    this.master = null;
    this.music = null;
    this.effects = null;
    this.noise = null;
    this.sessions = [];
    this.lastEffect.clear();
    if (context) {
      context.onstatechange = null;
      if (master) ramp(master.gain, 0, context.currentTime, 0.035);
      setTimeout(() => {
        for (const voice of voices) this.disposeVoice(voice, true);
        for (const engine of engines) this.disposeEngine(engine);
        for (const session of sessions) session.gain.disconnect();
        void context.close().catch(() => {});
      }, context.state === "running" ? 50 : 0);
    }
    this.publish();
  };

  private createContext() {
    const AudioConstructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioConstructor) {
      this.status.supported = false;
      throw new Error("AudioContext unavailable");
    }
    const context = new AudioConstructor({ latencyHint: "interactive" });
    this.context = context;
    this.status.supported = true;
    const master = context.createGain();
    master.gain.value = 0;
    const music = context.createGain();
    music.gain.value = MUSIC_LEVEL * (this.status.suspended ? MENU_MUSIC_LEVEL : 1);
    const effects = context.createGain();
    effects.gain.value = this.status.soundEnabled ? EFFECT_LEVEL : 0;
    const soften = context.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 6200;
    soften.Q.value = 0.4;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.18;
    music.connect(master);
    effects.connect(master);
    master.connect(soften);
    soften.connect(compressor);
    compressor.connect(context.destination);
    this.master = master;
    this.music = music;
    this.effects = effects;
    // One reusable noise buffer serves every drum. No downloads or live randomness.
    this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const noiseData = this.noise.getChannelData(0);
    let seed = 0x5c017;
    for (let i = 0; i < noiseData.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      noiseData[i] = seed / 2147483648 - 1;
    }
    context.onstatechange = () => {
      if (this.context !== context) return;
      if (context.state !== "running") {
        this.stopTimer();
        this.clearEngines();
        if (this.sessions.find(session => session.retireAt === null)?.key !== this.desiredTrack()?.key) this.clearSessions();
      }
      else {
        if (this.shouldPlay()) {
          // Mobile Safari can recover from an interruption without our resume call.
          this.tick();
          if (this.timer === null) this.timer = setInterval(() => this.tick(), POLL_MS);
        } else this.pause();
      }
      this.publish();
    };
  }

  private installVisibility() {
    if (!this.visibilityInstalled && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
      window.addEventListener("blur", this.onBlur);
      window.addEventListener("focus", this.onFocus);
      this.visibilityInstalled = true;
    }
  }

  private onVisibility = () => {
    if (!this.shouldPlay()) this.pause();
    else if (this.context) void this.resume();
  };

  private onBlur = () => {
    this.focused = false;
    this.pause();
  };

  private onFocus = () => {
    this.focused = true;
    if (this.shouldPlay() && this.context) void this.resume();
  };

  private cancelPause() {
    if (this.pauseTimer !== null) clearTimeout(this.pauseTimer);
    this.pauseTimer = null;
  }

  private pause() {
    const context = this.context;
    const revision = ++this.revision;
    this.stopTimer();
    this.cancelPause();
    this.releaseEngine(0.035);
    this.releaseEffects(0.035);
    if (context && this.master && context.state !== "closed") {
      ramp(this.master.gain, 0, context.currentTime, 0.04);
      this.pauseTimer = setTimeout(() => {
        this.pauseTimer = null;
        if (this.context === context && this.revision === revision && !this.shouldPlay()) void context.suspend().catch(() => {});
      }, 60);
    }
    this.publish();
  }

  private async resume() {
    const context = this.context;
    if (!context || context.state === "closed") return;
    const revision = ++this.revision;
    this.cancelPause();
    try {
      // Called before the first await, preserving a click's activation on Safari.
      await context.resume();
      if (this.context !== context || this.revision !== revision) return;
      if (!this.shouldPlay()) { this.pause(); return; }
      if (context.state !== "running") {
        this.status.error = "Open sound settings to resume audio.";
        this.publish();
        return;
      }
      if (this.sessions.find(session => session.retireAt === null)?.key !== this.desiredTrack()?.key) this.changeTrack();
      if (this.master) ramp(this.master.gain, 1, context.currentTime, 0.14);
      this.status.error = null;
      this.tick();
      if (this.timer === null) this.timer = setInterval(() => this.tick(), POLL_MS);
    } catch {
      this.status.error = "Open sound settings to resume audio.";
    }
    this.publish();
  }

  private stopTimer() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private clearSessions() {
    for (const voice of [...this.voices]) if (voice.session) this.disposeVoice(voice, true);
    for (const session of this.sessions) session.gain.disconnect();
    this.sessions = [];
  }

  private changeTrack() {
    const context = this.context;
    if (!context || !this.music) return;
    const selected = this.desiredTrack();
    if (selected && validateMusicTrack(selected.track).length) {
      this.status.error = "This soundtrack could not be loaded.";
      return;
    }
    const now = context.currentTime;
    const radioTransition = selected?.key.startsWith("radio:") || this.sessions.some(session => session.key.startsWith("radio:"));
    for (const session of this.sessions) {
      const fade = session.retireAt === null ? selected === null ? 0.22 : radioTransition ? 0.45 : 1.1 : 0.12;
      session.retireAt = Math.min(session.retireAt ?? Infinity, now + fade);
      ramp(session.gain.gain, 0, now, fade);
    }
    // Repeated chapter changes cannot leave an unbounded set of old buses alive.
    while (this.sessions.length > 2) {
      const oldest = this.sessions.shift()!;
      for (const voice of [...this.voices]) if (voice.session === oldest) this.disposeVoice(voice, true);
      oldest.gain.disconnect();
    }
    if (!selected) return;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.music);
    const origin = now + 0.055;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, origin + (radioTransition ? 0.6 : 1.2));
    this.sessions.push({ track: selected.track, key: selected.key, gain, origin, cursor: origin, retireAt: null });
    this.tick();
  }

  private createEngine(mix: DrivingMix) {
    const context = this.context;
    if (!context || !this.master || !this.noise) return null;
    while (this.engines.size >= AUDIO_LIMITS.drivingVoices) {
      const oldest = this.engines.values().next().value;
      if (!oldest) break;
      this.disposeEngine(oldest);
    }
    const hum = context.createGain();
    const road = context.createGain();
    hum.gain.value = 0;
    road.gain.value = 0;
    const motorFilter = context.createBiquadFilter();
    motorFilter.type = "lowpass";
    motorFilter.frequency.value = mix.motorCutoffHz;
    motorFilter.Q.value = 0.55;
    hum.connect(motorFilter);
    motorFilter.connect(this.master);
    road.connect(this.master);
    const fundamental = context.createOscillator();
    const harmonic = context.createOscillator();
    fundamental.type = "sine";
    harmonic.type = "triangle";
    fundamental.frequency.value = mix.fundamentalHz;
    harmonic.frequency.value = mix.harmonicHz;
    harmonic.detune.value = -2;
    const lowLevel = context.createGain();
    const highLevel = context.createGain();
    lowLevel.gain.value = mix.fundamentalLevel;
    highLevel.gain.value = mix.harmonicLevel;
    fundamental.connect(lowLevel);
    harmonic.connect(highLevel);
    lowLevel.connect(hum);
    highLevel.connect(hum);
    const noise = context.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = mix.roadCutoffHz;
    filter.Q.value = 0.5;
    noise.connect(filter);
    filter.connect(road);
    const voice: DrivingVoice = {
      sources: [fundamental, harmonic, noise],
      nodes: [fundamental, harmonic, noise, hum, road, lowLevel, highLevel, filter, motorFilter],
      hum, road, filter, lowLevel, highLevel, motorFilter, speed: -1, lastUpdate: -Infinity, releaseAt: null, disposed: false,
    };
    let remaining = voice.sources.length;
    for (const source of voice.sources) {
      source.onended = () => { if (--remaining === 0) this.disposeEngine(voice); };
      source.start(context.currentTime + 0.005);
    }
    this.engines.add(voice);
    this.engine = voice;
    return voice;
  }

  private disposeEngine(voice: DrivingVoice) {
    if (voice.disposed) return;
    voice.disposed = true;
    for (const source of voice.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* An ended engine source needs no further stop. */ }
    }
    for (const node of voice.nodes) node.disconnect();
    this.engines.delete(voice);
    if (this.engine === voice) this.engine = null;
  }

  private clearEngines() {
    for (const voice of [...this.engines]) this.disposeEngine(voice);
  }

  private releaseEngine(seconds: number) {
    const voice = this.engine;
    const context = this.context;
    if (!voice || !context) return;
    this.engine = null;
    if (context.state !== "running") { this.disposeEngine(voice); return; }
    const now = context.currentTime;
    ramp(voice.hum.gain, 0, now, seconds);
    ramp(voice.road.gain, 0, now, seconds);
    // Audio-clock stops still work when a hidden tab throttles JavaScript timers.
    for (const source of voice.sources) source.stop(now + seconds + 0.006);
  }

  private updateDriving() {
    const context = this.context;
    if (!context || context.state !== "running" || !this.shouldPlay()) return;
    if (!this.status.engineEnabled || !this.status.inVehicle || this.status.suspended) { this.releaseEngine(0.035); return; }
    const now = context.currentTime;
    if (this.drivingSpeed === 0) {
      const voice = this.engine;
      if (!voice) return;
      if (voice.releaseAt === null) {
        ramp(voice.hum.gain, 0, now, 0.12);
        ramp(voice.road.gain, 0, now, 0.09);
        voice.releaseAt = now + 0.16;
      } else if (now >= voice.releaseAt) this.disposeEngine(voice);
      return;
    }
    const mix = drivingMix(this.drivingSpeed, this.engineKind);
    const voice = this.engine ?? this.createEngine(mix);
    if (!voice) return;
    if (voice.releaseAt !== null) { voice.releaseAt = null; voice.speed = -1; }
    if (voice.speed >= 0 && (now - voice.lastUpdate < 0.045 || Math.abs(voice.speed - mix.speed) < 0.001)) return;
    // Reuse three sources; no new oscillators or unbounded automation per frame.
    ramp(voice.sources[0].frequency, mix.fundamentalHz, now, 0.13);
    ramp(voice.sources[1].frequency, mix.harmonicHz, now, 0.13);
    ramp(voice.hum.gain, mix.humGain, now, 0.11);
    ramp(voice.road.gain, mix.roadGain, now, 0.11);
    ramp(voice.filter.frequency, mix.roadCutoffHz, now, 0.13);
    ramp(voice.motorFilter.frequency, mix.motorCutoffHz, now, 0.13);
    ramp(voice.lowLevel.gain, mix.fundamentalLevel, now, 0.13);
    ramp(voice.highLevel.gain, mix.harmonicLevel, now, 0.13);
    voice.speed = mix.speed;
    voice.lastUpdate = now;
  }

  private tick = () => {
    const context = this.context;
    if (!context || context.state !== "running" || !this.shouldPlay()) return;
    const now = context.currentTime;
    this.updateDriving();
    for (const session of [...this.sessions]) {
      if (session.retireAt !== null && now >= session.retireAt + 0.02) {
        for (const voice of [...this.voices]) if (voice.session === session) this.disposeVoice(voice, true);
        session.gain.disconnect();
        this.sessions = this.sessions.filter(item => item !== session);
        continue;
      }
      const from = Math.max(session.cursor, now + 0.004);
      const until = Math.min(now + LOOKAHEAD, session.retireAt ?? Infinity);
      if (until <= from) continue;
      for (const scheduled of scoreEventsInWindow(session.track, session.origin, from, until)) {
        this.synthesize(scheduled.event, session.gain, scheduled.time, scheduled.duration, session, false);
      }
      session.cursor = until;
    }
  };

  private releaseEffects(seconds: number) {
    const context = this.context;
    if (!context) return;
    for (const voice of [...this.voices]) {
      if (!voice.effect) continue;
      if (context.state !== "running") this.disposeVoice(voice, true);
      else {
        ramp(voice.envelope.gain, 0, context.currentTime, seconds);
        for (const source of voice.sources) source.stop(context.currentTime + seconds + 0.006);
      }
    }
  }

  private disposeVoice(voice: Voice, stop = false) {
    if (voice.disposed) return;
    voice.disposed = true;
    for (const source of voice.sources) {
      source.onended = null;
      if (stop) { try { source.stop(); } catch { /* A naturally ended source is already stopped. */ } }
    }
    for (const node of voice.nodes) node.disconnect();
    this.voices.delete(voice);
  }

  private synthesize(event: ScoreEvent, output: AudioNode, start: number, duration: number, session: Session | null, effect: boolean) {
    const context = this.context;
    if (!context || !this.noise || this.voices.size >= AUDIO_LIMITS.musicVoices + AUDIO_LIMITS.effectVoices) return;
    if (effect && [...this.voices].filter(voice => voice.effect).length >= AUDIO_LIMITS.effectVoices) return;
    if (!effect && [...this.voices].filter(voice => !voice.effect).length >= AUDIO_LIMITS.musicVoices) return;
    const envelope = context.createGain();
    const voice: Voice = { sources: [], nodes: [envelope], envelope, session, effect, disposed: false };
    const pan = Math.max(-1, Math.min(1, event.pan ?? 0));
    if (pan !== 0 && typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      envelope.connect(panner);
      panner.connect(output);
      voice.nodes.push(panner);
    } else envelope.connect(output);
    const frequency = midiToFrequency(event.midi, event.detune ?? 0);
    const oscillator = (type: OscillatorType, ratio: number, level: number, detune = 0) => {
      const source = context.createOscillator();
      source.type = type;
      source.frequency.setValueAtTime(frequency * ratio, start);
      source.detune.value = detune;
      const levelNode = context.createGain();
      levelNode.gain.value = level;
      source.connect(levelNode);
      levelNode.connect(envelope);
      voice.sources.push(source);
      voice.nodes.push(source, levelNode);
      return source;
    };
    const noise = (type: BiquadFilterType, cutoff: number, level: number) => {
      const source = context.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = cutoff;
      filter.Q.value = 0.65;
      const levelNode = context.createGain();
      levelNode.gain.value = level;
      source.connect(filter);
      filter.connect(levelNode);
      levelNode.connect(envelope);
      voice.sources.push(source);
      voice.nodes.push(source, filter, levelNode);
    };
    let attack = 0.007;
    let release = 0.12;
    let body = Math.max(0.025, duration);
    let sustain = 0.48;
    switch (event.instrument) {
      case "pluck": oscillator("triangle", 1, 0.78); oscillator("square", 1, 0.1); release = 0.14; sustain = 0.3; break;
      case "bell": oscillator("sine", 1, 0.83); oscillator("sine", 2, 0.17, 3); release = 0.65; sustain = 0.32; break;
      case "pad": oscillator("sine", 1, 0.65, -3); oscillator("triangle", 1, 0.23, 3); attack = Math.min(0.18, body * 0.25); release = 0.55; sustain = 0.72; break;
      case "bass": oscillator("triangle", 1, 0.85); attack = 0.009; release = 0.1; sustain = 0.65; break;
      case "kick": {
        const source = oscillator("sine", 1, 0.9);
        source.frequency.setValueAtTime(130, start);
        source.frequency.exponentialRampToValueAtTime(42, start + 0.09);
        attack = 0.004; body = 0.06; release = 0.09; sustain = 0.45; break;
      }
      case "snare": noise("bandpass", 1600, 0.65); oscillator("triangle", 1, 0.1); attack = 0.004; body = 0.045; release = 0.085; sustain = 0.28; break;
      case "hat": noise("highpass", 5600, 0.5); attack = 0.003; body = 0.015; release = event.midi === 46 ? 0.11 : 0.04; sustain = 0.2; break;
    }
    const peak = Math.max(EPSILON, Math.min(0.2, event.gain));
    const hold = start + Math.max(attack + 0.012, body);
    const end = hold + release;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + attack);
    envelope.gain.exponentialRampToValueAtTime(Math.max(EPSILON, peak * sustain), hold);
    envelope.gain.exponentialRampToValueAtTime(EPSILON, end - 0.005);
    envelope.gain.linearRampToValueAtTime(0, end);
    let remaining = voice.sources.length;
    for (const source of voice.sources) {
      source.onended = () => { if (--remaining === 0) this.disposeVoice(voice); };
      source.start(start);
      source.stop(end + 0.01);
    }
    this.voices.add(voice);
  }

  sfx = (kind: SoundEffect) => {
    const context = this.context;
    const output = this.effects;
    if (!context || !output || !this.status.soundEnabled || !this.shouldPlay()) return;
    if (context.state !== "running") { void this.resume(); return; }
    const now = context.currentTime;
    if (this.status.suspended && ["step", "bump", "lowFuel"].includes(kind)) return;
    const cooldown = kind === "lowFuel" ? 5 : kind === "bump" ? 0.45 : kind === "step" ? 0.095 : kind === "interact" ? 0.045 : ["arrival", "phone", "wake", "luxury"].includes(kind) ? 0.8 : ["enterCar", "exitCar", "paint", "refuel"].includes(kind) ? 0.35 : 0.18;
    if (now - (this.lastEffect.get(kind) ?? -Infinity) < cooldown) return;
    this.lastEffect.set(kind, now);
    for (const note of soundEffectPlan(kind, this.status.tier)) {
      this.synthesize({ beat: 0, midi: note.midi, duration: note.duration, gain: note.gain, instrument: note.instrument, pan: note.pan }, output, now + 0.006 + note.offset, note.duration, null, true);
    }
  };
}

// Importing from a server component is safe: browser objects are only touched in start().
export const scoutAudio = new ScoutAudio();
