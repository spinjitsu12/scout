"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const beforeCloseCallbacks = new Map();
// A single acknowledgement covers all listeners. A fast listener must not
// close the window while another listener is still writing its final state.
ipcRenderer.on("scout:before-close", async (_event, token) => {
  await Promise.allSettled([...beforeCloseCallbacks.values()].map(callback => Promise.resolve().then(callback)));
  ipcRenderer.send("scout:close-ready", token);
});

// The game receives named capabilities, never filesystem paths or raw IPC.
contextBridge.exposeInMainWorld("scoutDesktop", Object.freeze({
  platform: process.platform === "darwin" ? "macos-desktop" : process.platform === "win32" ? "windows-desktop" : "linux-desktop",
  listSaveSlots: () => ipcRenderer.invoke("scout:list-save-slots"),
  loadCareer: (slot = 1) => ipcRenderer.invoke("scout:load-career", slot),
  loadBackup: (slot = 1) => ipcRenderer.invoke("scout:load-backup", slot),
  saveCareer: (json, slot = 1) => ipcRenderer.invoke("scout:save-career", json, slot),
  exportCareer: (json) => ipcRenderer.invoke("scout:export-career", json),
  importCareer: () => ipcRenderer.invoke("scout:import-career"),
  getUpdateStatus: () => ipcRenderer.invoke("scout:get-update-status"),
  confirmReady: () => ipcRenderer.invoke("scout:confirm-ready"),
  setUpdateRepository: (repository) => ipcRenderer.invoke("scout:set-update-repository", repository),
  checkForUpdate: () => ipcRenderer.invoke("scout:check-update"),
  downloadUpdate: () => ipcRenderer.invoke("scout:download-update"),
  cancelUpdate: () => ipcRenderer.invoke("scout:cancel-update"),
  prepareLocalUpdate: () => ipcRenderer.invoke("scout:prepare-local-update"),
  installUpdate: () => ipcRenderer.invoke("scout:install-update"),
  onUpdateStatus: (callback) => {
    if (typeof callback !== "function") throw new TypeError("An update status callback is required.");
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("scout:update-status", listener);
    return () => ipcRenderer.removeListener("scout:update-status", listener);
  },
  onBeforeClose: (callback) => {
    if (typeof callback !== "function") throw new TypeError("A close callback is required.");
    const subscription = Symbol("close-listener");
    beforeCloseCallbacks.set(subscription, callback);
    return () => beforeCloseCallbacks.delete(subscription);
  },
  getDisplayMode: () => ipcRenderer.invoke("scout:get-display-mode"),
  setDisplayMode: (mode) => ipcRenderer.invoke("scout:set-display-mode", mode),
  onDisplayMode: (callback) => {
    if (typeof callback !== "function") throw new TypeError("A display mode callback is required.");
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on("scout:display-mode", listener);
    return () => ipcRenderer.removeListener("scout:display-mode", listener);
  },
  toggleFullscreen: () => ipcRenderer.invoke("scout:toggle-fullscreen"),
  quit: () => ipcRenderer.invoke("scout:quit"),
}));
