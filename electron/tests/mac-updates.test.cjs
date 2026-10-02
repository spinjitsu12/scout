"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { MacUpdateManager } = require("../mac-updates.cjs");

const repository = "spinjitsu12/scout";
function release(version = "3.1.0") {
  const name = `SCOUT-${version}-macOS-Apple-Silicon.zip`;
  return { tag_name: `v${version}`, draft: false, prerelease: false, body: "New scouting locations.", assets: [
    { name, state: "uploaded", size: 200000000, browser_download_url: `https://github.com/${repository}/releases/download/v${version}/${name}` },
  ] };
}
async function fixture(t, options = {}) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), "scout-mac-update-"));
  t.after(() => fs.rm(userData, { recursive: true, force: true }));
  const opened = [], requested = [], statuses = [];
  await fs.mkdir(path.join(userData, "save"));
  await fs.writeFile(path.join(userData, "save", "career.json"), "keep-this-career");
  const manager = new MacUpdateManager({ version: "3.0.0", userData, packaged: true, repository,
    checkTimeoutMs: 1000, openExternal: async url => opened.push(url), onStatus: status => statuses.push(status),
    transport: { fetchJSON: async url => { requested.push(url); return release(); } }, ...options });
  await manager.initialize();
  return { manager, userData, opened, requested, statuses };
}

test("a Mac startup check announces an ARM64 app without downloading or touching careers", async t => {
  const { manager, userData, opened, requested } = await fixture(t);
  const status = await manager.startupCheck();
  assert.equal(status.state, "available"); assert.equal(status.updateMode, "mac-app");
  assert.equal(status.manualUpdate, true); assert.equal(status.supported, false); assert.equal(status.offlinePlayable, true);
  assert.deepEqual(opened, []); assert.equal(requested.length, 1);
  await manager.startupCheck(); assert.equal(requested.length, 1);
  assert.equal(await fs.readFile(path.join(userData, "save", "career.json"), "utf8"), "keep-this-career");
  assert.deepEqual(await fs.readdir(manager.directory), []);
});

test("only an explicit download action opens the validated publisher's Mac app", async t => {
  const { manager, opened } = await fixture(t);
  await assert.rejects(manager.download(), /Check for a Mac update/);
  await manager.check(); await manager.download();
  assert.deepEqual(opened, [release().assets[0].browser_download_url]);
  await assert.rejects(manager.install(), /Windows portable/);
  await assert.rejects(manager.prepareLocal("anything.json"), /Windows portable/);
});

test("offline and timed-out checks leave the complete local game available", async t => {
  for (const transport of [
    { fetchJSON: async () => { throw Object.assign(new Error("Offline"), { code: "ENOTFOUND" }); } },
    { fetchJSON: () => new Promise(() => {}) },
  ]) {
    const { manager, opened } = await fixture(t, { transport, checkTimeoutMs: 20 });
    const status = await manager.check();
    assert.equal(status.state, "offline"); assert.equal(status.offlinePlayable, true); assert.equal(status.connection, "offline");
    assert.equal(manager.operation, null); assert.deepEqual(opened, []);
  }
});

test("canceling a stalled startup check never opens a browser or replaces the app", async t => {
  const { manager, opened } = await fixture(t, { transport: { fetchJSON: () => new Promise(() => {}) } });
  const pending = manager.check(); manager.cancel();
  assert.equal((await pending).state, "idle"); assert.deepEqual(opened, []); assert.equal(manager.operation, null);
});

test("older Windows-only releases count as a successful current-version check", async t => {
  const old = { ...release("2.1.0"), assets: [] };
  const { manager } = await fixture(t, { transport: { fetchJSON: async () => old } });
  const status = await manager.check(); assert.equal(status.state, "idle"); assert.equal(status.connection, "online");
  assert.ok(status.lastCheckedAt); assert.equal(status.availableVersion, undefined);
});

test("Intel builds, drafts, duplicate assets, malformed versions and foreign URLs are rejected", async t => {
  const invalid = [
    { ...release(), prerelease: true }, { ...release(), draft: true }, { ...release(), tag_name: "v3.1.0-beta" },
    { ...release(), assets: [ { ...release().assets[0], name: "SCOUT-3.1.0-macOS-Intel.zip" } ] },
    { ...release(), assets: [...release().assets, ...release().assets] },
    { ...release(), assets: [ { ...release().assets[0], browser_download_url: "https://example.com/SCOUT-3.1.0-macOS-Apple-Silicon.zip" } ] },
    { ...release(), assets: [ { ...release().assets[0], browser_download_url: release().assets[0].browser_download_url.replace("spinjitsu12/scout", "other/scout") } ] },
    { ...release(), assets: [ { ...release().assets[0], browser_download_url: release().assets[0].browser_download_url.replace('/v3.1.0/', '/v9.9.9/') } ] },
  ];
  for (const item of invalid) {
    const { manager, opened } = await fixture(t, { transport: { fetchJSON: async () => item } });
    assert.equal((await manager.check()).state, "error"); assert.deepEqual(opened, []);
    await assert.rejects(manager.download(), /Check for a Mac update/);
  }
});

test("development runs do not contact a release service", async t => {
  const { manager, requested } = await fixture(t, { packaged: false });
  const status = await manager.startupCheck(); assert.equal(status.state, "unsupported"); assert.equal(status.automaticCheck, false);
  assert.deepEqual(requested, []);
});
