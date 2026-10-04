import type { Game, Tier } from './game';
import { boundedField, freshField } from './expedition.ts';
import { REGIONAL_SERVICE_POINTS, WORLD_SIZE } from './immersive-locations.ts';
import type { WorldPoint } from './immersive-runtime.ts';

/** Contacts come from the shared physics world; walking-speed nudges carry no charge. */
export const MIN_PEDESTRIAN_IMPACT_SPEED = 2.5;
export const POLICE_ARRIVAL_SECONDS = 18;
export const POLICE_RESOLVE_SECONDS = 30;
export const LAW_HISTORY_LIMIT = 64;
export type PedestrianIncident = { id: string; npcId: string; position: WorldPoint; speed: number };
export type PoliceResponse = PedestrianIncident & {
  phase: 'dispatched' | 'arrived'; elapsedSeconds: number;
};
export type LawLoss = {
  fine: number; reputation: number; missions: number; actions: number; trust: number; morale: number;
};
export type LawIncident = PedestrianIncident & {
  week: number; tier: Tier; loss: LawLoss; resolved: boolean;
};
export type LawState = {
  schema: 1; sequence: number; handled: string[]; response: PoliceResponse | null; last: LawIncident | null;
};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number => finite(value, min, max) && Number.isSafeInteger(value);
const validNpcId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const validPosition = (value: unknown): value is WorldPoint => record(value) && finite(value.x, 0, WORLD_SIZE.width) && finite(value.z, 0, WORLD_SIZE.depth);
function idParts(value: unknown): { sequence: number; npcId: string } | null {
  if (typeof value !== 'string' || value.length > 185) return null;
  const match = /^law:([1-9][0-9]*):(.+)$/.exec(value);
  if (!match || !validNpcId(match[2])) return null;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) ? { sequence, npcId: match[2] } : null;
}
export const freshLaw = (): LawState => ({ schema: 1, sequence: 0, handled: [], response: null, last: null });
export const lawOf = (game: Pick<Game, 'law'>): LawState => game.law ?? freshLaw();
export const incidentIdFor = (game: Pick<Game, 'law'>, npcId: string): string => `law:${lawOf(game).sequence + 1}:${npcId}`;
/** A new contact may be committed before React exposes its replacement response. */
export const policeResponseIsCurrent = (response: PoliceResponse | null, sequence: number): response is PoliceResponse =>
  !!response && idParts(response.id)?.sequence === sequence;
export const policeResponseProgress = (response: PoliceResponse | null): number => response ? Math.min(1, Math.max(0, response.elapsedSeconds / POLICE_RESOLVE_SECONDS)) : 0;
export function validPedestrianIncident(value: unknown): value is PedestrianIncident & Record<string, unknown> {
  if (!record(value)) return false;
  const id = idParts(value.id);
  return !!id && id.npcId === value.npcId && validPosition(value.position) && finite(value.speed, MIN_PEDESTRIAN_IMPACT_SPEED, 65);
}
/** The monotonic sequence survives history pruning, chapter changes and process restarts. */
export function validLaw(value: unknown): value is LawState {
  if (!record(value) || value.schema !== 1 || !integer(value.sequence, 0, Number.MAX_SAFE_INTEGER) ||
      !Array.isArray(value.handled) || value.handled.length !== Math.min(value.sequence, LAW_HISTORY_LIMIT)) return false;
  const sequence = value.sequence, handled = value.handled;
  if (!handled.every((id, index) => idParts(id)?.sequence === sequence - handled.length + index + 1)) return false;
  if (sequence === 0) return value.response === null && value.last === null;
  const last = value.last;
  if (!record(last) || !validPedestrianIncident(last) || last.id !== handled.at(-1) ||
      !integer(last.week, 1, Number.MAX_SAFE_INTEGER) || !integer(last.tier, 0, 2) || typeof last.resolved !== 'boolean' || !record(last.loss)) return false;
  const loss = last.loss;
  if (!finite(loss.fine, 0, Number.MAX_SAFE_INTEGER) || !finite(loss.reputation, 0, 40) || !integer(loss.missions, 0, 2) ||
      !integer(loss.actions, 0, 8) || !finite(loss.trust, 0, 45) || !finite(loss.morale, 0, 30)) return false;
  if (value.response === null) return last.resolved;
  const response = value.response;
  if (!record(response) || !validPedestrianIncident(response) || last.resolved || response.id !== last.id || response.npcId !== last.npcId ||
      response.position.x !== last.position.x || response.position.z !== last.position.z || response.speed !== last.speed ||
      !finite(response.elapsedSeconds, 0, POLICE_RESOLVE_SECONDS)) return false;
  return response.phase === (response.elapsedSeconds >= POLICE_ARRIVAL_SECONDS ? 'arrived' : 'dispatched');
}

/** Shared towing/impound placement: no free fuel, repair, mileage reset or gear change. */
export function impoundVehicle(game: Game): typeof REGIONAL_SERVICE_POINTS[number] {
  const state = game.immersion;
  if (!state) throw new Error('A vehicle must be in the world before it can be impounded.');
  const car = state.vehicle;
  const station = REGIONAL_SERVICE_POINTS.reduce((nearest, point) =>
    Math.hypot(car.x - point.parking.x, car.z - point.parking.z) < Math.hypot(car.x - nearest.parking.x, car.z - nearest.parking.z) ? point : nearest);
  state.vehicle = { ...car, ...station.parking, speed: 0, heading: 0, steering: 0 };
  state.player = { ...state.player, x: station.parking.x + 3, z: station.parking.z, yaw: Math.PI / 2, pitch: 0 };
  state.interior = null; state.mode = 'foot';
  if (station.locationId === 4) state.parkedAt = [...new Set([...state.parkedAt, 4])];
  game.field = boundedField({ ...game.field ?? freshField(game.tier), scene: 'district', driving: false,
    car: { x: state.vehicle.x, y: state.vehicle.z }, player: { x: state.player.x, y: state.player.z }, heading: 0, fuel: car.fuel });
  return station;
}
