/** Deterministic sound directions for the places in the regional world. */
export const AUDIO_REGIONS = ["harbor", "campus", "arts", "coast", "village", "garden", "city", "highway", "country"] as const;
export type AudioRegion = typeof AUDIO_REGIONS[number];
export const FOOTSTEP_SURFACES = ["wood", "carpet", "concrete", "grass"] as const;
export type FootstepSurface = typeof FOOTSTEP_SURFACES[number];
export type SceneAudioEnvironment = {
    scene?: "apartment" | "outdoors" | "interior" | "vehicle" | "menu";
    region?: AudioRegion;
    surface?: FootstepSurface;
    timeOfDay?: number;
    weather?: "clear" | "rain";
    interior?: boolean;
    conversation?: boolean;
};
export const REGIONAL_PLAYLISTS: Record<AudioRegion, readonly string[]> = {
    harbor: ["chasing-daylight", "effervescence", "simplicity", "golden-hour"],
    campus: ["simplicity", "effervescence", "chasing-daylight"],
    arts: ["effervescence", "simplicity", "golden-hour"],
    coast: ["golden-hour", "chasing-daylight", "at-the-end-of-all-things"],
    village: ["simplicity", "golden-hour", "chasing-daylight"],
    garden: ["effervescence", "chasing-daylight", "simplicity"],
    city: ["chasing-daylight", "effervescence", "golden-hour"],
    highway: ["golden-hour", "chasing-daylight", "simplicity"],
    country: ["simplicity", "chasing-daylight", "golden-hour"],
};
const CHAPTER_PLAYLISTS: readonly (readonly string[])[] = [
    ["simplicity", "effervescence", "chasing-daylight"],
    ["chasing-daylight", "golden-hour", "simplicity"],
    ["the-long-dark", "at-the-end-of-all-things", "effervescence"],
];
const NIGHT_PLAYLIST = ["at-the-end-of-all-things", "the-long-dark", "golden-hour"] as const;
export function normalizedHour(value: number | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? ((value % 24) + 24) % 24 : 9;
}
export function isInterior(environment: SceneAudioEnvironment): boolean {
    return environment.interior === true || environment.scene === "apartment" || environment.scene === "interior";
}
export function footstepSurface(environment: SceneAudioEnvironment): FootstepSurface {
    if (environment.surface && FOOTSTEP_SURFACES.includes(environment.surface)) return environment.surface;
    return environment.scene === "apartment" ? "wood" : isInterior(environment) ? "carpet" : "concrete";
}
export function sceneMusicPlaylist(environment: SceneAudioEnvironment, tier = 0): { key: string; tracks: readonly string[] } {
    const region = environment.region, hour = normalizedHour(environment.timeOfDay);
    if (!region || !AUDIO_REGIONS.includes(region)) {
        const chapter = Number.isFinite(tier) ? Math.max(0, Math.min(2, Math.round(tier))) : 0;
        return { key: "chapter:" + chapter, tracks: CHAPTER_PLAYLISTS[chapter] };
    }
    if (environment.scene !== "menu" && (hour < 6 || hour >= 20)) return { key: "night:" + region, tracks: NIGHT_PLAYLIST };
    if (environment.scene !== "menu" && hour >= 17) {
        const tracks = REGIONAL_PLAYLISTS[region];
        return { key: "evening:" + region, tracks: ["golden-hour", ...tracks.filter(id => id !== "golden-hour")] };
    }
    return { key: "day:" + region, tracks: REGIONAL_PLAYLISTS[region] };
}
export function sceneTrackAt(tracks: readonly string[], position = 0, previous: string | null = null): string {
    if (tracks.length === 0) throw new RangeError("A scene playlist needs a recording.");
    const index = Number.isFinite(position) ? Math.max(0, Math.floor(position)) % tracks.length : 0;
    const id = tracks[index];
    return id === previous && tracks.length > 1 ? tracks[(index + 1) % tracks.length] : id;
}
/** Short intervals of world sound between complete arrangements. */
export function scoreBreathingSeconds(environment: SceneAudioEnvironment, position: number): number {
    if (environment.scene === "menu") return 4;
    const quiet = isInterior(environment) || environment.region === "garden" || environment.region === "country";
    const variation = Number.isFinite(position) ? Math.abs(Math.floor(position)) % 4 : 0;
    return (quiet ? 20 : 12) + variation * 3;
}
export type SoundscapeMix = { wind: number; cutoff: number; room: number; birds: number; birdSpacing: number; traffic: number; trafficCutoff: number };
const PLACE_SOUND: Record<AudioRegion, { wind: number; cutoff: number; birds: number; traffic: number }> = {
    harbor: { wind: .026, cutoff: 1400, birds: .006, traffic: .011 },
    campus: { wind: .016, cutoff: 1600, birds: .026, traffic: .006 },
    arts: { wind: .016, cutoff: 1300, birds: .006, traffic: .009 },
    coast: { wind: .036, cutoff: 1700, birds: .009, traffic: .002 },
    village: { wind: .019, cutoff: 1500, birds: .021, traffic: .004 },
    garden: { wind: .023, cutoff: 1900, birds: .034, traffic: .001 },
    city: { wind: .018, cutoff: 1400, birds: .004, traffic: .015 },
    highway: { wind: .028, cutoff: 1200, birds: 0, traffic: .023 },
    country: { wind: .027, cutoff: 1800, birds: .029, traffic: .002 },
};
export function soundscapeMix(environment: SceneAudioEnvironment, inVehicle = false): SoundscapeMix {
    if (environment.scene === "menu") return { wind: 0, cutoff: 400, room: 0, birds: 0, birdSpacing: 60, traffic: 0, trafficCutoff: 300 };
    const place = environment.region ? PLACE_SOUND[environment.region] : undefined;
    const setting = place ?? { wind: .024, cutoff: 1800, birds: .024, traffic: .003 };
    const indoors = isInterior(environment), rain = environment.weather === "rain", hour = normalizedHour(environment.timeOfDay);
    const cabin = inVehicle || environment.scene === "vehicle", daylight = hour >= 6 && hour < 20;
    return {
        wind: indoors ? (rain ? .006 : 0) : cabin ? (rain ? .014 : .008) : rain ? .046 : setting.wind,
        cutoff: indoors ? 550 : cabin ? 750 : rain ? 4400 : setting.cutoff,
        room: indoors ? .008 : 0,
        birds: indoors || rain || !daylight ? 0 : setting.birds * (cabin ? .12 : 1),
        birdSpacing: environment.region === "garden" || environment.region === "country" ? 35 : 50,
        traffic: indoors ? 0 : setting.traffic * (cabin ? .28 : 1) * (daylight ? 1 : .55),
        trafficCutoff: cabin ? 380 : rain ? 1000 : 760,
    };
}
/** Slow air/surf motion and occasional distant passes, smoothed on the audio clock. */
export function ambienceMotion(environment: SceneAudioEnvironment, elapsed: number): { wind: number; traffic: number; pan: number } {
    const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    const coast = environment.region === "coast";
    const gust = .88 + .08 * Math.sin(time * .19) + .04 * Math.sin(time * .071 + 1.8);
    const surf = coast ? .82 + .18 * (Math.sin(time * .58 - .6) + 1) / 2 : 1;
    const period = environment.region === "highway" || environment.region === "city" ? 17 : 29;
    const phase = (time % period) / period;
    const passing = phase < .38 ? Math.sin(Math.PI * phase / .38) ** 2 : 0;
    const direction = Math.floor(time / period) % 2 ? -1 : 1;
    return { wind: gust * surf, traffic: .2 + passing * .8, pan: direction * (phase < .38 ? -.6 + 1.2 * phase / .38 : .6) };
}
