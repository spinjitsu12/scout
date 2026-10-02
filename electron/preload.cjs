"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// The game receives named capabilities, never filesystem paths or raw IPC.
contextBridge.exposeInMainWorld("scoutDesktop", Object.freeze({
  platform: "windows-desktop",
  loadCareer: () => ipcRenderer.invoke("scout:load-career"),
  loadBackup: () => ipcRenderer.invoke("scout:load-backup"),
  saveCareer: (json) => ipcRenderer.invoke("scout:save-career", json),
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
    const listener = async (_event, token) => {
      try { await callback(); }
      catch { /* The native save queue still retains the preceding checkpoint. */ }
      finally { ipcRenderer.send("scout:close-ready", token); }
    };
    ipcRenderer.on("scout:before-close", listener);
    return () => ipcRenderer.removeListener("scout:before-close", listener);
  },
  toggleFullscreen: () => ipcRenderer.invoke("scout:toggle-fullscreen"),
  quit: () => ipcRenderer.invoke("scout:quit"),
}));
