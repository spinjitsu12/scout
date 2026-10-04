import fs from 'node:fs/promises';
import path from 'node:path';
import { newGame, act, validGame } from '../../../../src/lib/game.ts';
import { REGIONAL_SERVICE_POINTS, WORLD_SIZE, getImmersiveLocations } from '../../../../src/lib/immersive-locations.ts';
const root=path.resolve(import.meta.dirname,'../../../..');
const metadata=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
function seed(slot,vehicle,player){
  let game=newGame(8300+slot);game.style.name='Linux QA '+slot;game.story={phase:'complete',choice:null};game.briefing=false;
  game.immersion={schema:2,tier:0,interior:null,player:{...player,yaw:0,pitch:0},vehicle:{heading:0,speed:0,steering:0,distance:0,fuel:12,gear:'D',damage:0,disabled:false,...vehicle},mode:'foot',destination:slot===1?1:null,parkedAt:[],tutorial:'complete',thoughtsSeen:[],homeReviewed:true};
  game.field={...game.field,fuel:game.immersion.vehicle.fuel};
  game=act(game,{type:'immersionSnapshot',snapshot:game.immersion});
  if(!validGame(game))throw new Error('QA seed '+slot+' is not a valid real career.');return game;
}
const station=REGIONAL_SERVICE_POINTS.find(point=>point.id==='eastmere-fuel');
const seeds=[seed(1,{x:500,z:870},{x:503,z:870}),seed(2,{...station.parking,distance:1523.4,fuel:4.25,damage:.42},{x:station.parking.x+1.3,z:station.parking.z+6.3}),seed(3,{x:500,z:870,distance:3142.7,fuel:2.25,damage:.93,disabled:true,gear:'R'},{x:503,z:870})];
await fs.writeFile(path.join(import.meta.dirname,'seed-metadata.json'),JSON.stringify({version:metadata.version,world:WORLD_SIZE,station,services:REGIONAL_SERVICE_POINTS,venues:getImmersiveLocations(0),seeds},null,2));
await fs.writeFile(path.join(import.meta.dirname,'package.json'),JSON.stringify({name:'scout-native-linux-qa',version:metadata.version,main:'fixture.cjs'}));
console.log('Prepared three valid schema-2 careers using the current shared game engine and regional coordinates.');
