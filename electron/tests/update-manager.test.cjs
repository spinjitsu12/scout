"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { EventEmitter } = require("node:events");
const { UpdateManager, verifyExecutable, executableIdentity, releaseAssetURL } = require("../update-manager.cjs");
const { SaveStore } = require("../save-store.cjs");
const { newGame } = require("../game-engine.cjs");

const REPOSITORY = "scout-tests/game";
const never = () => new Promise(() => {});

async function fixture(t, overrides = {}) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), "scout-update-test-"));
  t.after(() => fs.rm(userData, { recursive: true, force: true }));
  const statuses = [];
  const options = { version: "2.0.0", userData, platform: "win32", packaged: true,
    portablePath: "C:\\SCOUT\\SCOUT.exe", executablePath: "C:\\Temp\\SCOUT\\SCOUT.exe",
    repository: REPOSITORY, minimumBytes: 1, checkTimeoutMs: 1000, downloadTimeoutMs: 1000,
    onStatus: (status) => statuses.push(status), ...overrides };
  const manager = new UpdateManager(options);
  await manager.initialize();
  return { userData, statuses, options, manager };
}

async function releaseFixture(version = "2.1.0", product = "SCOUT") {
  // Real, parseable Windows PE/VERSIONINFO bytes exercise the validation
  // boundary. These minimal test fixtures are never executed.
  const { NtExecutable, NtExecutableResource, Resource } = await import("resedit");
  const executable = NtExecutable.createEmpty(false, false);
  const resources = NtExecutableResource.from(executable);
  const info = Resource.VersionInfo.create(1033, {}, [{ lang: 1033, codepage: 1200,
    values: { ProductName: product, ProductVersion: version, FileVersion: version } }]);
  info.outputToResourceEntries(resources.entries);
  resources.outputResource(executable);
  const bytes = Buffer.from(executable.generate());
  const file = `SCOUT-${version}-Windows-Portable.exe`;
  const manifest = { schema: 1, product: "SCOUT", appId: "com.scout.talentsimulator",
    target: "windows-portable-x64", version, file, size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") };
  const urlFor = (name) => `https://github.com/${REPOSITORY}/releases/download/v${version}/${name}`;
  const release = { tag_name: `v${version}`, draft: false, prerelease: false,
    assets: [ { name: "SCOUT-update.json", state: "uploaded", browser_download_url: urlFor("SCOUT-update.json") },
      { name: file, state: "uploaded", size: bytes.length, browser_download_url: urlFor(file) } ] };
  const transport = {
    fetchJSON: async (url) => url.startsWith("https://api.github.com/") ? release : manifest,
    downloadFile: async (_url, filename, _size, _options, report) => {
      await fs.writeFile(filename, bytes, { flag: "wx" });
      report(bytes.length, bytes.length);
    },
  };
  return { bytes, manifest, release, transport };
}

async function savedCareer(userData) {
  const store = new SaveStore(path.join(userData, "save"));
  const career = newGame(42);
  career.week = 8; career.cash = 54321; career.reputation = 37;
  career.style = { ...career.style, music: false, sound: false, radio: true, station: 2, camera: "cockpit" };
  career.field = { ...career.field, fuel: 4.5, driving: true, scene: "district", destination: 4 };
  const json = JSON.stringify(career);
  await store.save(json);
  return { store, json };
}

test("an unconfigured startup is fully offline and reopens the native career and preferences", async (t) => {
  let requests = 0;
  const { manager, userData } = await fixture(t, { repository: null,
    transport: { fetchJSON: () => { requests++; return never(); } } });
  const { json } = await savedCareer(userData);
  const status = await manager.startupCheck();
  assert.equal(status.state, "unconfigured");
  assert.equal(status.connection, "unknown");
  assert.equal(status.offlinePlayable, true);
  assert.equal(requests, 0);
  assert.equal(await new SaveStore(path.join(userData, "save")).load(), json);
});

test("local initialization never waits for the update network", async (t) => {
  let requests = 0;
  const { manager } = await fixture(t, { transport: { fetchJSON: () => { requests++; return never(); } } });
  assert.equal(manager.getStatus().state, "idle");
  assert.equal(requests, 0);
});

test("startup checks run once and DNS failure preserves the current offline career", async (t) => {
  let requests = 0;
  const { manager, userData } = await fixture(t, { transport: { fetchJSON: async () => {
    requests++; const error = new Error("getaddrinfo failed"); error.code = "ENOTFOUND"; throw error;
  } } });
  const { json } = await savedCareer(userData);
  const status = await manager.startupCheck();
  await manager.startupCheck();
  assert.equal(requests, 1);
  assert.equal(status.state, "offline");
  assert.equal(status.connection, "offline");
  assert.match(status.message, /ready to play offline/);
  assert.equal(await new SaveStore(path.join(userData, "save")).load(), json);
});

test("a hung update service has an absolute deadline even when transport ignores abort", async (t) => {
  let signal;
  const { manager } = await fixture(t, { checkTimeoutMs: 35, transport: {
    fetchJSON: (_url, _limit, options) => { signal = options.signal; return never(); },
  } });
  const started = Date.now();
  const status = await manager.startupCheck();
  assert.equal(status.state, "offline");
  assert.ok(Date.now() - started < 500);
  assert.ok(signal.aborted);
  assert.equal(manager.operation, null);
});

test("cancel acknowledges immediately and prevents a late check result from changing status", async (t) => {
  let resolveLate, signal;
  const { manager } = await fixture(t, { transport: { fetchJSON: (_url, _limit, options) => {
    signal = options.signal; return new Promise((resolve) => { resolveLate = resolve; });
  } } });
  const pending = manager.check();
  assert.equal(manager.getStatus().state, "checking");
  assert.equal(manager.cancel().state, "idle");
  assert.ok(signal.aborted);
  assert.equal((await pending).state, "idle");
  resolveLate({ draft: false, prerelease: false, assets: [] });
  await Promise.resolve();
  assert.equal(manager.getStatus().state, "idle");
  assert.equal(manager.operation, null);
});

test("concurrent update checks do not race network or staged state", async (t) => {
  const { manager } = await fixture(t, { transport: { fetchJSON: never } });
  const pending = manager.check();
  await assert.rejects(manager.check(), /already in progress/);
  await assert.rejects(manager.setRepository("someone/else"), /already in progress/);
  manager.cancel(); await pending;
});

test("a valid release is available without installing, replacing files, or altering saves", async (t) => {
  const release = await releaseFixture();
  const { manager, userData } = await fixture(t, { transport: release.transport });
  const { json } = await savedCareer(userData);
  const status = await manager.startupCheck();
  assert.equal(status.state, "available");
  assert.equal(status.connection, "online");
  assert.equal(status.availableVersion, "2.1.0");
  assert.equal(typeof status.lastCheckedAt, "number");
  assert.equal(await new SaveStore(path.join(userData, "save")).load(), json);
  assert.deepEqual(await fs.readdir(manager.directory), []);
});

test("the current stable release reports up to date with no download", async (t) => {
  const release = await releaseFixture("2.0.0");
  const { manager } = await fixture(t, { transport: release.transport });
  const status = await manager.check();
  assert.equal(status.state, "idle");
  assert.equal(status.connection, "online");
  assert.match(status.message, /up to date/);
  assert.equal(manager.available, null);
});

test("release metadata mismatch stays an update error, independent of offline play", async (t) => {
  const release = await releaseFixture();
  release.release.tag_name = "v9.9.9";
  const { manager } = await fixture(t, { transport: release.transport });
  const status = await manager.check();
  assert.equal(status.state, "error");
  assert.equal(status.connection, "online");
  assert.equal(status.offlinePlayable, true);
  assert.equal(manager.available, null);
  assert.throws(() => releaseAssetURL("https://github.com/someone/else/releases/download/v2.1.0/game.exe", REPOSITORY, "game.exe"));
});

test("an interrupted download removes only partial update files and leaves saved career intact", async (t) => {
  const release = await releaseFixture();
  release.transport.downloadFile = async (_url, filename) => {
    await fs.writeFile(filename, release.bytes.subarray(0, 30));
    const error = new Error("Connection dropped"); error.code = "ECONNRESET"; throw error;
  };
  const { manager, userData } = await fixture(t, { transport: release.transport });
  const { json } = await savedCareer(userData);
  await manager.check();
  assert.equal((await manager.download()).state, "offline");
  assert.equal(manager.prepared, null);
  assert.deepEqual(await fs.readdir(manager.directory), []);
  assert.equal(await new SaveStore(path.join(userData, "save")).load(), json);
});

test("canceling a download clears its stage and rejects late progress reports", async (t) => {
  const release = await releaseFixture();
  let started, reportLate;
  const written = new Promise((resolve) => { started = resolve; });
  release.transport.downloadFile = async (_url, filename, _size, _options, report) => {
    reportLate = report; await fs.writeFile(filename, release.bytes.subarray(0, 30)); started(); await never();
  };
  const { manager } = await fixture(t, { transport: release.transport });
  await manager.check(); const pending = manager.download(); await written;
  assert.equal(manager.cancel().state, "available");
  assert.equal((await pending).state, "available");
  reportLate(release.bytes.length, release.bytes.length);
  assert.equal(manager.getStatus().progress, 0);
  assert.equal(manager.prepared, null);
  assert.deepEqual(await fs.readdir(manager.directory), []);
});

test("a stuck download cannot stay active indefinitely", async (t) => {
  const release = await releaseFixture();
  release.transport.downloadFile = async (_url, filename) => { await fs.writeFile(filename, release.bytes.subarray(0, 30)); return never(); };
  const { manager } = await fixture(t, { transport: release.transport, downloadTimeoutMs: 35 });
  await manager.check();
  assert.equal((await manager.download()).state, "offline");
  assert.equal(manager.operation, null);
  assert.deepEqual(await fs.readdir(manager.directory), []);
});

test("cancel during executable validation aborts file hashing and removes the staged candidate", async (t) => {
  const release = await releaseFixture();
  const { manager } = await fixture(t, { transport: release.transport });
  await manager.check();
  manager.onStatus = (status) => { if (status.state === "validating") manager.cancel(); };
  assert.equal((await manager.download()).state, "available");
  assert.equal(manager.prepared, null);
  assert.deepEqual(await fs.readdir(manager.directory), []);
});

test("a verified download persists and is ready after an offline application relaunch", async (t) => {
  const release = await releaseFixture();
  const { manager, userData, options } = await fixture(t, { transport: release.transport });
  const { json } = await savedCareer(userData);
  await manager.check();
  assert.equal((await manager.download()).state, "ready");
  assert.deepEqual(await executableIdentity(manager.prepared.executable), { product: "SCOUT", version: "2.1.0" });
  let requests = 0;
  const reopened = new UpdateManager({ ...options, transport: { fetchJSON: () => { requests++; return never(); } } });
  assert.equal((await reopened.initialize()).state, "ready");
  assert.equal((await reopened.startupCheck()).state, "ready");
  assert.equal(requests, 0);
  assert.equal(await new SaveStore(path.join(userData, "save")).load(), json);
  await verifyExecutable(reopened.prepared.executable, release.manifest);
});

test("tampering with a staged file on disk cannot promote it into a new playable version", async (t) => {
  const release = await releaseFixture();
  const { manager, options } = await fixture(t, { transport: release.transport });
  await manager.check(); await manager.download();
  await fs.writeFile(manager.prepared.executable, "broken");
  const reopened = new UpdateManager({ ...options, transport: { fetchJSON: never } });
  assert.equal((await reopened.initialize()).state, "idle");
  assert.equal(reopened.prepared, null);
  assert.deepEqual(await fs.readdir(reopened.directory), []);
});

test("a complete local release can be verified and staged without network access", async (t) => {
  const release = await releaseFixture();
  const { manager, userData } = await fixture(t, { repository: null, transport: { fetchJSON: never } });
  const files = path.join(userData, "local-release"); await fs.mkdir(files);
  await fs.writeFile(path.join(files, release.manifest.file), release.bytes);
  const manifestPath = path.join(files, "SCOUT-update.json");
  await fs.writeFile(manifestPath, JSON.stringify(release.manifest));
  assert.equal((await manager.prepareLocal(manifestPath)).state, "ready");
  assert.equal(manager.getStatus().connection, "unknown");
  assert.equal(manager.getStatus().availableVersion, "2.1.0");
});

test("checksum and product identity failures leave the current game unchanged", async (t) => {
  const release = await releaseFixture("2.1.0", "Another Game");
  const { manager, userData } = await fixture(t, { transport: release.transport });
  const { json } = await savedCareer(userData);
  await manager.check();
  const status = await manager.download();
  assert.equal(status.state, "error"); assert.match(status.message, /not a SCOUT/);
  assert.equal(manager.prepared, null);
  const executable = path.join(userData, "bad-checksum.exe"); await fs.writeFile(executable, release.bytes);
  await assert.rejects(verifyExecutable(executable, { ...release.manifest, sha256: "0".repeat(64) }), /integrity check/);
  assert.equal(await new SaveStore(path.join(userData, "save")).load(), json);
});

test("an installed or development build reports its honest update limit and makes no network request", async (t) => {
  for (const mode of ["installer", "development"]) {
    let requests = 0;
    const { manager } = await fixture(t, { portablePath: null, packaged: mode === "installer",
      transport: { fetchJSON: () => { requests++; return never(); } } });
    const status = await manager.startupCheck();
    assert.equal(status.state, "unsupported"); assert.equal(status.updateMode, mode);
    assert.equal(status.supported, false); assert.equal(status.offlinePlayable, true);
    assert.equal(requests, 0);
  }
});

test("a publisher channel cannot be replaced by stale local settings", async (t) => {
  const { manager, options } = await fixture(t);
  await fs.writeFile(path.join(manager.directory, "settings.json"), JSON.stringify({ repository: "different/channel" }));
  const reopened = new UpdateManager(options); await reopened.initialize();
  assert.equal(reopened.getStatus().repository, REPOSITORY);
  await assert.rejects(reopened.setRepository("different/channel"), /cannot be changed/);
});

test("a user-configured channel survives relaunch and unconfiguration prevents startup network traffic", async (t) => {
  const { manager, options } = await fixture(t, { repository: null });
  await manager.setRepository(REPOSITORY);
  const reopened = new UpdateManager(options); await reopened.initialize();
  assert.equal(reopened.getStatus().repository, REPOSITORY);
  await reopened.setRepository(null);
  assert.equal((await reopened.startupCheck()).state, "unconfigured");
});

test("interrupted staging and damaged cache records never remove unrelated local files", async (t) => {
  const { manager, options, userData } = await fixture(t);
  const obsolete = path.join(manager.directory, "stage-12345678-1234-1234-1234-123456789abc");
  await fs.mkdir(obsolete); await fs.writeFile(path.join(obsolete, "SCOUT-update.exe"), "partial");
  await fs.writeFile(path.join(manager.directory, "prepared.json"), JSON.stringify({ schema: 1, directory: "../../save" }));
  await fs.writeFile(path.join(manager.directory, "keep.txt"), "keep");
  const { json } = await savedCareer(userData);
  const reopened = new UpdateManager(options); await reopened.initialize();
  assert.equal(await fs.readFile(path.join(manager.directory, "keep.txt"), "utf8"), "keep");
  assert.equal(await new SaveStore(path.join(userData, "save")).load(), json);
  assert.deepEqual(await fs.readdir(manager.directory), ["keep.txt"]);
});

test("an unavailable cache is a recoverable update problem and does not reject game initialization", async (t) => {
  const { userData, options } = await fixture(t);
  const blocked = path.join(userData, "blocked"); await fs.writeFile(blocked, "not a directory");
  const manager = new UpdateManager({ ...options, userData: blocked });
  const status = await manager.initialize();
  assert.equal(status.state, "error"); assert.equal(status.offlinePlayable, true);
  assert.match(status.message, /keep playing/);
});

test("rollback acknowledgement is written only for the new version and the same portable game", async (t) => {
  const { manager, options } = await fixture(t);
  const token = "12345678-1234-1234-1234-123456789abc";
  const pending = path.join(manager.directory, "pending.json");
  const acknowledgement = path.join(manager.directory, `ack-${token}.json`);
  await fs.writeFile(pending, JSON.stringify({ token, to: "2.1.0", target: options.portablePath }));
  await manager.confirmLaunch();
  await assert.rejects(fs.stat(acknowledgement), { code: "ENOENT" });
  const newBuild = new UpdateManager({ ...options, version: "2.1.0" });
  await newBuild.confirmLaunch();
  assert.deepEqual(JSON.parse(await fs.readFile(acknowledgement, "utf8")), { token, version: "2.1.0" });
  await fs.unlink(acknowledgement);
  await fs.writeFile(pending, JSON.stringify({ token, to: "2.1.0", target: "C:\\OtherGame\\SCOUT.exe" }));
  await newBuild.confirmLaunch();
  await assert.rejects(fs.stat(acknowledgement), { code: "ENOENT" });
});

test("a blocked update helper leaves the old executable, career, and verified staged release intact", async (t) => {
  const release = await releaseFixture();
  const previous = await releaseFixture("2.0.0");
  const { manager, userData } = await fixture(t, { transport: release.transport, spawn: () => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit("error", new Error("PowerShell blocked")));
    return child;
  } });
  const { json } = await savedCareer(userData);
  const target = path.join(userData, "SCOUT.exe"); await fs.writeFile(target, previous.bytes);
  // A POSIX temp file exercises main-process preparation on this test host.
  // The OS-specific replacement itself remains a Windows worker integration.
  manager.portablePath = target;
  await manager.check(); await manager.download();
  const result = await manager.install();
  assert.equal(result.ok, false); assert.match(result.error, /could not start the update helper/);
  assert.equal(result.status.state, "ready");
  assert.deepEqual(await fs.readFile(target), previous.bytes);
  await verifyExecutable(manager.prepared.executable, release.manifest);
  assert.equal(await new SaveStore(path.join(userData, "save")).load(), json);
  await assert.rejects(fs.stat(path.join(manager.directory, "pending.json")), { code: "ENOENT" });
  assert.equal((await fs.readdir(userData)).some((name) => name.startsWith(".SCOUT-update-")), false);
});

test("installation closes only after its detached helper acknowledges validated transaction data", async (t) => {
  const release = await releaseFixture();
  const previous = await releaseFixture("2.0.0");
  let parameters, unrefed = false;
  const { manager, userData } = await fixture(t, { transport: release.transport, spawn: (command, args, options) => {
    assert.match(command, /WindowsPowerShell.*powershell\.exe$/);
    assert.equal(options.shell, false); assert.equal(options.detached, true);
    const script = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
    const data = script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)[1];
    parameters = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
    const child = new EventEmitter(); child.unref = () => { unrefed = true; };
    child.kill = () => {};
    void fs.writeFile(parameters.ready, JSON.stringify({ token: parameters.token }));
    return child;
  } });
  const target = path.join(userData, "SCOUT.exe"); await fs.writeFile(target, previous.bytes);
  manager.portablePath = target;
  await manager.check(); await manager.download();
  const result = await manager.install();
  assert.equal(result.ok, true); assert.equal(result.status.state, "installing");
  assert.equal(unrefed, true);
  assert.equal(parameters.target, target); assert.equal(parameters.to, "2.1.0");
  assert.equal(parameters.originalHash, previous.manifest.sha256);
  assert.equal(parameters.sha256, release.manifest.sha256);
  assert.deepEqual(await fs.readFile(parameters.replacement), release.bytes);
  assert.deepEqual(await fs.readFile(target), previous.bytes);
  assert.equal(Object.values(parameters).some((value) => typeof value === "string" && value.includes("career.json")), false);
});
