/** The dream is a prologue, never a lost or unwinnable real career. */
export const PROLOGUE_PHASES = ["sky", "cruise", "meeting", "phone", "wake", "complete"] as const;
export type ProloguePhase = typeof PROLOGUE_PHASES[number];
export type PrologueChoice = "salary" | "purpose" | "freedom";
export type PrologueState = { phase: ProloguePhase; choice: PrologueChoice | null };
export type DreamDrive = { distance: number; speed: number; lane: number };
export type DreamDriveInput = { throttle: boolean; brake: boolean; steering: number };

export const DREAM_ROUTE_LENGTH = 1050;
export const DREAM_MAX_SPEED = 126;
export const DREAM_CONTACT = { name: "Luca Vale", detail: "Stanfield dropout · Independent inventor" } as const;
export const DREAM_PITCHES: readonly { id: PrologueChoice; label: string; reply: string }[] = [
  { id: "salary", label: "Offer a salary nobody could refuse.", reply: "Money wasn't why I walked away from Stanfield. You still haven't asked what I want to build. I'm out." },
  { id: "purpose", label: "Pitch work that could change the world.", reply: "Everyone says that. Whose world? You brought a slogan when I needed a reason. I'm out." },
  { id: "freedom", label: "Promise him complete creative freedom.", reply: "A promise before you know me is just another contract. I won't sign away my future. I'm out." },
];

export const initialPrologue = (): PrologueState => ({ phase: "sky", choice: null });

export function validPrologue(value: unknown): value is PrologueState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return PROLOGUE_PHASES.includes(state.phase as ProloguePhase) &&
    (state.choice === null || DREAM_PITCHES.some(pitch => pitch.id === state.choice)) &&
    (!["sky", "cruise"].includes(state.phase as string) || state.choice === null);
}

/** Scene changes are the save boundaries; reload never restarts a completed dream. */
export function advancePrologue(state: PrologueState): PrologueState {
  if (!validPrologue(state)) throw new Error("Invalid prologue save");
  if (state.phase === "meeting" && state.choice === null) return { ...state };
  const index = PROLOGUE_PHASES.indexOf(state.phase);
  return { ...state, phase: PROLOGUE_PHASES[Math.min(index + 1, PROLOGUE_PHASES.length - 1)] };
}

export function chooseProloguePitch(state: PrologueState, choice: PrologueChoice): PrologueState {
  if (!validPrologue(state) || state.phase !== "meeting" || !DREAM_PITCHES.some(pitch => pitch.id === choice)) throw new Error("Choose a pitch at the meeting");
  // All three endings are intentionally dream rejections, with different dialogue.
  // A choice is committed once; the dream is not a retryable hiring puzzle.
  return state.choice === null ? { ...state, choice } : { ...state };
}

/** Reduced-motion and skip controls still arrive at the playable apartment. */
export function skipPrologueDream(state: PrologueState): PrologueState {
  if (!validPrologue(state)) throw new Error("Invalid prologue save");
  return state.phase === "complete" ? { ...state } : { ...state, phase: "wake" };
}

export function stepDreamDrive(state: DreamDrive, input: DreamDriveInput, elapsedSeconds: number): DreamDrive {
  const dt = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.min(.08, elapsedSeconds)) : 0;
  const steering = Number.isFinite(input.steering) ? Math.max(-1, Math.min(1, input.steering)) : 0;
  const acceleration = input.brake ? -116 : input.throttle ? 42 : -9;
  const speed = Math.max(0, Math.min(DREAM_MAX_SPEED, state.speed + acceleration * dt));
  return {
    speed,
    distance: Math.max(0, Math.min(DREAM_ROUTE_LENGTH, state.distance + speed * dt)),
    lane: Math.max(-.72, Math.min(.72, state.lane + steering * dt * (speed > 3 ? .38 : 0))),
  };
}

export type ApartmentStationId = "bed" | "sink" | "stove" | "fridge" | "window" | "desk";
export type ApartmentStation = { id: ApartmentStationId; name: string; point: { x: number; y: number }; approach: { x: number; y: number }; thought: string };
// Coordinates use the same 960 × 640 logical room as the character renderer.
// Approaches live on the open floor; furniture itself remains solid.
export const APARTMENT_SPAWN = { x: 190, y: 455 };
export const APARTMENT_OBSTACLES = [
  { x: 114, y: 195, width: 143, height: 212 },
  { x: 64, y: 202, width: 48, height: 62 },
  { x: 293, y: 151, width: 29, height: 132 },
  { x: 294, y: 351, width: 25, height: 178 },
  { x: 666, y: 423, width: 171, height: 112 },
  { x: 789, y: 221, width: 111, height: 166 },
  { x: 695, y: 253, width: 71, height: 109 },
  { x: 637, y: 30, width: 258, height: 153 },
  { x: 27, y: 534, width: 374, height: 106 },
  { x: 544, y: 536, width: 389, height: 104 },
] as const;
export const APARTMENT_STATIONS: readonly ApartmentStation[] = [
  { id: "bed", name: "Bed", point: { x: 188, y: 300 }, approach: { x: 190, y: 446 }, thought: "The car. The deal. The call. Just a dream. You've still got a first day ahead of you." },
  { id: "sink", name: "Tiny bathroom", point: { x: 156, y: 66 }, approach: { x: 263, y: 177 }, thought: "A sink, a mirror, and barely enough room to turn around. At least the water is warm." },
  { id: "stove", name: "Stove", point: { x: 849, y: 139 }, approach: { x: 849, y: 213 }, thought: "Two burners work. One is ambitious. Breakfast will have to wait until after the first shift." },
  { id: "fridge", name: "Fridge", point: { x: 668, y: 119 }, approach: { x: 668, y: 212 }, thought: "Milk, yesterday's noodles, and a note: 'Do something worth waking up for.'" },
  { id: "window", name: "Window", point: { x: 507, y: 75 }, approach: { x: 509, y: 179 }, thought: "The city is already moving. Somewhere out there is someone nobody else has noticed." },
  { id: "desk", name: "Laptop", point: { x: 755, y: 456 }, approach: { x: 754, y: 398 }, thought: "Cirrus Works · Trainee scout. Your first real opportunity. Start small, listen closely, and earn the next chapter." },
];
