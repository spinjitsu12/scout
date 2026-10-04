"use strict";

const { app, BrowserWindow, Menu, ipcMain, dialog, session, screen, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");
const { SaveSlots, validateCareerJSON, writeAtomic, MAX_SAVE_BYTES } = require("./save-store.cjs");
const { DisplayPreferences, DisplayController, windowedBoundsFor } = require("./display-mode.cjs");
const { creditWindowHandler } = require("./credit-links.cjs");
const { UpdateManager } = require("./update-manager.cjs");
const { MacUpdateManager } = require("./mac-updates.cjs");
const { titleBarOptions, applicationMenu } = require("./desktop-options.cjs");
const { createExitCheckpoint } = require("./exit-checkpoint.cjs");
const { createGamePermissionHandlers } = require("./game-permissions.cjs");
const updateConfig = require("./update-config.json");

app.setName("SCOUT");
if (process.platform === "win32") app.setAppUserModelId("com.scout.talentsimulator");
// A stable directory keeps saves when installing a newer build or moving the
// portable executable. Chromium also retains its local backup in this profile.
app.setPath("userData", path.join(app.getPath("appData"), "SCOUT"));

const entry = path.join(__dirname, "..", "dist", "index.html");
const entryURL = pathToFileURL(entry).href;
let mainWindow = null;
let store = null;
let updates = null;
let readyToExit = false;
let closeCheckpoint = null;
let rendererReady = false;
let rendererGone = false;
let displayPreferences = null;
let display = null;
let initialDisplay = { mode: "borderless" };

async function checkpointRenderer() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  if (rendererGone) throw new Error("The game stopped responding before its latest progress could be saved.");
  if (!rendererReady) return;
  const token = randomUUID();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The game did not finish saving in time. Try again or export a career backup.")), 15000);
      closeCheckpoint = { token, resolve: result => {
        clearTimeout(timer);
        if (result?.ok === false) reject(new Error(result.error || "Your latest progress could not be saved."));
        else resolve();
      } };
      try { mainWindow.webContents.send("scout:before-close", token); }
      catch (error) { clearTimeout(timer); reject(error); }
    });
  } finally { closeCheckpoint = null; }
}

const exitCheckpoint = createExitCheckpoint({
  checkpoint: checkpointRenderer,
  flush: async () => {
    if (store) await store.flushStrict();
    if (display) await display.checkpoint().catch(() => {});
  },
  finish: () => { readyToExit = true; setImmediate(() => app.quit()); },
  failed: async error => {
    // A write failure keeps the career open. Quitting without its latest
    // checkpoint is an explicit player choice, including a crashed renderer.
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send("scout:close-canceled");
    const options = {
      type: "error", title: "Your journey needs a moment", message: "Your latest progress has not been saved.",
      detail: `${error.message}\n\nKeep playing to try saving again or export a career backup.`,
      buttons: ["Keep playing", "Quit without saving"], defaultId: 0, cancelId: 0, noLink: true,
    };
    const result = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  },
});
const requestExit = () => exitCheckpoint.request();

function trustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      event.senderFrame.url.split("#")[0] !== entryURL) {
    throw new Error("This request did not come from the SCOUT game.");
  }
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    trustedSender(event);
    return action(...args);
  });
}

function registerBridge() {
  ipcMain.on("scout:close-ready", (event, token, result) => {
    try { trustedSender(event); }
    catch { return; }
    if (closeCheckpoint && closeCheckpoint.token === token) closeCheckpoint.resolve(result);
  });
  handle("scout:list-save-slots", () => store.list());
  handle("scout:load-career", (slot) => store.load(slot));
  handle("scout:load-backup", (slot) => store.loadBackup(slot));
  handle("scout:save-career", async (json, slot) => {
    try { await store.save(json, slot); return { ok: true }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  handle("scout:export-career", async (json) => {
    try {
      validateCareerJSON(json);
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Export SCOUT career",
        defaultPath: "SCOUT-career.json",
        filters: [{ name: "SCOUT career backup", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      await writeAtomic(result.filePath, json);
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  handle("scout:import-career", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import SCOUT career",
      properties: ["openFile"],
      filters: [{ name: "SCOUT career backup", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filename = result.filePaths[0];
    const info = await fs.stat(filename);
    if (!info.isFile() || info.size > MAX_SAVE_BYTES) throw new Error("Choose a SCOUT career JSON file smaller than 1 MB.");
    return validateCareerJSON(await fs.readFile(filename, "utf8"));
  });
  handle("scout:get-update-status", () => updates.getStatus());
  handle("scout:confirm-ready", () => { rendererReady = true; return updates.confirmLaunch(); });
  handle("scout:set-update-repository", (repository) => updates.setRepository(repository));
  handle("scout:check-update", () => updates.check());
  handle("scout:download-update", () => updates.download());
  handle("scout:cancel-update", () => updates.cancel());
  handle("scout:prepare-local-update", async () => {
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: "Choose a SCOUT update manifest",
      properties: ["openFile"],
      filters: [{ name: "SCOUT update manifest", extensions: ["json"] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return updates.prepareLocal(selected.filePaths[0]);
  });
  handle("scout:install-update", async () => {
    try {
      await store.flushStrict();
      const result = await updates.install();
      if (result.ok) setImmediate(() => { void requestExit(); });
      return result;
    } catch (error) { return { ok: false, error: error.message }; }
  });
  handle("scout:get-display-mode", () => display.getMode());
  handle("scout:set-display-mode", (mode) => display.setMode(mode));
  handle("scout:toggle-fullscreen", () => display.toggleFullscreen());
  handle("scout:quit", () => requestExit());
}

function createWindow() {
  rendererReady = false;
  rendererGone = false;
  const monitor = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = initialDisplay.mode === "windowed" ? windowedBoundsFor(monitor, initialDisplay.windowedBounds) : { ...monitor.bounds };
  mainWindow = new BrowserWindow({
    title: "SCOUT",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    ...bounds,
    minWidth: 640,
    minHeight: 480,
    ...titleBarOptions(),
    backgroundColor: "#111b28",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  display = new DisplayController({
    window: mainWindow, screen, preferences: displayPreferences, initial: initialDisplay,
    onChange: mode => {
      initialDisplay.mode = mode;
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send("scout:display-mode", mode);
    },
  });
  const displayReady = display.apply(initialDisplay.mode, false).catch(() => {});
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(creditWindowHandler(url => shell.openExternal(url)));
  mainWindow.webContents.on("will-navigate", (event, destination) => {
    if (destination.split("#")[0] !== entryURL) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.on("render-process-gone", () => { rendererGone = true; });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11" && !input.isAutoRepeat) {
      event.preventDefault();
      void display.toggleFullscreen().catch(() => {});
    }
  });
  mainWindow.once("ready-to-show", async () => {
    await displayReady;
    mainWindow.show();
    // No remote request is part of window creation or career loading. An
    // offline or stalled release service only changes the optional update HUD.
    void updates.startupCheck().catch(() => {});
  });
  mainWindow.on("close", (event) => {
    if (!readyToExit) { event.preventDefault(); void requestExit(); }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.loadFile(entry).catch(async (error) => {
    await dialog.showMessageBox({ type: "error", title: "SCOUT could not start", message: "The game files could not be loaded.", detail: error.message });
    app.quit();
  });
  const updateBounds = () => { if (display && mainWindow && !mainWindow.isDestroyed()) void display.refreshBounds().catch(() => {}); };
  screen.on("display-metrics-changed", updateBounds);
  screen.on("display-removed", updateBounds);
  mainWindow.once("closed", () => {
    screen.removeListener("display-metrics-changed", updateBounds);
    screen.removeListener("display-removed", updateBounds);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    const menu = applicationMenu(process.platform, () => { void display?.toggleFullscreen().catch(() => {}); });
    Menu.setApplicationMenu(menu ? Menu.buildFromTemplate(menu) : null);
    store = new SaveSlots(path.join(app.getPath("userData"), "save"));
    displayPreferences = new DisplayPreferences(app.getPath("userData"));
    initialDisplay = await displayPreferences.load();
    const PlatformUpdates = process.platform === "darwin" ? MacUpdateManager : UpdateManager;
    updates = new PlatformUpdates({
      version: app.getVersion(),
      userData: app.getPath("userData"),
      packaged: app.isPackaged,
      portablePath: process.env.PORTABLE_EXECUTABLE_FILE,
      executablePath: process.execPath,
      repository: updateConfig.repository,
      openExternal: url => shell.openExternal(url),
      onStatus: (status) => {
        try {
          if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send("scout:update-status", status);
          }
        } catch { /* Keep update state available if the renderer is restarting. */ }
      },
    });
    try { await updates.initialize(); }
    catch { updates.report({ state: "error", message: "The update cache could not be read. You can keep playing offline." }); }
    registerBridge();
    const gamePermissions = createGamePermissionHandlers({ getWindow: () => mainWindow, entryURL });
    session.defaultSession.setPermissionRequestHandler(gamePermissions.request);
    session.defaultSession.setPermissionCheckHandler(gamePermissions.check);
    // All game content is bundled; the desktop build needs no network service.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_details, callback) => callback({ cancel: true }));
    createWindow();
    app.on("activate", () => { if (!mainWindow) createWindow(); });
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (readyToExit || !store) return;
    event.preventDefault();
    void requestExit();
  });
}
