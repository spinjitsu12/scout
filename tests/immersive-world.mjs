import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildImmersiveWorld } from '../src/lib/immersive-world.ts';
import { candidateAnchor, publicInteriorContains } from '../src/lib/immersive-locations.ts';
import { createPerson } from '../src/lib/immersive-assets.ts';
import { findLocalWalkPath, moveWalker, walkable, worldDistance } from '../src/lib/immersive-runtime.ts';
import { createImmersiveVehicle, immersiveVehicleBlocksPoint } from '../src/lib/immersive-driving.ts';

let checkedContacts=0,checkedPoints=0;
for(const tier of [0,1,2]) {
  const world=buildImmersiveWorld({tier});
  try {
    const solids=world.collisions.filter(solid=>solid.minY<1.72&&solid.maxY>.25);
    assert(world.collisions.length>150,'A complete town has real furniture, trees, walls, and visible border fences');
    assert(world.group.children.length>25,'World geometry is present, including spatial batches and animated residents');
    assert(walkable(world.homeSpawn,solids),'The apartment spawn is on open floor');
    for(const location of world.locations.filter(place=>place.id!==4)) {
      assert(walkable(location.interiorSpawn,solids),`${location.name}: the visible entrance reaches open floor`);
      const facing=location.door.z>location.center.z?1:-1;
      const outside={x:location.door.x,z:location.door.z+facing*3.8};
      const entrancePath=findLocalWalkPath(outside,location.interiorSpawn,solids,12);
      assert(entrancePath.length>0,`${location.name}: the open door is actually walkable`);
      let walked={...outside};
      for(let steps=0;steps<180;steps++) {
        const distance=worldDistance(walked,location.interiorSpawn);
        if(distance<.12)break;
        walked=moveWalker(walked,{x:(location.interiorSpawn.x-walked.x)/distance*.09,z:(location.interiorSpawn.z-walked.z)/distance*.09},solids);
      }
      assert(worldDistance(walked,location.interiorSpawn)<.2,`${location.name}: continuous movement crosses the doorway without teleporting`);
      const points=location.pointsOfInterest;
      for(const item of points) {
        let approaches=[];
        if(item.type==='laptop') approaches=[{x:item.position.x,z:item.position.z+1.1}];
        else {
          approaches=[item.position];
          for(let index=0;index<16;index++){const angle=index/16*Math.PI*2;approaches.push({x:item.position.x+Math.sin(angle)*item.range*.65,z:item.position.z+Math.cos(angle)*item.range*.65});}
        }
        const reachable=approaches.find(approach=>publicInteriorContains(tier,location.id,approach,.2)&&walkable(approach,solids)&&findLocalWalkPath(location.interiorSpawn,approach,solids,100).length>0);
        assert(reachable,`${location.name}: ${item.label} can be reached from the visible entrance`);
        if(item.type==='laptop') assert(reachable.z>item.position.z+.25,'The laptop is approached from the chair side');
        checkedPoints++;
      }
    }
    for(let index=0;index<36;index++) {
      const id=`t${tier}-${index}`,anchor=candidateAnchor(tier,id),location=world.locations[index%3+1];
      assert(publicInteriorContains(tier,location.id,anchor,1),'Every generated lead lives inside the venue');
      assert(worldDistance(anchor,location.door)>12,'Finding a contact requires exploring beyond the roadside doorway');
      assert(walkable(anchor,solids),`${id}: a contact does not stand in a shelf, desk, or wall`);
      const approaches=[0,Math.PI/2,Math.PI,Math.PI*1.5].map(angle=>({x:anchor.x+Math.sin(angle),z:anchor.z+Math.cos(angle)}));
      assert(approaches.some(point=>walkable(point,solids)&&findLocalWalkPath(location.interiorSpawn,point,solids,100).length>0),`${id}: there is a real aisle to approach the contact`);
      checkedContacts++;
    }
    const home=world.locations[5],bathroom={x:213.85,z:474.8},study={x:225.8,z:477.3},window={x:228.8,z:483.2};
    for(const destination of [bathroom,study,window])assert(findLocalWalkPath(world.homeSpawn,destination,solids,35).length>0,'Bathroom, chair, and window remain reachable from the bedroom');
    const homeFurniture=world.collisions.filter(solid=>solid.kind==='furniture'&&solid.maxY>.6&&solid.minX>home.footprint.minX&&solid.maxX<home.footprint.maxX&&solid.minZ>home.footprint.minZ&&solid.maxZ<home.footprint.maxZ);
    assert(homeFurniture.length>=12,'Apartment furniture has corresponding physical blockers');
    for(const furniture of homeFurniture)assert(!walkable({x:(furniture.minX+furniture.maxX)/2,z:(furniture.minZ+furniture.maxZ)/2},solids),'A visible piece of furniture cannot be walked through');
    const car=createImmersiveVehicle({x:home.parking.x,z:home.parking.z,heading:.45});
    const route=findLocalWalkPath({x:car.x-4,z:car.z},{x:car.x+4,z:car.z},solids,20,point=>immersiveVehicleBlocksPoint(point,car));
    assert(route.length>0,'Right-click can walk around a parked car rather than through it');
    assert(route.every(point=>!immersiveVehicleBlocksPoint(point,car)),'The local route respects the actual rotated vehicle body');
    const residents=world.group.children.filter(object=>object.name.startsWith('Scout character'));
    assert(residents.length>=7,'The town has visible local routines');
    const before=residents.map(person=>person.position.clone());world.update(.05,1);
    assert(residents.some((person,index)=>person.position.distanceTo(before[index])>0),'Ambient residents actually walk');
    assert(residents.some(person=>Math.abs(person.rotation.y)>0),'Walking residents face their current direction');
  } finally {world.dispose();world.dispose();}
}
const person=createPerson({avatar:5});
try{
  person.update(0,0);const idle=person.leftArm.rotation.x;person.update(2,.17);assert.notEqual(person.leftArm.rotation.x,idle,'Walking drives articulated limb animation');
  person.update(0,.3,'phone');assert(person.rightArm.rotation.x<-.7,'The scout raises a hand for the phone call');
  let visiblePhone=false;person.group.traverse(object=>{if(object instanceof THREE.Mesh&&object.visible&&object.geometry.type==='RoundedBoxGeometry'&&object.parent!==person.group&&object.position.y<-.3)visiblePhone=true;});
  assert(visiblePhone,'The phone pose retains a modeled object in the hand');
}finally{person.dispose();}
console.log(`PASS: all three continuous towns; ${checkedContacts} interior contact approaches; ${checkedPoints} readable, reachable points of interest; accessible apartment rooms; solid furniture/car bodies; animated people and phone pose.`);
