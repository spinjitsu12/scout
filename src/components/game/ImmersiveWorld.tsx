"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import * as THREE from 'three';
import { TIERS, type Action, type Game } from '@/lib/game';
import type { GamePanel, WorldTarget } from '@/lib/game-ui';
import { GAS_PRICES, PAINTS, candidateLocation, fieldOf, styleOf } from '@/lib/expedition';
import { DREAM_CONTACT, DREAM_PITCHES, advancePrologue, chooseProloguePitch, skipPrologueDream } from '@/lib/prologue';
import { scoutAudio } from '@/lib/audio';
import { buildImmersiveWorld, candidateAnchor, getImmersiveLocations, HOME_CAR_SPAWN, HOME_SPAWN, WORLD_ROADS, type WorldInteractable } from '@/lib/immersive-world';
import { applyPersonRagdollPose, createPerson, createVehicle } from '@/lib/immersive-assets';
import { createImmersiveVehicle, immersiveDrivingInput, immersiveVehicleBlocksPoint, immersiveVehicleTelemetry, stepImmersiveVehicle, type ImmersiveVehicleState } from '@/lib/immersive-driving';
import { FOOT_SPEED, IMMERSION_BOUNDS, findLocalWalkPath, immersionOf, moveWalker, normalizeHeading, walkable, worldDistance, type ImmersionSnapshot, type WorldPoint } from '@/lib/immersive-runtime';
import { createImmersiveClock, advanceImmersiveClock, interpolateImmersivePose, smoothImmersiveValue, smoothImmersiveAngle, stepImmersiveWalk } from '@/lib/immersive-motion';
import { createImmersivePerformance, advanceImmersivePerformance } from '@/lib/immersive-performance';
import { createWorldCollisionIndex, nearbyWorldCollisions } from '@/lib/immersive-spatial';
import { createRoadGuide, routeProgress, routeDistanceRemaining } from '@/lib/immersive-navigation';
import { createTrafficWorld } from '@/lib/immersive-traffic';
import { createPedestrianWorld } from '@/lib/immersive-pedestrians';
import { createImmersivePhysics, type ImmersivePhysicsInput } from '@/lib/immersive-physics';
import { impoundVehicle, lawOf, policeResponseIsCurrent, POLICE_RESOLVE_SECONDS } from '@/lib/immersive-law';
import { createPoliceResponseWorld } from '@/lib/immersive-police';
import { findRegionalRoute, REGIONAL_SETTLEMENTS, REGIONAL_SERVICE_POINTS, WORLD_SIZE, regionalSettlementAt, regionalPointOnRoad } from '@/lib/regional-roads';
import './immersive-world.css';

export type ImmersiveWorldProps = {
  game:Game; paused:boolean; run:(action:Action)=>boolean; onInteract:(target:WorldTarget)=>void; onPanelOpen:(panel:GamePanel)=>void;
  focusId?:string|null; onJournalOpen?:()=>void; preferences?:{mouseSensitivity:number;headBob:number;fieldOfView:number;graphicsQuality?:'auto'|'low'|'high'};
};
type ContactInteraction = WorldInteractable & { candidateId?:string };
type Hud = { speed:number; gear:string; mode:'foot'|'driving'; nearby:ContactInteraction|null; nearCar:boolean; location:string; interior:number|null; remaining:number; destination:number|null; fuel:number; pressed:string[]; tutorial:ImmersionSnapshot['tutorial']; player:WorldPoint; heading:number; homeReviewed:boolean; damage:number; stranded:boolean; navigationLabel:string|null };
type Thought = { title:string; text:string };
type ServicePoint = typeof REGIONAL_SERVICE_POINTS[number];
const trapDialogFocus=(event:ReactKeyboardEvent<HTMLElement>)=>{
  if(event.key!=='Tab')return;
  const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'));
  const first=controls[0],last=controls[controls.length-1];
  if(!first){event.preventDefault();event.currentTarget.focus();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
};
type SceneController = { service:(kind:'fuel'|'repair')=>void; tow:()=>void; serviceDestination:(id:string)=>void; snapshot:()=>void; interact:()=>void; destination:(id:number)=>void; requestLook:()=>void; clearInput:()=>void };
const initialHud:Hud = {speed:0,gear:'D',mode:'foot',nearby:null,nearCar:false,location:'Getting ready',interior:null,remaining:0,destination:null,fuel:12,pressed:[],tutorial:'complete',player:{x:500,z:870},heading:0,homeReviewed:false,damage:0,stranded:false,navigationLabel:null};
const keyName=(key:string)=>key.length===1?key.toLowerCase():key;
const movementKeys=new Set(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ']);
const inputTarget=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
const savedVehicle=(vehicle:ImmersiveVehicleState):ImmersionSnapshot['vehicle']=>({x:vehicle.x,z:vehicle.z,heading:normalizeHeading(vehicle.heading),speed:vehicle.speed,steering:vehicle.steering,distance:vehicle.distance,fuel:Math.max(0,Math.min(12,vehicle.fuel)),gear:vehicle.gear,damage:vehicle.damage,disabled:vehicle.disabled});

/** One continuous world: first-person exploration, a modeled cockpit, and short grounded cinematics. */
export default function ImmersiveWorld({game,paused,run,onInteract,onPanelOpen,focusId,onJournalOpen,preferences}:ImmersiveWorldProps){
  const mount=useRef<HTMLDivElement>(null),controller=useRef<SceneController|null>(null);
  const gameRef=useRef(game),pausedRef=useRef(paused),runRef=useRef(run),interactRef=useRef(onInteract),panelRef=useRef(onPanelOpen),journalRef=useRef(onJournalOpen),preferencesRef=useRef(preferences);
  gameRef.current=game;pausedRef.current=paused;runRef.current=run;interactRef.current=onInteract;panelRef.current=onPanelOpen;journalRef.current=onJournalOpen;preferencesRef.current=preferences;
  const [service,setService]=useState<ServicePoint|null>(null),[placeVisible,setPlaceVisible]=useState(true),[mapView,setMapView]=useState<'region'|'nearby'>('region');
  const [hud,setHud]=useState<Hud>(initialHud),[locked,setLocked]=useState(false),[mapOpen,setMapOpen]=useState(false),[thought,setThought]=useState<Thought|null>(null),[toast,setToast]=useState(''),[ready,setReady]=useState(false),[graphicsError,setGraphicsError]=useState(''),[phoneAnswered,setPhoneAnswered]=useState(false),[fade,setFade]=useState(0);
  const modalRef=useRef(false),phaseRef=useRef(game.story?.phase??'complete'),fadeRef=useRef(0);
  const phase=game.story?.phase??'complete';modalRef.current=mapOpen||!!thought||!!service;phaseRef.current=phase;
  const locations=getImmersiveLocations(game.tier);
  const message=useCallback((text:string)=>setToast(text),[]);
  useEffect(()=>{setPlaceVisible(true);const timer=window.setTimeout(()=>setPlaceVisible(false),6500);return()=>window.clearTimeout(timer);},[hud.location]);
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(''),5500);return()=>window.clearTimeout(timer);},[toast]);
  useEffect(()=>{
    const section=mount.current?.parentElement;if(!section)return;
    if(mapOpen||thought||service){section.querySelector<HTMLElement>('[role="dialog"] button')?.focus({preventScroll:true});}
    else if(ready&&!paused)section.querySelector<HTMLElement>('canvas')?.focus({preventScroll:true});
  },[mapOpen,thought,service]);
  useEffect(()=>{if(paused||mapOpen||thought||service){controller.current?.clearInput();if(document.pointerLockElement)document.exitPointerLock();}},[paused,mapOpen,thought,service]);
  useEffect(()=>{setPhoneAnswered(false);if(phase==='wake'){fadeRef.current=2.4;setFade(1);scoutAudio.sfx('wake');}if(phase==='phone')scoutAudio.sfx('phone');},[phase]);
  useEffect(()=>{if(!focusId)return;controller.current?.destination(candidateLocation(focusId));const person=gameRef.current.candidates.find(candidate=>candidate.id===focusId);message(person?`${person.name} spends time inside ${getImmersiveLocations(gameRef.current.tier)[candidateLocation(focusId)].name}. Follow the route, then explore the building.`:'The venue is marked on your map.');},[focusId,message]);

  useEffect(()=>{
    const element=mount.current;if(!element)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});}catch{setGraphicsError('The 3D renderer could not start. Enable hardware acceleration, then reopen SCOUT.');return;}
    const scene=new THREE.Scene(),sky=gameRef.current.tier===2?'#8c9fa5':'#b9dcec';scene.background=new THREE.Color(sky);scene.fog=new THREE.FogExp2(sky,.00018);
    const camera=new THREE.PerspectiveCamera(preferencesRef.current?.fieldOfView??70,1,.06,7000);camera.rotation.order='YXZ';
    let performanceState=createImmersivePerformance(preferencesRef.current?.graphicsQuality??'auto',window.devicePixelRatio||1);
    renderer.setPixelRatio(performanceState.pixelRatio);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=performanceState.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.className='immersive-world__canvas';renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','First-person scout world. WASD moves, mouse looks, E interacts. Right-click nearby visible floor to walk when the cursor is released.');element.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight('#fff4df','#608e91',2.1));
    const sun=new THREE.DirectionalLight('#ffe3ba',3.4);sun.castShadow=performanceState.shadows;sun.shadow.mapSize.set(preferencesRef.current?.graphicsQuality==='high'?2048:1024,preferencesRef.current?.graphicsQuality==='high'?2048:1024);Object.assign(sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:10,far:400});sun.shadow.bias=-.00035;sun.shadow.normalBias=.08;scene.add(sun,sun.target);
    const world=buildImmersiveWorld({tier:gameRef.current.tier,ambientResidents:false});scene.add(world.group);
    const collisionIndex=createWorldCollisionIndex(world.collisions),traffic=createTrafficWorld({roads:WORLD_ROADS,maxCars:72}),roadGuide=createRoadGuide(),pedestrians=createPedestrianWorld({...world,maxPeople:12});scene.add(traffic.group,roadGuide.group,pedestrians.group);
    const style=styleOf(gameRef.current),vehicleModel=createVehicle({paint:PAINTS[style.paint],plate:style.plate}),playerModel=createPerson({avatar:style.avatar}),dreamContact=createPerson({avatar:4});scene.add(vehicleModel.group,playerModel.group,dreamContact.group);
    const npcModels=new Map<string,ReturnType<typeof createPerson>>(),state=immersionOf(gameRef.current);
    let vehicle={...createImmersiveVehicle(state.vehicle),...state.vehicle,speed:0};
    const initialLaw=lawOf(gameRef.current),struckNpcIds=new Set(initialLaw.handled.map(id=>id.split(':').slice(2).join(':')));
    for(const id of struckNpcIds)pedestrians.retire(id);
    const physics=createImmersivePhysics({vehicle,nearbyCollisions:(point,radius)=>nearbyWorldCollisions(collisionIndex,point,radius,-1,20),bounds:IMMERSION_BOUNDS,struckNpcIds:[...struckNpcIds]}),police=createPoliceResponseWorld({collisions:world.collisions});scene.add(police.group);
    let incidentSequence=initialLaw.sequence,policeClock=0,policeResponseId=initialLaw.response?.id??null,resolvedIncidentId=initialLaw.last?.resolved?initialLaw.last.id:null;
    let lookYaw=0,bodyYaw=state.player.yaw,lastPhase=phaseRef.current==='wake'&&!state.parkedAt.includes(5)?'phone':phaseRef.current;
    let lastTime=performance.now(),elapsed=0,phaseStarted=0,hudClock=0,saveClock=0,frame=0,disposed=false,worldMoved=false,stepDistance=0,tutorialClock=0,steerStart=vehicle.heading,lastCollision=false,contactSignature='',lastInterior=state.interior,lastFuel=gameRef.current.field?.fuel??12,environmentKey='';
    let clock=createImmersiveClock(),walkVelocity={x:0,z:0},previousVehiclePose={x:vehicle.x,z:vehicle.z,heading:vehicle.heading},previousPlayerPose={x:state.player.x,z:state.player.z,heading:bodyYaw};
    let driveRoute:WorldPoint[]=[],navigationTarget:{point:WorldPoint;name:string;id:string}|null=null,routeKey='',routeClock=0,hasRendered=false,renderViewYaw=state.player.yaw,renderViewPitch=state.player.pitch,renderCarLook=0,presentationMode=state.mode;
    let renderDirty=true,lastActive=!pausedRef.current&&!modalRef.current&&!document.hidden,lastRenderedFov=camera.fov;
    let externalDestination=(gameRef.current as Game&{immersion?:ImmersionSnapshot}).immersion?.destination;
    let route:WorldPoint[]=[],nearby:ContactInteraction|null=null,dreamRoute:WorldPoint[]=[],dreamWalker:WorldPoint|null=null;
    const keys=new Set<string>(),raycaster=new THREE.Raycaster(),floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.035),carEye=new THREE.Vector3(),cameraTarget=new THREE.Vector3();
    let solids=nearbyWorldCollisions(collisionIndex,state.player,42,.25,1.72);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const blockedFootPoint=(point:WorldPoint)=>immersiveVehicleBlocksPoint(point,vehicle)||pedestrians.blocksPoint(point)||[...npcModels].some(([id,model])=>!struckNpcIds.has(`candidate:${id}`)&&model.group.visible&&Math.hypot(point.x-model.group.position.x,point.z-model.group.position.z)<.58)||(dreamContact.group.visible&&Math.hypot(point.x-dreamContact.group.position.x,point.z-dreamContact.group.position.z)<.58);
    const containingLocation=(point:WorldPoint)=>world.locations.find(location=>{if(location.id===4)return false;const b=location.footprint;return point.x>=b.minX+.35&&point.x<=b.maxX-.35&&point.z>=b.minZ+.35&&point.z<=b.maxZ-.35;});
    const focusPedestrians=(interior:number|null)=>{
      const lightBudget=performanceState.quality==='low'||!performanceState.shadows,population=['sky','cruise','meeting','phone'].includes(phaseRef.current)||interior===5?0:interior===null?(lightBudget?4:8):(lightBudget?2:3);
      pedestrians.setFocus({position:state.mode==='driving'?vehicle:state.player,interior,driving:state.mode==='driving',population});
    };
    if(!walkable(state.player,solids)){const safe=world.locations.find(location=>location.id===state.interior)?.interiorSpawn??world.homeSpawn;state.player.x=safe.x;state.player.z=safe.z;}
    const sync=()=>{
      if(disposed||state.tier!==gameRef.current.tier)return;state.vehicle=savedVehicle(vehicle);state.player.yaw=normalizeHeading(state.player.yaw);state.player.pitch=Math.max(-1.25,Math.min(1.25,state.player.pitch));
      if(!runRef.current({type:'immersionSnapshot',snapshot:structuredClone(state)}))return;
      worldMoved=false;saveClock=0;
    };
    const clearInput=()=>{keys.clear();route=[];walkVelocity={x:0,z:0};scoutAudio.setDriving(0);};
    const resetPresentation=()=>{previousVehiclePose={x:vehicle.x,z:vehicle.z,heading:vehicle.heading};previousPlayerPose={x:state.player.x,z:state.player.z,heading:bodyYaw};renderViewYaw=state.mode==='driving'?vehicle.heading:state.player.yaw;renderViewPitch=state.player.pitch;renderCarLook=lookYaw;clock=createImmersiveClock();renderDirty=true;};
    const adoptImpound=(snapshot:ImmersionSnapshot,id:string)=>{resolvedIncidentId=id;Object.assign(state,snapshot);vehicle={...createImmersiveVehicle(state.vehicle),...state.vehicle,speed:0};physics.resetVehicle(vehicle);for(const actorId of struckNpcIds){pedestrians.retire(actorId);physics.retireRagdoll(actorId);}bodyYaw=state.player.yaw;lookYaw=0;clearInput();resetPresentation();routeKey='';fadeRef.current=1.3;setFade(1);message('Police have impounded the compact at the nearest service station. Your career penalty remains.');};
    const requestLook=()=>{
      if(pausedRef.current||modalRef.current||['sky','meeting','phone'].includes(phaseRef.current))return;
      void scoutAudio.start(gameRef.current.tier);renderer.domElement.focus({preventScroll:true});
      try{const pending=renderer.domElement.requestPointerLock();if(pending)pending.catch(()=>message('Hold the left mouse button to look around, or click the scene to capture the mouse.'));}catch{message('Click the scene to look around. Escape releases the cursor.');}
    };
    const chooseDestination=(id:number)=>{navigationTarget=null;routeKey='';state.destination=id;if(id<5)runRef.current({type:'setDestination',destination:id});sync();setMapOpen(false);message(`${world.locations.find(location=>location.id===id)?.name??'Destination'} marked. Follow the roads, pull into the forecourt, and explore on foot.`);};
    const revealThought=(title:string,text:string)=>{clearInput();if(document.pointerLockElement)document.exitPointerLock();setThought({title,text});};
    const exitCar=()=>{
      if(Math.abs(vehicle.speed)>.65){message('Brake to a complete stop before stepping out.');return;}
      const side=new THREE.Vector3(-2.05,0,.6).applyAxisAngle(new THREE.Vector3(0,1,0),vehicle.heading),other=side.clone().negate();
      const exit=[side,other].map(offset=>({x:vehicle.x+offset.x,z:vehicle.z+offset.z})).find(point=>walkable(point,solids)&&!blockedFootPoint(point));
      if(!exit){message('There is no room to open the door here. Move into an open parking space.');return;}
      state.mode='foot';state.player={...exit,yaw:vehicle.heading,pitch:0};vehicle.speed=0;vehicle.steering=0;lookYaw=0;route=[];keys.clear();
      const arrived=world.locations.find(location=>worldDistance(vehicle,location.parking)<25);if(arrived&&!state.parkedAt.includes(arrived.id))state.parkedAt.push(arrived.id);
      if(arrived){message(`Parked at ${arrived.name}. Find the entrance and take your time inside.`);scoutAudio.sfx('arrival');}
      scoutAudio.setInVehicle(false);scoutAudio.setDriving(0);scoutAudio.sfx('exitCar');sync();
    };
    const interact=()=>{
      if(pausedRef.current||modalRef.current)return;
      if(state.mode==='driving'){exitCar();return;}
      if(worldDistance(state.player,vehicle)<3.4&&(!nearby||nearby.type==='fuel')){state.mode='driving';state.player.pitch=0;state.player.yaw=vehicle.heading;lookYaw=0;route=[];keys.clear();scoutAudio.setInVehicle(true);scoutAudio.sfx('enterCar');sync();requestLook();return;}
      if(!nearby){message('Walk close to a person, a noticeboard, or your car and press E.');return;}
      const target=nearby;
      if(['door','exit','home'].includes(target.type)){fadeRef.current=.32;message(target.type==='exit'?'Your car is parked outside.':`Step through the entrance to ${world.locations.find(location=>location.id===target.locationId)?.name}.`);return;}
      if(target.type==='thought'){if(!state.thoughtsSeen.includes(target.id))state.thoughtsSeen.push(target.id);sync();revealThought(target.label,target.detail??'A quiet corner of town. There is time to notice the details.');scoutAudio.sfx('interact');return;}
      if(target.type==='laptop'){state.homeReviewed=true;sync();revealThought('Your first morning',phaseRef.current==='wake'?'Cirrus Works • Trainee Scout\n\nA modest car, a new notebook, and a company willing to give you a chance. Your first assignment is waiting at headquarters. Leave through the front door, take your car, and drive to Cirrus Works. Good scouting starts with a patient conversation.':'Your scouting notebook is here whenever you need a quiet moment. Check the map, think about the people you met, and plan a drive worth taking.');return;}
      if(target.candidateId==='dream-luca'){sync();runRef.current({type:'story',state:advancePrologue(gameRef.current.story!)});return;}
      if(phaseRef.current==='cruise'){message('Luca is working inside Maker Yard. Find him and hear what he has to say.');return;}
      if(target.type==='fuel'){const station=REGIONAL_SERVICE_POINTS.find(point=>worldDistance(point.parking,target.position)<12);if(station){clearInput();if(document.pointerLockElement)document.exitPointerLock();sync();setService(station);}return;}
      if(phaseRef.current==='wake'){message('Your first briefing is at Cirrus Works. Review the laptop, then drive there in your car.');return;}
      sync();clearInput();if(document.pointerLockElement)document.exitPointerLock();scoutAudio.sfx('interact');
      if(target.candidateId)interactRef.current({kind:'candidate',id:target.candidateId});
      else if(target.type==='sources'&&target.locationId>0)panelRef.current({kind:'venue',source:target.locationId-1});
      else if(['missions','career','team','week'].includes(target.type))interactRef.current({kind:'station',station:target.type as 'missions'|'career'|'team'|'week'});
    };
    const serviceAction=(kind:'fuel'|'repair')=>{
      const station=REGIONAL_SERVICE_POINTS.find(point=>worldDistance(point.parking,vehicle)<25);if(!station)return;sync();
      if(kind==='fuel'){if(runRef.current({type:'refuel'})){vehicle.fuel=12;lastFuel=12;message('Tank filled. Ready for the next drive.');scoutAudio.sfx('refuel');}}
      else if(runRef.current({type:'vehicleService',station:station.id})){vehicle.damage=0;vehicle.disabled=false;vehicle.collision=false;message('The compact is repaired and ready for the road.');}
      state.vehicle=savedVehicle(vehicle);renderDirty=true;sync();setService(null);
    };
    const tow=()=>{
      sync();if(!runRef.current({type:'roadside'}))return;
      const station=REGIONAL_SERVICE_POINTS.reduce((best,point)=>worldDistance(vehicle,point.parking)<worldDistance(vehicle,best.parking)?point:best);
      vehicle={...createImmersiveVehicle({...vehicle,...station.parking,heading:0}),distance:vehicle.distance,gear:vehicle.gear};physics.resetVehicle(vehicle);state.mode='foot';state.interior=null;state.player={x:station.parking.x+3,z:station.parking.z,yaw:Math.PI/2,pitch:0};bodyYaw=state.player.yaw;
      if(station.locationId===4&&!state.parkedAt.includes(4))state.parkedAt.push(4);
      previousVehiclePose={x:vehicle.x,z:vehicle.z,heading:vehicle.heading};previousPlayerPose={x:state.player.x,z:state.player.z,heading:bodyYaw};fadeRef.current=2.4;setFade(1);routeKey='';clearInput();resetPresentation();sync();message(`Roadside assistance brought you to ${station.name}. Fuel and repairs are available at the pump.`);
    };
    const serviceDestination=(id:string)=>{const station=REGIONAL_SERVICE_POINTS.find(point=>point.id===id);if(!station)return;navigationTarget={point:{...station.parking},name:station.name,id};state.destination=null;routeKey='';sync();setMapOpen(false);};
    controller.current={snapshot:sync,interact,destination:chooseDestination,requestLook,clearInput,service:serviceAction,tow,serviceDestination};
    const onKeyDown=(event:KeyboardEvent)=>{
      if(inputTarget(event.target)||pausedRef.current)return;const key=keyName(event.key);
      if(key==='Escape'){
        if(document.pointerLockElement===renderer.domElement){event.preventDefault();clearInput();document.exitPointerLock();return;}
        if(modalRef.current){event.preventDefault();clearInput();setMapOpen(false);setThought(null);setService(null);}return;
      }if(modalRef.current)return;
      if(movementKeys.has(key)){event.preventDefault();keys.add(key);route=[];}if(event.repeat)return;
      if(key==='e'){event.preventDefault();interact();}if(key==='m'){event.preventDefault();clearInput();setMapOpen(true);}
      if((key==='j'||key==='Tab')&&phaseRef.current==='complete'){event.preventDefault();sync();clearInput();if(journalRef.current)journalRef.current();else panelRef.current({kind:'sources'});}
      if(key==='t'&&state.mode==='foot'&&worldDistance(state.player,vehicle)<12&&(vehicle.disabled||vehicle.fuel<=.05)){event.preventDefault();tow();}
      if(key==='r'&&state.mode==='driving'){const status=scoutAudio.getStatus();scoutAudio.setRadio(!status.radioEnabled);runRef.current({type:'preferences',radio:!status.radioEnabled});message(status.radioEnabled?'Radio off. Just the road and the engine.':'Radio on. Settle into the drive.');}
    };
    const onKeyUp=(event:KeyboardEvent)=>keys.delete(keyName(event.key));
    const onLock=()=>{setLocked(document.pointerLockElement===renderer.domElement);if(!document.pointerLockElement)keys.clear();};
    const onMouseMove=(event:MouseEvent)=>{
      if(pausedRef.current||modalRef.current||['sky','meeting','phone'].includes(phaseRef.current))return;
      if(document.pointerLockElement!==renderer.domElement&&!(event.buttons&1))return;
      const sensitivity=(preferencesRef.current?.mouseSensitivity??1)*.00175,delta=event.movementX*sensitivity;
      if(state.mode==='driving')lookYaw=Math.max(-1.5,Math.min(1.5,lookYaw-delta));else state.player.yaw=normalizeHeading(state.player.yaw-delta);
      state.player.pitch=Math.max(-1.16,Math.min(1.16,state.player.pitch-event.movementY*sensitivity));
    };
    const onClick=()=>requestLook();
    const onRightClick=(event:MouseEvent)=>{
      event.preventDefault();if(pausedRef.current||modalRef.current||state.mode==='driving')return;
      if(document.pointerLockElement){document.exitPointerLock();return;}
      const bounds=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-((event.clientY-bounds.top)/bounds.height*2-1)),camera);
      const point=new THREE.Vector3();if(!raycaster.ray.intersectPlane(floorPlane,point)){message('Right-click a nearby stretch of visible floor to walk there.');return;}
      const destination={x:point.x,z:point.z};
      const next=findLocalWalkPath(state.player,destination,nearbyWorldCollisions(collisionIndex,state.player,65,.25,1.72),38,blockedFootPoint);if(!next.length){message('Choose an open spot nearby. Furniture, people, and walls need a little room.');return;}keys.clear();route=next;
    };
    const onBlur=()=>{clearInput();sync();};
    const onVisibility=()=>{clearInput();clock=createImmersiveClock();lastTime=performance.now();resetPresentation();if(document.hidden)sync();};
    const onContextLost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(frame);clearInput();sync();setReady(false);setGraphicsError('The graphics paused. Your progress is preserved; waiting for the display to recover.');};
    const prepare=()=>renderer.compileAsync(scene,camera).then(()=>{if(!disposed){lastTime=performance.now();frame=requestAnimationFrame(animate);}}).catch(error=>{if(!disposed)setGraphicsError('The world could not finish loading. '+(error instanceof Error?error.message:String(error)));});
    const onContextRestored=()=>{if(disposed)return;hasRendered=false;setGraphicsError('');renderDirty=true;resetPresentation();void prepare();};
    window.addEventListener('keydown',onKeyDown,true);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',onBlur);window.addEventListener('scout:flush-field',sync);document.addEventListener('pointerlockchange',onLock);document.addEventListener('visibilitychange',onVisibility);renderer.domElement.addEventListener('webglcontextlost',onContextLost);renderer.domElement.addEventListener('webglcontextrestored',onContextRestored);
    renderer.domElement.addEventListener('mousemove',onMouseMove);renderer.domElement.addEventListener('click',onClick);renderer.domElement.addEventListener('contextmenu',onRightClick);
    const resize=()=>{const width=Math.max(320,element.clientWidth),height=Math.max(240,element.clientHeight);renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();renderDirty=true;},observer=new ResizeObserver(resize);observer.observe(element);resize();
    const updateContacts=()=>{
      const contacts=gameRef.current.candidates.filter(person=>person.discovered&&person.status==='available'),signature=contacts.map(person=>person.id).join(',');if(signature===contactSignature)return;contactSignature=signature;
      const live=new Set(contacts.map(person=>person.id));for(const[id,model]of npcModels)if(!live.has(id)){scene.remove(model.group);model.dispose();npcModels.delete(id);}
      for(const person of contacts)if(!npcModels.has(person.id)){const avatar=(Number(person.id.split('-')[1])||0)%16,model=createPerson({avatar}),anchor=candidateAnchor(gameRef.current.tier,person.id);model.group.position.set(anchor.x,0,anchor.z);model.group.rotation.y=avatar%4*Math.PI/2;scene.add(model.group);npcModels.set(person.id,model);}
    };
    const animate=(now:number)=>{
      if(disposed)return;try{frame=requestAnimationFrame(animate);const wallDt=Math.max(0,(now-lastTime)/1000);lastTime=now;
      const active=!pausedRef.current&&!modalRef.current&&!document.hidden,currentPhase=phaseRef.current,intervalActive=active&&lastActive;
      if(active!==lastActive){lastActive=active;resetPresentation();}if(state.mode!==presentationMode){presentationMode=state.mode;resetPresentation();}
      const timing=advanceImmersiveClock(clock,wallDt,intervalActive);clock=timing.clock;const dt=timing.elapsed,frameDt=Math.min(.06,wallDt);if(active)elapsed+=dt;
      solids=nearbyWorldCollisions(collisionIndex,state.player,42,.25,1.72);
      const nextPerformance=advanceImmersivePerformance(performanceState,wallDt,{quality:preferencesRef.current?.graphicsQuality??'auto',devicePixelRatio:window.devicePixelRatio||1,active:intervalActive&&hasRendered});
      const shadowSize=nextPerformance.state.quality==='high'?2048:1024;
      if(sun.shadow.mapSize.width!==shadowSize){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.needsUpdate=true;renderDirty=true;}
      performanceState=nextPerformance.state;
      if(nextPerformance.changed){renderer.setPixelRatio(nextPerformance.pixelRatio);renderer.shadowMap.enabled=nextPerformance.shadows;sun.castShadow=nextPerformance.shadows;renderDirty=true;}
      if(currentPhase!==lastPhase){
        clearInput();lastPhase=currentPhase;phaseStarted=elapsed;renderDirty=true;
        if(currentPhase==='cruise'){state.mode='driving';state.destination=1;routeKey='';lookYaw=0;}
        if(currentPhase==='wake'){vehicle=createImmersiveVehicle({...HOME_CAR_SPAWN,heading:Math.PI,fuel:12});physics.resetVehicle(vehicle);state.vehicle=savedVehicle(vehicle);state.mode='foot';state.interior=5;state.player={...HOME_SPAWN,yaw:-Math.PI/2,pitch:0};state.parkedAt=[5];state.destination=0;state.homeReviewed=false;state.tutorial=state.tutorial==='complete'?'complete':'accelerate';lookYaw=0;previousVehiclePose={x:vehicle.x,z:vehicle.z,heading:vehicle.heading};previousPlayerPose={x:state.player.x,z:state.player.z,heading:state.player.yaw};bodyYaw=state.player.yaw;routeKey='';sync();}
        if(currentPhase==='phone'){dreamWalker={...world.locations[1].candidateSpawns[2]};const door=world.locations[1].door;dreamRoute=findLocalWalkPath(dreamWalker,{x:door.x,z:door.z+5},nearbyWorldCollisions(collisionIndex,dreamWalker,110,.25,1.72),90);}
        if(['meeting','phone'].includes(currentPhase)&&document.pointerLockElement)document.exitPointerLock();
      }
      const incomingDestination=(gameRef.current as Game&{immersion?:ImmersionSnapshot}).immersion?.destination;if(incomingDestination!==externalDestination){externalDestination=incomingDestination;if(incomingDestination!==undefined){if(incomingDestination!==state.destination){navigationTarget=null;routeKey='';}state.destination=incomingDestination;}}
      const currentLaw=lawOf(gameRef.current);incidentSequence=Math.max(incidentSequence,currentLaw.sequence);
      if(currentLaw.last?.resolved&&currentLaw.last.id!==resolvedIncidentId)adoptImpound(immersionOf(gameRef.current),currentLaw.last.id);
      if((currentLaw.response?.id??null)!==policeResponseId){policeResponseId=currentLaw.response?.id??null;policeClock=0;}
      const externalFuel=gameRef.current.field?.fuel??vehicle.fuel;if(externalFuel>lastFuel+.001)vehicle.fuel=externalFuel;lastFuel=externalFuel;
      updateContacts();const dream=['sky','cruise','meeting','phone'].includes(currentPhase),dreamPosition=world.locations[1].candidateSpawns[2];
      dreamContact.group.visible=dream&&currentPhase!=='sky';
      let dreamWalkSpeed=0;
      if(currentPhase==='phone'&&dreamWalker&&dreamRoute.length&&active){const next=dreamRoute[0],distance=worldDistance(dreamWalker,next);if(distance<.2)dreamRoute.shift();else{const dx=(next.x-dreamWalker.x)/distance,dz=(next.z-dreamWalker.z)/distance,previous=dreamWalker;dreamWalker=moveWalker(dreamWalker,{x:dx*1.2*dt,z:dz*1.2*dt},nearbyWorldCollisions(collisionIndex,dreamWalker,42,.25,1.72));dreamWalkSpeed=worldDistance(previous,dreamWalker)/Math.max(dt,.001);dreamContact.group.rotation.y=Math.atan2(-dx,-dz);}}
      const contactPoint=currentPhase==='phone'&&dreamWalker?dreamWalker:dreamPosition;dreamContact.group.position.set(contactPoint.x,0,contactPoint.z);if(currentPhase!=='phone')dreamContact.group.rotation.y=Math.PI;dreamContact.update(dreamWalkSpeed,elapsed);
      const ragdollPoses=physics.ragdolls;for(const[id,model]of npcModels){const bodyId=`candidate:${id}`,ragdoll=ragdollPoses.find(pose=>pose.npcId===bodyId),position=ragdoll?.parts.pelvis.position??model.group.position;model.group.visible=!dream&&(!struckNpcIds.has(bodyId)||!!ragdoll)&&worldDistance(state.player,position)<210;if(!struckNpcIds.has(bodyId))model.update(0,elapsed+(Number(id.split('-')[1])||0));}
      focusPedestrians(state.mode==='foot'?containingLocation(state.player)?.id??null:null);
      let movingSpeed=active&&state.mode==='foot'?Math.hypot(walkVelocity.x,walkVelocity.z):0,collidedFrame=false;
      for(let tick=0;tick<timing.steps;tick++){
        const step=timing.stepSeconds,tickTime=elapsed-dt+(tick+1)*step,previous=vehicle,previousFoot={x:state.player.x,z:state.player.z},canMove=!['sky','meeting','phone'].includes(currentPhase),response=lawOf(gameRef.current).response;
        previousVehiclePose={x:vehicle.x,z:vehicle.z,heading:vehicle.heading};previousPlayerPose={x:state.player.x,z:state.player.z,heading:bodyYaw};
        const input=response?.phase==='arrived'?{throttle:0,brake:1,steer:0}:immersiveDrivingInput(keys);
        let proposed=vehicle,walking:ImmersivePhysicsInput['walker'];
        if(canMove&&state.mode==='driving')proposed=stepImmersiveVehicle(vehicle,input,step,{solids:[],bounds:IMMERSION_BOUNDS});
        else if(canMove){
          const forward=Number(keys.has('w')||keys.has('ArrowUp'))-Number(keys.has('s')||keys.has('ArrowDown')),side=Number(keys.has('d')||keys.has('ArrowRight'))-Number(keys.has('a')||keys.has('ArrowLeft'));
          let dx=-Math.sin(state.player.yaw)*forward+Math.cos(state.player.yaw)*side,dz=-Math.cos(state.player.yaw)*forward-Math.sin(state.player.yaw)*side;
          if(route.length&&!forward&&!side){const target=route[0],distance=worldDistance(state.player,target);if(distance<.24)route.shift();else{dx=(target.x-state.player.x)/distance;dz=(target.z-state.player.z)/distance;}}
          const walked=stepImmersiveWalk(walkVelocity,{x:dx,z:dz},step,FOOT_SPEED);walkVelocity=walked.velocity;walking={position:previousFoot,displacement:walked.displacement};
          if(Math.hypot(dx,dz)>.001){bodyYaw=smoothImmersiveAngle(bodyYaw,Math.atan2(-dx,-dz),12,step);if(route.length)state.player.yaw=smoothImmersiveAngle(state.player.yaw,bodyYaw,5,step);}
        }
        const point=state.mode==='driving'?vehicle:state.player;traffic.simulation.update(step,tickTime,{x:point.x,z:point.z,heading:state.mode==='driving'?vehicle.heading:state.player.yaw,speed:state.mode==='driving'?vehicle.speed:0,driving:state.mode==='driving'});
        police.update(response,vehicle,step,tickTime);
        const occupiedPoints=[...npcModels].filter(([id,model])=>model.group.visible&&!struckNpcIds.has(`candidate:${id}`)).map(([,model])=>({x:model.group.position.x,z:model.group.position.z}));
        pedestrians.update(step,tickTime,{player:state.mode==='foot'?state.player:undefined,vehicle,nearbyCollisions:(where,radius)=>traffic.nearbyCollisions(where,radius),blockedPoints:occupiedPoints});
        const careerPeople=dream?[]:[...npcModels].filter(([id,model])=>model.group.visible&&!struckNpcIds.has(`candidate:${id}`)).map(([id,model])=>({id:`candidate:${id}`,x:model.group.position.x,z:model.group.position.z,heading:model.group.rotation.y,speed:0}));
        const contacts=physics.step({dt:step,vehicle:{previous,proposed,driving:canMove&&state.mode==='driving'},walker:walking,pedestrians:[...pedestrians.physicsPedestrians(),...careerPeople,...police.pedestrians()],traffic:[...traffic.simulation.cars,...police.actors()],props:traffic.props});
        vehicle=contacts.vehicle;collidedFrame ||= vehicle.collision;worldMoved ||= worldDistance(previous,vehicle)>.005;
        pedestrians.applyStandingPoses(contacts.standingPedestrians);police.applyStandingPoses(contacts.standingPedestrians);traffic.applyPropPoses(contacts.props);
        for(const pose of contacts.standingPedestrians){if(!pose.id.startsWith('candidate:'))continue;const model=npcModels.get(pose.id.slice(10));if(model){model.group.position.x=pose.x;model.group.position.z=pose.z;}}
        for(const impact of contacts.impacts){const collider=traffic.nearbyCollisions(impact.position,15).find(solid=>solid.id===impact.id);if(collider)traffic.hit({...impact,collider,severity:Math.min(1,impact.normalSpeed/12)});}
        if(state.mode==='driving'){
          state.player.x=vehicle.x;state.player.z=vehicle.z;if(!document.pointerLockElement&&!keys.size)lookYaw=smoothImmersiveValue(lookYaw,0,2.5,step);
          if(state.tutorial==='accelerate'){tutorialClock=input.throttle>.5&&Math.abs(vehicle.speed)>3?tutorialClock+step:0;if(tutorialClock>1.1){state.tutorial='brake';tutorialClock=0;}}
          else if(state.tutorial==='brake'){if(input.brake>.5&&Math.abs(vehicle.speed)<2.5)tutorialClock+=step;if(tutorialClock>.55){state.tutorial='steer';tutorialClock=0;steerStart=vehicle.heading;}}
          else if(state.tutorial==='steer'&&Math.abs(input.steer)>.5&&Math.abs(normalizeHeading(vehicle.heading-steerStart))>.14){state.tutorial='complete';message('You have it. Take the drive at your own pace.');sync();}
        }else if(contacts.walker){
          state.player.x=contacts.walker.x;state.player.z=contacts.walker.z;const travelled=worldDistance(previousFoot,contacts.walker);stepDistance+=travelled;movingSpeed=travelled/step;worldMoved ||= travelled>.001;if(stepDistance>1.5){scoutAudio.sfx('step');stepDistance=0;}
        }
        for(const incident of contacts.incidents){
          struckNpcIds.add(incident.npcId);pedestrians.strike(incident.npcId);sync();incidentSequence=Math.max(incidentSequence,lawOf(gameRef.current).sequence)+1;
          if(runRef.current({type:'pedestrianIncident',incident:{id:`law:${incidentSequence}:${incident.npcId}`,npcId:incident.npcId,position:incident.position,speed:incident.speed}})){message('You struck someone. Emergency services are responding. Your employer has imposed a serious career penalty.');scoutAudio.sfx('bump');}
        }
      }
      if(collidedFrame&&!lastCollision){scoutAudio.sfx('bump');message(vehicle.disabled?'The compact needs repairs. Step out and call roadside assistance.':'That impact damaged the compact. A service station can repair it.');}lastCollision=collidedFrame;
      const renderVehicle=interpolateImmersivePose(previousVehiclePose,{x:vehicle.x,z:vehicle.z,heading:vehicle.heading},timing.alpha),renderPlayer=interpolateImmersivePose(previousPlayerPose,{x:state.player.x,z:state.player.z,heading:bodyYaw},timing.alpha);
      state.vehicle=savedVehicle(vehicle);const containing=state.mode==='foot'?containingLocation(state.player):undefined;state.interior=containing?.id??null;
      if(state.interior!==lastInterior){if(state.interior!==null){fadeRef.current=.28;message(`${containing?.name}. Look around, listen, and find the people behind the work.`);}lastInterior=state.interior;worldMoved=true;}
      if(currentPhase==='wake'&&state.interior===0&&state.homeReviewed&&state.parkedAt.includes(0)&&vehicle.distance>100&&!lawOf(gameRef.current).response){sync();runRef.current({type:'story',state:advancePrologue(gameRef.current.story!)});}
      const interactions:ContactInteraction[]=world.interactables.map(item=>{if(item.type!=='fuel')return item;const station=REGIONAL_SERVICE_POINTS.find(point=>worldDistance(point.parking,item.position)<12);if(!station)return item;const offsets=station.locationId===4?[{x:-4.1,z:0},{x:4.1,z:0}]:[{x:0,z:-6.3},{x:0,z:6.3}],pumps=offsets.map(offset=>({x:station.parking.x+offset.x,z:station.parking.z+offset.z}));return {...item,position:pumps.sort((a,b)=>worldDistance(a,state.player)-worldDistance(b,state.player))[0],range:2.9};});
      if(currentPhase==='cruise')interactions.push({id:'dream-luca',candidateId:'dream-luca',type:'candidate',label:`Talk to ${DREAM_CONTACT.name}`,position:dreamPosition,range:3.2,locationId:1,detail:DREAM_CONTACT.detail});
      else if(!dream)for(const person of gameRef.current.candidates.filter(person=>person.discovered&&person.status==='available'&&!struckNpcIds.has(`candidate:${person.id}`)))interactions.push({id:person.id,candidateId:person.id,type:'candidate',label:`Talk to ${person.name}`,position:npcModels.has(person.id)?{x:npcModels.get(person.id)!.group.position.x,z:npcModels.get(person.id)!.group.position.z}:candidateAnchor(gameRef.current.tier,person.id),range:3.2,locationId:candidateLocation(person.id),detail:person.origin});
      nearby=state.mode==='foot'?interactions.filter(item=>{
        if(['candidate','sources'].includes(item.type)&&(state.interior!==item.locationId||!state.parkedAt.includes(item.locationId)||worldDistance(vehicle,world.locations[item.locationId].parking)>=25))return false;
        if(['laptop','thought','missions','career','week','team'].includes(item.type)&&item.locationId>=0&&item.locationId!==state.interior)return false;
        if(item.type==='laptop'&&(state.player.z<item.position.z+.25||Math.abs(state.player.x-item.position.x)>1.6))return false;
        if(item.type==='fuel'&&(!REGIONAL_SERVICE_POINTS.some(point=>worldDistance(point.parking,item.position)<12&&worldDistance(point.parking,vehicle)<25)))return false;return worldDistance(state.player,item.position)<item.range;
      }).sort((a,b)=>worldDistance(state.player,a.position)-worldDistance(state.player,b.position))[0]??null:null;
      const telemetry=immersiveVehicleTelemetry(vehicle);vehicleModel.group.position.set(renderVehicle.x,0,renderVehicle.z);vehicleModel.group.rotation.y=renderVehicle.heading;vehicleModel.updateDashboard({speedMps:vehicle.speed,fuelGallons:vehicle.fuel,damage:vehicle.damage,gear:vehicle.gear,engineRpm:telemetry.engineRpm,gearNumber:telemetry.gearNumber});vehicleModel.update(vehicle.speed,vehicle.steering,active?frameDt:0);
      playerModel.group.position.set(renderPlayer.x,0,renderPlayer.z);playerModel.group.rotation.y=renderPlayer.heading;playerModel.update(movingSpeed,elapsed,currentPhase==='phone'?'phone':'idle');playerModel.group.visible=currentPhase==='phone';
      if(currentPhase==='phone'){const lift=Math.min(1,Math.max(0,(elapsed-phaseStarted)/1.2));playerModel.rightArm.rotation.x*=lift;playerModel.rightArm.rotation.z*=lift;}
      renderViewYaw=smoothImmersiveAngle(renderViewYaw,state.player.yaw,26,frameDt);renderViewPitch=smoothImmersiveValue(renderViewPitch,state.player.pitch,26,frameDt);renderCarLook=smoothImmersiveValue(renderCarLook,lookYaw,26,frameDt);
      if(currentPhase==='sky'){const angle=-.9+Math.min(1,elapsed/6);camera.position.set(vehicle.x+Math.sin(angle)*8,2.45,vehicle.z+Math.cos(angle)*8);camera.lookAt(vehicle.x,.9,vehicle.z);}
      else if(currentPhase==='phone'){const offset=new THREE.Vector3(3.7,2.4,4.8).applyAxisAngle(new THREE.Vector3(0,1,0),bodyYaw);cameraTarget.set(state.player.x+offset.x,offset.y,state.player.z+offset.z);if(elapsed-phaseStarted<dt*1.1)camera.position.copy(cameraTarget);else camera.position.lerp(cameraTarget,reduced?1:Math.min(1,dt*3));camera.lookAt(state.player.x,1.12,state.player.z);}
      else if(state.mode==='driving'){vehicleModel.group.updateMatrixWorld(true);carEye.copy(vehicleModel.cockpitEye);vehicleModel.group.localToWorld(carEye);camera.position.copy(carEye);camera.rotation.set(renderViewPitch,renderVehicle.heading+renderCarLook,0,'YXZ');}
      else{const bob=!reduced&&movingSpeed>.5?Math.sin(elapsed*9)*.045*(preferencesRef.current?.headBob??.15):0;camera.position.set(renderPlayer.x,1.64+bob,renderPlayer.z);camera.rotation.set(renderViewPitch,renderViewYaw,0,'YXZ');if(currentPhase==='meeting')camera.lookAt(dreamPosition.x,1.45,dreamPosition.z);}
      sun.target.position.set(camera.position.x,0,camera.position.z);sun.position.set(camera.position.x+105,170,camera.position.z+80);const fov=preferencesRef.current?.fieldOfView??70;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}world.setFocus({x:camera.position.x,z:camera.position.z});world.update(active?frameDt:0,elapsed);
      const focusPoint=state.mode==='driving'?vehicle:state.player;traffic.render({x:focusPoint.x,z:focusPoint.z,heading:state.mode==='driving'?vehicle.heading:state.player.yaw,speed:vehicle.speed,driving:state.mode==='driving'},elapsed,active?frameDt:0,timing.alpha);
      focusPedestrians(state.interior);pedestrians.render(elapsed,timing.alpha,active?frameDt:0);
      for(const pose of physics.ragdolls){pedestrians.applyRagdollPose(pose.npcId,pose,timing.alpha);if(pose.npcId.startsWith('candidate:')){const model=npcModels.get(pose.npcId.slice(10));if(model&&model.group.visible)applyPersonRagdollPose(model,pose,timing.alpha);}}
      police.render(timing.alpha,elapsed);police.applyRagdollPoses(physics.ragdolls,timing.alpha);
      const policeResponse=lawOf(gameRef.current).response;scoutAudio.setPoliceResponse(active&&!!policeResponse,policeResponse?.phase==='arrived'?1:.55);
      if(active&&policeResponseIsCurrent(policeResponse,incidentSequence)){policeClock+=dt;if(policeClock>=1){const seconds=Math.min(5,policeClock);policeClock=0;runRef.current({type:'policeAdvance',id:policeResponse.id,seconds});}if(policeResponse.elapsedSeconds>=POLICE_RESOLVE_SECONDS){sync();const impounded={...gameRef.current,immersion:structuredClone(state)};impoundVehicle(impounded);if(runRef.current({type:'policeResolve',id:policeResponse.id}))adoptImpound(impounded.immersion,policeResponse.id);}}
      const routeDestination=world.locations.find(place=>place.id===state.destination),routeTarget=navigationTarget?.point??routeDestination?.parking,targetKey=navigationTarget?.id??String(state.destination);routeClock+=dt;
      if(routeTarget&&(routeKey!==targetKey||(!driveRoute.length)||(routeClock>1.5&&routeProgress(driveRoute,focusPoint).offRoute>45))){driveRoute=findRegionalRoute(focusPoint,routeTarget).points;routeKey=targetKey;routeClock=0;}
      roadGuide.group.visible=state.mode==='driving'&&!!routeTarget&&!['sky','meeting','phone'].includes(currentPhase);roadGuide.update(roadGuide.group.visible?driveRoute:[],focusPoint,elapsed);
      scoutAudio.setInVehicle(state.mode==='driving');scoutAudio.setEngineKind('compact');
      scoutAudio.setVehicleTelemetry({...telemetry,normalizedSpeed:active&&state.mode==='driving'?telemetry.normalizedSpeed:0,engineRunning:active&&state.mode==='driving'&&!vehicle.disabled&&vehicle.fuel>0,engineRpm:active&&state.mode==='driving'?telemetry.engineRpm:0});
      const environmentScene=state.mode==='driving'?'vehicle':state.interior===5?'apartment':state.interior!==null?'interior':'outdoors',conversation=['meeting','phone'].includes(currentPhase)||pausedRef.current||modalRef.current;
      const settlement=regionalSettlementAt(focusPoint),onRoad=regionalPointOnRoad(focusPoint),currentRoad=onRoad?WORLD_ROADS.find(road=>Math.abs(focusPoint.x-road.x)<=road.width/2&&Math.abs(focusPoint.z-road.z)<=road.depth/2):undefined,region=settlement?.character??(currentRoad?.kind==='highway'?'highway':'country'),surface=state.interior===5?'wood':state.interior!==null?'carpet':onRoad?'concrete':'grass',nextEnvironment=environmentScene+region+surface+String(conversation);
      if(nextEnvironment!==environmentKey){environmentKey=nextEnvironment;scoutAudio.setEnvironment({scene:environmentScene,region,surface,timeOfDay:gameRef.current.tier===2?19.3:9.4,conversation});}
      if(fadeRef.current>0){fadeRef.current=Math.max(0,fadeRef.current-wallDt);setFade(Math.min(1,fadeRef.current/1.3));}
      hudClock+=dt;saveClock+=dt;
      if(hudClock>.16){hudClock=0;setHud({speed:telemetry.absoluteMph,gear:vehicle.gear,mode:state.mode,nearby,nearCar:worldDistance(state.player,vehicle)<3.4,location:containing?.name??regionalSettlementAt(focusPoint)?.name??'The coastal countryside',interior:state.interior,remaining:routeTarget&&driveRoute.length?routeDistanceRemaining(driveRoute,focusPoint):routeTarget?worldDistance(focusPoint,routeTarget):0,destination:state.destination,fuel:vehicle.fuel,pressed:[...keys],tutorial:state.tutorial,player:{x:state.player.x,z:state.player.z},heading:state.mode==='driving'?vehicle.heading:state.player.yaw,homeReviewed:state.homeReviewed,damage:vehicle.damage,stranded:vehicle.disabled||vehicle.fuel<=.05,navigationLabel:navigationTarget?.name??null});}
      if(saveClock>5&&worldMoved&&active)sync();
      if(camera.fov!==lastRenderedFov)renderDirty=true;
      if(active||renderDirty){renderer.render(scene,camera);if(!hasRendered){hasRendered=true;setReady(true);}renderDirty=false;lastRenderedFov=camera.fov;}
      }catch(error){cancelAnimationFrame(frame);clearInput();sync();setReady(false);setGraphicsError('The world stopped rendering. Your progress is preserved. Reopen SCOUT to continue.');console.error('SCOUT world rendering failed:',error);}
    };
    world.setFocus(state.mode==='driving'?vehicle:state.player);focusPedestrians(state.interior);pedestrians.render(0);camera.position.set(state.player.x,1.64,state.player.z);
    void prepare();
    return()=>{
      disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',onKeyDown,true);window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',onBlur);window.removeEventListener('scout:flush-field',sync);document.removeEventListener('pointerlockchange',onLock);document.removeEventListener('visibilitychange',onVisibility);renderer.domElement.removeEventListener('webglcontextlost',onContextLost);renderer.domElement.removeEventListener('webglcontextrestored',onContextRestored);
      renderer.domElement.removeEventListener('mousemove',onMouseMove);renderer.domElement.removeEventListener('click',onClick);renderer.domElement.removeEventListener('contextmenu',onRightClick);if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
      for(const model of npcModels.values())model.dispose();vehicleModel.dispose();playerModel.dispose();dreamContact.dispose();roadGuide.dispose();traffic.dispose();pedestrians.dispose();physics.dispose();police.dispose();world.dispose();renderer.dispose();renderer.domElement.remove();scoutAudio.setDriving(0);scoutAudio.setInVehicle(false);scoutAudio.setPoliceResponse(false);controller.current=null;
    };
  },[game.tier,message]);

  const law=lawOf(game),destination=locations.find(location=>location.id===hud.destination),visitingDestination=!!destination&&hud.mode==='foot'&&hud.interior===destination.id;
  const wakingAtHome=phase==='wake'&&!hud.homeReviewed,navigationName=wakingAtHome?'Review your laptop':hud.navigationLabel??destination?.name;
  const mapWidth=mapView==='region'?WORLD_SIZE.width:2400,mapDepth=mapView==='region'?WORLD_SIZE.depth:2000;
  const mapOrigin={x:mapView==='region'?0:Math.max(0,Math.min(WORLD_SIZE.width-mapWidth,hud.player.x-mapWidth/2)),z:mapView==='region'?0:Math.max(0,Math.min(WORLD_SIZE.depth-mapDepth,hud.player.z-mapDepth/2))};
  const mapX=(x:number)=>(x-mapOrigin.x)/mapWidth*100,mapZ=(z:number)=>(z-mapOrigin.z)/mapDepth*100;
  const mapLabelAlign=(x:number)=>mapX(x)<20?'start':mapX(x)>80?'end':'center';
  const inMap=(point:WorldPoint)=>point.x>=mapOrigin.x&&point.x<=mapOrigin.x+mapWidth&&point.z>=mapOrigin.z&&point.z<=mapOrigin.z+mapDepth;
  const mapRoads=WORLD_ROADS.map(road=>{const left=Math.max(mapOrigin.x,road.x-road.width/2),top=Math.max(mapOrigin.z,road.z-road.depth/2),right=Math.min(mapOrigin.x+mapWidth,road.x+road.width/2),bottom=Math.min(mapOrigin.z+mapDepth,road.z+road.depth/2);return {...road,left,top,mapWidth:right-left,mapDepth:bottom-top};}).filter(road=>road.mapWidth>0&&road.mapDepth>0);
  const serviceRepairCost=Math.max(20,Math.ceil(hud.damage*900)),serviceFuelCost=Math.round((12-hud.fuel)*GAS_PRICES[game.tier]*100)/100;
  const quietScene=['meeting','phone'].includes(phase),canInteract=hud.mode==='driving'?hud.speed<1.5:!!hud.nearby||hud.nearCar;
  const interactionLabel=hud.mode==='driving'?'Step out':hud.nearCar&&(!hud.nearby||hud.nearby.type==='fuel')?'Enter your car':hud.nearby?.label;
  const storyAction=(command:'advance'|'skip'|'pitch',choice?:'salary'|'purpose'|'freedom')=>{controller.current?.snapshot();void scoutAudio.start(game.tier);const state=game.story!;run({type:'story',state:command==='skip'?skipPrologueDream(state):command==='pitch'&&choice?chooseProloguePitch(state,choice):advancePrologue(state)});};
  return <section className="immersive-world" data-phase={phase} data-mode={hud.mode} aria-label="SCOUT open world">
    <div ref={mount} className="immersive-world__surface"/>
    {!ready&&!graphicsError&&<div className="immersive-world__loading"><span/>Bringing the coast to life…</div>}
    {graphicsError&&<div className="immersive-world__error" role="alert">{graphicsError}</div>}
    <div className="immersive-world__vignette"/><div className="immersive-world__fade" style={{opacity:fade}} aria-hidden="true"/>
    {ready&&phase!=='sky'&&<>
      {placeVisible&&!toast&&<div className="immersive-world__place"><span>{phase==='wake'?'A NEW MORNING':TIERS[game.tier].name.toUpperCase()}</span><strong>{hud.location}</strong></div>}
      <div className="immersive-world__tools"><button onClick={()=>setMapOpen(true)} aria-label="Open regional map (M)"><span className="immersive-world__key">M</span>Map</button></div>
      {navigationName&&!quietScene&&!visitingDestination&&!law.response&&<div className="immersive-world__navigation"><strong>{navigationName}</strong><small>{wakingAtHome?'Your study · approach the chair':hud.remaining<22?'Park, then explore on foot':`${hud.remaining>999?`${(hud.remaining/1000).toFixed(1)} km`:`${Math.round(hud.remaining)} m`} along the road`}</small></div>}
      {!paused&&!mapOpen&&!thought&&!service&&!quietScene&&canInteract&&<div className="immersive-world__interact"><button onClick={()=>controller.current?.interact()}><span className="immersive-world__key">E</span>{interactionLabel}</button></div>}
      {hud.mode==='foot'&&hud.nearCar&&hud.stranded&&!paused&&!mapOpen&&!thought&&!service&&!quietScene&&<button className="immersive-world__roadside" disabled={game.cash<150} onClick={()=>controller.current?.tow()}><kbd>T</kbd> Call roadside assistance <span>$150</span></button>}
      {locked&&!mapOpen&&!thought&&!service&&!quietScene&&<div className="immersive-world__reticle" aria-hidden="true"/>}
      {hud.mode==='driving'&&hud.tutorial!=='complete'&&['cruise','wake'].includes(phase)&&!paused&&!modalRef.current&&<div className="immersive-world__tutorial" aria-live="polite"><span>LET'S GET COMFORTABLE</span>{hud.tutorial==='accelerate'?<><div className={`immersive-world__tutorial-key ${hud.pressed.includes('w')?'is-pressed':''}`}>W</div><h2>Ease onto the accelerator</h2><p>Hold W to build speed gently.</p></>:hud.tutorial==='brake'?<><div className={`immersive-world__tutorial-key ${hud.pressed.includes('s')?'is-pressed':''}`}>S</div><h2>Give yourself room to slow down</h2><p>Hold S until the car is nearly stopped.</p></>:<><div className="immersive-world__tutorial-steer">{['a','d'].map(key=><div key={key} className={`immersive-world__tutorial-key ${hud.pressed.includes(key)?'is-pressed':''}`}>{key.toUpperCase()}</div>)}</div><h2>Turn the wheel</h2><p>Drive slowly and hold A or D.</p></>}</div>}
    </>}
    {(toast||(ready&&phase!=='sky'&&law.response))&&<div className={`immersive-world__status-stack ${toast?'immersive-world__status-stack--toast':''}`}>
      {toast&&<div className="immersive-world__toast" role="status">{toast}</div>}
      {ready&&phase!=='sky'&&law.response&&<div className="immersive-world__police" data-phase={law.response.phase} role="status"><strong>{law.response.phase==='arrived'?'Police on scene':'Police responding'}</strong><span>{law.response.phase==='arrived'?'Your vehicle is being impounded.':'Stop safely. Emergency services are on their way.'}</span></div>}
    </div>}
    {phase==='sky'&&ready&&<div className="immersive-world__intro"><span>A SCOUT'S STORY</span><h1>Every great team<br/>starts with a person.</h1><p>And every person has a story worth listening to.</p><button onClick={()=>storyAction('advance')}>Take the drive <span>→</span></button><button className="immersive-world__quiet" onClick={()=>storyAction('skip')}>Skip the dream</button></div>}
    {phase==='meeting'&&<div className="immersive-world__conversation"><span>LUCA VALE · INDEPENDENT INVENTOR</span><h2>{game.story?.choice?'He shakes his head.':'“You drove all this way. What did you want to say?”'}</h2>{game.story?.choice?<><p>{DREAM_PITCHES.find(pitch=>pitch.id===game.story?.choice)?.reply}</p><button onClick={()=>storyAction('advance')}>Let him leave</button></>:<><p>You have the title, the car, and the perfect pitch. You haven't yet asked about the person in front of you.</p><div>{DREAM_PITCHES.map(pitch=><button key={pitch.id} onClick={()=>storyAction('pitch',pitch.id)}>{pitch.label}</button>)}</div></>}</div>}
    {phase==='phone'&&<div className="immersive-world__conversation immersive-world__phone"><span>{phoneAnswered?'THE DIRECTOR':'INCOMING CALL'}</span><h2>{phoneAnswered?'“We’ll need your badge back.”':'Your phone begins to ring.'}</h2><p>{phoneAnswered?'“We needed someone who could listen. You tried to sell him a future before finding out what mattered to him. We’re going in another direction.”\n\nYou stand still for a moment. The town carries on around you.':'You reach into your pocket. The screen lights up with the director’s name.'}</p><button onClick={()=>phoneAnswered?storyAction('advance'):setPhoneAnswered(true)}>{phoneAnswered?'Close your eyes':'Answer the call'}</button></div>}
    {thought&&<div className="immersive-world__modal-backdrop"><article className="immersive-world__thought" role="dialog" aria-modal="true" aria-labelledby="immersion-thought-title" onKeyDown={trapDialogFocus}><span>A MOMENT TO YOURSELF</span><h2 id="immersion-thought-title">{thought.title}</h2><p>{thought.text}</p><button onClick={()=>setThought(null)}>Back to the world</button></article></div>}
    {service&&<div className="immersive-world__modal-backdrop"><article className="immersive-world__service" role="dialog" aria-modal="true" aria-labelledby="immersion-service-title" onKeyDown={trapDialogFocus}><header><div><span>A LITTLE CARE FOR THE ROAD</span><h2 id="immersion-service-title">{service.name}</h2></div><button className="immersive-world__close" aria-label="Close service station" onClick={()=>setService(null)}>×</button></header><p>Your compact has plenty of journeys ahead.</p><div className="immersive-world__service-status"><span>Fuel <strong>{hud.fuel.toFixed(1)} / 12 gal</strong></span><span>Condition <strong>{Math.round((1-hud.damage)*100)}%</strong></span></div><div className="immersive-world__service-actions"><button disabled={hud.fuel>=11.999||game.cash<serviceFuelCost} onClick={()=>controller.current?.service('fuel')}><span><b>Fill the tank</b><small>{hud.fuel>=11.999?'Ready to go':`$${GAS_PRICES[game.tier].toFixed(2)} per gallon`}</small></span><strong>${serviceFuelCost.toFixed(2)}</strong></button><button disabled={hud.damage<=.0001||game.cash<serviceRepairCost} onClick={()=>controller.current?.service('repair')}><span><b>Repair the compact</b><small>{hud.damage<=.0001?'Already in good condition':hud.stranded?'Get the engine running again':'Bodywork and mechanical repairs'}</small></span><strong>{hud.damage<=.0001?'—':`$${serviceRepairCost}`}</strong></button></div><footer>Travel budget <b>${game.cash.toFixed(2)}</b><button onClick={()=>setService(null)}>Back to the world</button></footer></article></div>}
    {mapOpen&&<div className="immersive-world__modal-backdrop"><article className="immersive-world__map" role="dialog" aria-modal="true" aria-labelledby="immersion-map-title" onKeyDown={trapDialogFocus}><header><div><span>YOUR SCOUTING NOTEBOOK</span><h2 id="immersion-map-title">The Cirrus Coast</h2></div><button aria-label="Close map" onClick={()=>setMapOpen(false)}>×</button></header><div className="immersive-world__map-toolbar"><p>Harbor towns, campus greens, city lights. Make a day of the journey.</p><div className="map-view-toggle" role="group" aria-label="Map view"><button aria-pressed={mapView==='region'} onClick={()=>setMapView('region')}>Region</button><button aria-pressed={mapView==='nearby'} onClick={()=>setMapView('nearby')}>Nearby</button></div></div><div className="immersive-world__map-layout"><div className="immersive-world__map-drawing">{mapView==='region'&&<div className="map-coast" aria-hidden="true"/>}{REGIONAL_SETTLEMENTS.filter(region=>inMap(region.center)).map(region=><div className={`map-region map-region--${region.character}`} data-label-align={mapLabelAlign(region.center.x)} key={region.id} style={{left:`${mapX(region.center.x)}%`,top:`${mapZ(region.center.z)}%`,width:`${region.radiusX*2/mapWidth*100}%`,height:`${region.radiusZ*2/mapDepth*100}%`}} aria-hidden="true"><span>{region.name}</span></div>)}{mapRoads.map(road=><i key={road.id} className={`map-road map-road--${road.kind}`} aria-hidden="true" style={{left:`${mapX(road.left)}%`,top:`${mapZ(road.top)}%`,width:`${road.mapWidth/mapWidth*100}%`,height:`${road.mapDepth/mapDepth*100}%`}}/>)}{locations.filter(place=>inMap(place.parking)).map(place=><button key={place.id} className={`map-place ${hud.destination===place.id?'is-destination':''}`} data-label-align={mapLabelAlign(place.parking.x)} aria-label={`Drive to ${place.name}`} title={place.name} style={{left:`${mapX(place.parking.x)}%`,top:`${mapZ(place.parking.z)}%`}} onClick={()=>controller.current?.destination(place.id)}>{place.id===5?'H':place.id===4?'F':place.id+1}<span>{place.name}</span></button>)}{REGIONAL_SERVICE_POINTS.filter(point=>point.locationId<0&&inMap(point.parking)).map(point=><button key={point.id} className="map-service" aria-label={`Drive to ${point.name}`} title={point.name} style={{left:`${mapX(point.parking.x)}%`,top:`${mapZ(point.parking.z)}%`}} onClick={()=>controller.current?.serviceDestination(point.id)}>F</button>)}<b className="map-you" style={{left:`${mapX(hud.player.x)}%`,top:`${mapZ(hud.player.z)}%`,transform:`translate(-50%,-50%) rotate(${-hud.heading}rad)`}} aria-label="Your location">▲</b><div className="map-compass" aria-hidden="true">N<br/>↑</div><div className="map-scale" aria-hidden="true"><i style={{width:mapView==='region'?'16.666%':'20.833%'}}/>{mapView==='region'?'2 km':'500 m'}</div></div><div className="immersive-world__map-list"><span className="map-list-heading">Places &amp; people</span>{locations.map(place=><button className={hud.destination===place.id?'is-destination':''} key={place.id} onClick={()=>controller.current?.destination(place.id)}><b>{place.name}</b><span>{place.subtitle}</span></button>)}<span className="map-list-heading">Along the road</span>{REGIONAL_SERVICE_POINTS.filter(point=>point.locationId<0).map(point=><button key={point.id} onClick={()=>controller.current?.serviceDestination(point.id)}><b>{point.name}</b><span>Fuel &amp; repairs</span></button>)}</div></div><footer><span className="map-legend"><i/>Destinations <i/>Fuel &amp; repairs <i/>You are here</span><span>Choose a place. Take the road at your own pace.</span></footer></article></div>}
  </section>;
}
