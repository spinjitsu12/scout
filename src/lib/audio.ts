import { type Instrument, type MusicTrack, type ScoreEvent } from "./music-score";
import { AUDIO_CREDITS } from "./audio-credits";
import { AUDIO_REGIONS, FOOTSTEP_SURFACES, ambienceMotion, footstepSurface, sceneMusicPlaylist, sceneTrackAt, scoreBreathingSeconds, soundscapeMix, type SceneAudioEnvironment } from "./audio-scene.ts";
import type { Tier } from "./game";
export type AudioVolumes = {
    master: number;
    music: number;
    ambient: number;
    effects: number;
    engine: number;
};
export const DEFAULT_AUDIO_VOLUMES: AudioVolumes = { master: .8, music: .38, ambient: .6, effects: .7, engine: .35 };
export type AudioEnvironment = SceneAudioEnvironment;
export type VehicleAudioTelemetry = { normalizedSpeed: number; normalizedEngine?: number; engineLoad?: number; gearNumber?: number; engineRpm?: number; engineRunning?: boolean };
export function engineMix(telemetry: VehicleAudioTelemetry, kind: EngineKind = "standard") {
    const unit = (value: number | undefined, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, Math.abs(value))) : fallback;
    const speed = unit(telemetry.normalizedSpeed, 0);
    const engine = unit(telemetry.normalizedEngine, 0.08 + speed * 0.45);
    const load = unit(telemetry.engineLoad, 0.12 + speed * 0.35);
    const running = telemetry.engineRunning !== false && telemetry.engineRpm !== 0;
    const cabin = kind === "luxury" ? 0.65 : kind === "coupe" ? 1.12 : 1;
    return {
        speed, engine, load, running,
        frequency: 24 + engine * 82,
        cutoff: 190 + engine * 450 + load * 100,
        humGain: running ? (0.013 + engine * 0.023 + load * 0.016) * cabin : 0,
        roadGain: speed * speed * 0.067 * cabin,
        roadCutoff: 420 + speed * 1500,
        textureRate: 0.7 + engine * 0.95,
    };
}
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
    volumes: AudioVolumes;
    environment: AudioEnvironment;
    artist: string;
    loading: boolean;
};
export type ScheduledScoreEvent = {
    event: ScoreEvent;
    loop: number;
    time: number;
    duration: number;
};
export type EffectNote = {
    midi: number;
    offset: number;
    duration: number;
    gain: number;
    instrument: Instrument;
    pan: number;
};
export type DrivingMix = {
    speed: number;
    fundamentalHz: number;
    harmonicHz: number;
    humGain: number;
    roadGain: number;
    roadCutoffHz: number;
    fundamentalLevel: number;
    harmonicLevel: number;
    motorCutoffHz: number;
};
export type MusicSelection = {
    kind: "score" | "radio";
    index: Tier;
} | null;
export function selectMusic(preferences: Pick<AudioStatus, "musicEnabled" | "radioEnabled" | "inVehicle" | "radioStation" | "tier">, radioReady: boolean): MusicSelection {
    if (preferences.radioEnabled && preferences.inVehicle && radioReady)
        return { kind: "radio", index: preferences.radioStation };
    if (preferences.musicEnabled)
        return { kind: "score", index: preferences.tier };
    return null;
}
const INSTRUMENTS: readonly Instrument[] = ["pluck", "bell", "pad", "bass", "kick", "snare", "hat"];
const MUSIC_LEVEL = 0.38;
const EFFECT_LEVEL = 0.4;
export const AUDIO_LIMITS = { musicVoices: 2, effectVoices: 12, drivingSources: 4, drivingVoices: 1, ambientSources: 3, policeSources: 2, policeVoices: 1, musicLevel: MUSIC_LEVEL, effectLevel: EFFECT_LEVEL } as const;
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
    if (!track.title.trim())
        errors.push("Missing title");
    if (!Number.isFinite(track.bpm) || track.bpm < 40 || track.bpm > 220)
        errors.push("Invalid tempo");
    if (![0, 1, 2].includes(track.tier))
        errors.push("Invalid tier");
    if (track.bars < 16 || track.bars > 32 || track.beatsPerBar !== 4 || track.beats !== track.bars * track.beatsPerBar)
        errors.push("Invalid loop length");
    if (!track.events.length || track.events.length > 4096)
        errors.push("Invalid event count");
    let previousBeat = -Infinity;
    track.events.forEach((event, index) => {
        const prefix = `Event ${index}`;
        if (!Number.isFinite(event.beat) || event.beat < 0 || event.beat >= track.beats)
            errors.push(`${prefix}: outside loop`);
        if (event.beat < previousBeat)
            errors.push(`${prefix}: unsorted`);
        if (Math.abs(event.beat * 4 - Math.round(event.beat * 4)) > 1e-7)
            errors.push(`${prefix}: off rhythm grid`);
        if (!Number.isFinite(event.duration) || event.duration <= 0 || event.duration > 16)
            errors.push(`${prefix}: invalid duration`);
        if (!Number.isFinite(event.midi) || event.midi < 0 || event.midi > 127)
            errors.push(`${prefix}: invalid pitch`);
        if (!Number.isFinite(event.gain) || event.gain <= 0 || event.gain > 0.25)
            errors.push(`${prefix}: invalid gain`);
        if (!INSTRUMENTS.includes(event.instrument))
            errors.push(`${prefix}: unknown instrument`);
        if (event.pan !== undefined && (!Number.isFinite(event.pan) || Math.abs(event.pan) > 1))
            errors.push(`${prefix}: invalid pan`);
        if (event.detune !== undefined && (!Number.isFinite(event.detune) || Math.abs(event.detune) > 100))
            errors.push(`${prefix}: invalid detune`);
        previousBeat = event.beat;
    });
    return errors;
}
function lowerBound(events: readonly ScoreEvent[], beat: number) {
    let low = 0;
    let high = events.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (events[middle].beat < beat)
            low = middle + 1;
        else
            high = middle;
    }
    return low;
}
/** A half-open audio-clock window: adjacent windows cannot double-play a note. */
export function scoreEventsInWindow(track: MusicTrack, origin: number, from: number, until: number): ScheduledScoreEvent[] {
    if (![origin, from, until, track.bpm, track.beats].every(Number.isFinite) || until < from || track.bpm <= 0 || track.beats <= 0)
        throw new RangeError("Invalid score window");
    const result: ScheduledScoreEvent[] = [];
    if (until <= origin || until === from)
        return result;
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
            if (time >= until)
                break;
            if (time >= from)
                result.push({ event, loop, time, duration: event.duration * beatSeconds });
        }
    }
    return result;
}
export type RecordedTrack = {
    id: string;
    title: string;
    artist: string;
    file: string;
    source: string;
    license: string;
    licenseUrl: string;
};
export const RECORDED_TRACKS: readonly RecordedTrack[] = AUDIO_CREDITS.filter(c => c.artist === "Scott Buckley").map(c => {
    const id = c.source.split("/").filter(Boolean).at(-1)!;
    return { id, title: c.title, artist: c.artist, file: "audio/music/" + id + ".mp3", source: c.source, license: c.license, licenseUrl: c.licenseUrl };
});
export const SCORE_PLAYLISTS: Record<Tier, readonly string[]> = {
    0: ["simplicity", "effervescence", "chasing-daylight"],
    1: ["chasing-daylight", "golden-hour", "simplicity"],
    2: ["the-long-dark", "at-the-end-of-all-things", "effervescence"],
};
export const RADIO_PLAYLISTS: Record<Tier, readonly string[]> = {
    0: ["simplicity", "effervescence", "golden-hour"],
    1: ["golden-hour", "chasing-daylight", "simplicity"],
    2: ["at-the-end-of-all-things", "the-long-dark", "chasing-daylight"],
};
export const RADIO_STATION_NAMES = ["GOLD FM", "ASTER WAVES", "MIDNIGHT SIGNAL"] as const;
export const FOLEY_FILES: readonly string[] = [
    ...["carpet", "concrete", "grass", "wood"].flatMap(surface => [0, 1, 2, 3].map(i => "audio/foley/footstep_" + surface + "_00" + i + ".ogg")),
    ...["doorClose_1", "doorClose_2", "doorOpen_1", "cloth1", "cloth2", "metalLatch", "bookFlip1", "bookClose", "beltHandle1", "click_001", "switch_001", "impactSoft_medium_000", "phone-vibration", "park-birds"].map(name => "audio/foley/" + name + ".ogg"),
];
export function normalizeVolumes(values: Partial<AudioVolumes> & {
    sfx?: number;
}, previous: AudioVolumes = DEFAULT_AUDIO_VOLUMES): AudioVolumes {
    const next = { ...previous };
    for (const key of ["master", "music", "ambient", "effects", "engine"] as const) {
        const v = key === "effects" ? values.effects ?? values.sfx : values[key];
        if (typeof v === "number" && Number.isFinite(v))
            next[key] = Math.max(0, Math.min(1, v));
    }
    return next;
}
/** Recordings resolve beside the packaged index.html, including Electron file:// mode. */
export function audioAssetUrl(relative: string, baseUrl = "./", documentUrl?: string): string {
    if (!/^audio\/(?:music|foley)\//.test(relative) || relative.includes("..") || relative.includes("\\"))
        throw new Error("Invalid local audio path");
    return documentUrl ? new URL(relative, new URL(baseUrl, documentUrl)).href : baseUrl + relative;
}
export function ambientMix(environment: AudioEnvironment, inVehicle = false): {
    wind: number;
    cutoff: number;
    room: number;
} {
    const { wind, cutoff, room } = soundscapeMix(environment, inVehicle);
    return { wind, cutoff, room };
}
type RecordingSession = {
    key: string;
    playlistKey: string;
    kind: "score" | "radio";
    track: RecordedTrack;
    element: HTMLAudioElement;
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    retireAt: number | null;
    disposed: boolean;
};
type SampleVoice = {
    source: AudioBufferSourceNode;
    gain: GainNode;
    pan: StereoPannerNode | null;
    disposed: boolean;
};
type TextureVoice = {
    sources: AudioScheduledSourceNode[];
    nodes: AudioNode[];
    gain: GainNode;
    filter: BiquadFilterNode;
    secondaryGain?: GainNode;
    secondaryFilter?: BiquadFilterNode;
    low?: OscillatorNode;
    high?: OscillatorNode;
    birdGain?: GainNode;
    birdSource?: AudioBufferSourceNode;
    birdEndsAt?: number;
    trafficGain?: GainNode;
    trafficFilter?: BiquadFilterNode;
    trafficPan?: StereoPannerNode;
    combustion?: AudioBufferSourceNode;
    disposed: boolean;
};
type PoliceVoice = TextureVoice & { retireAt: number | null };
function ramp(param: AudioParam, value: number, now: number, seconds: number) {
    if (typeof param.cancelAndHoldAtTime === "function")
        param.cancelAndHoldAtTime(now);
    else {
        const value = param.value;
        param.cancelScheduledValues(now);
        param.setValueAtTime(value, now);
    }
    param.linearRampToValueAtTime(value, now + Math.max(.01, seconds));
}
function toTier(value: number): Tier { return (Number.isFinite(value) ? Math.max(0, Math.min(2, Math.round(value))) : 0) as Tier; }
export class ScoutAudio {
    private status: AudioStatus = {
        started: false, muted: false, tier: 0, playing: false, supported: true, title: RECORDED_TRACKS[0].title, artist: "Scott Buckley", error: null, loading: false,
        musicEnabled: true, soundEnabled: true, engineEnabled: true, suspended: false, radioEnabled: false, radioActive: false, radioStation: 0, radioTitle: RADIO_STATION_NAMES[0], inVehicle: false,
        volumes: { ...DEFAULT_AUDIO_VOLUMES }, environment: { scene: "menu", timeOfDay: 9, weather: "clear", conversation: false },
    };
    private listeners = new Set<(status: AudioStatus) => void>();
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private music: GainNode | null = null;
    private effects: GainNode | null = null;
    private ambient: GainNode | null = null;
    private engineBus: GainNode | null = null;
    private noise: AudioBuffer | null = null;
    private motorNoise: AudioBuffer | null = null;
    private recordings: RecordingSession[] = [];
    private effectsPlaying = new Set<SampleVoice>();
    private engine: TextureVoice | null = null;
    private weather: TextureVoice | null = null;
    private police: PoliceVoice | null = null;
    private policeRequested = false;
    private policeProximity = 1;
    private policeDirty = true;
    private sampleBuffers = new Map<string, AudioBuffer>();
    private pendingSamples = new Map<string, Promise<AudioBuffer | null>>();
    private samplesPreloaded = false;
    private playlistPositions = new Map<string, number>();
    private lastScoreTrack: string | null = null;
    private nextScoreAt = 0;
    private nextBirdAt = 0;
    private ambientTime = 0;
    private timer: ReturnType<typeof setInterval> | null = null;
    private pauseTimer: ReturnType<typeof setTimeout> | null = null;
    private revision = 0;
    private visibilityInstalled = false;
    private focused = true;
    private lastEffect = new Map<SoundEffect, number>();
    private drivingSpeed = 0;
    private engineLevel: number | undefined;
    private engineLoad: number | undefined;
    private engineRunning = true;
    private engineKind: EngineKind = "standard";
    private footstepIndex = 0;
    private ambientDirty = true;
    private engineDirty = true;
    getStatus = (): AudioStatus => ({ ...this.status, volumes: { ...this.status.volumes }, environment: { ...this.status.environment } });
    getDiagnostics = () => ({
        contextState: this.context?.state ?? "closed", recordings: this.recordings.filter(s => !s.disposed).length, effects: this.effectsPlaying.size,
        engine: this.engine ? 1 : 0, ambience: this.weather ? 1 : 0, decodedSamples: this.sampleBuffers.size, activeTrack: this.recordings.find(s => s.retireAt === null)?.track.id ?? null,
    });
    subscribe = (listener: (status: AudioStatus) => void) => {
        this.listeners.add(listener);
        try {
            listener(this.getStatus());
        }
        catch { /* A UI subscriber cannot interrupt audio. */ }
        return () => { this.listeners.delete(listener); };
    };
    private publish() {
        this.status.playing = Boolean(this.context?.state === "running" && this.shouldPlay());
        const current = this.recordings.find(s => s.retireAt === null), track = current?.track ?? this.desiredTrack()?.track;
        this.status.radioActive = this.status.playing && current?.kind === "radio";
        this.status.title = track?.title ?? RECORDED_TRACKS[0].title;
        this.status.artist = track?.artist ?? "Scott Buckley";
        this.status.radioTitle = RADIO_STATION_NAMES[this.status.radioStation];
        const state = this.getStatus();
        for (const listener of this.listeners)
            try {
                listener(state);
            }
            catch { /* UI isolation. */ }
    }
    private shouldPlay() {
        return this.status.started && !this.status.muted && !this.status.suspended && this.status.volumes.master > 0 && this.focused &&
            (typeof document === "undefined" || document.visibilityState !== "hidden") &&
            (this.desiredTrack() !== null && this.status.volumes.music > 0 || this.status.volumes.ambient > 0 ||
                this.status.soundEnabled && this.status.volumes.effects > 0 || this.status.engineEnabled && this.status.volumes.engine > 0);
    }
    private desiredTrack(): {
        track: RecordedTrack;
        kind: "score" | "radio";
        key: string;
        playlistKey: string;
    } | null {
        const selection = selectMusic(this.status, true);
        if (!selection)
            return null;
        const scene = sceneMusicPlaylist(this.status.environment, selection.index);
        const key = selection.kind === "radio" ? "radio:" + selection.index : "score:" + scene.key;
        const playlist = selection.kind === "radio" ? RADIO_PLAYLISTS[selection.index] : scene.tracks;
        const id = sceneTrackAt(playlist, this.playlistPositions.get(key) ?? 0, selection.kind === "score" ? this.lastScoreTrack : null);
        return { track: RECORDED_TRACKS.find(t => t.id === id)!, kind: selection.kind, playlistKey: key, key: key + ":" + id };
    }
    private synchronize() {
        this.updateBuses();
        if (this.status.volumes.music === 0)
            for (const session of this.recordings) session.element.pause();
        this.ambientDirty = true;
        this.engineDirty = true;
        this.policeDirty = true;
        if (this.context && this.context.state !== "closed") {
            if (this.shouldPlay()) {
                if (this.context.state === "running") {
                    this.changeTrack();
                    this.tick();
                }
                else
                    void this.resume();
            }
            else
                this.pause();
        }
        this.publish();
    }
    /** Called directly from player input; configuration and imports never unlock sound. */
    start = async (tier: number = this.status.tier): Promise<boolean> => {
        this.status.tier = toTier(tier);
        this.status.muted = false;
        this.status.error = null;
        if (typeof window === "undefined")
            return false;
        try {
            if (!this.context || this.context.state === "closed")
                this.createContext();
            this.status.started = true;
            this.installVisibility();
            const promise = this.resume();
            this.changeTrack();
            await promise;
            return this.status.playing;
        }
        catch {
            this.status.error = this.status.supported ? "Open sound settings to try again." : "Audio is unavailable on this device.";
            this.publish();
            return false;
        }
    };
    setTier = (value: number) => { const next = toTier(value); if (next === this.status.tier)
        return; this.status.tier = next; this.synchronize(); };
    setVolumes = (values: Partial<AudioVolumes> & {
        sfx?: number;
    }) => {
        const next = normalizeVolumes(values, this.status.volumes);
        if (Object.keys(next).every(k => next[k as keyof AudioVolumes] === this.status.volumes[k as keyof AudioVolumes]))
            return;
        this.status.volumes = next;
        this.synchronize();
    };
    setEnvironment = (values: AudioEnvironment) => {
        const next = { ...this.status.environment };
        if (["apartment", "outdoors", "interior", "vehicle", "menu"].includes(values.scene ?? "")) {
            next.scene = values.scene;
            if (typeof values.interior !== "boolean")
                next.interior = values.scene === "apartment" || values.scene === "interior";
            if (!values.surface && values.scene !== this.status.environment.scene)
                delete next.surface;
        }
        if (typeof values.timeOfDay === "number" && Number.isFinite(values.timeOfDay))
            next.timeOfDay = Math.floor((((values.timeOfDay % 24) + 24) % 24) * 10) / 10;
        if (values.weather === "clear" || values.weather === "rain")
            next.weather = values.weather;
        if (values.region && AUDIO_REGIONS.includes(values.region))
            next.region = values.region;
        if (values.surface && FOOTSTEP_SURFACES.includes(values.surface))
            next.surface = values.surface;
        if (typeof values.interior === "boolean")
            next.interior = values.interior;
        if (typeof values.conversation === "boolean")
            next.conversation = values.conversation;
        if (JSON.stringify(next) === JSON.stringify(this.status.environment))
            return;
        this.status.environment = next;
        this.updateBuses();
        this.ambientDirty = true;
        this.publish();
    };
    setMuted = (value: boolean) => { if (this.status.muted === value)
        return; this.status.muted = value; this.synchronize(); };
    setDriving = (value: number) => { const next = Number.isFinite(value) ? Math.max(0, Math.min(1, Math.abs(value))) : 0; if (Math.abs(next - this.drivingSpeed) < .005)
        return; this.drivingSpeed = next; this.engineLevel = undefined; this.engineLoad = undefined; this.engineDirty = true; };
    setVehicleTelemetry = (telemetry: VehicleAudioTelemetry) => {
        const mix = engineMix(telemetry, this.engineKind);
        if (Math.abs(mix.speed - this.drivingSpeed) < 0.005 && Math.abs(mix.engine - (this.engineLevel ?? -1)) < 0.005 && Math.abs(mix.load - (this.engineLoad ?? -1)) < 0.01 && mix.running === this.engineRunning) return;
        this.drivingSpeed = mix.speed; this.engineLevel = mix.engine; this.engineLoad = mix.load; this.engineRunning = mix.running; this.engineDirty = true;
    };
    /** Original emergency wail; updating a world event never unlocks audio. */
    setPoliceResponse = (active: boolean, proximity = 1) => {
        const next = Number.isFinite(proximity) ? Math.max(0, Math.min(1, proximity)) : 0;
        if (this.policeRequested === active && Math.abs(this.policeProximity - next) < .005)
            return;
        this.policeRequested = active; this.policeProximity = next; this.policeDirty = true;
    };
    setEngineKind = (kind: EngineKind | string) => { const next: EngineKind = kind === "coupe" || kind === "luxury" ? kind : "standard"; if (next === this.engineKind)
        return; this.engineKind = next; this.engineDirty = true; };
    setMusicEnabled = (value: boolean) => { if (this.status.musicEnabled === value)
        return; this.status.musicEnabled = value; this.synchronize(); };
    setSoundEnabled = (value: boolean) => { if (this.status.soundEnabled === value)
        return; this.status.soundEnabled = value; if (!value)
        this.clearEffects(); this.synchronize(); };
    setEngineEnabled = (value: boolean) => { if (this.status.engineEnabled === value)
        return; this.status.engineEnabled = value; this.synchronize(); };
    setSuspended = (value: boolean) => { if (this.status.suspended === value)
        return; this.status.suspended = value; if (value)
        this.clearEffects(); this.synchronize(); };
    setRadio = (value: boolean, station: number = this.status.radioStation) => { const next = toTier(station); if (this.status.radioEnabled === value && this.status.radioStation === next)
        return; this.status.radioEnabled = value; this.status.radioStation = next; this.synchronize(); };
    setInVehicle = (value: boolean) => { if (this.status.inVehicle === value)
        return; this.status.inVehicle = value; if (!value)
        this.drivingSpeed = 0; this.synchronize(); };
    /** Legacy data is validated for callers; authored local recordings remain active. */
    setRadioTracks = (tracks: Record<Tier, MusicTrack>): boolean => [0, 1, 2].every(i => tracks[i as Tier] && validateMusicTrack(tracks[i as Tier]).length === 0);
    private assetUrl(file: string) {
        const base = (import.meta as ImportMeta & {
            env?: {
                BASE_URL?: string;
            };
        }).env?.BASE_URL ?? "./";
        return audioAssetUrl(file, base, document.baseURI);
    }
    private createContext() {
        const Constructor = window.AudioContext ?? (window as unknown as {
            webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;
        if (!Constructor) {
            this.status.supported = false;
            throw new Error("AudioContext unavailable");
        }
        const context = new Constructor({ latencyHint: "interactive" });
        this.context = context;
        this.status.supported = true;
        const master = context.createGain();
        master.gain.value = 0;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -6;
        compressor.knee.value = 6;
        compressor.ratio.value = 6;
        compressor.attack.value = .006;
        compressor.release.value = .25;
        const limiter = context.createWaveShaper(), curve = new Float32Array(4097);
        for (let i = 0; i < curve.length; i++) {
            const x = i / (curve.length - 1) * 2 - 1, m = Math.abs(x);
            curve[i] = Math.sign(x) * (m <= .9 ? m : .9 + .08 * (1 - Math.exp(-(m - .9) / .08)));
        }
        limiter.curve = curve;
        master.connect(compressor);
        compressor.connect(limiter);
        limiter.connect(context.destination);
        this.master = master;
        this.music = context.createGain();
        this.effects = context.createGain();
        this.ambient = context.createGain();
        this.engineBus = context.createGain();
        for (const bus of [this.music, this.effects, this.ambient, this.engineBus])
            bus.connect(master);
        this.updateBuses();
        // Seeded low-frequency noise supports wind/tires without a synthetic music bed.
        this.noise = context.createBuffer(1, context.sampleRate * 18, context.sampleRate);
        let seed = 0x5c017, brown = 0;
        const values = this.noise.getChannelData(0);
        for (let i = 0; i < values.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            brown = (brown + (seed / 2147483648 - 1) * .025) / 1.025;
            values[i] = brown * 3.8;
        }
        this.motorNoise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const motor = this.motorNoise.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < motor.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            previous = previous * .86 + (seed / 2147483648 - 1) * .14;
            motor[i] = previous;
        }
        context.onstatechange = () => {
            if (this.context !== context)
                return;
            if (context.state !== "running") {
                this.stopTimer();
                this.disposeTextures();
                for (const s of this.recordings)
                    s.element.pause();
            }
            else if (this.shouldPlay()) {
                this.tick();
                if (this.timer === null)
                    this.timer = setInterval(this.tick, 100);
            }
            else
                this.pause();
            this.publish();
        };
    }
    private updateBuses() {
        const c = this.context;
        if (!c || c.state === "closed")
            return;
        const now = c.currentTime, v = this.status.volumes, quiet = this.status.environment.conversation ? .24 : 1;
        if (this.music)
            ramp(this.music.gain, MUSIC_LEVEL * v.music * quiet, now, v.music === 0 ? .02 : .7);
        if (this.effects)
            ramp(this.effects.gain, this.status.soundEnabled ? EFFECT_LEVEL * v.effects : 0, now, .12);
        if (this.ambient)
            ramp(this.ambient.gain, v.ambient * (this.status.suspended ? 0 : 1), now, .25);
        if (this.engineBus)
            ramp(this.engineBus.gain, this.status.engineEnabled && !this.status.suspended ? v.engine : 0, now, .2);
        if (this.master && this.shouldPlay() && c.state === "running")
            ramp(this.master.gain, v.master, now, .12);
    }
    private installVisibility() {
        if (this.visibilityInstalled || typeof document === "undefined")
            return;
        document.addEventListener("visibilitychange", this.onVisibility);
        window.addEventListener("blur", this.onBlur);
        window.addEventListener("focus", this.onFocus);
        this.visibilityInstalled = true;
    }
    private onVisibility = () => { if (this.shouldPlay())
        void this.resume();
    else
        this.pause(); };
    private onBlur = () => { this.focused = false; this.pause(); };
    private onFocus = () => { this.focused = true; if (this.shouldPlay())
        void this.resume(); };
    private cancelPause() { if (this.pauseTimer !== null)
        clearTimeout(this.pauseTimer); this.pauseTimer = null; }
    private pause() {
        const context = this.context, revision = ++this.revision;
        this.stopTimer();
        this.cancelPause();
        this.clearEffects();
        for (const s of this.recordings)
            s.element.pause();
        if (context && this.master && context.state !== "closed") {
            ramp(this.master.gain, 0, context.currentTime, .06);
            this.pauseTimer = setTimeout(() => { this.pauseTimer = null; if (this.context === context && this.revision === revision && !this.shouldPlay()) {
                this.disposeTextures();
                void context.suspend().catch(() => { });
            } }, 85);
        }
        this.publish();
    }
    private async resume() {
        const c = this.context;
        if (!c || c.state === "closed")
            return;
        const revision = ++this.revision;
        this.cancelPause();
        try {
            const promise = c.resume();
            for (const s of this.recordings)
                if (s.retireAt === null)
                    this.playRecording(s);
            await promise;
            if (this.context !== c || this.revision !== revision)
                return;
            if (!this.shouldPlay()) {
                this.pause();
                return;
            }
            this.changeTrack();
            if (this.master)
                ramp(this.master.gain, this.status.volumes.master, c.currentTime, .18);
            this.status.error = null;
            this.ambientDirty = true;
            this.engineDirty = true;
            this.tick();
            if (this.timer === null)
                this.timer = setInterval(this.tick, 100);
        }
        catch {
            this.status.error = "Open sound settings to resume audio.";
        }
        this.publish();
    }
    private stopTimer() { if (this.timer !== null)
        clearInterval(this.timer); this.timer = null; }
    private playRecording(s: RecordingSession) {
        if (s.disposed || this.status.volumes.music === 0 || !this.shouldPlay())
            return;
        void s.element.play().then(() => { if (!s.disposed) {
            this.status.loading = false;
            this.publish();
        } }).catch(() => {
            if (!s.disposed && this.shouldPlay()) {
                this.status.loading = false;
                this.status.error = "Music could not start. Open sound settings to try again.";
                this.publish();
            }
        });
    }
    private disposeRecording(s: RecordingSession) {
        if (s.disposed)
            return;
        s.disposed = true;
        s.element.pause();
        s.element.onended = null;
        s.element.onerror = null;
        s.element.removeAttribute("src");
        s.element.load();
        s.source.disconnect();
        s.gain.disconnect();
        this.recordings = this.recordings.filter(other => other !== s);
    }
    private changeTrack() {
        const c = this.context, music = this.music;
        if (!c || !music || !this.status.started)
            return;
        const desired = this.desiredTrack(), current = this.recordings.find(s => s.retireAt === null);
        // Doors and regional boundaries choose the next arrangement; they never
        // restart the complete recording the player is currently hearing.
        if (current && (current.key === desired?.key || current.kind === "score" && desired?.kind === "score" && !current.element.ended)) {
            if (this.status.volumes.music === 0) current.element.pause();
            else if (this.shouldPlay() && current.element.paused)
                this.playRecording(current);
            return;
        }
        const now = c.currentTime;
        if (desired?.kind === "score" && now < this.nextScoreAt && !current) return;
        for (const s of this.recordings) {
            s.retireAt = Math.min(s.retireAt ?? Infinity, now + (desired ? 2.5 : .5));
            ramp(s.gain.gain, 0, now, desired ? 2.5 : .5);
        }
        while (this.recordings.length >= AUDIO_LIMITS.musicVoices)
            this.disposeRecording(this.recordings[0]);
        if (!desired || this.status.volumes.music === 0)
            return;
        const element = new Audio();
        element.preload = "auto";
        element.src = this.assetUrl(desired.track.file);
        const source = c.createMediaElementSource(element), gain = c.createGain();
        gain.gain.value = 0;
        source.connect(gain);
        gain.connect(music);
        ramp(gain.gain, 1, now, 2.8);
        const s: RecordingSession = { ...desired, element, source, gain, retireAt: null, disposed: false };
        element.onended = () => {
            if (s.disposed || s.retireAt !== null)
                return;
            const position = (this.playlistPositions.get(s.playlistKey) ?? 0) + 1;
            this.playlistPositions.set(s.playlistKey, position);
            if (s.kind === "score") {
                this.lastScoreTrack = s.track.id;
                this.nextScoreAt = c.currentTime + scoreBreathingSeconds(this.status.environment, position);
            }
            this.disposeRecording(s);
            if (s.kind === "radio") this.changeTrack();
            this.publish();
        };
        element.onerror = () => { if (!s.disposed) {
            this.status.loading = false;
            this.status.error = "A local music file could not be loaded.";
            this.publish();
        } };
        this.recordings.push(s);
        this.status.loading = true;
        if (this.shouldPlay())
            this.playRecording(s);
        this.publish();
    }
    private disposeTexture(v: TextureVoice | null) {
        if (!v || v.disposed)
            return;
        v.disposed = true;
        for (const source of v.sources) {
            try {
                source.stop();
            }
            catch { /* Already stopped. */ }
            source.onended = null;
        }
        for (const node of v.nodes)
            node.disconnect();
    }
    private disposeTextures() { this.disposeTexture(this.engine); this.disposeTexture(this.weather); this.disposeTexture(this.police); this.engine = null; this.weather = null; this.police = null; this.engineDirty = true; this.ambientDirty = true; this.policeDirty = true; this.nextBirdAt = 0; }
    private createPolice(): PoliceVoice | null {
        const c = this.context;
        if (!c || !this.effects)
            return null;
        const carrier = c.createOscillator(), modulation = c.createOscillator(), sweep = c.createGain(), filter = c.createBiquadFilter(), gain = c.createGain();
        // A continuous wail, not a musical cue. Slow triangular modulation
        // sweeps a softened alarm tone without scheduling notes or new voices.
        carrier.type = 'triangle'; carrier.frequency.value = 780;
        modulation.type = 'triangle'; modulation.frequency.value = .46;
        sweep.gain.value = 260;
        filter.type = 'lowpass'; filter.frequency.value = 1650; filter.Q.value = .45;
        gain.gain.value = 0;
        modulation.connect(sweep); sweep.connect(carrier.frequency);
        carrier.connect(filter); filter.connect(gain); gain.connect(this.effects);
        carrier.start(); modulation.start();
        return { sources: [carrier, modulation], nodes: [carrier, modulation, sweep, filter, gain], gain, filter, disposed: false, retireAt: null };
    }
    private updatePolice() {
        const c = this.context;
        if (!c || c.state !== 'running')
            return;
        const now = c.currentTime, audible = this.policeRequested && this.policeProximity > 0 && this.status.soundEnabled && this.status.volumes.effects > 0 && this.shouldPlay();
        if (!audible) {
            if (this.police && this.police.retireAt === null) {
                ramp(this.police.gain.gain, 0, now, .14); this.police.retireAt = now + .16;
            }
            if (this.police && this.police.retireAt !== null && now >= this.police.retireAt) {
                this.disposeTexture(this.police); this.police = null;
            }
            this.policeDirty = false;
            return;
        }
        if (!this.police) { this.police = this.createPolice(); this.policeDirty = true; }
        if (!this.police || (!this.policeDirty && this.police.retireAt === null))
            return;
        this.police.retireAt = null;
        ramp(this.police.gain.gain, .18 * this.policeProximity ** 1.5, now, .24);
        this.policeDirty = false;
    }
    private createWeather() {
        const c = this.context;
        if (!c || !this.noise || !this.ambient)
            return null;
        const noise = c.createBufferSource();
        noise.buffer = this.noise;
        noise.loop = true;
        const filter = c.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = .3;
        const gain = c.createGain();
        gain.gain.value = 0;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ambient);
        noise.start();
        const v: TextureVoice = { sources: [noise], nodes: [noise, filter, gain], gain, filter, disposed: false };
        // The soft distant pass is original SCOUT air texture, with cabin
        // filtering and movement below the music and foreground foley.
        const traffic = c.createBufferSource();
        traffic.buffer = this.noise;
        traffic.loop = true;
        const trafficFilter = c.createBiquadFilter();
        trafficFilter.type = "lowpass";
        trafficFilter.Q.value = .5;
        const trafficGain = c.createGain();
        trafficGain.gain.value = 0;
        const trafficPan = typeof c.createStereoPanner === "function" ? c.createStereoPanner() : undefined;
        traffic.connect(trafficFilter);
        trafficFilter.connect(trafficGain);
        if (trafficPan) { trafficGain.connect(trafficPan); trafficPan.connect(this.ambient); }
        else trafficGain.connect(this.ambient);
        v.sources.push(traffic);
        v.nodes.push(traffic, trafficFilter, trafficGain, ...(trafficPan ? [trafficPan] : []));
        v.trafficGain = trafficGain;
        v.trafficFilter = trafficFilter;
        v.trafficPan = trafficPan;
        traffic.start(c.currentTime, 7.1);
        this.nextBirdAt = c.currentTime + 6;
        void this.loadSample("audio/foley/park-birds.ogg");
        return v;
    }
    private updateAmbience() {
        const c = this.context;
        if (!c || c.state !== "running")
            return;
        const changed = this.ambientDirty;
        if (!changed && c.currentTime - this.ambientTime < .25) return;
        this.ambientDirty = false;
        this.ambientTime = c.currentTime;
        const env = this.status.environment, mix = soundscapeMix(env, this.status.inVehicle);
        const level = this.status.suspended || this.status.volumes.ambient === 0 ? 0 : mix.wind + mix.room;
        if (level === 0) {
            this.disposeTexture(this.weather);
            this.weather = null;
            return;
        }
        this.weather ??= this.createWeather();
        const v = this.weather;
        if (!v)
            return;
        const motion = ambienceMotion(env, c.currentTime), seconds = changed ? 1.8 : .7;
        ramp(v.gain.gain, mix.room + mix.wind * motion.wind, c.currentTime, seconds);
        ramp(v.filter.frequency, mix.cutoff, c.currentTime, seconds);
        if (v.trafficGain) ramp(v.trafficGain.gain, mix.traffic * motion.traffic, c.currentTime, seconds);
        if (v.trafficFilter) ramp(v.trafficFilter.frequency, mix.trafficCutoff, c.currentTime, seconds);
        if (v.trafficPan) ramp(v.trafficPan.pan, motion.pan, c.currentTime, .7);
        if (v.birdGain && changed && v.birdEndsAt) {
            const remaining = v.birdEndsAt - c.currentTime;
            if (remaining <= 1.4) ramp(v.birdGain.gain, 0, c.currentTime, Math.max(.02, remaining));
            else {
                ramp(v.birdGain.gain, mix.birds, c.currentTime, Math.min(.6, remaining - 1.4));
                v.birdGain.gain.setValueAtTime(mix.birds, v.birdEndsAt - 1.4);
                v.birdGain.gain.linearRampToValueAtTime(0, v.birdEndsAt);
            }
        }
        const birds = this.sampleBuffers.get("audio/foley/park-birds.ogg");
        if (mix.birds > 0 && birds && !v.birdSource && c.currentTime >= this.nextBirdAt && this.ambient) {
            // Excerpts change offset and leave long gaps; birds never chirp in
            // a continuous loop, indoors, on the interstate or in the rain.
            const source = c.createBufferSource(), gain = c.createGain();
            const sequence = Math.floor(c.currentTime / mix.birdSpacing);
            const duration = Math.min(8 + sequence % 3, birds.duration);
            const offset = (sequence * 7.9 + 1.3) % Math.max(.1, birds.duration - duration);
            source.buffer = birds;
            gain.gain.value = 0;
            source.connect(gain);
            gain.connect(this.ambient);
            ramp(gain.gain, mix.birds, c.currentTime, 1.4);
            gain.gain.setValueAtTime(mix.birds, c.currentTime + duration - 1.4);
            gain.gain.linearRampToValueAtTime(0, c.currentTime + duration);
            v.sources.push(source);
            v.nodes.push(source, gain);
            v.birdSource = source;
            v.birdGain = gain;
            v.birdEndsAt = c.currentTime + duration;
            source.onended = () => {
                source.disconnect(); gain.disconnect();
                v.sources = v.sources.filter(item => item !== source);
                v.nodes = v.nodes.filter(item => item !== source && item !== gain);
                if (v.birdSource === source) { v.birdSource = undefined; v.birdGain = undefined; v.birdEndsAt = undefined; }
            };
            source.start(c.currentTime, offset, duration);
            this.nextBirdAt = c.currentTime + mix.birdSpacing + sequence % 4 * 3;
        }
    }
    private createEngine() {
        const c = this.context;
        if (!c || !this.noise || !this.motorNoise || !this.engineBus)
            return null;
        const low = c.createOscillator(), high = c.createOscillator();
        low.type = "triangle";
        high.type = "sine";
        const filter = c.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = .45;
        const gain = c.createGain();
        gain.gain.value = 0;
        const lowGain = c.createGain(), highGain = c.createGain();
        lowGain.gain.value = .7;
        highGain.gain.value = .15;
        low.connect(lowGain);
        high.connect(highGain);
        lowGain.connect(filter);
        highGain.connect(filter);
        const combustion = c.createBufferSource();
        combustion.buffer = this.motorNoise;
        combustion.loop = true;
        const combustionGain = c.createGain();
        combustionGain.gain.value = .6;
        combustion.connect(combustionGain);
        combustionGain.connect(filter);
        filter.connect(gain);
        gain.connect(this.engineBus);
        const road = c.createBufferSource();
        road.buffer = this.noise;
        road.loop = true;
        const secondaryFilter = c.createBiquadFilter();
        secondaryFilter.type = "lowpass";
        secondaryFilter.Q.value = .4;
        const secondaryGain = c.createGain();
        secondaryGain.gain.value = 0;
        road.connect(secondaryFilter);
        secondaryFilter.connect(secondaryGain);
        secondaryGain.connect(this.engineBus);
        const sources = [low, high, combustion, road];
        for (const source of sources)
            source.start();
        return { sources, nodes: [...sources, lowGain, highGain, combustionGain, filter, gain, secondaryFilter, secondaryGain], gain, filter, secondaryGain, secondaryFilter, low, high, combustion, disposed: false };
    }
    private updateEngine() {
        if (!this.engineDirty)
            return;
        this.engineDirty = false;
        const c = this.context;
        if (!c || c.state !== "running")
            return;
        if (!this.status.inVehicle || !this.status.engineEnabled || this.status.volumes.engine === 0 || this.status.suspended) {
            this.disposeTexture(this.engine);
            this.engine = null;
            return;
        }
        this.engine ??= this.createEngine();
        const v = this.engine;
        if (!v)
            return;
        const now = c.currentTime;
        const mix = engineMix({ normalizedSpeed: this.drivingSpeed, normalizedEngine: this.engineLevel, engineLoad: this.engineLoad, engineRunning: this.engineRunning }, this.engineKind);
        ramp(v.low!.frequency, mix.frequency, now, .22);
        ramp(v.high!.frequency, mix.frequency * 2, now, .22);
        ramp(v.filter.frequency, mix.cutoff, now, .24);
        ramp(v.gain.gain, mix.humGain, now, .24);
        ramp(v.secondaryGain!.gain, mix.roadGain, now, .25);
        ramp(v.secondaryFilter!.frequency, mix.roadCutoff, now, .25);
        if (v.combustion) ramp(v.combustion.playbackRate, mix.textureRate, now, .24);
    }
    private tick = () => {
        const c = this.context;
        if (!c || c.state !== "running" || !this.shouldPlay())
            return;
        for (const s of [...this.recordings])
            if (s.retireAt !== null && c.currentTime >= s.retireAt)
                this.disposeRecording(s);
        this.updateEngine();
        this.updateAmbience();
        this.updatePolice();
        if (this.recordings.length === 0 && this.desiredTrack())
            this.changeTrack();
        // Decode only short foley; full songs stream locally and do not retain PCM buffers.
        if (!this.samplesPreloaded) {
            this.samplesPreloaded = true;
            for (const file of FOLEY_FILES.filter(f => f.includes("footstep_concrete") || f.includes("doorClose") || f.includes("click") || f.includes("phone")))
                void this.loadSample(file);
        }
    };
    private async loadSample(file: string): Promise<AudioBuffer | null> {
        const cached = this.sampleBuffers.get(file);
        if (cached)
            return cached;
        const pending = this.pendingSamples.get(file);
        if (pending)
            return pending;
        const c = this.context;
        if (!c || c.state === "closed")
            return null;
        const promise = (async () => {
            try {
                const response = await fetch(this.assetUrl(file));
                if (!response.ok && response.status !== 0)
                    throw new Error("Local audio unavailable");
                const buffer = await c.decodeAudioData(await response.arrayBuffer());
                if (this.context !== c || c.state === "closed")
                    return null;
                this.sampleBuffers.set(file, buffer);
                return buffer;
            }
            catch {
                return null;
            }
            finally {
                if (this.context === c)
                    this.pendingSamples.delete(file);
            }
        })();
        this.pendingSamples.set(file, promise);
        return promise;
    }
    private disposeEffect(v: SampleVoice) {
        if (v.disposed)
            return;
        v.disposed = true;
        v.source.onended = null;
        try {
            v.source.stop();
        }
        catch { /* Already ended. */ }
        v.source.disconnect();
        v.gain.disconnect();
        v.pan?.disconnect();
        this.effectsPlaying.delete(v);
    }
    private clearEffects() { for (const v of [...this.effectsPlaying])
        this.disposeEffect(v); }
    private playSample(buffer: AudioBuffer, level: number, pitch = 1, pan = 0, delay = 0) {
        const c = this.context;
        if (!c || !this.effects || c.state !== "running" || !this.shouldPlay() || this.status.suspended || !this.status.soundEnabled)
            return;
        if (this.effectsPlaying.size >= AUDIO_LIMITS.effectVoices)
            this.disposeEffect(this.effectsPlaying.values().next().value!);
        const source = c.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = pitch;
        const gain = c.createGain();
        gain.gain.value = Math.max(0, Math.min(.45, level));
        const panner = typeof c.createStereoPanner === "function" ? c.createStereoPanner() : null;
        source.connect(gain);
        if (panner) {
            panner.pan.value = pan;
            gain.connect(panner);
            panner.connect(this.effects);
        }
        else
            gain.connect(this.effects);
        const v: SampleVoice = { source, gain, pan: panner, disposed: false };
        source.onended = () => this.disposeEffect(v);
        this.effectsPlaying.add(v);
        source.start(c.currentTime + delay);
    }
    sfx = (kind: SoundEffect) => {
        const c = this.context;
        if (!c || c.state !== "running" || !this.shouldPlay() || !this.status.soundEnabled || this.status.suspended || this.status.volumes.effects === 0)
            return;
        const now = c.currentTime, cooldown = kind === "step" ? .18 : kind === "phone" ? 2.2 : kind === "bump" ? .6 : kind === "interact" ? .12 : .4;
        if (now - (this.lastEffect.get(kind) ?? -Infinity) < cooldown)
            return;
        this.lastEffect.set(kind, now);
        let file: string | null = null, level = .22, pitch = 1, pan = 0;
        switch (kind) {
            case "step": {
                const indoors = this.status.environment.interior || ["apartment", "interior"].includes(this.status.environment.scene ?? ""), surface = footstepSurface(this.status.environment), index = this.footstepIndex++ % 4;
                file = "footstep_" + surface + "_00" + index;
                level = indoors ? .28 : .34;
                pitch = .94 + (index % 3) * .045;
                pan = index % 2 ? .08 : -.08;
                break;
            }
            case "enterCar":
                file = "doorClose_1";
                level = .42;
                break;
            case "exitCar":
                file = "doorOpen_1";
                level = .33;
                break;
            case "bump":
                file = "impactSoft_medium_000";
                level = .3;
                break;
            case "interact":
                file = "click_001";
                level = .2;
                break;
            case "paint":
                file = "cloth1";
                level = .25;
                break;
            case "refuel":
                file = "metalLatch";
                level = .25;
                break;
            case "phone":
                file = "phone-vibration";
                level = .42;
                break;
            case "wake":
                file = "cloth2";
                level = .16;
                break;
            case "week":
                file = "bookFlip1";
                level = .22;
                break;
            case "lowFuel":
                file = "switch_001";
                level = .14;
                break;
            // Recruitment and progression have no gamified reward stingers.
            case "recruit":
            case "success":
            case "error":
            case "prestige":
            case "arrival":
            case "luxury": return;
        }
        if (!file)
            return;
        const revision = this.revision, local = "audio/foley/" + file + ".ogg", cached = this.sampleBuffers.get(local);
        if (cached)
            this.playSample(cached, level, pitch, pan);
        else
            void this.loadSample(local).then(buffer => { if (buffer && this.revision === revision && this.context === c && c.currentTime - now < .35)
                this.playSample(buffer, level, pitch, pan); });
    };
    stop = () => {
        this.status.started = false;
        this.status.loading = false;
        this.revision++;
        this.stopTimer();
        this.cancelPause();
        this.clearEffects();
        this.disposeTextures();
        for (const s of [...this.recordings])
            this.disposeRecording(s);
        if (this.visibilityInstalled && typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", this.onVisibility);
            window.removeEventListener("blur", this.onBlur);
            window.removeEventListener("focus", this.onFocus);
        }
        this.visibilityInstalled = false;
        this.focused = true;
        this.drivingSpeed = 0;
        const c = this.context;
        if (c) {
            c.onstatechange = null;
            void c.close().catch(() => { });
        }
        this.context = null;
        this.master = null;
        this.music = null;
        this.effects = null;
        this.ambient = null;
        this.engineBus = null;
        this.noise = null;
        this.motorNoise = null;
        this.sampleBuffers.clear();
        this.pendingSamples.clear();
        this.samplesPreloaded = false;
        this.lastEffect.clear();
        this.lastScoreTrack = null;
        this.nextScoreAt = 0;
        this.nextBirdAt = 0;
        this.ambientTime = 0;
        this.engineLevel = undefined;
        this.engineLoad = undefined;
        this.engineRunning = true;
        this.policeRequested = false;
        this.policeProximity = 1;
        this.policeDirty = true;
        this.playlistPositions.clear();
        this.publish();
    };
}
// Safe to import during server rendering: only a player gesture creates browser objects.
export const scoutAudio = new ScoutAudio();
