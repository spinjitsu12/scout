import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){
  if(['./music-score','./audio-credits'].includes(specifier)&&context.parentURL?.endsWith('/audio.ts'))return nextResolve(new URL('../src/lib/'+specifier.slice(2)+'.ts',import.meta.url).href,context);
  return nextResolve(specifier,context);
}});
const {scoutAudio,RECORDED_TRACKS,RADIO_PLAYLISTS,RADIO_STATION_NAMES,selectMusic}=await import('../src/lib/audio.ts');
assert.deepEqual(RADIO_STATION_NAMES,['GOLD FM','ASTER WAVES','MIDNIGHT SIGNAL']);
for(const station of[0,1,2]){
  const playlist=RADIO_PLAYLISTS[station];assert(playlist.length>=3);assert.equal(new Set(playlist).size,playlist.length);assert(playlist.every(id=>RECORDED_TRACKS.some(t=>t.id===id)));
}
for(const musicEnabled of[false,true])for(const radioEnabled of[false,true])for(const inVehicle of[false,true])for(const radioReady of[false,true])for(const tier of[0,1,2])for(const radioStation of[0,1,2]){
  assert.deepEqual(selectMusic({musicEnabled,radioEnabled,inVehicle,radioStation,tier},radioReady),radioEnabled&&inVehicle&&radioReady?{kind:'radio',index:radioStation}:musicEnabled?{kind:'score',index:tier}:null);
}
scoutAudio.setTier(2);scoutAudio.setRadio(true,0);scoutAudio.setInVehicle(true);
assert.equal(scoutAudio.getStatus().radioTitle,'GOLD FM');assert.equal(scoutAudio.getStatus().title,'Simplicity');assert.equal(scoutAudio.getStatus().artist,'Scott Buckley');
assert.equal(scoutAudio.getStatus().started,false);assert.equal(scoutAudio.getStatus().radioActive,false);
scoutAudio.setInVehicle(false);assert.equal(scoutAudio.getStatus().title,'The Long Dark');
scoutAudio.setMusicEnabled(false);assert.equal(selectMusic(scoutAudio.getStatus(),true),null);
scoutAudio.setInVehicle(true);assert.deepEqual(selectMusic(scoutAudio.getStatus(),true),{kind:'radio',index:0});
scoutAudio.setRadio(true,1);assert.equal(scoutAudio.getStatus().radioTitle,'ASTER WAVES');assert.equal(scoutAudio.getStatus().title,'Golden Hour');
scoutAudio.setRadio(true,9);assert.equal(scoutAudio.getStatus().radioStation,2);
scoutAudio.setRadio(false);scoutAudio.setMusicEnabled(true);scoutAudio.setInVehicle(false);scoutAudio.setTier(0);scoutAudio.stop();
console.log('PASS: three authored recording stations, rotating full-length playlists, car-only radio, independent background music, quiet chapter restoration and no sound before input.');

