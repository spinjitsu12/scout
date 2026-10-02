"use strict";

// Updating is a main-process capability. Neither the renderer nor a release
// manifest may choose executable destinations, shell commands, or credentials.
const fs = require("node:fs/promises");
const nativeFS = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { createHash, randomUUID } = require("node:crypto");
const { Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { spawn } = require("node:child_process");
const { writeAtomic } = require("./save-store.cjs");

const APP_ID = "com.scout.talentsimulator";
const MAX_UPDATE_BYTES = 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024;
const CHECK_TIMEOUT_MS = 8_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const CDN_HOSTS = new Set(["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"]);

function operationError(message, code) {
  const error = new Error(message);
  error.code = code;
  if (code === "ABORT_ERR") error.name = "AbortError";
  return error;
}

function connectionError(error) {
  return ["UPDATE_TIMEOUT", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "ECONNRESET", "ECONNREFUSED", "ERR_NETWORK", "ERR_INTERNET_DISCONNECTED"].includes(error.code);
}

function versionParts(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/.test(value)) {
    throw new Error("SCOUT updates require a stable major.minor.patch version.");
  }
  return value.split(".").map(Number);
}

function compareVersions(first, second) {
  const a = versionParts(first), b = versionParts(second);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return Math.sign(a[index] - b[index]);
  return 0;
}

function validateRepository(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) || value.endsWith(".git")) {
    throw new Error("Use a public GitHub release channel in owner/repository format.");
  }
  return value;
}

function validateManifest(value, currentVersion, minimumBytes = 1024 * 1024) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schema !== 1 ||
      value.product !== "SCOUT" || value.appId !== APP_ID || value.target !== "windows-portable-x64" ||
      typeof value.file !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,149}\.exe$/i.test(value.file) ||
      !Number.isSafeInteger(value.size) || value.size < minimumBytes || value.size > MAX_UPDATE_BYTES ||
      typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.sha256) ||
      (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 4000))) {
    throw new Error("This release does not contain a supported SCOUT portable update manifest.");
  }
  versionParts(value.version);
  if (compareVersions(value.version, currentVersion) <= 0) throw new Error("Choose a SCOUT version newer than the one already running.");
  return Object.freeze({ schema: 1, product: "SCOUT", appId: APP_ID, target: value.target,
    version: value.version, file: value.file, size: value.size, sha256: value.sha256.toLowerCase(), notes: value.notes || "" });
}

function safeWindowsPath(value) {
  if (typeof value !== "string" || value.length > 240 || !/^[A-Za-z]:\\/.test(value) || /[\x00-\x1f<>"|?*]/.test(value) || value.slice(2).includes(":")) {
    throw new Error("The portable game must be in a writable local Windows folder.");
  }
  const normalized = path.win32.normalize(value);
  if (normalized.split("\\").slice(1).some((part) => !part || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error("The portable game path is not supported for in-place updates.");
  }
  return normalized;
}

function releaseAssetURL(value, repository, filename) {
  let url;
  try { url = new URL(value); } catch { throw new Error("The release asset has an invalid address."); }
  const prefix = `/${repository}/releases/download/`;
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password ||
      !url.pathname.toLowerCase().startsWith(prefix.toLowerCase()) ||
      decodeURIComponent(url.pathname.split("/").at(-1)) !== filename || url.hash || url.search) {
    throw new Error("The update asset is outside the configured GitHub release channel.");
  }
  return url.href;
}

function allowedURL(value, api = false) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      !(api ? url.hostname === "api.github.com" : CDN_HOSTS.has(url.hostname))) {
    throw new Error("The update server redirected outside GitHub's release service.");
  }
  return url;
}

async function responseFor(url, { signal, api = false, version = "SCOUT", redirects = 0 } = {}) {
  const address = allowedURL(url, api);
  const response = await new Promise((resolve, reject) => {
    const request = https.get(address, { signal, headers: {
      "User-Agent": `SCOUT/${version}`, "Accept": api ? "application/vnd.github+json" : "application/octet-stream",
      ...(api ? { "X-GitHub-Api-Version": "2022-11-28" } : {}),
    } }, resolve);
    request.setTimeout(30_000, () => request.destroy(operationError("The update server timed out. Try again when connected.", "UPDATE_TIMEOUT")));
    request.once("error", reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.resume();
    if (api || redirects >= 5 || !response.headers.location) throw new Error("The update server returned an unexpected redirect.");
    return responseFor(new URL(response.headers.location, address).href, { signal, api, version, redirects: redirects + 1 });
  }
  if (response.statusCode !== 200) {
    response.resume();
    if (response.statusCode === 404) throw new Error("This release channel has no published SCOUT update yet.");
    if (response.statusCode === 403 || response.statusCode === 429) throw new Error("GitHub's update service is busy. Try again later.");
    throw new Error(`The update server could not complete the request (${response.statusCode}).`);
  }
  return response;
}

async function fetchJSON(url, maxBytes, options) {
  const response = await responseFor(url, options);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response) {
      size += chunk.length;
      if (size > maxBytes) throw new Error("The update server returned an oversized response.");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    response.destroy();
    if (error instanceof SyntaxError) throw new Error("The update server returned unreadable release information.");
    throw error;
  }
}

async function downloadFile(url, filename, expectedBytes, options, report) {
  const response = await responseFor(url, options);
  if (response.headers["content-length"] && Number(response.headers["content-length"]) !== expectedBytes) {
    response.destroy(); throw new Error("The update download size does not match its release manifest.");
  }
  let bytes = 0;
  const meter = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > expectedBytes) { callback(new Error("The update download exceeded its declared size.")); return; }
    report(bytes, expectedBytes); callback(null, chunk);
  } });
  try {
    await pipeline(response, meter, nativeFS.createWriteStream(filename, { flags: "wx", mode: 0o600 }), { signal: options.signal });
    if (bytes !== expectedBytes) throw new Error("The update download was interrupted before it finished.");
    const handle = await fs.open(filename, "r+");
    try { await handle.sync(); } finally { await handle.close(); }
  } catch (error) {
    response.destroy(); await fs.unlink(filename).catch(() => {}); throw error;
  }
}

async function sha256File(filename, { signal } = {}) {
  signal?.throwIfAborted();
  const hash = createHash("sha256");
  for await (const chunk of nativeFS.createReadStream(filename, { signal })) hash.update(chunk);
  return hash.digest("hex");
}

async function ordinaryFile(filename, maxBytes = MAX_UPDATE_BYTES) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error("Choose a regular SCOUT release file, not a shortcut or linked file.");
  return stat;
}

async function boundedJSON(filename, maxBytes = MAX_MANIFEST_BYTES * 2) {
  await ordinaryFile(filename, maxBytes);
  return JSON.parse(await fs.readFile(filename, "utf8"));
}

// Read Windows VERSIONINFO without executing the candidate or requiring a
// native tool. Bounds are checked before every PE/resource pointer is followed.
async function executableIdentity(filename, { signal } = {}) {
  signal?.throwIfAborted();
  const stat = await ordinaryFile(filename);
  const handle = await fs.open(filename, "r");
  const read = async (offset, length) => {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > stat.size || length > 8 * 1024 * 1024) throw new Error("The update contains an invalid Windows executable.");
    const result = Buffer.alloc(length);
    const { bytesRead } = await handle.read(result, 0, length, offset);
    if (bytesRead !== length) throw new Error("The update executable is incomplete.");
    return result;
  };
  try {
    const dos = await read(0, 64);
    if (dos.readUInt16LE(0) !== 0x5a4d) throw new Error("The selected file is not a Windows executable.");
    const peOffset = dos.readUInt32LE(60), header = await read(peOffset, 24);
    if (header.readUInt32LE(0) !== 0x4550 || ![0x14c, 0x8664].includes(header.readUInt16LE(4)) ||
        !(header.readUInt16LE(22) & 2) || (header.readUInt16LE(22) & 0x2000)) throw new Error("The update is not a supported Windows application.");
    const sectionCount = header.readUInt16LE(6), optionalSize = header.readUInt16LE(20);
    if (!sectionCount || sectionCount > 96 || optionalSize < 120 || optionalSize > 4096) throw new Error("The update has an invalid executable header.");
    const optional = await read(peOffset + 24, optionalSize), magic = optional.readUInt16LE(0);
    const directoryOffset = magic === 0x10b ? 96 : magic === 0x20b ? 112 : -1;
    if (directoryOffset < 0 || optionalSize < directoryOffset + 24) throw new Error("The update has an invalid executable format.");
    const resourceRVA = optional.readUInt32LE(directoryOffset + 16), resourceSize = optional.readUInt32LE(directoryOffset + 20);
    const sections = await read(peOffset + 24 + optionalSize, sectionCount * 40);
    const fileOffset = (rva, length) => {
      for (let i = 0; i < sectionCount; i++) {
        const start = i * 40, base = sections.readUInt32LE(start + 12), rawSize = sections.readUInt32LE(start + 16);
        if (rva >= base && rva - base + length <= rawSize) return sections.readUInt32LE(start + 20) + rva - base;
      }
      throw new Error("The update contains an invalid executable resource.");
    };
    if (!resourceRVA || resourceSize < 16) throw new Error("The update is missing its SCOUT product identity.");
    const resource = await read(fileOffset(resourceRVA, resourceSize), resourceSize);
    const entries = (offset) => {
      if (offset + 16 > resource.length) throw new Error("The update has an invalid resource directory.");
      const count = resource.readUInt16LE(offset + 12) + resource.readUInt16LE(offset + 14);
      if (count > 1024 || offset + 16 + count * 8 > resource.length) throw new Error("The update has an invalid resource table.");
      return Array.from({ length: count }, (_, i) => ({ id: resource.readUInt32LE(offset + 16 + i * 8), next: resource.readUInt32LE(offset + 20 + i * 8) }));
    };
    const versionEntry = entries(0).find((entry) => entry.id === 16);
    if (!versionEntry || !(versionEntry.next & 0x80000000)) throw new Error("The update is missing its SCOUT version information.");
    const nameEntry = entries(versionEntry.next & 0x7fffffff)[0];
    if (!nameEntry || !(nameEntry.next & 0x80000000)) throw new Error("The update has an invalid version directory.");
    const language = entries(nameEntry.next & 0x7fffffff)[0];
    if (!language || (language.next & 0x80000000) || language.next + 16 > resource.length) throw new Error("The update has an invalid version language.");
    const version = await read(fileOffset(resource.readUInt32LE(language.next), resource.readUInt32LE(language.next + 4)), resource.readUInt32LE(language.next + 4));
    const strings = {};
    const align = (n) => (n + 3) & ~3;
    const walk = (offset, end, depth) => {
      if (depth > 6 || offset + 6 > end) throw new Error("The update version resource is malformed.");
      const length = version.readUInt16LE(offset), valueLength = version.readUInt16LE(offset + 2), type = version.readUInt16LE(offset + 4);
      if (length < 6 || offset + length > end) throw new Error("The update version block is malformed.");
      let keyEnd = offset + 6;
      while (keyEnd + 2 <= offset + length && version.readUInt16LE(keyEnd) !== 0) keyEnd += 2;
      if (keyEnd + 2 > offset + length) throw new Error("The update version name is malformed.");
      const key = version.toString("utf16le", offset + 6, keyEnd), valueStart = align(keyEnd + 2), bytes = valueLength * (type === 1 ? 2 : 1);
      if (valueStart + bytes > offset + length) throw new Error("The update version value is malformed.");
      if (["ProductName", "ProductVersion", "FileVersion"].includes(key) && type === 1) strings[key] = version.toString("utf16le", valueStart, valueStart + bytes).replace(/\0+$/, "");
      let child = align(valueStart + bytes);
      while (child + 6 <= offset + length) { const size = walk(child, offset + length, depth + 1); child = align(child + size); }
      return length;
    };
    walk(0, version.length, 0);
    if (strings.ProductName !== "SCOUT") throw new Error("This executable is not a SCOUT game release.");
    versionParts(strings.ProductVersion);
    return { product: strings.ProductName, version: strings.ProductVersion };
  } finally { await handle.close(); }
}

async function verifyExecutable(filename, manifest, { signal } = {}) {
  signal?.throwIfAborted();
  const stat = await ordinaryFile(filename);
  if (stat.size !== manifest.size || await sha256File(filename, { signal }) !== manifest.sha256) throw new Error("The update failed its size or SHA-256 integrity check. Download it again.");
  const identity = await executableIdentity(filename, { signal });
  if (identity.version !== manifest.version) throw new Error("The executable version does not match the SCOUT release manifest.");
  return identity;
}

class UpdateManager {
  constructor(options) {
    this.version = options.version;
    versionParts(this.version);
    this.directory = path.join(options.userData, "updates");
    this.platform = options.platform || process.platform;
    this.packaged = !!options.packaged;
    this.portablePath = options.portablePath || null;
    this.executablePath = options.executablePath || process.execPath;
    this.pid = options.pid || process.pid;
    this.parentPid = options.parentPid || process.ppid;
    this.repository = validateRepository(options.repository || null);
    this.configurable = this.repository === null;
    this.minimumBytes = options.minimumBytes || 1024 * 1024;
    this.onStatus = options.onStatus || (() => {});
    this.transport = options.transport || { fetchJSON, downloadFile };
    this.spawn = options.spawn || spawn;
    this.checkTimeoutMs = options.checkTimeoutMs || CHECK_TIMEOUT_MS;
    this.downloadTimeoutMs = options.downloadTimeoutMs || DOWNLOAD_TIMEOUT_MS;
    this.available = null;
    this.prepared = null;
    this.controller = null;
    this.operation = null;
    this.configurationPending = false;
    this.startupChecked = false;
    this.lastReport = 0;
    this.state = { state: "idle", connection: "unknown", lastCheckedAt: null };
    this.supported = this.platform === "win32" && this.packaged && !!this.portablePath;
    if (this.supported) {
      try { this.portablePath = safeWindowsPath(this.portablePath); }
      catch { this.supported = false; }
      if (this.portablePath.toLowerCase() === this.executablePath.toLowerCase()) this.supported = false;
    }
    this.updateMode = this.supported ? "portable" : this.platform === "win32" && this.packaged ? "installer" : "development";
  }

  async initialize() {
    try { await fs.mkdir(this.directory, { recursive: true, mode: 0o700 }); }
    catch {
      return this.report({ state: "error", message: "The update cache is unavailable. You can keep playing your current game offline." });
    }
    try {
      const config = await boundedJSON(path.join(this.directory, "settings.json"));
      // An older locally configured channel cannot replace a publisher's
      // embedded release channel when a production build is installed.
      if (this.configurable) this.repository = validateRepository(config.repository);
    } catch { /* Publisher config is the default when no local override exists. */ }
    try {
      const result = await boundedJSON(path.join(this.directory, "result.json"));
      if (result && ["installed", "rolled-back", "error"].includes(result.status) && typeof result.message === "string") {
        this.state.lastResult = { status: result.status, message: result.message.slice(0, 1000), version: typeof result.to === "string" ? result.to : undefined };
      }
    } catch { /* First launch. */ }
    if (!this.supported) return this.report({ state: "unsupported" });
    const retained = new Set();
    try {
      const record = await boundedJSON(path.join(this.directory, "prepared.json"));
      if (!record || record.schema !== 1 || typeof record.directory !== "string" || !/^stage-[a-f0-9-]{36}$/.test(record.directory)) throw new Error("Invalid staged update.");
      const manifest = validateManifest(record.manifest, this.version, this.minimumBytes);
      const directory = path.join(this.directory, record.directory);
      const info = await fs.lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Invalid staged update directory.");
      const executable = path.join(directory, "SCOUT-update.exe");
      await verifyExecutable(executable, manifest);
      this.prepared = { directory, executable, manifest };
      retained.add(record.directory);
      this.report({ state: "ready", availableVersion: manifest.version, notes: manifest.notes,
        totalBytes: manifest.size, downloadedBytes: manifest.size, progress: 1,
        message: "A verified update is saved on this device. Restart when you are ready, even while offline." });
    } catch {
      await fs.unlink(path.join(this.directory, "prepared.json")).catch(() => {});
    }
    // A stopped download never becomes a playable build. Only our own stage
    // directories are removed; native saves and the installed game are absent.
    try {
      for (const entry of await fs.readdir(this.directory, { withFileTypes: true })) {
        if (/^stage-[a-f0-9-]{36}$/.test(entry.name) && !retained.has(entry.name)) {
          await fs.rm(path.join(this.directory, entry.name), { recursive: true, force: true });
        }
      }
    } catch { /* Cache cleanup cannot prevent starting the game. */ }
    if (!this.prepared) this.report({ state: this.supported ? this.repository ? "idle" : "unconfigured" : "unsupported" });
    return this.getStatus();
  }

  getStatus() {
    return { supported: this.supported, currentVersion: this.version, repository: this.repository,
      configurable: this.configurable, updateMode: this.updateMode, offlinePlayable: true,
      automaticCheck: true,
      ...(this.supported ? {} : { unsupportedReason: this.updateMode === "installer"
        ? "This installer build cannot replace itself in the game. The Windows portable build supports in-app updates."
        : "In-app updates run in the packaged Windows portable game." }),
      ...this.state };
  }

  report(update) {
    this.state = { ...this.state, ...update };
    try { this.onStatus(this.getStatus()); } catch { /* UI closure does not cancel validation. */ }
    return this.getStatus();
  }

  assertSupported() {
    if (!this.supported) throw new Error("In-app updates are available in the Windows portable game.");
  }

  assertIdle() {
    if (this.operation || this.configurationPending || ["checking", "downloading", "validating", "installing"].includes(this.state.state)) throw new Error("An update operation is already in progress.");
  }

  beginOperation(state, timeoutMs) {
    this.assertIdle();
    const controller = new AbortController();
    const operation = { controller, timer: null };
    operation.aborted = new Promise((_resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason || operationError("Update canceled.", "ABORT_ERR")), { once: true });
    });
    // The rejection is observed even if a local preparation fails before the
    // first transport call can be raced with it.
    operation.aborted.catch(() => {});
    operation.timer = setTimeout(() => controller.abort(operationError("The update service did not respond in time. Your current game is available offline.", "UPDATE_TIMEOUT")), timeoutMs);
    this.controller = controller;
    this.operation = operation;
    this.report({ state });
    return operation;
  }

  endOperation(operation) {
    clearTimeout(operation.timer);
    if (this.operation === operation) { this.operation = null; this.controller = null; }
  }

  async waitFor(operation, promise) {
    if (operation.controller.signal.aborted) {
      // Some callers have already started an abort-aware filesystem promise.
      // Observe its rejection even though the operation is already canceled.
      Promise.resolve(promise).catch(() => {});
      throw operation.controller.signal.reason;
    }
    return Promise.race([promise, operation.aborted]);
  }

  operationReport(operation, update) {
    if (this.operation === operation && !operation.controller.signal.aborted) this.report(update);
  }

  // The caller starts this after the game window is shown and never waits for
  // its network work. Recovery of a downloaded update takes precedence.
  startupCheck() {
    if (this.startupChecked) return Promise.resolve(this.getStatus());
    this.startupChecked = true;
    if (this.prepared || this.operation) return Promise.resolve(this.getStatus());
    return this.check();
  }

  async setRepository(value) {
    this.assertIdle();
    if (!this.configurable) throw new Error("This build's publisher release channel cannot be changed in the game.");
    const repository = validateRepository(value);
    this.configurationPending = true;
    try {
      await writeAtomic(path.join(this.directory, "settings.json"), JSON.stringify({ repository }));
      await this.discard();
      this.repository = repository;
      return this.report({ state: repository ? "idle" : "unconfigured", message: repository ? "Release channel configured." : "No release channel configured. The full game is available offline." });
    } finally { this.configurationPending = false; }
  }

  async discard() {
    await fs.unlink(path.join(this.directory, "prepared.json")).catch(() => {});
    if (this.prepared) await fs.rm(this.prepared.directory, { recursive: true, force: true });
    this.prepared = null;
    this.available = null;
    const { lastResult, connection, lastCheckedAt } = this.state;
    this.state = { state: "idle", lastResult, connection, lastCheckedAt };
  }

  async retainPrepared(stage, manifest) {
    await writeAtomic(path.join(this.directory, "prepared.json"), JSON.stringify({
      schema: 1, directory: path.basename(stage.directory), manifest,
    }));
    this.prepared = { ...stage, manifest };
  }

  async check() {
    this.assertIdle();
    if (!this.supported) return this.report({ state: "unsupported", message: this.getStatus().unsupportedReason });
    if (!this.repository) return this.report({ state: "unconfigured", message: "The publisher has not configured a release channel. The full game and saves are available offline." });
    if (this.prepared) return this.getStatus();
    const operation = this.beginOperation("checking", this.checkTimeoutMs);
    this.available = null;
    this.report({ availableVersion: undefined, notes: undefined, totalBytes: 0, downloadedBytes: 0,
      progress: 0, message: "Checking for updates in the background. You can keep playing." });
    try {
      const repository = this.repository, options = { signal: operation.controller.signal, version: this.version };
      const release = await this.waitFor(operation, this.transport.fetchJSON(`https://api.github.com/repos/${repository}/releases/latest`, 2 * 1024 * 1024, { ...options, api: true }));
      this.operationReport(operation, { connection: "online" });
      if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) throw new Error("The channel did not return a stable public release.");
      const manifests = release.assets.filter((item) => item && item.name === "SCOUT-update.json" && item.state === "uploaded");
      if (manifests.length !== 1) throw new Error("This release is missing its SCOUT update manifest.");
      const manifestURL = releaseAssetURL(manifests[0].browser_download_url, repository, "SCOUT-update.json");
      const rawManifest = await this.waitFor(operation, this.transport.fetchJSON(manifestURL, MAX_MANIFEST_BYTES, options));
      // The current release is a successful check, not a failed update.
      if (rawManifest && typeof rawManifest.version === "string" && compareVersions(rawManifest.version, this.version) <= 0) {
        validateManifest(rawManifest, "0.0.0", this.minimumBytes);
        if (String(release.tag_name).replace(/^v/, "") !== rawManifest.version) throw new Error("The release tag and update manifest version disagree.");
        return this.report({ state: "idle", lastCheckedAt: Date.now(), message: "SCOUT is up to date. You can keep playing offline." });
      }
      const manifest = validateManifest(rawManifest, this.version, this.minimumBytes);
      if (String(release.tag_name).replace(/^v/, "") !== manifest.version) throw new Error("The release tag and update manifest version disagree.");
      const artifacts = release.assets.filter((item) => item && item.name === manifest.file && item.state === "uploaded");
      if (artifacts.length !== 1 || artifacts[0].size !== manifest.size) throw new Error("The release executable does not match its update manifest.");
      this.available = { manifest, url: releaseAssetURL(artifacts[0].browser_download_url, repository, manifest.file) };
      return this.report({ state: "available", lastCheckedAt: Date.now(), availableVersion: manifest.version, notes: manifest.notes, totalBytes: manifest.size, downloadedBytes: 0, progress: 0, message: "A new SCOUT update is available. Download it whenever you are ready." });
    } catch (error) { return this.fail(error); }
    finally { this.endOperation(operation); }
  }

  async newStage() {
    const directory = path.join(this.directory, `stage-${randomUUID()}`);
    await fs.mkdir(directory, { mode: 0o700 });
    return { directory, executable: path.join(directory, "SCOUT-update.exe") };
  }

  async download() {
    this.assertSupported(); this.assertIdle();
    if (this.prepared) return this.getStatus();
    if (!this.available) throw new Error("Check for a SCOUT update before downloading.");
    const available = this.available, operation = this.beginOperation("downloading", this.downloadTimeoutMs);
    let stage;
    this.report({ state: "downloading", message: "Downloading the update. Your career is unchanged.", downloadedBytes: 0, progress: 0 });
    try {
      stage = await this.newStage();
      await this.waitFor(operation, this.transport.downloadFile(available.url, stage.executable, available.manifest.size, { signal: operation.controller.signal, version: this.version }, (bytes, total) => {
        const now = Date.now();
        if (now - this.lastReport > 100 || bytes === total) {
          this.lastReport = now; this.operationReport(operation, { downloadedBytes: bytes, totalBytes: total, progress: bytes / total });
        }
      }));
      this.operationReport(operation, { connection: "online" });
      this.report({ state: "validating", message: "Verifying SCOUT's executable and release checksum…" });
      await this.waitFor(operation, verifyExecutable(stage.executable, available.manifest, { signal: operation.controller.signal }));
      if (operation.controller.signal.aborted) throw operation.controller.signal.reason;
      await this.retainPrepared(stage, available.manifest);
      if (operation.controller.signal.aborted) {
        this.prepared = null;
        await fs.unlink(path.join(this.directory, "prepared.json")).catch(() => {});
        throw operation.controller.signal.reason;
      }
      return this.report({ state: "ready", message: "Update verified. Save and restart when you are ready.", progress: 1, downloadedBytes: available.manifest.size });
    } catch (error) {
      if (stage) await fs.rm(stage.directory, { recursive: true, force: true }).catch(() => {});
      return this.fail(error, "available");
    } finally { this.endOperation(operation); }
  }

  async prepareLocal(manifestPath) {
    this.assertSupported(); this.assertIdle();
    const operation = this.beginOperation("validating", this.downloadTimeoutMs);
    this.report({ state: "validating", message: "Verifying the selected SCOUT release…" });
    let stage;
    try {
      await this.discard();
      if (operation.controller.signal.aborted) throw operation.controller.signal.reason;
      this.report({ state: "validating" });
      await ordinaryFile(manifestPath, MAX_MANIFEST_BYTES);
      const manifest = validateManifest(JSON.parse(await fs.readFile(manifestPath, "utf8")), this.version, this.minimumBytes);
      const source = path.join(path.dirname(manifestPath), manifest.file);
      await ordinaryFile(source);
      stage = await this.newStage();
      await this.waitFor(operation, fs.copyFile(source, stage.executable, nativeFS.constants.COPYFILE_EXCL));
      await this.waitFor(operation, verifyExecutable(stage.executable, manifest, { signal: operation.controller.signal }));
      if (operation.controller.signal.aborted) throw operation.controller.signal.reason;
      await this.retainPrepared(stage, manifest);
      if (operation.controller.signal.aborted) {
        this.prepared = null;
        await fs.unlink(path.join(this.directory, "prepared.json")).catch(() => {});
        throw operation.controller.signal.reason;
      }
      return this.report({ state: "ready", availableVersion: manifest.version, notes: manifest.notes, totalBytes: manifest.size, downloadedBytes: manifest.size, progress: 1, message: "Update verified. Save and restart when you are ready." });
    } catch (error) {
      if (stage) await fs.rm(stage.directory, { recursive: true, force: true }).catch(() => {});
      return this.fail(error);
    } finally { this.endOperation(operation); }
  }

  cancel() {
    if (this.controller && ["checking", "downloading", "validating"].includes(this.state.state)) {
      this.controller.abort(operationError("Update canceled.", "ABORT_ERR"));
      this.report({ state: this.available ? "available" : this.repository ? "idle" : "unconfigured",
        message: "Update canceled. Your current game and career are unchanged.", progress: 0 });
    }
    return this.getStatus();
  }

  fail(error, canceledState = "idle") {
    if (error.name === "AbortError" || error.code === "ABORT_ERR") return this.report({ state: canceledState, message: "Update canceled. Your current game and career are unchanged.", progress: 0 });
    if (connectionError(error)) return this.report({ state: "offline", connection: "offline",
      message: "Updates are unavailable right now. The full game and your saved career are ready to play offline.", progress: 0 });
    return this.report({ state: "error", message: error.message || "The update could not be completed. Try again." });
  }

  async install() {
    this.assertSupported(); this.assertIdle();
    if (!this.prepared || this.state.state !== "ready") throw new Error("Download and verify a SCOUT update before restarting.");
    this.report({ state: "installing", message: "Preparing a safe restart…" });
    const prepared = this.prepared, token = randomUUID();
    let replacement;
    try {
      await verifyExecutable(prepared.executable, prepared.manifest);
      await ordinaryFile(this.portablePath);
      const original = await executableIdentity(this.portablePath);
      if (original.version !== this.version) throw new Error("The portable executable on disk changed. Reopen SCOUT before updating.");
      const folder = path.dirname(this.portablePath);
      const folderInfo = await fs.lstat(folder);
      if (!folderInfo.isDirectory() || folderInfo.isSymbolicLink()) throw new Error("Move the portable game to a normal writable folder before updating.");
      replacement = path.join(folder, `.SCOUT-update-${token}.tmp`);
      await fs.copyFile(prepared.executable, replacement, nativeFS.constants.COPYFILE_EXCL);
      await verifyExecutable(replacement, prepared.manifest);
      const replacementHandle = await fs.open(replacement, "r+");
      try { await replacementHandle.sync(); } finally { await replacementHandle.close(); }
      const originalHash = await sha256File(this.portablePath);
      const parameters = {
        token, from: this.version, to: prepared.manifest.version, size: prepared.manifest.size, sha256: prepared.manifest.sha256,
        originalHash, target: this.portablePath, replacement,
        backup: path.join(folder, `.SCOUT-previous-${token}.bak`),
        failed: path.join(folder, `.SCOUT-failed-${token}.bak`),
        result: path.join(this.directory, "result.json"), pending: path.join(this.directory, "pending.json"),
        acknowledgement: path.join(this.directory, `ack-${token}.json`), ready: path.join(prepared.directory, "worker-ready.json"),
        pids: [...new Set([this.pid, this.parentPid].filter((pid) => Number.isInteger(pid) && pid > 0))],
      };
      await writeAtomic(parameters.pending, JSON.stringify(parameters));
      const worker = await fs.readFile(path.join(__dirname, "update-worker.ps1"), "utf8");
      const encodedParameters = Buffer.from(JSON.stringify(parameters), "utf8").toString("base64");
      const script = worker.replace("__SCOUT_PARAMETERS__", encodedParameters);
      const encodedCommand = Buffer.from(script, "utf16le").toString("base64");
      if (encodedCommand.length > 28_000) throw new Error("The game path is too long for a safe Windows update.");
      const systemRoot = safeWindowsPath(path.win32.join(process.env.SystemRoot || "C:\\Windows", "System32"));
      const powershell = path.win32.join(systemRoot, "WindowsPowerShell", "v1.0", "powershell.exe");
      const child = this.spawn(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand], {
        detached: true, windowsHide: true, stdio: "ignore", shell: false,
      });
      let spawnError = null, exited = false;
      child.once("error", (error) => { spawnError = error; });
      child.once("exit", () => { exited = true; });
      const started = Date.now();
      let ready = false;
      while (Date.now() - started < 10_000) {
        if (spawnError) throw new Error("Windows could not start the update helper. Your game has not been closed.");
        try { ready = JSON.parse(await fs.readFile(parameters.ready, "utf8")).token === token; } catch { /* Wait for the helper handshake. */ }
        if (ready) break;
        if (exited) throw new Error("Windows prevented the update helper from starting. Your game has not been closed.");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!ready) { child.kill(); throw new Error("The update helper did not become ready. Your game has not been closed."); }
      child.unref();
      this.report({ state: "installing", message: "Saving your career and restarting SCOUT…" });
      return { ok: true, status: this.getStatus() };
    } catch (error) {
      if (replacement) await fs.unlink(replacement).catch(() => {});
      await fs.unlink(path.join(this.directory, "pending.json")).catch(() => {});
      this.report({ state: "ready", message: error.message });
      return { ok: false, error: error.message, status: this.getStatus() };
    }
  }

  // Call only after the updated renderer reaches ready-to-show. The detached
  // worker keeps the old executable until it receives this startup handshake.
  async confirmLaunch() {
    if (!this.supported) return;
    try {
      const parameters = await boundedJSON(path.join(this.directory, "pending.json"));
      if (parameters.to === this.version && parameters.target.toLowerCase() === this.portablePath.toLowerCase() &&
          /^[a-f0-9-]{36}$/.test(parameters.token)) {
        await writeAtomic(path.join(this.directory, `ack-${parameters.token}.json`), JSON.stringify({ token: parameters.token, version: this.version }));
      }
    } catch { /* Ordinary launch has no update waiting for acknowledgement. */ }
  }
}

module.exports = { UpdateManager, compareVersions, validateRepository, validateManifest, safeWindowsPath,
  releaseAssetURL, allowedURL, executableIdentity, verifyExecutable, sha256File, fetchJSON, downloadFile, MAX_UPDATE_BYTES };
