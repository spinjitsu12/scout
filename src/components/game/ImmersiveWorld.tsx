"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TIERS, type Action, type Game } from '@/lib/game';
import type { GamePanel, WorldTarget } from '@/lib/game-ui';
import { PAINTS, candidateLocation, fieldOf, styleOf } from '@/lib/expedition';
import { DREAM_CONTACT, DREAM_PITCHES, advancePrologue, chooseProloguePitch, skipPrologueDream } from '@/lib/prologue';
import { scoutAudio } from '@/lib/audio';
import { buildImmersiveWorld, candidateAnchor, getImmersiveLocations, HOME_CAR_SPAWN, HOME_SPAWN, publicInteriorContains, WORLD_ROADS, type WorldInteractable } from '@/lib/immersive-world';
import { createPerson, createVehicle } from '@/lib/immersive-assets';
import { createImmersiveVehicle, immersiveDrivingInput, immersiveVehicleBlocksPoint, immersiveVehicleTelemetry, stepImmersiveVehicle, type ImmersiveVehicleState } from '@/lib/immersive-driving';
import { FOOT_SPEED, IMMERSION_BOUNDS, findLocalWalkPath, immersionOf, moveWalker, normalizeHeading, walkable, worldDistance, type ImmersionSnapshot, type WorldPoint } from '@/lib/immersive-runtime';
import './immersive-world.css';

export type ImmersiveWorldProps = {
  game:Game; paused:boolean; run:(action:Action)=>boolean; onInteract:(target:WorldTarget)=>void; onPanelOpen:(panel:GamePanel)=>void;
  focusId?:string|null; onJournalOpen?:()=>void; preferences?:{mouseSensitivity:number;headBob:number;fieldOfView:number};
};
type ContactInteraction = WorldInteractable & { candidateId?:string };
type Hud = { speed:number; gear:string; mode:'foot'|'driving'; nearby:ContactInteraction|null; nearCar:boolean; location:string; interior:number|null; remaining:number; destination:number|null; fuel:number; pressed:string[]; tutorial:ImmersionSnapshot['tutorial']; player:WorldPoint; heading:number; homeReviewed:boolean };
type Thought = { title:string; text:string };
type SceneController = { snapshot:()=>void; interact:()=>void; destination:(id:number)=>void; requestLook:()=>void; clearInput:()=>void };
const initialHud:Hud = {speed:0,gear:'D',mode:'foot',nearby:null,nearCar:false,location:'Getting ready',interior:null,remaining:0,destination:null,fuel:12,pressed:[],tutorial:'complete',player:{x:500,z:870},heading:0,homeReviewed:false};
const keyName=(key:string)=>key.length===1?key.toLowerCase():key;
const movementKeys=new Set(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ']);
const inputTarget=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName));
const lerpAngle=(from:number,to:number,fraction:number)=>normalizeHeading(from+normalizeHeading(to-from)*fraction);
const savedVehicle=(vehicle:ImmersiveVehicleState):ImmersionSnapshot['vehicle']=>({x:vehicle.x,z:vehicle.z,heading:normalizeHeading(vehicle.heading),speed:vehicle.speed,steering:vehicle.steering,distance:vehicle.distance,fuel:Math.max(0,Math.min(12,vehicle.fuel)),gear:vehicle.gear});

/** One continuous world: first-person exploration, a modeled cockpit, and short grounded cinematics. */
export default function ImmersiveWorld({game,paused,run,onInteract,onPanelOpen,focusId,onJournalOpen,preferences}:ImmersiveWorldProps){
  const mount=useRef<HTMLDivElement>(null),controller=useRef<SceneController|null>(null);
  const gameRef=useRef(game),pausedRef=useRef(paused),runRef=useRef(run),interactRef=useRef(onInteract),panelRef=useRef(onPanelOpen),journalRef=useRef(onJournalOpen),preferencesRef=useRef(preferences);
  gameRef.current=game;pausedRef.current=paused;runRef.current=run;interactRef.current=onInteract;panelRef.current=onPanelOpen;journalRef.current=onJournalOpen;preferencesRef.current=preferences;
  const [hud,setHud]=useState<Hud>(initialHud),[locked,setLocked]=useState(false),[mapOpen,setMapOpen]=useState(false),[thought,setThought]=useState<Thought|null>(null),[toast,setToast]=useState(''),[ready,setReady]=useState(false),[graphicsError,setGraphicsError]=useState(''),[phoneAnswered,setPhoneAnswered]=useState(false),[fade,setFade]=useState(0);
  const modalRef=useRef(false),phaseRef=useRef(game.story?.phase??'complete'),fadeRef=useRef(0);
  const phase=game.story?.phase??'complete';modalRef.current=mapOpen||!!thought;phaseRef.current=phase;
  const locations=getImmersiveLocations(game.tier);
  const message=useCallback((text:string)=>setToast(text),[]);
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(''),5500);return()=>window.clearTimeout(timer);},[toast]);
  useEffect(()=>{if(paused||mapOpen||thought){controller.current?.clearInput();if(document.pointerLockElement)document.exitPointerLock();}},[paused,mapOpen,thought]);
  useEffect(()=>{setPhoneAnswered(false);if(phase==='wake'){fadeRef.current=2.4;setFade(1);scoutAudio.sfx('wake');}if(phase==='phone')scoutAudio.sfx('phone');},[phase]);
  useEffect(()=>{if(!focusId)return;controller.current?.destination(candidateLocation(focusId));const person=gameRef.current.candidates.find(candidate=>candidate.id===focusId);message(person?`${person.name} spends time inside ${getImmersiveLocations(gameRef.current.tier)[candidateLocation(focusId)].name}. Follow the route, then explore the building.`:'The venue is marked on your map.');},[focusId,message]);

  useEffect(()=>{
    const element=mount.current;if(!element)return;
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});}catch{setGraphicsError('The 3D renderer could not start. Enable hardware acceleration, then reopen SCOUT.');return;}
    const scene=new THREE.Scene(),sky=gameRef.current.tier===2?'#8c9fa5':'#b5ced3';scene.background=new THREE.Color(sky);scene.fog=new THREE.FogExp2(sky,.00085);
    const camera=new THREE.PerspectiveCamera(preferencesRef.current?.fieldOfView??70,1,.06,2400);camera.rotation.order='YXZ';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.className='immersive-world__canvas';renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','First-person scout world. WASD moves, mouse looks, E interacts. Right-click nearby visible floor to walk when the cursor is released.');element.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xe6f2ff,0x6c7250,2.2));
    const sun=new THREE.DirectionalLight(0xffe0ae,3.3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:10,far:400});sun.shadow.bias=-.00035;sun.shadow.normalBias=.08;scene.add(sun,sun.target);
    const world=buildImmersiveWorld({tier:gameRef.current.tier});scene.add(world.group);
    const style=styleOf(gameRef.current),vehicleModel=createVehicle({paint:PAINTS[style.paint],plate:style.plate}),playerModel=createPerson({avatar:style.avatar}),dreamContact=createPerson({avatar:4});scene.add(vehicleModel.group,playerModel.group,dreamContact.group);
    const npcModels=new Map<string,ReturnType<typeof createPerson>>(),state=immersionOf(gameRef.current);
    let vehicle={...createImmersiveVehicle(state.vehicle),...state.vehicle,speed:0};
    let lookYaw=0,bodyYaw=state.player.yaw,lastPhase=phaseRef.current==='wake'&&!state.parkedAt.includes(5)?'phone':phaseRef.current;
    let lastTime=performance.now(),elapsed=0,phaseStarted=0,hudClock=0,saveClock=0,frame=0,disposed=false,worldMoved=false,stepDistance=0,tutorialClock=0,steerStart=vehicle.heading,lastCollision=false,contactSignature='',lastInterior=state.interior,lastFuel=gameRef.current.field?.fuel??12,environmentKey='';
    let renderDirty=true,lastActive=!pausedRef.current&&!modalRef.current,lastRenderedFov=camera.fov;
    let externalDestination=(gameRef.current as Game&{immersion?:ImmersionSnapshot}).immersion?.destination;
    let route:WorldPoint[]=[],nearby:ContactInteraction|null=null,dreamRoute:WorldPoint[]=[],dreamWalker:WorldPoint|null=null;
    const keys=new Set<string>(),raycaster=new THREE.Raycaster(),floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.035),carEye=new THREE.Vector3(),cameraTarget=new THREE.Vector3();
    const solids=world.collisions.filter(solid=>solid.minY<1.72&&solid.maxY>.25),vehicleSolids=world.collisions.filter(solid=>solid.minY<1.3&&solid.maxY>.18),reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const blockedFootPoint=(point:WorldPoint)=>immersiveVehicleBlocksPoint(point,vehicle)||[...npcModels.values()].some(model=>model.group.visible&&Math.hypot(point.x-model.group.position.x,point.z-model.group.position.z)<.58)||(dreamContact.group.visible&&Math.hypot(point.x-dreamContact.group.position.x,point.z-dreamContact.group.position.z)<.58);
    if(!walkable(state.player,solids)){const safe=world.locations.find(location=>location.id===state.interior)?.interiorSpawn??world.homeSpawn;state.player.x=safe.x;state.player.z=safe.z;}
    const sync=()=>{
      if(disposed||state.tier!==gameRef.current.tier)return;state.vehicle=savedVehicle(vehicle);state.player.yaw=normalizeHeading(state.player.yaw);state.player.pitch=Math.max(-1.25,Math.min(1.25,state.player.pitch));
      if(!runRef.current({type:'immersionSnapshot',snapshot:structuredClone(state)}))return;
      const field=fieldOf(gameRef.current);runRef.current({type:'fieldSnapshot',field:{...field,scene:state.interior===0?'office':'district',player:{x:state.player.x,y:state.player.z},car:{x:vehicle.x,y:vehicle.z},heading:((vehicle.heading%(Math.PI*2))+Math.PI*2)%(Math.PI*2),driving:state.mode==='driving',fuel:vehicle.fuel}});
      worldMoved=false;saveClock=0;
    };
    const clearInput=()=>{keys.clear();route=[];scoutAudio.setDriving(0);};
    const requestLook=()=>{
      if(pausedRef.current||modalRef.current||['sky','meeting','phone'].includes(phaseRef.current))return;
      void scoutAudio.start(gameRef.current.tier);renderer.domElement.focus({preventScroll:true});
      try{const pending=renderer.domElement.requestPointerLock();if(pending)pending.catch(()=>message('Hold the left mouse button to look around, or click the scene to capture the mouse.'));}catch{message('Click the scene to look around. Escape releases the cursor.');}
    };
    const chooseDestination=(id:number)=>{state.destination=id;if(id<5)runRef.current({type:'setDestination',destination:id});sync();setMapOpen(false);message(`${world.locations.find(location=>location.id===id)?.name??'Destination'} marked. Follow the roads, pull into the forecourt, and explore on foot.`);};
    const revealThought=(title:string,text:string)=>{clearInput();if(document.pointerLockElement)document.exitPointerLock();setThought({title,text});};
    const exitCar=()=>{
      if(Math.abs(vehicle.speed)>.65){message('Brake to a complete stop before stepping out.');return;}
      const side=new THREE.Vector3(-2.05,0,.6).applyAxisAngle(new THREE.Vector3(0,1,0),vehicle.heading),other=side.clone().negate();
      const exit=[side,other].map(offset=>({x:vehicle.x+offset.x,z:vehicle.z+offset.z})).find(point=>walkable(point,solids));
      if(!exit){message('There is no room to open the door here. Move into an open parking space.');return;}
      state.mode='foot';state.player={...exit,yaw:vehicle.heading,pitch:0};vehicle.speed=0;vehicle.steering=0;lookYaw=0;route=[];keys.clear();
      const arrived=world.locations.find(location=>worldDistance(vehicle,location.parking)<25);if(arrived&&!state.parkedAt.includes(arrived.id))state.parkedAt.push(arrived.id);
      if(arrived){message(`Parked at ${arrived.name}. Find the entrance and take your time inside.`);scoutAudio.sfx('arrival');}
      scoutAudio.setInVehicle(false);scoutAudio.setDriving(0);scoutAudio.sfx('exitCar');sync();
    };
    const interact=()=>{
      if(pausedRef.current||modalRef.current)return;
      if(state.mode==='driving'){exitCar();return;}
      if(worldDistance(state.player,vehicle)<3.4&&!nearby){state.mode='driving';state.player.pitch=0;state.player.yaw=vehicle.heading;lookYaw=0;route=[];keys.clear();scoutAudio.setInVehicle(true);scoutAudio.sfx('enterCar');sync();requestLook();return;}
      if(!nearby){message('Walk close to a person, a noticeboard, or your car and press E.');return;}
      const target=nearby;
      if(['door','exit','home'].includes(target.type)){fadeRef.current=.32;message(target.type==='exit'?'Your car is parked outside.':`Step through the entrance to ${world.locations.find(location=>location.id===target.locationId)?.name}.`);return;}
      if(target.type==='thought'){if(!state.thoughtsSeen.includes(target.id))state.thoughtsSeen.push(target.id);sync();revealThought(target.label,target.detail??'A quiet corner of town. There is time to notice the details.');scoutAudio.sfx('interact');return;}
      if(target.type==='laptop'){state.homeReviewed=true;sync();revealThought('Your first morning',phaseRef.current==='wake'?'Cirrus Works • Trainee Scout\n\nA modest car, a new notebook, and a company willing to give you a chance. Your first assignment is waiting at headquarters. Leave through the front door, take your car, and drive to Cirrus Works. Good scouting starts with a patient conversation.':'Your scouting notebook is here whenever you need a quiet moment. Check the map, think about the people you met, and plan a drive worth taking.');return;}
      if(target.candidateId==='dream-luca'){sync();runRef.current({type:'story',state:advancePrologue(gameRef.current.story!)});return;}
      if(phaseRef.current==='cruise'){message('Luca is working inside Maker Yard. Find him and hear what he has to say.');return;}
      if(target.type==='fuel'){sync();if(runRef.current({type:'refuel'})){vehicle.fuel=fieldOf(gameRef.current).fuel;lastFuel=vehicle.fuel;message('Tank filled. A little farther to explore.');scoutAudio.sfx('refuel');}return;}
      if(phaseRef.current==='wake'){message('Your first briefing is at Cirrus Works. Review the laptop, then drive there in your car.');return;}
      sync();clearInput();if(document.pointerLockElement)document.exitPointerLock();scoutAudio.sfx('interact');
      if(target.candidateId)interactRef.current({kind:'candidate',id:target.candidateId});
      else if(target.type==='sources'&&target.locationId>0)panelRef.current({kind:'venue',source:target.locationId-1});
      else if(['missions','career','team','week'].includes(target.type))interactRef.current({kind:'station',station:target.type as 'missions'|'career'|'team'|'week'});
    };
    controller.current={snapshot:sync,interact,destination:chooseDestination,requestLook,clearInput};
    const onKeyDown=(event:KeyboardEvent)=>{
      if(inputTarget(event.target)||pausedRef.current)return;const key=keyName(event.key);
      if(key==='Escape'){
        if(document.pointerLockElement===renderer.domElement){event.preventDefault();clearInput();document.exitPointerLock();return;}
        if(modalRef.current){event.preventDefault();clearInput();setMapOpen(false);setThought(null);}return;
      }if(modalRef.current)return;
      if(movementKeys.has(key)){event.preventDefault();keys.add(key);route=[];}if(event.repeat)return;
      if(key==='e'){event.preventDefault();interact();}if(key==='m'){event.preventDefault();clearInput();setMapOpen(true);}
      if((key==='j'||key==='Tab')&&phaseRef.current==='complete'){event.preventDefault();sync();clearInput();if(journalRef.current)journalRef.current();else panelRef.current({kind:'sources'});}
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
      const next=findLocalWalkPath(state.player,destination,solids,38,blockedFootPoint);if(!next.length){message('Choose an open spot nearby. Furniture, people, and walls need a little room.');return;}keys.clear();route=next;
    };
    const onBlur=()=>{clearInput();sync();};
    window.addEventListener('keydown',onKeyDown,true);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',onBlur);window.addEventListener('scout:flush-field',sync);document.addEventListener('pointerlockchange',onLock);
    renderer.domElement.addEventListener('mousemove',onMouseMove);renderer.domElement.addEventListener('click',onClick);renderer.domElement.addEventListener('contextmenu',onRightClick);
    const resize=()=>{const width=Math.max(320,element.clientWidth),height=Math.max(240,element.clientHeight);renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();renderDirty=true;},observer=new ResizeObserver(resize);observer.observe(element);resize();
    const updateContacts=()=>{
      const contacts=gameRef.current.candidates.filter(person=>person.discovered&&person.status==='available'),signature=contacts.map(person=>person.id).join(',');if(signature===contactSignature)return;contactSignature=signature;
      const live=new Set(contacts.map(person=>person.id));for(const[id,model]of npcModels)if(!live.has(id)){scene.remove(model.group);model.dispose();npcModels.delete(id);}
      for(const person of contacts)if(!npcModels.has(person.id)){const avatar=(Number(person.id.split('-')[1])||0)%16,model=createPerson({avatar}),anchor=candidateAnchor(gameRef.current.tier,person.id);model.group.position.set(anchor.x,0,anchor.z);model.group.rotation.y=avatar%4*Math.PI/2;scene.add(model.group);npcModels.set(person.id,model);}
    };
    const animate=(now:number)=>{
      if(disposed)return;frame=requestAnimationFrame(animate);const wallDt=Math.max(0,(now-lastTime)/1000),dt=Math.min(.06,wallDt);lastTime=now;
      const active=!pausedRef.current&&!modalRef.current,currentPhase=phaseRef.current;if(active)elapsed+=dt;
      if(active!==lastActive){lastActive=active;renderDirty=true;}
      if(currentPhase!==lastPhase){
        clearInput();lastPhase=currentPhase;phaseStarted=elapsed;renderDirty=true;
        if(currentPhase==='cruise'){state.mode='driving';state.destination=1;lookYaw=0;}
        if(currentPhase==='wake'){vehicle=createImmersiveVehicle({...HOME_CAR_SPAWN,heading:Math.PI,fuel:12});state.vehicle=savedVehicle(vehicle);state.mode='foot';state.interior=5;state.player={...HOME_SPAWN,yaw:-Math.PI/2,pitch:0};state.parkedAt=[5];state.destination=0;state.homeReviewed=false;state.tutorial=state.tutorial==='complete'?'complete':'accelerate';lookYaw=0;sync();}
        if(currentPhase==='phone'){dreamWalker={...world.locations[1].candidateSpawns[2]};const door=world.locations[1].door;dreamRoute=findLocalWalkPath(dreamWalker,{x:door.x,z:door.z+5},solids,90);}
        if(['meeting','phone'].includes(currentPhase)&&document.pointerLockElement)document.exitPointerLock();
      }
      const incomingDestination=(gameRef.current as Game&{immersion?:ImmersionSnapshot}).immersion?.destination;if(incomingDestination!==externalDestination){externalDestination=incomingDestination;if(incomingDestination!==undefined)state.destination=incomingDestination;}
      const externalFuel=gameRef.current.field?.fuel??vehicle.fuel;if(externalFuel>lastFuel+.001)vehicle.fuel=externalFuel;lastFuel=externalFuel;
      updateContacts();const dream=['sky','cruise','meeting','phone'].includes(currentPhase),dreamPosition=world.locations[1].candidateSpawns[2];
      dreamContact.group.visible=dream&&currentPhase!=='sky';
      let dreamWalkSpeed=0;
      if(currentPhase==='phone'&&dreamWalker&&dreamRoute.length&&active){const next=dreamRoute[0],distance=worldDistance(dreamWalker,next);if(distance<.2)dreamRoute.shift();else{const dx=(next.x-dreamWalker.x)/distance,dz=(next.z-dreamWalker.z)/distance,previous=dreamWalker;dreamWalker=moveWalker(dreamWalker,{x:dx*1.2*dt,z:dz*1.2*dt},solids);dreamWalkSpeed=worldDistance(previous,dreamWalker)/Math.max(dt,.001);dreamContact.group.rotation.y=Math.atan2(-dx,-dz);}}
      const contactPoint=currentPhase==='phone'&&dreamWalker?dreamWalker:dreamPosition;dreamContact.group.position.set(contactPoint.x,0,contactPoint.z);if(currentPhase!=='phone')dreamContact.group.rotation.y=Math.PI;dreamContact.update(dreamWalkSpeed,elapsed);
      for(const[id,model]of npcModels){model.group.visible=!dream;model.update(0,elapsed+(Number(id.split('-')[1])||0));}
      let movingSpeed=0;
      if(active&&!['sky','meeting','phone'].includes(currentPhase)){
        if(state.mode==='driving'){
          const input=immersiveDrivingInput(keys),previous=vehicle;vehicle=stepImmersiveVehicle(vehicle,input,dt,{solids:vehicleSolids,bounds:IMMERSION_BOUNDS});
          if(vehicle.collision&&!lastCollision){scoutAudio.sfx('bump');message('Easy. Give solid objects a little more room.');}lastCollision=vehicle.collision;worldMoved||=worldDistance(previous,vehicle)>.005;state.player.x=vehicle.x;state.player.z=vehicle.z;
          if(!document.pointerLockElement&&!keys.size)lookYaw*=Math.exp(-dt*2.5);
          if(state.tutorial==='accelerate'){tutorialClock=input.throttle>.5&&Math.abs(vehicle.speed)>3?tutorialClock+dt:0;if(tutorialClock>1.1){state.tutorial='brake';tutorialClock=0;}}
          else if(state.tutorial==='brake'){if(input.brake>.5&&Math.abs(vehicle.speed)<2.5)tutorialClock+=dt;if(tutorialClock>.55){state.tutorial='steer';tutorialClock=0;steerStart=vehicle.heading;}}
          else if(state.tutorial==='steer'&&Math.abs(input.steer)>.5&&Math.abs(normalizeHeading(vehicle.heading-steerStart))>.14){state.tutorial='complete';message('You have it. Take the drive at your own pace. M opens your map.');sync();}
        }else{
          const forward=Number(keys.has('w')||keys.has('ArrowUp'))-Number(keys.has('s')||keys.has('ArrowDown')),side=Number(keys.has('d')||keys.has('ArrowRight'))-Number(keys.has('a')||keys.has('ArrowLeft'));
          let dx=-Math.sin(state.player.yaw)*forward+Math.cos(state.player.yaw)*side,dz=-Math.cos(state.player.yaw)*forward-Math.sin(state.player.yaw)*side;
          if(route.length&&!forward&&!side){const target=route[0],distance=worldDistance(state.player,target);if(distance<.24)route.shift();else{dx=(target.x-state.player.x)/distance;dz=(target.z-state.player.z)/distance;}}
          const length=Math.hypot(dx,dz);if(length>.001){
            const previous={x:state.player.x,z:state.player.z};let next=moveWalker(previous,{x:dx/length*FOOT_SPEED*dt,z:dz/length*FOOT_SPEED*dt},solids);
            if(blockedFootPoint(next)){const xOnly={x:next.x,z:previous.z},zOnly={x:previous.x,z:next.z};next=!blockedFootPoint(xOnly)&&walkable(xOnly,solids)?xOnly:!blockedFootPoint(zOnly)&&walkable(zOnly,solids)?zOnly:previous;}
            state.player.x=next.x;state.player.z=next.z;const travelled=worldDistance(previous,next);stepDistance+=travelled;movingSpeed=travelled/Math.max(dt,.001);worldMoved||=travelled>.001;bodyYaw=lerpAngle(bodyYaw,Math.atan2(-dx,-dz),Math.min(1,dt*12));if(route.length)state.player.yaw=lerpAngle(state.player.yaw,bodyYaw,Math.min(1,dt*5));if(stepDistance>1.5){scoutAudio.sfx('step');stepDistance=0;}
          }
        }
      }
      state.vehicle=savedVehicle(vehicle);const containing=state.mode==='foot'?world.locations.find(location=>location.id!==4&&publicInteriorContains(gameRef.current.tier,location.id,state.player,.35)):undefined;state.interior=containing?.id??null;
      if(state.interior!==lastInterior){if(state.interior!==null){fadeRef.current=.28;message(`${containing?.name}. Look around, listen, and find the people behind the work.`);}lastInterior=state.interior;worldMoved=true;}
      if(currentPhase==='wake'&&state.interior===0&&state.homeReviewed&&state.parkedAt.includes(0)&&vehicle.distance>100){sync();runRef.current({type:'story',state:advancePrologue(gameRef.current.story!)});}
      const interactions:ContactInteraction[]=[...world.interactables];
      if(currentPhase==='cruise')interactions.push({id:'dream-luca',candidateId:'dream-luca',type:'candidate',label:`Talk to ${DREAM_CONTACT.name}`,position:dreamPosition,range:3.2,locationId:1,detail:DREAM_CONTACT.detail});
      else if(!dream)for(const person of gameRef.current.candidates.filter(person=>person.discovered&&person.status==='available'))interactions.push({id:person.id,candidateId:person.id,type:'candidate',label:`Talk to ${person.name}`,position:candidateAnchor(gameRef.current.tier,person.id),range:3.2,locationId:candidateLocation(person.id),detail:person.origin});
      nearby=state.mode==='foot'?interactions.filter(item=>{
        if(['candidate','sources'].includes(item.type)&&(state.interior!==item.locationId||!state.parkedAt.includes(item.locationId)||worldDistance(vehicle,world.locations[item.locationId].parking)>=25))return false;
        if(['laptop','thought','missions','career','week','team'].includes(item.type)&&item.locationId!==state.interior)return false;
        if(item.type==='laptop'&&(state.player.z<item.position.z+.25||Math.abs(state.player.x-item.position.x)>1.6))return false;
        if(item.type==='fuel'&&!state.parkedAt.includes(4))return false;return worldDistance(state.player,item.position)<item.range;
      }).sort((a,b)=>worldDistance(state.player,a.position)-worldDistance(state.player,b.position))[0]??null:null;
      vehicleModel.group.position.set(vehicle.x,0,vehicle.z);vehicleModel.group.rotation.y=vehicle.heading;vehicleModel.update(vehicle.speed,vehicle.steering,active?dt:0);
      playerModel.group.position.set(state.player.x,0,state.player.z);playerModel.group.rotation.y=bodyYaw;playerModel.update(movingSpeed,elapsed,currentPhase==='phone'?'phone':'idle');playerModel.group.visible=currentPhase==='phone';
      if(currentPhase==='phone'){const lift=Math.min(1,Math.max(0,(elapsed-phaseStarted)/1.2));playerModel.rightArm.rotation.x*=lift;playerModel.rightArm.rotation.z*=lift;}
      if(currentPhase==='sky'){const angle=-.9+Math.min(1,elapsed/6);camera.position.set(vehicle.x+Math.sin(angle)*8,2.45,vehicle.z+Math.cos(angle)*8);camera.lookAt(vehicle.x,.9,vehicle.z);}
      else if(currentPhase==='phone'){const offset=new THREE.Vector3(3.7,2.4,4.8).applyAxisAngle(new THREE.Vector3(0,1,0),bodyYaw);cameraTarget.set(state.player.x+offset.x,offset.y,state.player.z+offset.z);if(elapsed-phaseStarted<dt*1.1)camera.position.copy(cameraTarget);else camera.position.lerp(cameraTarget,reduced?1:Math.min(1,dt*3));camera.lookAt(state.player.x,1.12,state.player.z);}
      else if(state.mode==='driving'){vehicleModel.group.updateMatrixWorld(true);carEye.copy(vehicleModel.cockpitEye);vehicleModel.group.localToWorld(carEye);camera.position.copy(carEye);camera.rotation.set(state.player.pitch,vehicle.heading+lookYaw,0,'YXZ');}
      else{const bob=!reduced&&movingSpeed>.5?Math.sin(elapsed*9)*.045*(preferencesRef.current?.headBob??.15):0;camera.position.set(state.player.x,1.64+bob,state.player.z);camera.rotation.set(state.player.pitch,state.player.yaw,0,'YXZ');if(currentPhase==='meeting')camera.lookAt(dreamPosition.x,1.45,dreamPosition.z);}
      sun.target.position.set(camera.position.x,0,camera.position.z);sun.position.set(camera.position.x+105,170,camera.position.z+80);const fov=preferencesRef.current?.fieldOfView??70;if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix();}world.update(active?dt:0,elapsed);
      const telemetry=immersiveVehicleTelemetry(vehicle);scoutAudio.setInVehicle(state.mode==='driving');scoutAudio.setEngineKind('compact');
      const vehicleAudio=scoutAudio as typeof scoutAudio&{setVehicleTelemetry?:(value:{normalizedSpeed:number;normalizedEngine:number;engineLoad:number;gearNumber:number})=>void};
      if(active&&state.mode==='driving'&&vehicleAudio.setVehicleTelemetry)vehicleAudio.setVehicleTelemetry(telemetry);else scoutAudio.setDriving(active&&state.mode==='driving'?telemetry.normalizedSpeed:0);
      const environmentScene=state.mode==='driving'?'vehicle':state.interior===5?'apartment':state.interior!==null?'interior':'outdoors',conversation=['meeting','phone'].includes(currentPhase)||pausedRef.current,nextEnvironment=environmentScene+String(conversation);
      if(nextEnvironment!==environmentKey){environmentKey=nextEnvironment;const contextual=scoutAudio as typeof scoutAudio&{setEnvironment?:(environment:{scene:'apartment'|'outdoors'|'interior'|'vehicle';timeOfDay:number;conversation:boolean})=>void};contextual.setEnvironment?.({scene:environmentScene,timeOfDay:gameRef.current.tier===2?19.3:9.4,conversation});}
      if(fadeRef.current>0){fadeRef.current=Math.max(0,fadeRef.current-wallDt);setFade(Math.min(1,fadeRef.current/1.3));}
      const destination=world.locations.find(location=>location.id===state.destination);hudClock+=dt;saveClock+=dt;
      if(hudClock>.16){hudClock=0;setHud({speed:telemetry.absoluteMph,gear:vehicle.gear,mode:state.mode,nearby,nearCar:worldDistance(state.player,vehicle)<3.4,location:containing?.name??'The open road',interior:state.interior,remaining:destination?worldDistance(state.mode==='driving'?vehicle:state.player,destination.parking):0,destination:state.destination,fuel:vehicle.fuel,pressed:[...keys],tutorial:state.tutorial,player:{x:state.player.x,z:state.player.z},heading:state.mode==='driving'?vehicle.heading:state.player.yaw,homeReviewed:state.homeReviewed});}
      if(saveClock>2.5&&worldMoved&&active)sync();
      if(camera.fov!==lastRenderedFov)renderDirty=true;
      if(active||renderDirty){renderer.render(scene,camera);renderDirty=false;lastRenderedFov=camera.fov;}
    };
    setReady(true);frame=requestAnimationFrame(animate);
    return()=>{
      disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',onKeyDown,true);window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',onBlur);window.removeEventListener('scout:flush-field',sync);document.removeEventListener('pointerlockchange',onLock);
      renderer.domElement.removeEventListener('mousemove',onMouseMove);renderer.domElement.removeEventListener('click',onClick);renderer.domElement.removeEventListener('contextmenu',onRightClick);if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
      for(const model of npcModels.values())model.dispose();vehicleModel.dispose();playerModel.dispose();dreamContact.dispose();world.dispose();renderer.dispose();renderer.domElement.remove();scoutAudio.setDriving(0);scoutAudio.setInVehicle(false);controller.current=null;
    };
  },[game.tier,message]);

  const destination=locations.find(location=>location.id===hud.destination),visitingDestination=!!destination&&hud.mode==='foot'&&hud.interior===destination.id;
  const storyAction=(command:'advance'|'skip'|'pitch',choice?:'salary'|'purpose'|'freedom')=>{controller.current?.snapshot();void scoutAudio.start(game.tier);const state=game.story!;run({type:'story',state:command==='skip'?skipPrologueDream(state):command==='pitch'&&choice?chooseProloguePitch(state,choice):advancePrologue(state)});};
  return <section className="immersive-world" data-phase={phase} aria-label="SCOUT open world">
    <div ref={mount} className="immersive-world__surface"/>
    {!ready&&!graphicsError&&<div className="immersive-world__loading"><span/>Bringing the town to life…</div>}{graphicsError&&<div className="immersive-world__error">{graphicsError}</div>}
    <div className="immersive-world__vignette"/><div className="immersive-world__fade" style={{opacity:fade}} aria-hidden="true"/>
    {ready&&phase!=='sky'&&<>
      <div className="immersive-world__place"><span>{phase==='wake'?'A NEW MORNING':TIERS[game.tier].name.toUpperCase()}</span><strong>{hud.location}</strong></div>
      <div className="immersive-world__tools"><button onClick={()=>setMapOpen(true)} title="Map (M)"><span className="immersive-world__key">M</span>Map</button><button onClick={()=>onPanelOpen({kind:'help'})}>Controls</button></div>
      {destination&&!['meeting','phone'].includes(phase)&&<div className="immersive-world__navigation"><span>{phase==='wake'&&!hud.homeReviewed?'FIRST, GET READY':visitingDestination?'TAKE YOUR TIME':'YOUR NEXT STOP'}</span><strong>{phase==='wake'&&!hud.homeReviewed?'Review the note at your laptop':destination.name}</strong>{(phase!=='wake'||hud.homeReviewed)&&!visitingDestination&&<div>{hud.remaining>999?`${(hud.remaining/1000).toFixed(1)} km`:`${Math.round(hud.remaining)} m`}<small> to the forecourt</small></div>}<p>{phase==='wake'&&!hud.homeReviewed?'The study is through the right-hand doorway. Approach the laptop from its chair, then press E.':visitingDestination?'You have arrived. Explore the rooms, notice the details, and speak with the people inside.':hud.remaining<22?'Brake, park, then explore inside.':'Follow the streets. There is no need to hurry.'}</p></div>}
      {hud.mode==='driving'&&!['meeting','phone'].includes(phase)&&<div className="immersive-world__driving"><div className="immersive-world__speed"><b>{Math.round(hud.speed)}</b><span>mph</span></div><div className="immersive-world__gear">{hud.gear}</div><div className="immersive-world__fuel"><span>FUEL</span><div><i style={{width:`${hud.fuel/12*100}%`}}/></div><small>{hud.fuel.toFixed(1)} gal</small></div></div>}
      {!['meeting','phone'].includes(phase)&&<div className="immersive-world__bottom"><span>{hud.mode==='driving'?'W accelerate · S brake / reverse · A D steer · Space handbrake':'WASD walk · mouse look · right-click nearby floor to walk'}</span><span>{locked?'Esc releases the cursor':'Click the scene to look around'}</span></div>}
      {!paused&&!mapOpen&&!thought&&!['meeting','phone'].includes(phase)&&<div className="immersive-world__interact"><button onClick={()=>controller.current?.interact()}><span className="immersive-world__key">E</span>{hud.mode==='driving'?hud.speed>2?'Stop to step out':'Park and step out':hud.nearby?.label??(hud.nearCar?'Enter your car':'Interact')}</button>{hud.nearby?.detail&&<small>{hud.nearby.detail}</small>}</div>}
      {locked&&!mapOpen&&!thought&&!['meeting','phone'].includes(phase)&&<div className="immersive-world__reticle" aria-hidden="true"/>}
      {hud.mode==='driving'&&hud.tutorial!=='complete'&&['cruise','wake'].includes(phase)&&!paused&&<div className="immersive-world__tutorial" aria-live="polite"><span>LET'S GET COMFORTABLE</span>{hud.tutorial==='accelerate'?<><div className={`immersive-world__tutorial-key ${hud.pressed.includes('w')?'is-pressed':''}`}>W</div><h2>Ease onto the accelerator</h2><p>Hold W to build speed gently.</p></>:hud.tutorial==='brake'?<><div className={`immersive-world__tutorial-key ${hud.pressed.includes('s')?'is-pressed':''}`}>S</div><h2>Give yourself room to slow down</h2><p>Hold S until the car is nearly stopped.</p></>:<><div className="immersive-world__tutorial-steer">{['a','d'].map(key=><div key={key} className={`immersive-world__tutorial-key ${hud.pressed.includes(key)?'is-pressed':''}`}>{key.toUpperCase()}</div>)}</div><h2>Turn the wheel</h2><p>Drive slowly and hold A or D. The car follows its heading.</p></>}</div>}
    </>}
    {toast&&<div className="immersive-world__toast" role="status">{toast}</div>}
    {phase==='sky'&&ready&&<div className="immersive-world__intro"><span>A SCOUT'S STORY</span><h1>Every great team<br/>starts with a person.</h1><p>And every person has a story worth listening to.</p><button onClick={()=>storyAction('advance')}>Take the drive <span>→</span></button><button className="immersive-world__quiet" onClick={()=>storyAction('skip')}>Skip the dream</button></div>}
    {phase==='meeting'&&<div className="immersive-world__conversation"><span>LUCA VALE · INDEPENDENT INVENTOR</span><h2>{game.story?.choice?'He shakes his head.':'“You drove all this way. What did you want to say?”'}</h2>{game.story?.choice?<><p>{DREAM_PITCHES.find(pitch=>pitch.id===game.story?.choice)?.reply}</p><button onClick={()=>storyAction('advance')}>Let him leave</button></>:<><p>You have the title, the car, and the perfect pitch. You haven't yet asked about the person in front of you.</p><div>{DREAM_PITCHES.map(pitch=><button key={pitch.id} onClick={()=>storyAction('pitch',pitch.id)}>{pitch.label}</button>)}</div></>}</div>}
    {phase==='phone'&&<div className="immersive-world__conversation immersive-world__phone"><span>{phoneAnswered?'THE DIRECTOR':'INCOMING CALL'}</span><h2>{phoneAnswered?'“We’ll need your badge back.”':'Your phone begins to ring.'}</h2><p>{phoneAnswered?'“We needed someone who could listen. You tried to sell him a future before finding out what mattered to him. We’re going in another direction.”\n\nYou stand still for a moment. The town carries on around you.':'You reach into your pocket. The screen lights up with the director’s name.'}</p><button onClick={()=>phoneAnswered?storyAction('advance'):setPhoneAnswered(true)}>{phoneAnswered?'Close your eyes':'Answer the call'}</button></div>}
    {thought&&<div className="immersive-world__modal-backdrop"><article className="immersive-world__thought" role="dialog" aria-modal="true" aria-labelledby="immersion-thought-title"><span>A MOMENT TO YOURSELF</span><h2 id="immersion-thought-title">{thought.title}</h2><p>{thought.text}</p><button onClick={()=>setThought(null)}>Back to the world</button></article></div>}
    {mapOpen&&<div className="immersive-world__modal-backdrop"><article className="immersive-world__map" role="dialog" aria-modal="true" aria-labelledby="immersion-map-title"><header><div><span>YOUR SCOUTING NOTEBOOK</span><h2 id="immersion-map-title">A town worth exploring</h2></div><button aria-label="Close map" onClick={()=>setMapOpen(false)}>×</button></header><p>Choose a destination, drive to its parking area, then explore the building on foot. Contacts spend time in workshops, studios, and quiet corners inside.</p><div className="immersive-world__map-layout"><div className="immersive-world__map-drawing">{WORLD_ROADS.map((road,index)=><i key={index} className="map-road" aria-hidden="true" style={{left:`${(road.x-road.width/2)/1536*100}%`,top:`${(road.z-road.depth/2)/1024*100}%`,width:`${road.width/1536*100}%`,height:`${road.depth/1024*100}%`}}/>)}{locations.map(place=><button key={place.id} className={`map-place ${hud.destination===place.id?'is-destination':''}`} style={{left:`${place.parking.x/1536*100}%`,top:`${place.parking.z/1024*100}%`}} onClick={()=>controller.current?.destination(place.id)}>{place.id===5?'H':place.id===4?'F':place.id+1}<span>{place.name}</span></button>)}<b className="map-you" style={{left:`${hud.player.x/1536*100}%`,top:`${hud.player.z/1024*100}%`,transform:`translate(-50%,-50%) rotate(${-hud.heading}rad)`}} aria-label="Your location">▲</b></div><div className="immersive-world__map-list">{locations.map(place=><button key={place.id} onClick={()=>controller.current?.destination(place.id)}><b>{place.name}</b><span>{place.subtitle}</span><small>{place.id===5?'Come home, plan, and rest':place.id===4?'Fuel for the next outing':place.id===0?'Assignments, your team, and your career':'Drive there · explore inside · meet people'}</small></button>)}</div></div><footer>WASD · mouse look · E interact · M map · J / Tab notebook · R car radio</footer></article></div>}
  </section>;
}
