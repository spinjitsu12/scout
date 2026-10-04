/** Small deterministic motion tools, independent of React, Three.js, and refresh rate. */
export type ImmersiveMotionPoint = { x: number; z: number };
export type ImmersiveMotionPose = ImmersiveMotionPoint & { heading: number };
export type ImmersiveClock = { remainder: number; stepSeconds: number; maxCatchUpSeconds: number };
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, finite(value)));
const angle = (value: number) => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
export function createImmersiveClock(stepSeconds = 1 / 120, maxCatchUpSeconds = .1): ImmersiveClock {
  return { remainder: 0, stepSeconds: clamp(stepSeconds, 1 / 240, 1 / 30), maxCatchUpSeconds: clamp(maxCatchUpSeconds, 1 / 30, .15) };
}
/**
 * Fixed simulation ticks with a bounded amount of work for every active frame.
 * Slow rendering is not a pause: even a long active frame advances the budget.
 * The caller must mark hidden/paused frames inactive and reset on resuming; their
 * unseen time is discarded rather than inferred from an arbitrary FPS cutoff.
 */
export function advanceImmersiveClock(clock: ImmersiveClock, seconds: number, active = true): {
  clock: ImmersiveClock; steps: number; alpha: number; stepSeconds: number; elapsed: number;
} {
  const stepSeconds = clamp(clock.stepSeconds, 1 / 240, 1 / 30);
  const maxCatchUpSeconds = clamp(clock.maxCatchUpSeconds, stepSeconds, .15);
  const paused = !active || !Number.isFinite(seconds) || seconds < 0;
  if (paused) return { clock: { remainder: 0, stepSeconds, maxCatchUpSeconds }, steps: 0, alpha: 1, stepSeconds, elapsed: 0 };
  const available = clamp(clock.remainder, 0, stepSeconds) + Math.min(seconds, maxCatchUpSeconds);
  const maxSteps = Math.max(1, Math.floor(maxCatchUpSeconds / stepSeconds + 1e-8));
  const steps = Math.min(maxSteps, Math.floor(available / stepSeconds + 1e-8));
  const remainder = clamp(available - steps * stepSeconds, 0, stepSeconds * (1 - 1e-10));
  return { clock: { remainder, stepSeconds, maxCatchUpSeconds }, steps, alpha: remainder / stepSeconds, stepSeconds, elapsed: steps * stepSeconds };
}
/** Shortest-arc heading interpolation avoids a spin when crossing +/-PI. */
export function interpolateImmersivePose(previous: ImmersiveMotionPose, current: ImmersiveMotionPose, alpha: number): ImmersiveMotionPose {
  const amount = clamp(alpha, 0, 1);
  return { x: previous.x + (current.x - previous.x) * amount, z: previous.z + (current.z - previous.z) * amount,
    heading: angle(previous.heading + angle(current.heading - previous.heading) * amount) };
}
export function immersiveDampingAlpha(response: number, seconds: number): number {
  return 1 - Math.exp(-Math.max(0, finite(response)) * clamp(seconds, 0, .25));
}
export function smoothImmersiveValue(current: number, target: number, response: number, seconds: number): number {
  const start = finite(current), destination = finite(target, start);
  return start + (destination - start) * immersiveDampingAlpha(response, seconds);
}
export function smoothImmersiveAngle(current: number, target: number, response: number, seconds: number): number {
  return angle(finite(current) + angle(target - current) * immersiveDampingAlpha(response, seconds));
}
/** Analytic damped walking: gentle starts, prompt stops, no diagonal speed boost. */
export function stepImmersiveWalk(velocity: ImmersiveMotionPoint, requestedDirection: ImmersiveMotionPoint, seconds: number, maxSpeed = 2.15): {
  velocity: ImmersiveMotionPoint; displacement: ImmersiveMotionPoint; speed: number;
} {
  const dt = clamp(seconds, 0, .1), speedLimit = clamp(maxSpeed, 0, 8);
  const dx = finite(requestedDirection.x), dz = finite(requestedDirection.z), length = Math.hypot(dx, dz);
  const divisor = Math.max(1, length), target = { x: dx / divisor * speedLimit, z: dz / divisor * speedLimit };
  const response = length > .001 ? 14 : 22, decay = Math.exp(-response * dt), integratedDecay = (1 - decay) / response;
  const vx = finite(velocity.x), vz = finite(velocity.z);
  const next = { x: target.x + (vx - target.x) * decay, z: target.z + (vz - target.z) * decay };
  return { velocity: next, displacement: { x: target.x * dt + (vx - target.x) * integratedDecay, z: target.z * dt + (vz - target.z) * integratedDecay }, speed: Math.hypot(next.x, next.z) };
}
/** Exact critically damped suspension/camera spring. */
export function springImmersiveValue(position: number, velocity: number, target: number, frequency: number, seconds: number): { position: number; velocity: number } {
  const dt = clamp(seconds, 0, .1), omega = clamp(frequency, 0, 60), destination = finite(target), start = finite(position, destination), momentum = finite(velocity);
  if (omega <= 0 || dt <= 0) return { position: start, velocity: momentum };
  const offset = start - destination, impulse = momentum + omega * offset, decay = Math.exp(-omega * dt);
  return { position: destination + (offset + impulse * dt) * decay, velocity: (momentum - omega * impulse * dt) * decay };
}
