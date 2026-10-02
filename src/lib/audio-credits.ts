/** Credits travel with every offline installation. */
export type AudioCredit = {
    title: string;
    artist: string;
    source: string;
    license: string;
    licenseUrl: string;
    attribution: string;
    description: string;
};
export const AUDIO_CREDITS: readonly AudioCredit[] = [
    ["Simplicity", "simplicity", "Piano, acoustic guitar, mandolin, fiddle and brushed jazz drums."],
    ["Effervescence", "effervescence", "Calm piano and improvisational clarinet in a gently shifting jazz arrangement."],
    ["Golden Hour", "golden-hour", "Warm strings and atmospheric vocals for unhurried evening drives."],
    ["Chasing Daylight", "chasing-daylight", "Contemplative piano and strings for time spent exploring."],
    ["At The End Of All Things", "at-the-end-of-all-things", "Quiet piano and solo clarinet for a reflective late-night journey."],
    ["The Long Dark", "the-long-dark", "Restrained ambient piano for the mysteries of the final chapter."],
].map(([title, slug, description]) => ({
    title, artist: "Scott Buckley", source: "https://www.scottbuckley.com.au/library/" + slug + "/",
    license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "'" + title + "' by Scott Buckley — released under CC-BY 4.0. www.scottbuckley.com.au", description,
})).concat([
    { title: "RPG Audio · Impact Sounds · Interface Sounds", artist: "Kenney", source: "https://kenney.nl/assets/rpg-audio", license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Foley and interface recordings by Kenney (CC0). kenney.nl", description: "Recorded footsteps, doors, cloth and quiet physical interface sounds, mixed and pitched for the environment." },
    { title: "Ambient Bird Sounds", artist: "isaiah658", source: "https://opengameart.org/content/ambient-bird-sounds", license: "CC0 1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "Ambient Bird Sounds recorded by isaiah658, released under CC0.", description: "A real outdoor field recording heard softly on clear daytime walks." },
]);
