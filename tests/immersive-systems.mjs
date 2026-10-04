import assert from 'node:assert/strict';
import { createWorldCollisionIndex, nearbyWorldCollisions } from '../src/lib/immersive-spatial.ts';
import { buildImmersiveWorld } from '../src/lib/immersive-world.ts';
import { routeProgress, sampleRoute, createRoadGuide } from '../src/lib/immersive-navigation.ts';
import { findRegionalRoute } from '../src/lib/regional-roads.ts';
import { getImmersiveLocations } from '../src/lib/immersive-locations.ts';

// Compare local broad phase with real scene colliders, including each venue interior.
for (const tier of [0,1,2]) {
  const world=buildImmersiveWorld({tier}), index=createWorldCollisionIndex(world.collisions);
  const positions=world.locations.flatMap(location=>[location.parking,location.interiorSpawn,...location.candidateSpawns]);
  for (const point of positions) for (const [radius,minY,maxY] of [[42,.25,1.72],[45,.18,1.3]]) {
    const actual=nearbyWorldCollisions(index,point,radius,minY,maxY);
    const expected=world.collisions.filter(solid=>solid.minY<maxY&&solid.maxY>minY&&solid.minX<=point.x+radius&&solid.maxX>=point.x-radius&&solid.minZ<=point.z+radius&&solid.maxZ>=point.z-radius);
    assert.deepEqual(new Set(actual),new Set(expected)); assert.equal(actual.length,new Set(actual).size);
  }
  assert.throws(()=>createWorldCollisionIndex(world.collisions,0));
  world.dispose();
}
// A wall spanning many cells remains solid near its middle and both edges.
const wall={id:'long-wall',kind:'wall',minX:-220,maxX:640,minZ:-5,maxZ:5,minY:0,maxY:3};
for(const x of [-219,0,639]) assert.equal(nearbyWorldCollisions(createWorldCollisionIndex([wall]),{x,z:0},2).length,1);

const route=[{x:0,z:100},{x:0,z:0},{x:100,z:0}];
assert.equal(routeProgress(route,{x:0,z:70}).remaining,170);
assert.equal(routeProgress(route,{x:50,z:0}).remaining,50);
assert.equal(routeProgress(route,{x:80,z:30}).offRoute,30);
assert(Math.abs(sampleRoute(route,140).heading+Math.PI/2)<1e-8);
assert.equal(sampleRoute(route,201),null);
const guide=createRoadGuide();
for(const tier of [0,1,2]) {
 const locations=getImmersiveLocations(tier);
 for(const destination of locations.filter(location=>location.id>=1&&location.id<=3)) {
  const journey=findRegionalRoute(locations[0].parking,destination.parking);
  assert(journey.distance>4000);
  guide.update(journey.points,locations[0].parking,0);
  assert(guide.group.children[0].count>0);
  assert(guide.group.children[0].count<=40);
  assert(Math.abs(routeProgress(journey.points,destination.parking).remaining)<.001);
 }
}
guide.update([], {x:0,z:0}, 0); assert.equal(guide.group.children[0].count,0); guide.dispose();
console.log('PASS: local collision queries match full real-world geometry, large walls remain solid, and road navigation covers all nine regional venue trips.');
