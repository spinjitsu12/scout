"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { DisplayPreferences, DisplayController } = require("../display-mode.cjs");
const monitor = { bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, workArea: { x: 1920, y: 0, width: 1920, height: 1040 } };
class NativeWindow extends EventEmitter {
  constructor(bounds = { x: 2020, y: 100, width: 1200, height: 800 }) { super(); this.bounds = bounds; this.fullscreen = false; this.maximized = false; }
  getBounds() { return { ...this.bounds }; } getNormalBounds() { return this.getBounds(); }
  isFullScreen() { return this.fullscreen; } setFullScreen(value) { this.fullscreen = value; this.emit(value ? "enter-full-screen" : "leave-full-screen"); }
  setBounds(bounds) { this.bounds = { ...bounds }; } isMaximized() { return this.maximized; } unmaximize() { this.maximized = false; }
  setResizable(value) { this.resizable = value; } setMovable(value) { this.movable = value; } setMaximizable(value) { this.maximizable = value; }
}
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "scout-display-test-")); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const preferences = new DisplayPreferences(directory), window = options.window || new NativeWindow(), emitted = [];
  const display = new DisplayController({ window, screen: { getDisplayMatching: () => monitor }, preferences, initial: await preferences.load(), onChange: mode => emitted.push(mode), platform: "win32", ...options });
  return { directory, preferences, window, display, emitted };
}
test("fresh settings default to a monitor-sized borderless window outside exclusive fullscreen", async t => {
  const { display, window } = await fixture(t); await display.apply(display.getMode(), false);
  assert.equal(display.getMode(), "borderless"); assert.equal(window.isFullScreen(), false); assert.deepEqual(window.getBounds(), monitor.bounds);
  assert.equal(window.resizable, false); assert.equal(window.movable, false);
});
test("all display choices work and F11 restores the previous mode and window bounds", async t => {
  const { display, window, preferences, emitted } = await fixture(t);
  await display.setMode("windowed"); window.setBounds({ x: 2400, y: 180, width: 1100, height: 760 });
  assert.equal(await display.toggleFullscreen(), true); assert.equal(window.isFullScreen(), true); assert.equal(await display.toggleFullscreen(), false);
  assert.equal(display.getMode(), "windowed"); assert.deepEqual(window.getBounds(), { x: 2400, y: 180, width: 1100, height: 760 }); assert.equal(window.resizable, true);
  await display.setMode("borderless"); await display.toggleFullscreen(); await display.toggleFullscreen();
  assert.equal(display.getMode(), "borderless"); assert.deepEqual(window.getBounds(), monitor.bounds);
  assert.deepEqual(emitted, ["windowed", "fullscreen", "windowed", "borderless", "fullscreen", "borderless"]); assert.equal((await preferences.load()).mode, "borderless");
});
test("rapid display switches serialize native state and saved preferences", async t => {
  const { display, window, preferences } = await fixture(t);
  await Promise.all([display.setMode("windowed"), display.toggleFullscreen(), display.toggleFullscreen(), display.setMode("borderless")]);
  assert.equal(display.getMode(), "borderless"); assert.equal(window.isFullScreen(), false); assert.equal((await preferences.load()).mode, "borderless");
  assert.equal(window.listenerCount("enter-full-screen"), 0); assert.equal(window.listenerCount("leave-full-screen"), 0);
});
test("windowed preferences persist across restart and clamp unreachable bounds to the monitor", async t => {
  const { directory, preferences, window, display } = await fixture(t); await display.setMode("windowed");
  window.setBounds({ x: -5000, y: -4000, width: 2200, height: 1400 }); await display.checkpoint();
  const reopened = new DisplayPreferences(directory), initial = await reopened.load(); assert.equal(initial.mode, "windowed");
  const nextWindow = new NativeWindow(), next = new DisplayController({ window: nextWindow, screen: { getDisplayMatching: () => monitor }, preferences: reopened, initial });
  await next.apply(initial.mode, false); assert.deepEqual(nextWindow.getBounds(), monitor.workArea); assert.equal((await preferences.load()).windowedBounds.x, -5000);
});
test("bad preferences safely fall back and invalid renderer choices cannot change the window", async t => {
  const { preferences, display, window } = await fixture(t); await fs.writeFile(preferences.filename, "{broken"); assert.equal((await preferences.load()).mode, "borderless");
  await fs.writeFile(preferences.filename, JSON.stringify({ mode: "kiosk", windowedBounds: { x: NaN, y: 0, width: 5, height: 5 } }));
  assert.deepEqual(await preferences.load(), { mode: "borderless", previousMode: "borderless" });
  const before = window.getBounds(); for (const mode of ["kiosk", true, null, "../fullscreen"]) assert.throws(() => display.setMode(mode), /Choose Borderless/); assert.deepEqual(window.getBounds(), before);
});
test("later mode changes recover after a display preference write failure", async t => {
  const { preferences, display, window } = await fixture(t); await fs.mkdir(preferences.filename); await assert.rejects(display.setMode("windowed"));
  assert.equal(display.getMode(), "windowed"); assert.equal(window.isFullScreen(), false);
  await fs.rm(preferences.filename, { recursive: true }); await display.setMode("fullscreen"); assert.equal((await preferences.load()).mode, "fullscreen"); assert.equal(window.isFullScreen(), true);
});

const nextTurn = () => new Promise(resolve => setImmediate(resolve));
class MacWindow extends NativeWindow {
  constructor() { super(); this.simpleFullscreen = false; this.normalBounds = this.getBounds(); this.simpleCalls = []; this.nativeCalls = []; this.boundsChanges = 0; this.pendingNative = null; }
  getNormalBounds() { return this.fullscreen || this.simpleFullscreen ? { ...this.normalBounds } : this.getBounds(); }
  setBounds(bounds) { assert.equal(this.pendingNative, null, "bounds cannot change during a native fullscreen transition"); super.setBounds(bounds); this.boundsChanges++; }
  isSimpleFullScreen() { return this.simpleFullscreen; }
  setWindowButtonVisibility(value) { this.buttonsVisible = value; }
  setSimpleFullScreen(value) {
    assert.equal(this.fullscreen, false, "simple fullscreen cannot overlap native fullscreen");
    this.simpleCalls.push(value); this.simpleFullscreen = value;
    if (value) { this.normalBounds = this.getBounds(); this.bounds = { ...monitor.bounds }; }
    else this.bounds = { ...this.normalBounds };
  }
  setFullScreen(value) {
    assert.equal(this.simpleFullscreen, false, "simple fullscreen must close before entering a native Space");
    this.nativeCalls.push(value); if (value) this.normalBounds = this.getBounds();
    // Mimic Cocoa reporting the new state before the transition event arrives.
    this.fullscreen = value; this.pendingNative = value;
  }
  completeNativeTransition() {
    const value = this.pendingNative; assert.notEqual(value, null); this.pendingNative = null;
    if (value) this.bounds = { ...monitor.bounds }; else this.bounds = { ...this.normalBounds };
    this.emit(value ? "enter-full-screen" : "leave-full-screen");
  }
  nativeToggle(value) { this.setFullScreen(value); this.completeNativeTransition(); }
}

test("Mac borderless uses simple fullscreen across the whole monitor and restores a movable window", async t => {
  const window = new MacWindow(), { display, preferences } = await fixture(t, { window, platform: "darwin" });
  await display.apply("borderless", false);
  assert.equal(window.isSimpleFullScreen(), true); assert.equal(window.isFullScreen(), false);
  assert.deepEqual(window.getBounds(), monitor.bounds); assert.equal(window.buttonsVisible, true); assert.equal(window.resizable, false);
  assert.deepEqual(window.nativeCalls, []);
  await display.setMode("windowed");
  assert.equal(window.isSimpleFullScreen(), false); assert.equal(window.resizable, true); assert.equal(window.movable, true);
  assert.deepEqual(window.getBounds(), { x: 2240, y: 120, width: 1280, height: 800 }); assert.equal((await preferences.load()).mode, "windowed");
});

test("Mac falls back to usable borderless bounds when simple fullscreen APIs are unavailable", async t => {
  const { display, window } = await fixture(t, { platform: "darwin" }); await display.apply("borderless", false);
  assert.deepEqual(window.getBounds(), monitor.workArea); assert.equal(window.isFullScreen(), false);
});

test("Mac explicit fullscreen waits for both native events before resolving or restoring bounds", async t => {
  const window = new MacWindow(), { display, emitted } = await fixture(t, { window, platform: "darwin" });
  await display.apply("borderless", false);
  let entered = false;
  const enter = display.toggleFullscreen().then(value => { entered = true; return value; }); await nextTurn();
  assert.equal(entered, false); assert.equal(window.isFullScreen(), true); assert.equal(window.isSimpleFullScreen(), false);
  assert.equal(display.getMode(), "borderless"); window.completeNativeTransition(); assert.equal(await enter, true);
  let left = false; const boundsBeforeLeave = window.boundsChanges;
  const leave = display.toggleFullscreen().then(value => { left = true; return value; }); await nextTurn();
  assert.equal(left, false); assert.equal(window.boundsChanges, boundsBeforeLeave); assert.equal(window.isSimpleFullScreen(), false);
  window.completeNativeTransition(); assert.equal(await leave, false);
  assert.equal(window.isSimpleFullScreen(), true); assert.deepEqual(window.getBounds(), monitor.bounds);
  assert.deepEqual(emitted, ["borderless", "fullscreen", "borderless"]);
  assert.deepEqual(window.simpleCalls, [true, false, true]); assert.deepEqual(window.nativeCalls, [true, false]);
});

test("Mac green-button transitions reconcile settings, shortcuts, saved bounds, and restart preferences", async t => {
  const window = new MacWindow(), { display, preferences, emitted } = await fixture(t, { window, platform: "darwin" });
  await display.setMode("windowed"); const bounds = { x: 2400, y: 180, width: 1100, height: 760 }; window.setBounds(bounds);
  window.nativeToggle(true); await display.flush();
  assert.equal(display.getMode(), "fullscreen"); assert.equal((await preferences.load()).mode, "fullscreen");
  assert.equal((await preferences.load()).previousMode, "windowed"); assert.deepEqual((await preferences.load()).windowedBounds, bounds);
  const leave = display.toggleFullscreen(); await nextTurn(); window.completeNativeTransition(); assert.equal(await leave, false);
  assert.equal(display.getMode(), "windowed"); assert.deepEqual(window.getBounds(), bounds);
  const enter = display.toggleFullscreen(); await nextTurn(); window.completeNativeTransition(); assert.equal(await enter, true);
  window.nativeToggle(false); await display.flush();
  assert.equal(display.getMode(), "windowed"); assert.deepEqual(window.getBounds(), bounds); assert.equal((await preferences.load()).mode, "windowed");
  assert.deepEqual(emitted, ["windowed", "fullscreen", "windowed", "fullscreen", "windowed"]);
  window.emit("closed"); assert.equal(window.listenerCount("enter-full-screen"), 0); assert.equal(window.listenerCount("leave-full-screen"), 0);
});

test("a missing Mac transition event rejects without claiming success or resizing the window", async t => {
  const window = new MacWindow(), { display, preferences } = await fixture(t, { window, platform: "darwin", transitionTimeoutMs: 20 });
  await display.setMode("windowed"); const boundsChanges = window.boundsChanges;
  await assert.rejects(display.setMode("fullscreen"), /transition did not complete/);
  assert.equal(display.getMode(), "windowed"); assert.equal((await preferences.load()).mode, "windowed"); assert.equal(window.boundsChanges, boundsChanges);
  // A late Cocoa event still reconciles the actual native state after timeout.
  window.completeNativeTransition(); await display.flush(); assert.equal(display.getMode(), "fullscreen");
  assert.equal((await preferences.load()).mode, "fullscreen"); assert.equal(window.listenerCount("enter-full-screen"), 1);
});
