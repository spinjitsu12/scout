/**
 * Grounded, metre-based driving for the first-person world.
 * Heading follows Three.js: zero looks down -Z and a positive angle turns left.
 * Speed is signed metres/second; fuel is always saved in US gallons.
 */
export type ImmersivePoint = { x: number; z: number };
export type ImmersiveBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type ImmersiveDrivingWorld = { solids: readonly ImmersiveBounds[]; bounds?: ImmersiveBounds };
export type ImmersiveDriveInput = {
  /** Accelerator pedal, 0..1. W requests the forward gear. */
  throttle: number;
  /** Brake pedal, 0..1. S brakes first, then requests reverse at a standstill. */
  brake: number;
  /** Negative is left, positive is right. Turns the wheels, never translates the car. */
  steer: number;
  reverse?: boolean;
};
export type ImmersiveVehicleState = ImmersivePoint & {
  y: 0;
  heading: number;
  speed: number;
  steering: number;
  distance: number;
  fuel: number;
  gear: 'D' | 'R';
  throttle: number;
  brake: number;
  reverseHold: number;
  collision: boolean;
};
export const IMMERSIVE_VEHICLE = Object.freeze({
  kind: 'compact' as const, width: 1.7, length: 4.1, wheelbase: 2.5,
  tankGallons: 12, milesPerGallon: 32, maxSpeed: 33.5, maxReverseSpeed: 3.2,
  maxSteering: .6, steeringRatio: 14, maxLateralAcceleration: 3.8, brakingDeceleration: 5.4,
});
export const METRES_PER_MILE = 1609.344;
export const MPH_PER_METRE_SECOND = 3600 / METRES_PER_MILE;
export const IMMERSIVE_DRIVING_STEP = 1 / 120;
export const IMMERSIVE_MAX_FRAME_SECONDS = .25;
const CLEARANCE = .012;
const REVERSE_DELAY = .4;
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, finite(value)));
const radians = (value: number): number => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
const approach = (value: number, target: number, response: number, dt: number): number => target + (value - target) * Math.exp(-response * dt);
const idleInput: ImmersiveDriveInput = { throttle: 0, brake: 0, steer: 0, reverse: false };

export function createImmersiveVehicle(initial: ImmersivePoint & { heading?: number; fuel?: number }): ImmersiveVehicleState {
  return {
    x: finite(initial.x), y: 0, z: finite(initial.z), heading: radians(initial.heading ?? 0),
    speed: 0, steering: 0, distance: 0, fuel: clamp(initial.fuel ?? IMMERSIVE_VEHICLE.tankGallons, 0, IMMERSIVE_VEHICLE.tankGallons),
    gear: 'D', throttle: 0, brake: 0, reverseHold: 0, collision: false,
  };
}

/** Arrow keys are equivalent to WASD; Space is a brake that never requests reverse. */
export function immersiveDrivingInput(keys: ReadonlySet<string>): ImmersiveDriveInput {
  const has = (...options: string[]): boolean => options.some(key => keys.has(key));
  const forward = has('w', 'W', 'KeyW', 'ArrowUp');
  const reverse = has('s', 'S', 'KeyS', 'ArrowDown');
  const brake = has(' ', 'Space', 'Spacebar');
  return {
    throttle: forward && !reverse ? 1 : 0,
    brake: reverse || brake ? 1 : 0,
    steer: Number(has('d', 'D', 'KeyD', 'ArrowRight')) - Number(has('a', 'A', 'KeyA', 'ArrowLeft')),
    reverse: reverse && !forward && !brake,
  };
}

/** Physical axes at the car's centre, shared with cameras and exit placement. */
export function immersiveVehicleAxes(heading: number): { forward: ImmersivePoint; right: ImmersivePoint } {
  return { forward: { x: -Math.sin(heading), z: -Math.cos(heading) }, right: { x: Math.cos(heading), z: -Math.sin(heading) } };
}

function validBounds(rect: ImmersiveBounds): boolean {
  return Number.isFinite(rect.minX) && Number.isFinite(rect.maxX) && Number.isFinite(rect.minZ) && Number.isFinite(rect.maxZ) && rect.minX < rect.maxX && rect.minZ < rect.maxZ;
}

/** Oriented rectangle/AABB SAT includes the entire bonnet, not just the driver point. */
function overlapsSolid(position: ImmersivePoint, heading: number, rect: ImmersiveBounds): boolean {
  if (!validBounds(rect)) return false;
  const halfLength = IMMERSIVE_VEHICLE.length / 2 + CLEARANCE;
  const halfWidth = IMMERSIVE_VEHICLE.width / 2 + CLEARANCE;
  const { forward, right } = immersiveVehicleAxes(heading);
  const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
  const hx = (rect.maxX - rect.minX) / 2, hz = (rect.maxZ - rect.minZ) / 2;
  const dx = position.x - cx, dz = position.z - cz;
  const carX = Math.abs(forward.x) * halfLength + Math.abs(right.x) * halfWidth;
  const carZ = Math.abs(forward.z) * halfLength + Math.abs(right.z) * halfWidth;
  if (Math.abs(dx) >= hx + carX || Math.abs(dz) >= hz + carZ) return false;
  if (Math.abs(dx * forward.x + dz * forward.z) >= halfLength + Math.abs(forward.x) * hx + Math.abs(forward.z) * hz) return false;
  if (Math.abs(dx * right.x + dz * right.z) >= halfWidth + Math.abs(right.x) * hx + Math.abs(right.z) * hz) return false;
  return true;
}

export function immersiveVehicleFits(position: ImmersivePoint, heading: number, world?: ImmersiveDrivingWorld): boolean {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z) || !Number.isFinite(heading)) return false;
  if (!world) return true;
  if (world.bounds && validBounds(world.bounds)) {
    const { forward, right } = immersiveVehicleAxes(heading);
    const rx = Math.abs(forward.x) * IMMERSIVE_VEHICLE.length / 2 + Math.abs(right.x) * IMMERSIVE_VEHICLE.width / 2 + CLEARANCE;
    const rz = Math.abs(forward.z) * IMMERSIVE_VEHICLE.length / 2 + Math.abs(right.z) * IMMERSIVE_VEHICLE.width / 2 + CLEARANCE;
    if (position.x - rx < world.bounds.minX || position.x + rx > world.bounds.maxX || position.z - rz < world.bounds.minZ || position.z + rz > world.bounds.maxZ) return false;
  }
  return !world.solids.some(rect => overlapsSolid(position, heading, rect));
}

/** Walking collision rotates with the parked body instead of adding invisible AABB corners. */
export function immersiveVehicleBlocksPoint(point: ImmersivePoint, vehicle: ImmersivePoint & { heading: number }, radius = .3): boolean {
  const { forward, right } = immersiveVehicleAxes(vehicle.heading);
  const dx = point.x - vehicle.x, dz = point.z - vehicle.z;
  const lateral = dx * right.x + dz * right.z;
  const longitudinal = dx * forward.x + dz * forward.z;
  const edgeX = Math.max(0, Math.abs(lateral) - IMMERSIVE_VEHICLE.width / 2);
  const edgeZ = Math.max(0, Math.abs(longitudinal) - IMMERSIVE_VEHICLE.length / 2);
  return edgeX * edgeX + edgeZ * edgeZ < Math.max(CLEARANCE, finite(radius)) ** 2;
}

/** Distance-only consumption preserves the existing save field's gallon meaning. */
export function immersiveFuelAfterDistance(fuel: number, distanceMetres: number): number {
  return Math.max(0, clamp(fuel, 0, IMMERSIVE_VEHICLE.tankGallons) - Math.max(0, finite(distanceMetres)) / (METRES_PER_MILE * IMMERSIVE_VEHICLE.milesPerGallon));
}

function tickVehicle(state: ImmersiveVehicleState, input: ImmersiveDriveInput, dt: number, world?: ImmersiveDrivingWorld): ImmersiveVehicleState {
  let gear = state.gear;
  let reverseHold = input.reverse ? state.reverseHold : 0;
  let accelerator = input.throttle;
  let brakeDemand = input.brake;
  const nearRest = Math.abs(state.speed) < .08;
  if (input.reverse) {
    accelerator = 0;
    if (state.speed > .08) { brakeDemand = 1; reverseHold = 0; }
    else if (gear === 'D' && nearRest) {
      reverseHold += dt; brakeDemand = 1;
      if (reverseHold >= REVERSE_DELAY) { gear = 'R'; accelerator = 1; brakeDemand = 0; }
    } else if (gear === 'R') { accelerator = 1; brakeDemand = 0; }
  } else if (input.throttle > 0) {
    if (state.speed < -.08) { accelerator = 0; brakeDemand = 1; }
    else if (nearRest) gear = 'D';
  }
  if (state.fuel <= 0) accelerator = 0;
  const throttle = approach(state.throttle, accelerator, accelerator < state.throttle ? 10 : 4.2, dt);
  const brake = approach(state.brake, brakeDemand, 18, dt);
  const absSpeed = Math.abs(state.speed);
  const maxSteering = Math.min(IMMERSIVE_VEHICLE.maxSteering, Math.atan(IMMERSIVE_VEHICLE.maxLateralAcceleration * IMMERSIVE_VEHICLE.wheelbase / Math.max(1, absSpeed * absSpeed)));
  const steering = clamp(approach(state.steering, input.steer * maxSteering, input.steer ? 4.2 : 6, dt), -maxSteering, maxSteering);
  const direction = gear === 'R' ? -1 : 1;
  const engine = state.fuel <= 0 ? 0 : gear === 'R' ? 1.35 : Math.max(0, 2.38 - .03 * absSpeed);
  const rollingAndAirResistance = .12 + .00055 * absSpeed * absSpeed;
  const opposing = absSpeed > .00001 ? Math.sign(state.speed) * (rollingAndAirResistance + IMMERSIVE_VEHICLE.brakingDeceleration * brake) : 0;
  const force = direction * engine * throttle * (1 - brake) - opposing;
  let speed = state.speed + force * dt;
  if (state.speed !== 0 && Math.sign(speed) !== Math.sign(state.speed) && (brake > .01 || throttle < .01)) speed = 0;
  if (Math.abs(speed) < .025 && throttle < .01) speed = 0;
  speed = clamp(speed, -IMMERSIVE_VEHICLE.maxReverseSpeed, IMMERSIVE_VEHICLE.maxSpeed);
  if (gear === 'D' && state.speed >= 0) speed = Math.max(0, speed);
  if (gear === 'R' && state.speed <= 0) speed = Math.min(0, speed);
  const averageSpeed = (state.speed + speed) / 2;
  const rotation = -averageSpeed / IMMERSIVE_VEHICLE.wheelbase * Math.tan(steering) * dt;
  const midHeading = state.heading + rotation / 2;
  const dx = -Math.sin(midHeading) * averageSpeed * dt;
  const dz = -Math.cos(midHeading) * averageSpeed * dt;
  let fraction = 1;
  const nextHeading = radians(state.heading + rotation);
  const nextPosition = { x: state.x + dx, z: state.z + dz };
  let collision = false;
  if (!immersiveVehicleFits(nextPosition, nextHeading, world)) {
    collision = true;
    // Stop at the last safe swept fraction. No height impulse or repositioning across a wall.
    let low = 0, high = 1;
    if (!immersiveVehicleFits(state, state.heading, world)) high = 0;
    for (let i = 0; i < 12 && high > 0; i++) {
      const mid = (low + high) / 2;
      if (immersiveVehicleFits({ x: state.x + dx * mid, z: state.z + dz * mid }, radians(state.heading + rotation * mid), world)) low = mid;
      else high = mid;
    }
    fraction = low; speed = 0;
  }
  const travelled = Math.hypot(dx * fraction, dz * fraction);
  return {
    x: state.x + dx * fraction, y: 0, z: state.z + dz * fraction,
    heading: radians(state.heading + rotation * fraction), speed, steering,
    distance: state.distance + travelled, fuel: immersiveFuelAfterDistance(state.fuel, travelled),
    gear, throttle, brake, reverseHold, collision,
  };
}

/** Full body sweeps and limited catch-up prevent tunnelling and hidden-tab teleportation. */
export function stepImmersiveVehicle(state: ImmersiveVehicleState, requested: ImmersiveDriveInput = idleInput, seconds = 0, world?: ImmersiveDrivingWorld): ImmersiveVehicleState {
  const elapsed = clamp(seconds, 0, IMMERSIVE_MAX_FRAME_SECONDS);
  const input: ImmersiveDriveInput = { throttle: clamp(requested.throttle, 0, 1), brake: clamp(requested.brake, 0, 1), steer: clamp(requested.steer, -1, 1), reverse: requested.reverse === true };
  let next: ImmersiveVehicleState = {
    ...state, x: finite(state.x), y: 0, z: finite(state.z), heading: radians(state.heading),
    speed: clamp(state.speed, -IMMERSIVE_VEHICLE.maxReverseSpeed, IMMERSIVE_VEHICLE.maxSpeed),
    steering: clamp(state.steering, -IMMERSIVE_VEHICLE.maxSteering, IMMERSIVE_VEHICLE.maxSteering),
    distance: Math.max(0, finite(state.distance)), fuel: clamp(state.fuel, 0, IMMERSIVE_VEHICLE.tankGallons),
    gear: state.gear === 'R' ? 'R' : 'D', throttle: clamp(state.throttle, 0, 1), brake: clamp(state.brake, 0, 1),
    reverseHold: clamp(state.reverseHold, 0, REVERSE_DELAY), collision: false,
  };
  const steps = Math.max(1, Math.ceil(elapsed / IMMERSIVE_DRIVING_STEP), Math.ceil(Math.abs(next.speed) * elapsed / .2));
  const dt = elapsed / steps;
  let collision = false;
  for (let i = 0; i < steps; i++) { next = tickVehicle(next, input, dt, world); collision ||= next.collision; }
  return { ...next, collision };
}

export function immersiveVehicleTelemetry(state: ImmersiveVehicleState): {
  mph: number; absoluteMph: number; normalizedSpeed: number; normalizedEngine: number;
  engineRpm: number; engineLoad: number; gearNumber: number; gear: 'D' | 'R'; steeringWheel: number; brakeLights: boolean;
} {
  const speed = Math.abs(state.speed);
  const gearNumber = state.gear === 'R' ? 1 : speed < 6.1 ? 1 : speed < 11.7 ? 2 : speed < 18.9 ? 3 : 4;
  const ratios = [440, 235, 150, 95];
  const engineRpm = state.fuel <= 0 ? 0 : clamp(850 + speed * ratios[gearNumber - 1] + state.throttle * 380, 850, 4700);
  return {
    mph: state.speed * MPH_PER_METRE_SECOND, absoluteMph: speed * MPH_PER_METRE_SECOND,
    normalizedSpeed: clamp(speed / IMMERSIVE_VEHICLE.maxSpeed, 0, 1), normalizedEngine: clamp((engineRpm - 850) / (4700 - 850), 0, 1),
    engineRpm, engineLoad: clamp(state.throttle, 0, 1), gearNumber, gear: state.gear,
    steeringWheel: -state.steering * IMMERSIVE_VEHICLE.steeringRatio, brakeLights: state.brake > .1,
  };
}
