"use strict";

const { app, BrowserWindow, Menu, ipcMain, dialog, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");
const { SaveStore, validateCareerJSON, MAX_SAVE_BYTES } = require("./save-store.cjs");
const { UpdateManager } = require("./update-manager.cjs");
const updateConfig = require("./update-config.json");

app.setName("SCOUT");
app.setAppUserModelId("com.scout.talentsimulator");
// A stable directory keeps saves when installing a newer build or moving the
// portable executable. Chromium also retains its local backup in this profile.
app.setPath("userData", path.join(app.getPath("appData"), "SCOUT"));

const entry = path.join(__dirname, "..", "dist", "index.html");
const entryURL = pathToFileURL(entry).href;
let mainWindow = null;
let store = null;
let updates = null;
let exiting = false;
let readyToExit = false;
let closeCheckpoint = null;

async function requestExit() {
  if (exiting) return;
  exiting = true;
  let waitForRenderer = Promise.resolve();
  try {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      const token = randomUUID();
      waitForRenderer = new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        closeCheckpoint = { token, resolve: () => { clearTimeout(timer); resolve(); } };
      });
      mainWindow.webContents.send("scout:before-close", token);
    }
  } catch { /* A crashed renderer must not prevent closing the native window. */ }
  // The sandboxed preload acknowledges only after its close listener has
  // flushed live driving state. A crashed renderer cannot stall exit forever.
  await waitForRenderer;
  closeCheckpoint = null;
  try { if (store) await store.flush(); }
  finally { readyToExit = true; app.quit(); }
}

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
  ipcMain.on("scout:close-ready", (event, token) => {
    try { trustedSender(event); }
    catch { return; }
    if (closeCheckpoint && closeCheckpoint.token === token) closeCheckpoint.resolve();
  });
  handle("scout:load-career", () => store.load());
  handle("scout:load-backup", () => store.loadBackup());
  handle("scout:save-career", async (json) => {
    try { await store.save(json); return { ok: true }; }
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
      await fs.writeFile(result.filePath, json, { encoding: "utf8", mode: 0o600 });
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
  handle("scout:confirm-ready", () => updates.confirmLaunch());
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
  handle("scout:toggle-fullscreen", () => {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  });
  handle("scout:quit", () => { setImmediate(() => app.quit()); });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "SCOUT",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
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
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, destination) => {
    if (destination.split("#")[0] !== entryURL) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11" && !input.isAutoRepeat) {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });
  mainWindow.once("ready-to-show", () => {
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
    Menu.setApplicationMenu(null);
    store = new SaveStore(path.join(app.getPath("userData"), "save"));
    updates = new UpdateManager({
      version: app.getVersion(),
      userData: app.getPath("userData"),
      packaged: app.isPackaged,
      portablePath: process.env.PORTABLE_EXECUTABLE_FILE,
      executablePath: process.execPath,
      repository: updateConfig.repository,
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
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
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
