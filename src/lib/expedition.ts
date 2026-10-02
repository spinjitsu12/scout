import type { Game, Tier } from "./game";

export type Point = { x: number; y: number };
export type ScoutStyle = { name: string; avatar: number; car: "compact" | "wagon" | "coupe"; paint: "mint" | "coral" | "gold" | "violet" | "slate"; plate: string; camera?: "overhead" | "cockpit" | "chase" | "far"; radio?: boolean; station?: 0 | 1 | 2; music?: boolean; sound?: boolean; engine?: boolean };
export type FieldState = { scene: "office" | "district"; player: Point; car: Point; heading: number; driving: boolean; fuel: number; visited: number[]; met: string[]; destination: number | null };
export type FieldLocation = { id: number; point: Point; door: Point; name: string; subtitle: string; source: number | null };
export const DISTRICT_WIDTH = 1536;
export const DISTRICT_HEIGHT = 1024;
export const DISTRICT_ASSETS = ["pixel/company-district.png", "pixel/elite-district.png", "pixel/veil-district.png"];
export const HQ_POINT = { x: 387, y: 266 };
export const GAS_POINT = { x: 840, y: 620 };
export const FUEL_CAPACITY = 12;
export const GAS_PRICES = [4.15, 4.65, 5.25] as const;
export const FIELD_LOCATIONS: Record<Tier, FieldLocation[]> = {
  0: [
    { id: 0, point: { x: 387, y: 266 }, door: { x: 387, y: 180 }, name: "Cirrus Works", subtitle: "Headquarters & garage", source: null },
    { id: 1, point: { x: 1159, y: 266 }, door: { x: 1159, y: 201 }, name: "Maker Yard", subtitle: "Community meetup", source: 0 },
    { id: 2, point: { x: 388, y: 718 }, door: { x: 388, y: 910 }, name: "Palette House", subtitle: "Portfolio circuit", source: 1 },
    { id: 3, point: { x: 1138, y: 718 }, door: { x: 1138, y: 928 }, name: "Junction Café", subtitle: "Industry referrals", source: 2 },
    { id: 4, point: GAS_POINT, door: GAS_POINT, name: "Highway Fuel", subtitle: "Fuel & roadside assistance", source: null },
  ],
  1: [
    { id: 0, point: { x: 375, y: 275 }, door: { x: 375, y: 189 }, name: "Aster Institute", subtitle: "Headquarters & garage", source: null },
    { id: 1, point: { x: 1170, y: 275 }, door: { x: 1170, y: 194 }, name: "Archive Annex", subtitle: "Independent journals", source: 0 },
    { id: 2, point: { x: 375, y: 752 }, door: { x: 375, y: 928 }, name: "Observatory", subtitle: "Research symposium", source: 1 },
    { id: 3, point: { x: 1170, y: 752 }, door: { x: 1170, y: 932 }, name: "Glass Pavilion", subtitle: "Fellowship network", source: 2 },
    { id: 4, point: GAS_POINT, door: GAS_POINT, name: "Highway Fuel", subtitle: "Fuel & roadside assistance", source: null },
  ],
  2: [
    { id: 0, point: { x: 383, y: 266 }, door: { x: 383, y: 188 }, name: "The Veil", subtitle: "Restricted headquarters", source: null },
    { id: 1, point: { x: 1167, y: 266 }, door: { x: 1167, y: 186 }, name: "Signal Archive", subtitle: "Incident archive", source: 0 },
    { id: 2, point: { x: 384, y: 702 }, door: { x: 384, y: 908 }, name: "Last Stop", subtitle: "Witness interviews", source: 1 },
    { id: 3, point: { x: 1185, y: 702 }, door: { x: 1185, y: 923 }, name: "Night Market", subtitle: "Encrypted referrals", source: 2 },
    { id: 4, point: GAS_POINT, door: GAS_POINT, name: "Highway Fuel", subtitle: "Fuel & roadside assistance", source: null },
  ],
};
export const PAINTS = { mint: "#86cfb3", coral: "#ed8b7b", gold: "#edc76c", violet: "#b6a0e3", slate: "#91a4b4" } as const;
export const CAR_NAMES = { compact: "City compact", wagon: "Field wagon", coupe: "Scout coupe" } as const;
export const DEFAULT_STYLE: ScoutStyle = { name: "Scout", avatar: 0, car: "compact", paint: "mint", plate: "SCOUT", camera: "overhead", radio: false, station: 0, music: true, sound: true, engine: true };
export const MEET_DISTANCE = 90;
export const VENUE_DISTANCE = 110;
export const FULL_TURN = Math.PI * 2;
export const freshField = (tier: Tier = 0): FieldState => {
  const headquarters = FIELD_LOCATIONS[tier][0].point;
  return { scene: "office", player: { x: headquarters.x, y: headquarters.y + 40 }, car: { ...headquarters }, heading: 0, driving: false, fuel: FUEL_CAPACITY, visited: [0], met: [], destination: null };
};
export const fieldOf = (game: Game): FieldState => game.field ? { ...game.field, fuel: game.field.fuel ?? FUEL_CAPACITY } : freshField(game.tier);
export const styleOf = (game: Game): ScoutStyle => ({ ...DEFAULT_STYLE, ...game.style });
export function candidateLocation(id: string): number { return (Math.max(0, Number(id.split("-")[1]) || 0) % 3) + 1; }
export const locationOf = (game: Game, id: string) => FIELD_LOCATIONS[game.tier][candidateLocation(id)];

// Keep every contact's feet on the open pavement beside their venue's entrance.
// The renderer and the recruiting rules share these positions, including generated leads.
export function candidatePosition(game: Pick<Game, "tier">, id: string): Point {
  const location = FIELD_LOCATIONS[game.tier][candidateLocation(id)];
  const index = Math.max(0, Number(id.split("-")[1]) || 0);
  const slot = Math.floor(index / 3) % 12;
  const row = Math.floor(slot / 6);
  return {
    x: location.door.x + ((slot % 6) - 2.5) * 38,
    y: Math.min(DISTRICT_HEIGHT - 30, location.door.y + 12 + row * 24),
  };
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function atVenue(game: Game, locationId: number): boolean {
  const location = FIELD_LOCATIONS[game.tier].find(place => place.id === locationId);
  const field = fieldOf(game);
  return !!location && field.scene === "district" && !field.driving && distance(field.player, location.door) <= VENUE_DISTANCE;
}
export function canMeet(game: Game, id: string): boolean {
  const contact = game.candidates.find(candidate => candidate.id === id);
  const field = fieldOf(game);
  return !!contact && contact.discovered && contact.status === "available" &&
    field.scene === "district" && !field.driving && distance(field.player, candidatePosition(game, id)) <= MEET_DISTANCE;
}
export function canRefuel(game: Game): boolean {
  const field = fieldOf(game);
  return atVenue(game, 4) && distance(field.car, FIELD_LOCATIONS[game.tier][4].point) <= 100;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validPoint = (value: unknown, bounded: boolean): value is Point => record(value) && finite(value.x) && finite(value.y) &&
  (!bounded || (value.x >= 0 && value.x <= DISTRICT_WIDTH && value.y >= 0 && value.y <= DISTRICT_HEIGHT));

export function validScoutStyle(value: unknown): value is ScoutStyle {
  return record(value) && typeof value.name === "string" && value.name.length >= 1 && value.name.length <= 24 &&
    value.name.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value.name) &&
    Number.isInteger(value.avatar) && (value.avatar as number) >= 0 && (value.avatar as number) <= 15 &&
    typeof value.car === "string" && Object.hasOwn(CAR_NAMES, value.car) &&
    typeof value.paint === "string" && Object.hasOwn(PAINTS, value.paint) &&
    typeof value.plate === "string" && /^[A-Z0-9-]{1,8}$/u.test(value.plate) &&
    (value.camera === undefined || (typeof value.camera === "string" && ["overhead", "cockpit", "chase", "far"].includes(value.camera))) &&
    (value.radio === undefined || typeof value.radio === "boolean") &&
    (value.music === undefined || typeof value.music === "boolean") &&
    (value.sound === undefined || typeof value.sound === "boolean") &&
    (value.engine === undefined || typeof value.engine === "boolean") &&
    (value.station === undefined || (Number.isInteger(value.station) && (value.station as number) >= 0 && (value.station as number) <= 2));
}

// Runtime snapshots may contain harmless finite overshoot after a long animation
// frame. Saved careers always contain bounded positions and a normalized heading.
export function validField(value: unknown, bounded = true, legacyFuel = false): value is FieldState {
  if (!record(value) || !["office", "district"].includes(value.scene as string) ||
      !validPoint(value.player, bounded) || !validPoint(value.car, bounded) || !finite(value.heading) ||
      (bounded && (value.heading < 0 || value.heading >= FULL_TURN)) ||
      typeof value.driving !== "boolean" || (value.scene === "office" && value.driving) ||
      (!(legacyFuel && value.fuel === undefined) && (!finite(value.fuel) || (bounded && (value.fuel < 0 || value.fuel > FUEL_CAPACITY)))) ||
      !Array.isArray(value.visited) || value.visited.length > 5 || new Set(value.visited).size !== value.visited.length ||
      !value.visited.every(id => Number.isInteger(id) && id >= 0 && id <= 4) ||
      !Array.isArray(value.met) || value.met.length > 200 || new Set(value.met).size !== value.met.length ||
      !value.met.every(id => typeof id === "string" && id.length > 0 && id.length <= 100) ||
      (value.destination !== null && (!Number.isInteger(value.destination) || (value.destination as number) < 0 || (value.destination as number) > 4))) return false;
  return true;
}

export function boundedField(field: FieldState): FieldState {
  const bound = (point: Point): Point => ({ x: Math.max(0, Math.min(DISTRICT_WIDTH, point.x)), y: Math.max(0, Math.min(DISTRICT_HEIGHT, point.y)) });
  return {
    ...field, player: bound(field.player), car: bound(field.car),
    heading: ((field.heading % FULL_TURN) + FULL_TURN) % FULL_TURN,
    fuel: Math.max(0, Math.min(FUEL_CAPACITY, field.fuel)),
    visited: [...field.visited], met: [...field.met],
  };
}
