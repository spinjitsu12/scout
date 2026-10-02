import type { Action, Game } from "./game";

export type GamePanel =
  | { kind: "candidate"; id: string }
  | { kind: "venue"; source: number }
  | { kind: "sources" | "missions" | "team" | "career" | "week" | "help" }
  | null;

export type WorldTarget =
  | { kind: "candidate"; id: string }
  | { kind: "station"; station: "sources" | "missions" | "week" | "career" | "team" | "garage" };

export type RunAction = (action: Action) => boolean;

export type GameplayPanelsProps = {
  game: Game;
  panel: GamePanel;
  onClose: () => void;
  onOpen: (panel: GamePanel) => void;
  run: RunAction;
  onTravel?: (source: number) => void;
  onFindCandidate?: (id: string) => void;
};

export type WorldProps = {
  game: Game;
  paused: boolean;
  onInteract: (target: WorldTarget) => void;
  focusId?: string | null;
  officeOnly?: boolean;
};

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 640;
export const WORLD_ASSETS = ["pixel/company-world.png", "pixel/elite-world.png", "pixel/veil-world.png"];

export function spriteIndex(id?: string): number {
  if (!id) return 0;
  const index = Number(id.split("-")[1]) || 0;
  return (index % 15) + 1;
}
