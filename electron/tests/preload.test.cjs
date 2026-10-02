"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
function preload(platform = "win32") {
  const ipc = new EventEmitter(), invoked = [], sent = [];
  ipc.invoke = (...args) => { invoked.push(args); return Promise.resolve(); }; ipc.send = (...args) => sent.push(args); let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../preload.cjs"), "utf8"), { process: { platform }, require: name => {
    assert.equal(name, "electron"); return { ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (_name, exposed) => { bridge = exposed; } } };
  } });
  return { ipc, bridge, invoked, sent };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
test("the native bridge identifies Mac, Windows, and Linux without exposing process access", () => {
  for (const [platform, expected] of [["darwin", "macos-desktop"], ["win32", "windows-desktop"], ["linux", "linux-desktop"]]) {
    const { bridge } = preload(platform);
    assert.equal(bridge.platform, expected); assert.equal(bridge.process, undefined);
  }
});
test("sandboxed capabilities send explicit slot identities and named display actions", async () => {
  const { bridge, invoked } = preload();
  await bridge.listSaveSlots(); await bridge.loadCareer(3); await bridge.loadBackup(2); await bridge.saveCareer("career-json", 3);
  await bridge.loadCareer(); await bridge.saveCareer("legacy-json"); await bridge.getDisplayMode(); await bridge.setDisplayMode("windowed");
  assert.deepEqual(invoked, [["scout:list-save-slots"], ["scout:load-career", 3], ["scout:load-backup", 2], ["scout:save-career", "career-json", 3],
    ["scout:load-career", 1], ["scout:save-career", "legacy-json", 1], ["scout:get-display-mode"], ["scout:set-display-mode", "windowed"]]);
  assert.ok(Object.isFrozen(bridge)); assert.equal(bridge.invoke, undefined);
});
test("the single close acknowledgement waits for every final save even if a listener fails", async () => {
  const { bridge, ipc, sent } = preload(); let complete;
  const finalSave = new Promise(resolve => { complete = resolve; }); let finalSaved = false;
  bridge.onBeforeClose(() => { throw new Error("Failed world listener"); }); bridge.onBeforeClose(async () => { await finalSave; finalSaved = true; }); bridge.onBeforeClose(() => {});
  assert.equal(ipc.listenerCount("scout:before-close"), 1); ipc.emit("scout:before-close", {}, "checkpoint-42"); await nextTurn();
  assert.equal(finalSaved, false); assert.deepEqual(sent, []); complete(); await nextTurn();
  assert.equal(finalSaved, true); assert.deepEqual(sent, [["scout:close-ready", "checkpoint-42"]]);
});
test("released subscriptions cannot stall exit or keep receiving display changes", async () => {
  const { bridge, ipc, sent } = preload(); let called = false;
  const unsubscribe = bridge.onBeforeClose(() => { called = true; return new Promise(() => {}); }); unsubscribe();
  ipc.emit("scout:before-close", {}, "checkpoint-9"); await nextTurn(); assert.equal(called, false); assert.deepEqual(sent, [["scout:close-ready", "checkpoint-9"]]);
  let mode; const stopMode = bridge.onDisplayMode(next => { mode = next; }); ipc.emit("scout:display-mode", {}, "fullscreen"); assert.equal(mode, "fullscreen");
  stopMode(); ipc.emit("scout:display-mode", {}, "windowed"); assert.equal(mode, "fullscreen");
});
