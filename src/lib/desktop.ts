export type DesktopUpdateState = "idle" | "checking" | "available" | "downloading" | "validating" | "ready" | "installing" | "error" | "offline" | "unconfigured" | "unsupported";
export type SaveSlot = 1 | 2 | 3;
export type SaveSlotSummary = {
  slot: SaveSlot;
  occupied: boolean;
  name: string | null;
  tier: number | null;
  week: number | null;
  lastSavedAt?: number;
  error?: string;
  backupAvailable?: boolean;
};
export type DisplayMode = "borderless" | "fullscreen" | "windowed";
export type DesktopUpdateStatus = {
  supported: boolean;
  currentVersion: string;
  repository: string | null;
  configurable: boolean;
  state: DesktopUpdateState;
  connection: "unknown" | "online" | "offline";
  lastCheckedAt: number | null;
  automaticCheck: boolean;
  offlinePlayable?: boolean;
  updateMode?: "portable" | "installer" | "development" | "mac-app";
  manualUpdate?: boolean;
  unsupportedReason?: string;
  message?: string;
  availableVersion?: string;
  notes?: string;
  totalBytes?: number;
  downloadedBytes?: number;
  progress?: number;
  lastResult?: { status: "installed" | "rolled-back" | "error"; message: string; version?: string };
};

export type DesktopBridge = {
  platform?: string;
  confirmReady?: () => Promise<void>;
  listSaveSlots: () => Promise<SaveSlotSummary[]>;
  loadCareer: (slot?: SaveSlot) => Promise<string | null>;
  saveCareer: (json: string, slot?: SaveSlot) => Promise<{ ok: boolean; error?: string }>;
  loadBackup: (slot?: SaveSlot) => Promise<string | null>;
  getDisplayMode: () => Promise<DisplayMode>;
  setDisplayMode: (mode: DisplayMode) => Promise<DisplayMode>;
  onDisplayMode: (listener: (mode: DisplayMode) => void) => () => void;
  toggleFullscreen: () => Promise<boolean>;
  quit: () => Promise<void>;
  exportCareer: (json: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
  importCareer: () => Promise<string | null>;
  getUpdateStatus: () => Promise<DesktopUpdateStatus>;
  setUpdateRepository: (repository: string | null) => Promise<DesktopUpdateStatus>;
  checkForUpdate: () => Promise<DesktopUpdateStatus>;
  downloadUpdate: () => Promise<DesktopUpdateStatus>;
  cancelUpdate: () => Promise<DesktopUpdateStatus>;
  prepareLocalUpdate: () => Promise<DesktopUpdateStatus>;
  installUpdate: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void) => () => void;
  onBeforeClose: (listener: () => void | Promise<void>) => () => void;
};
declare global { interface Window { scoutDesktop?: DesktopBridge } }
export const desktopBridge = () => typeof window === "undefined" ? undefined : window.scoutDesktop;

export function localSaveLabel(saveStatus: string, status: DesktopUpdateStatus | null): string {
  if (saveStatus !== "Saved") return saveStatus === "Saving" ? "Saving locally…" : saveStatus;
  return status?.connection === "offline" || status?.state === "offline" ? "Offline · saved locally" : "Saved locally";
}
