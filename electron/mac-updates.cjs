"use strict";

const path = require("node:path");
const { UpdateManager, compareVersions, releaseAssetURL, MAX_UPDATE_BYTES } = require("./update-manager.cjs");

// Mac updates are announced in the background. Only an explicit download click
// opens the verified publisher URL. No running .app or career file is replaced.
class MacUpdateManager extends UpdateManager {
  constructor(options) {
    super({ ...options, platform: "darwin" });
    this.directory = path.join(options.userData, "mac-updates");
    this.updateMode = "mac-app";
    this.openExternal = options.openExternal;
  }

  getStatus() {
    return { ...super.getStatus(), manualUpdate: this.packaged, automaticCheck: this.packaged,
      unsupportedReason: "Mac updates download as a new SCOUT app. Quit SCOUT, replace the app in Applications, and reopen it. Your careers stay saved locally." };
  }

  async initialize() {
    await super.initialize();
    return this.report({ state: this.packaged ? this.repository ? "idle" : "unconfigured" : "unsupported" });
  }

  async check() {
    this.assertIdle();
    if (!this.packaged) return this.report({ state: "unsupported", message: "Update checks run in the packaged Mac app." });
    if (!this.repository) return this.report({ state: "unconfigured", message: "No publisher channel is connected. Your complete game is available offline." });
    const operation = this.beginOperation("checking", this.checkTimeoutMs);
    this.available = null;
    this.report({ availableVersion: undefined, notes: undefined, progress: 0, totalBytes: 0,
      message: "Checking for Mac updates in the background. You can keep playing." });
    try {
      const repository = this.repository;
      const release = await this.waitFor(operation, this.transport.fetchJSON(
        `https://api.github.com/repos/${repository}/releases/latest`, 2 * 1024 * 1024,
        { signal: operation.controller.signal, version: this.version, api: true }));
      if (!release || release.draft || release.prerelease || !Array.isArray(release.assets) || typeof release.tag_name !== "string") {
        throw new Error("The channel did not return a stable public SCOUT release.");
      }
      const version = release.tag_name.replace(/^v/, "");
      const newer = compareVersions(version, this.version) > 0;
      this.operationReport(operation, { connection: "online" });
      if (!newer) return this.report({ state: "idle", lastCheckedAt: Date.now(), message: "SCOUT is up to date. You can keep playing offline." });
      const filename = `SCOUT-${version}-macOS-Apple-Silicon.zip`;
      const assets = release.assets.filter(item => item && item.name === filename && item.state === "uploaded");
      if (assets.length !== 1 || !Number.isSafeInteger(assets[0].size) || assets[0].size < 1024 * 1024 || assets[0].size > MAX_UPDATE_BYTES) {
        throw new Error("This release does not include an Apple silicon SCOUT app yet. Your current game remains playable.");
      }
      const url = releaseAssetURL(assets[0].browser_download_url, repository, filename);
      const expectedPath = `/${repository}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(filename)}`;
      if (new URL(url).pathname !== expectedPath) throw new Error("The Mac download address does not match this release tag.");
      this.available = Object.freeze({ version, url });
      return this.report({ state: "available", lastCheckedAt: Date.now(), availableVersion: version,
        notes: typeof release.body === "string" ? release.body.slice(0, 4000) : undefined, totalBytes: assets[0].size,
        message: "A new Mac app is available. Download it when ready, then quit SCOUT and replace the app in Applications. Your careers stay on this Mac." });
    } catch (error) { return this.fail(error); }
    finally { this.endOperation(operation); }
  }

  async download() {
    this.assertIdle();
    if (!this.packaged || !this.available || typeof this.openExternal !== "function") throw new Error("Check for a Mac update before opening its download.");
    await this.openExternal(this.available.url);
    return this.getStatus();
  }
}

module.exports = { MacUpdateManager };
