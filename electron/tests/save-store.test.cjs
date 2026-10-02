"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { SaveStore, validateCareerJSON, MAX_SAVE_BYTES } = require("../save-store.cjs");
const { newGame, normalizeGame } = require("../game-engine.cjs");

function career(week = 1) {
  return JSON.stringify({ ...newGame(42), week });
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "scout-save-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new SaveStore(directory);
}

test("careers survive a new app process and keep the preceding save", async (t) => {
  const store = await fixture(t);
  assert.equal(await store.load(), null);
  await store.save(career(1));
  await store.save(career(2));
  const reopened = new SaveStore(path.dirname(store.current));
  assert.equal(await reopened.load(), career(2));
  assert.equal(await reopened.loadBackup(), career(1));
});

test("concurrent autosaves are serialized, leaving the newest state and no temporary files", async (t) => {
  const store = await fixture(t);
  await Promise.all(Array.from({ length: 20 }, (_value, i) => store.save(career(i + 1))));
  await store.flush();
  assert.equal(await store.load(), career(20));
  assert.equal(await store.loadBackup(), career(19));
  assert.deepEqual((await fs.readdir(path.dirname(store.current))).sort(), ["career.json", "career.previous.json"]);
});

test("a damaged current career is reported and a valid restore preserves the useful backup", async (t) => {
  const store = await fixture(t);
  await store.save(career(1));
  await store.save(career(2));
  await fs.writeFile(store.current, "{broken");
  await assert.rejects(store.load(), /unreadable JSON/);
  assert.equal(await store.loadBackup(), career(1));
  await store.save(career(3));
  assert.equal(await store.load(), career(3));
  assert.equal(await store.loadBackup(), career(1));
});

test("invalid, oversized and unrelated data cannot replace a saved career", async (t) => {
  const store = await fixture(t);
  await store.save(career(1));
  for (const value of [null, "{}", "[]", "null", "nope", "x".repeat(MAX_SAVE_BYTES + 1), career(0)]) {
    assert.throws(() => store.save(value));
  }
  assert.equal(await store.load(), career(1));
  assert.equal(validateCareerJSON(career(1)), career(1));
});

test("semantically damaged primary data cannot overwrite the last playable backup during recovery", async (t) => {
  const store = await fixture(t);
  await store.save(career(1));
  await store.save(career(2));
  const damaged = JSON.parse(career(2));
  damaged.report = {};
  damaged.candidates = [null];
  await fs.writeFile(store.current, JSON.stringify(damaged));
  await assert.rejects(store.load(), /not a supported SCOUT career/);
  const backup = await store.loadBackup();
  assert.equal(backup, career(1));
  await store.save(backup);
  assert.equal(await store.load(), career(1));
  assert.equal(await store.loadBackup(), career(1));
});

test("an earlier career migrates optional world settings while retaining earned progress", async (t) => {
  const store = await fixture(t);
  const previous = JSON.parse(career(7));
  previous.cash = 76543;
  previous.reputation = 31;
  previous.completed = 2;
  delete previous.field;
  delete previous.style;
  delete previous.story;
  await store.save(JSON.stringify(previous));
  const loaded = normalizeGame(JSON.parse(await store.load()));
  assert.equal(loaded.week, 7);
  assert.equal(loaded.cash, 76543);
  assert.equal(loaded.reputation, 31);
  assert.equal(loaded.completed, 2);
  assert.equal(loaded.field.fuel, 12);
  assert.ok(loaded.style);
  assert.ok(loaded.story);
});

test("update preparation detects a failed latest save and recovers after storage becomes writable", async (t) => {
  const store = await fixture(t);
  await fs.mkdir(store.current);
  await assert.rejects(store.save(career(1)));
  await store.flush();
  await assert.rejects(store.flushStrict(), /latest career could not be saved/);
  await fs.rm(store.current, { recursive: true });
  await store.save(career(2));
  await store.flushStrict();
  assert.equal(await store.load(), career(2));
});

test("a terminated write leaves the preceding playable career and backup intact", async (t) => {
  const store = await fixture(t);
  await store.save(career(6)); await store.save(career(7));
  const script = `
    const fs = require('node:fs/promises');
    const originalRename = fs.rename;
    fs.rename = async (from, to) => {
      if (to.endsWith('career.json')) {
        process.send({ writing: true });
        await new Promise(() => {});
      }
      return originalRename(from, to);
    };
    const { SaveStore } = require(process.argv[1]);
    new SaveStore(process.argv[2]).save(process.argv[3]).catch(() => process.exit(1));
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ["-e", script, path.resolve(__dirname, "../save-store.cjs"),
    path.dirname(store.current), career(8)], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const exited = once(child, "exit");
  t.after(() => { if (!child.killed) child.kill(); });
  await once(child, "message");
  child.kill("SIGKILL"); await exited;
  const reopened = new SaveStore(path.dirname(store.current));
  assert.equal(await reopened.load(), career(7));
  assert.equal(await reopened.loadBackup(), career(7));
  await reopened.save(career(9));
  assert.equal(await reopened.load(), career(9));
});
