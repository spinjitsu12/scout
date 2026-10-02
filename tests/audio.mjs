import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (['./music-score', './audio-credits'].includes(specifier) && context.parentURL?.endsWith('/audio.ts')) {
      return nextResolve(new URL('../src/lib/' + specifier.slice(2) + '.ts', import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { scoutAudio, DEFAULT_AUDIO_VOLUMES, normalizeVolumes, audioAssetUrl, RECORDED_TRACKS, SCORE_PLAYLISTS, FOLEY_FILES, ambientMix, engineMix, AUDIO_LIMITS } = await import('../src/lib/audio.ts');
const { AUDIO_CREDITS } = await import('../src/lib/audio-credits.ts');
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/audio/manifest.json'), 'utf8'));
assert.equal(typeof globalThis.window, 'undefined');
assert.equal(scoutAudio.getStatus().started, false, 'Importing never creates browser objects or starts audio');
assert.equal(scoutAudio.getStatus().playing, false);
assert.equal(scoutAudio.getDiagnostics().contextState, 'closed');
assert.equal(RECORDED_TRACKS.length, 6);
for (const track of RECORDED_TRACKS) {
  const entry = manifest.music.find(item => item.file === track.file);
  assert(entry, 'Every playlist recording has an offline manifest');
  assert.equal(track.artist, 'Scott Buckley');
  assert.equal(track.license, 'CC BY 4.0');
  assert.equal(track.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert(track.source.startsWith('https://www.scottbuckley.com.au/library/'));
  const bytes = await fs.readFile(path.join(root, 'public', track.file));
  assert(bytes.length > 1_000_000, 'Bundled music is a full recording');
  assert.equal(bytes.length, entry.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  assert(entry.duration >= 180, 'Arrangements unfold over minutes');
  assert.equal(entry.stream.codec_name, 'mp3');
  assert.equal(entry.stream.channels, 2);
  assert(Number(entry.stream.sample_rate) >= 44100);
  assert(Number(entry.peak_dbfs) <= 0);
  assert(Number(entry.mean_volume) < -10, 'Recordings preserve quiet dynamics');
}
for (const file of FOLEY_FILES) {
  const bytes = await fs.readFile(path.join(root, 'public', file));
  assert.equal(bytes.toString('ascii', 0, 4), 'OggS');
  const entry = manifest.foley.find(item => item.file === file);
  assert(entry, 'Every foley file is decoded and documented');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  assert.equal(entry.stream.codec_name, 'vorbis');
}
assert(AUDIO_CREDITS.some(credit => credit.artist === 'isaiah658'));
assert(AUDIO_CREDITS.some(credit => credit.artist === 'Kenney'));
for (const tier of [0, 1, 2]) assert(SCORE_PLAYLISTS[tier].length >= 3 && SCORE_PLAYLISTS[tier].every(id => RECORDED_TRACKS.some(track => track.id === id)));
assert.equal(AUDIO_LIMITS.musicVoices, 2);
assert.equal(AUDIO_LIMITS.drivingVoices, 1);
assert.deepEqual(normalizeVolumes({master:4,music:-1,ambient:NaN,effects:Infinity,engine:.24}),{...DEFAULT_AUDIO_VOLUMES,master:1,music:0,engine:.24});
assert.equal(normalizeVolumes({sfx:.17}).effects,.17);
assert.equal(normalizeVolumes({sfx:.17,effects:.3}).effects,.3);
assert.equal(audioAssetUrl('audio/music/simplicity.mp3','./','file:///D:/SCOUT/resources/app.asar/dist/index.html'),'file:///D:/SCOUT/resources/app.asar/dist/audio/music/simplicity.mp3');
assert.equal(audioAssetUrl('audio/foley/click_001.ogg','/scout/','https://example.test/scout/index.html'),'https://example.test/scout/audio/foley/click_001.ogg');
assert.throws(()=>audioAssetUrl('https://remote.test/song.mp3'));
assert.throws(()=>audioAssetUrl('audio/music/../outside.mp3'));
assert.throws(()=>audioAssetUrl('audio/music\\outside.mp3'));
assert(ambientMix({scene:'outdoors',weather:'rain'}).wind>ambientMix({scene:'outdoors',weather:'clear'}).wind);
assert(ambientMix({scene:'apartment',weather:'rain'}).wind<ambientMix({scene:'outdoors',weather:'rain'}).wind);
assert.equal(ambientMix({scene:'menu'}).wind,0);
const accelerating=engineMix({normalizedSpeed:.4,normalizedEngine:.8,engineLoad:.8});
const coasting=engineMix({normalizedSpeed:.4,normalizedEngine:.3,engineLoad:.05});
assert(accelerating.frequency>coasting.frequency,'Coasting and shifts lower RPM independently of road speed');
assert(accelerating.humGain>coasting.humGain,'Pedal load controls motor body');
assert.equal(accelerating.roadGain,coasting.roadGain,'Tire texture follows road speed independently of RPM');
for(const value of[NaN,Infinity,-Infinity]){
 assert(Object.values(engineMix({normalizedSpeed:value,normalizedEngine:value,engineLoad:value})).filter(value=>typeof value==='number').every(Number.isFinite));
}
const dryTank=engineMix({normalizedSpeed:.3,normalizedEngine:0,engineLoad:0,engineRpm:0});
assert.equal(dryTank.humGain,0,'An engine out of fuel has no combustion hum');
assert(dryTank.roadGain>0,'Tires remain audible while a dry-tank vehicle coasts');
assert(engineMix({normalizedSpeed:0,normalizedEngine:0,engineLoad:0}).humGain>0,'A running parked car has a quiet idle');
scoutAudio.setVehicleTelemetry({normalizedSpeed:.4,normalizedEngine:.8,engineLoad:.6,gearNumber:3});
scoutAudio.setVolumes({master:.42,ambient:.3,effects:.26,engine:.2});
scoutAudio.setEnvironment({scene:'apartment',interior:true});
scoutAudio.setEnvironment({scene:'outdoors'});
assert.equal(scoutAudio.getStatus().environment.interior,false,'Leaving a room restores outdoor ambience');
scoutAudio.setEnvironment({scene:'outdoors',timeOfDay:27,weather:'rain',conversation:true});
scoutAudio.setTier(2);scoutAudio.setInVehicle(true);
for(let i=0;i<1000;i++)scoutAudio.setDriving((i%100)/100);
scoutAudio.sfx('step');scoutAudio.sfx('phone');
assert.equal(scoutAudio.getStatus().started,false,'World and preference updates cannot unlock audio');
assert.equal(scoutAudio.getStatus().environment.timeOfDay,3);
const snapshot=scoutAudio.getStatus();snapshot.volumes.master=1;snapshot.environment.scene='menu';
assert.equal(scoutAudio.getStatus().volumes.master,.42);assert.equal(scoutAudio.getStatus().environment.scene,'outdoors');
scoutAudio.setSuspended(true);assert.equal(scoutAudio.getStatus().volumes.effects,.26,'Pause preserves slider preferences');
scoutAudio.setMuted(true);assert.equal(scoutAudio.getStatus().volumes.master,.42,'Mute preserves master level');
scoutAudio.setVolumes({engine:0});assert.equal(scoutAudio.getStatus().volumes.effects,.26,'Motor/effects independent');
const statuses=[];const unsubscribe=scoutAudio.subscribe(status=>statuses.push(status));
scoutAudio.setTier(0);assert.equal(statuses.at(-1).tier,0);const count=statuses.length;unsubscribe();scoutAudio.setTier(1);assert.equal(statuses.length,count);
scoutAudio.stop();
assert.deepEqual(scoutAudio.getDiagnostics(),{contextState:'closed',recordings:0,effects:0,engine:0,ambience:0,decodedSamples:0,activeTrack:null});
console.log('PASS: six complete credited composer recordings, offline MP3/Ogg integrity, portable asset paths, quiet field ambience, independent clamped sliders, preference-preserving pause/mute, bounded sources and gesture-only audio.');

