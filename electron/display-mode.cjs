"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { writeAtomic } = require("./save-store.cjs");

const DISPLAY_MODES = Object.freeze(["borderless", "fullscreen", "windowed"]);
function validateDisplayMode(mode) {
  if (!DISPLAY_MODES.includes(mode)) throw new Error("Choose Borderless Fullscreen, Fullscreen or Windowed.");
  return mode;
}
function validBounds(bounds) {
  return bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) &&
    bounds.width >= 640 && bounds.height >= 480 && bounds.width <= 16384 && bounds.height <= 16384;
}

class DisplayPreferences {
  constructor(directory) { this.filename = path.join(directory, "display.json"); this.pending = Promise.resolve(); }
  async load() {
    await this.pending;
    try {
      const info = await fs.stat(this.filename);
      if (!info.isFile() || info.size > 16384) return { mode: "borderless" };
      const saved = JSON.parse(await fs.readFile(this.filename, "utf8"));
      return { mode: DISPLAY_MODES.includes(saved?.mode) ? saved.mode : "borderless",
        previousMode: saved?.previousMode === "windowed" ? "windowed" : "borderless",
        ...(validBounds(saved?.windowedBounds) ? { windowedBounds: saved.windowedBounds } : {}) };
    } catch { return { mode: "borderless" }; }
  }
  save(record) {
    validateDisplayMode(record.mode);
    const json = `${JSON.stringify({ mode: record.mode, previousMode: record.previousMode === "windowed" ? "windowed" : "borderless",
      ...(validBounds(record.windowedBounds) ? { windowedBounds: record.windowedBounds } : {}) })}\n`;
    const operation = this.pending.then(() => writeAtomic(this.filename, json));
    this.pending = operation.catch(() => {});
    return operation;
  }
}

function windowedBoundsFor(display, preferred) {
  const area = display.workArea || display.bounds;
  const width = Math.min(preferred?.width || 1280, area.width);
  const height = Math.min(preferred?.height || 800, area.height);
  const x = preferred ? Math.max(area.x, Math.min(preferred.x, area.x + area.width - width)) : Math.round(area.x + (area.width - width) / 2);
  const y = preferred ? Math.max(area.y, Math.min(preferred.y, area.y + area.height - height)) : Math.round(area.y + (area.height - height) / 2);
  return { x, y, width, height };
}

class DisplayController {
  constructor({ window, screen, preferences, initial, onChange = () => {}, platform = process.platform, transitionTimeoutMs = 8000 }) {
    this.window = window; this.screen = screen; this.preferences = preferences;
    this.platform = platform; this.transitionTimeoutMs = transitionTimeoutMs;
    this.mode = validateDisplayMode(initial?.mode || "borderless");
    this.previousMode = initial?.previousMode === "windowed" ? "windowed" : "borderless";
    this.windowedBounds = validBounds(initial?.windowedBounds) ? initial.windowedBounds : null;
    this.onChange = onChange; this.pending = Promise.resolve();
    this.requestedFullscreen = null; this.changingSimpleFullscreen = false;
    if (this.platform === "darwin") {
      // The green traffic light can change native fullscreen without using IPC.
      // Reuse the serialized mode path so settings and saved bounds stay in sync.
      const reconcile = flag => {
        if (this.requestedFullscreen !== null || this.changingSimpleFullscreen || this.window.isFullScreen() !== flag) return;
        void this.setMode(flag ? "fullscreen" : this.previousMode).catch(() => {});
      };
      const entered = () => reconcile(true), left = () => reconcile(false);
      this.window.on("enter-full-screen", entered); this.window.on("leave-full-screen", left);
      this.window.once("closed", () => {
        this.window.removeListener("enter-full-screen", entered); this.window.removeListener("leave-full-screen", left);
      });
    }
  }
  getMode() { return this.mode; }
  display() { return this.screen.getDisplayMatching(this.window.getBounds()); }
  hasSimpleFullscreen() {
    return this.platform === "darwin" && typeof this.window.isSimpleFullScreen === "function" && typeof this.window.setSimpleFullScreen === "function";
  }
  simpleFullscreen(flag) {
    if (!this.hasSimpleFullscreen()) return false;
    if (this.window.isSimpleFullScreen() === flag) return true;
    this.changingSimpleFullscreen = true;
    try {
      if (flag) this.window.setWindowButtonVisibility?.(true);
      this.window.setSimpleFullScreen(flag);
      if (!flag && this.window.isSimpleFullScreen()) throw new Error("The Mac borderless fullscreen window could not be restored.");
      return this.window.isSimpleFullScreen() === flag;
    } finally { this.changingSimpleFullscreen = false; }
  }
  async fullScreen(flag) {
    if (this.window.isFullScreen() === flag) return;
    const event = flag ? "enter-full-screen" : "leave-full-screen";
    await new Promise((resolve, reject) => {
      let timer, finished = false;
      this.requestedFullscreen = flag;
      const finish = error => {
        if (finished) return; finished = true;
        clearTimeout(timer); this.window.removeListener(event, done); this.window.removeListener("closed", closed);
        this.requestedFullscreen = null;
        if (error) reject(error); else resolve();
      };
      const done = () => finish(), closed = () => finish(new Error("The window closed during its fullscreen transition."));
      this.window.once(event, done);
      this.window.once("closed", closed);
      timer = setTimeout(() => this.platform === "darwin" ? finish(new Error("The Mac fullscreen transition did not complete. Try changing the display mode again.")) : done(), this.platform === "darwin" ? this.transitionTimeoutMs : 1500);
      try {
        this.window.setFullScreen(flag);
        // Mac may report the requested state before its animation completes.
        // Bounds must only change after the native leave-full-screen event.
        if (this.platform !== "darwin" && this.window.isFullScreen() === flag) done();
      } catch (error) { finish(error); }
    });
  }
  async apply(mode, persist = true) {
    validateDisplayMode(mode);
    const display = this.display();
    if (this.mode === "windowed" && mode !== "windowed") {
      const bounds = this.window.getNormalBounds?.() || this.window.getBounds();
      if (validBounds(bounds)) this.windowedBounds = bounds;
    }
    if (mode === "fullscreen") {
      if (this.mode !== "fullscreen") this.previousMode = this.mode;
      this.simpleFullscreen(false);
      this.window.setResizable(true); this.window.setMovable(true); this.window.setMaximizable(true);
      await this.fullScreen(true);
    } else {
      await this.fullScreen(false);
      if (mode === "windowed") this.simpleFullscreen(false);
      if (this.window.isMaximized()) this.window.unmaximize();
      this.window.setResizable(mode === "windowed"); this.window.setMovable(mode === "windowed"); this.window.setMaximizable(mode === "windowed");
      if (mode === "borderless" && this.hasSimpleFullscreen()) {
        // Simple fullscreen fills the monitor without creating a native Space.
        // Ordinary Mac setBounds can clamp y under the menu bar and clip the
        // bottom of a monitor-height window, so stage it in the usable area.
        if (!this.window.isSimpleFullScreen()) {
          this.window.setBounds({ ...(display.workArea || display.bounds) });
          this.simpleFullscreen(true);
        }
      } else {
        this.window.setBounds(mode === "borderless" ? { ...(this.platform === "darwin" ? display.workArea || display.bounds : display.bounds) } : windowedBoundsFor(display, this.windowedBounds));
      }
      if (mode === "windowed") this.windowedBounds = this.window.getBounds();
    }
    this.mode = mode; this.onChange(mode);
    if (persist) await this.preferences.save({ mode: this.mode, previousMode: this.previousMode, windowedBounds: this.windowedBounds });
    return this.mode;
  }
  setMode(mode) {
    validateDisplayMode(mode);
    const operation = this.pending.then(() => this.apply(mode));
    this.pending = operation.catch(() => {}); return operation;
  }
  toggleFullscreen() {
    const operation = this.pending.then(() => this.apply(this.mode === "fullscreen" ? this.previousMode : "fullscreen"));
    this.pending = operation.catch(() => {}); return operation.then(mode => mode === "fullscreen");
  }
  refreshBounds() {
    const operation = this.pending.then(() => {
      if (this.mode === "windowed") this.windowedBounds = this.window.getNormalBounds?.() || this.window.getBounds();
      return this.apply(this.mode, false);
    });
    this.pending = operation.catch(() => {}); return operation;
  }
  checkpoint() {
    const operation = this.pending.then(async () => {
      if (this.mode === "windowed") this.windowedBounds = this.window.getNormalBounds?.() || this.window.getBounds();
      await this.preferences.save({ mode: this.mode, previousMode: this.previousMode, windowedBounds: this.windowedBounds });
    });
    this.pending = operation.catch(() => {}); return operation;
  }
  async flush() { await this.pending; await this.preferences.pending; }
}

module.exports = { DISPLAY_MODES, DisplayPreferences, DisplayController, validateDisplayMode, windowedBoundsFor };
