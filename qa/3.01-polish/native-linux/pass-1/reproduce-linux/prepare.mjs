import fs from 'node:fs/promises';
import path from 'node:path';
import { newGame, act, validGame } from '../../../../src/lib/game.ts';
import { REGIONAL_SERVICE_POINTS, WORLD_ROADS, WORLD_SIZE, getImmersiveLocations } from '../../../../src/lib/immersive-locations.ts';
const root=path.resolve(import.meta.dirname,'../../../..');
const metadata=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
function seed(slot,vehicle,player,{mode='foot',destination=slot===1?1:null}={}){
  let game=newGame(8300+slot);game.style.name='Linux QA '+slot;game.story={phase:'complete',choice:null};game.briefing=false;
  game.immersion={schema:2,tier:0,interior:null,player:{yaw:0,pitch:0,...player},vehicle:{heading:0,speed:0,steering:0,distance:0,fuel:12,gear:'D',damage:0,disabled:false,...vehicle},mode,destination,parkedAt:[],tutorial:'complete',thoughtsSeen:[],homeReviewed:true};
  game.field={...game.field,fuel:game.immersion.vehicle.fuel};
  game=act(game,{type:'immersionSnapshot',snapshot:game.immersion});
  if(!validGame(game))throw new Error('QA seed '+slot+' is not a valid real career.');return game;
}
const station=REGIONAL_SERVICE_POINTS.find(point=>point.id==='eastmere-fuel');
const seeds=[seed(1,{x:500,z:870},{x:503,z:870}),seed(2,{...station.parking,distance:1523.4,fuel:4.25,damage:.42},{x:station.parking.x+1.3,z:station.parking.z+6.3}),seed(3,{x:500,z:870,distance:3142.7,fuel:2.25,damage:.93,disabled:true,gear:'R'},{x:503,z:870})];
const artSeeds=[
  {name:'eastmere-interstate-sign',sign:'eastmere-exit-1',career:seed(2,{x:2935,z:1105,heading:-Math.PI/2},{x:2935,z:1105},{mode:'driving',destination:null})},
  {name:'eastmere-welcome-sign',sign:'eastmere-welcome-eastmere-avenue-1',career:seed(2,{x:3146,z:1186,heading:Math.PI},{x:3146,z:1186},{mode:'driving',destination:null})},
];
const coastRoad=WORLD_ROADS.find(road=>road.id==='coast-access'),lighthouseX=coastRoad.x+coastRoad.width/2;
artSeeds.push({name:'tideglass-coast-overlook',sign:null,career:seed(2,{x:lighthouseX-10,z:coastRoad.z},{x:lighthouseX-12,z:coastRoad.z+44,yaw:-Math.PI/2},{destination:null})});
// An ordinary saved career on real Eastmere plaza paving. The unmodified resident
// pool deterministically places this actor 7 m ahead; W must produce the contact.
const impactSetup={vehicle:{x:3218,z:1692.4857142857143,heading:-Math.PI},npcId:'pedestrian:eastmere-plaza-column-8-1',victim:{x:3218,z:1699.4857142857143,heading:-Math.PI},minimumSpeed:2.5};
const impactSeed=seed(1,{...impactSetup.vehicle,distance:921.75,fuel:8.5},{x:impactSetup.vehicle.x,z:impactSetup.vehicle.z,yaw:-Math.PI},{mode:'driving',destination:1});
impactSeed.reputation=73;impactSeed.completed=6;impactSeed.attempts=8;
for(const [index,candidate] of impactSeed.candidates.entries()){
  candidate.trust=82;
  if(index<3)Object.assign(candidate,{status:'hired',discovered:true,hiredWeek:1,wage:1500,morale:92,verified:true,completed:3});
}
if(!validGame(impactSeed))throw Error('The progressed NPC-impact QA career is not a valid real career.');
// Keep the restart regression outside the incident slot. Its old scene and
// vehicle are far from the fresh chapter's headquarters, so a stale Cannon
// world or stale flush cannot accidentally satisfy the expected checkpoint.
const restartSeed=structuredClone(impactSeed);
restartSeed.style.name='Linux QA 2';restartSeed.immersion=structuredClone(seeds[1].immersion);
restartSeed.field={...restartSeed.field,fuel:restartSeed.immersion.vehicle.fuel};
const restartExpected=act(restartSeed,{type:'repeat'});
if(!validGame(restartSeed)||!validGame(restartExpected))throw Error('The same-chapter restart QA careers are not valid real careers.');
await fs.writeFile(path.join(import.meta.dirname,'seed-metadata.json'),JSON.stringify({version:metadata.version,world:WORLD_SIZE,station,services:REGIONAL_SERVICE_POINTS,venues:getImmersiveLocations(0),seeds,artSeeds,impactSetup,impactSeed,restartSeed,restartExpected},null,2));
await fs.writeFile(path.join(import.meta.dirname,'package.json'),JSON.stringify({name:'scout-native-linux-qa',version:metadata.version,main:'fixture.cjs'}));
console.log('Prepared three valid schema-2 careers using the current shared game engine and regional coordinates.');
