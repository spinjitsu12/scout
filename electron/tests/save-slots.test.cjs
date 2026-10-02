"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { SaveStore, SaveSlots } = require("../save-store.cjs");
const { newGame } = require("../game-engine.cjs");

function career(week = 1, name = "Scout") {
  const record = newGame(42); record.week = week; record.style.name = name;
  return JSON.stringify(record);
}
async function directory(t) {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), "scout-slots-test-"));
  t.after(() => fs.rm(value, { recursive: true, force: true })); return value;
}

test("three independent careers and preceding backups survive reopening", async t => {
  const location = await directory(t), slots = new SaveSlots(location);
  assert.deepEqual((await slots.list()).map(s => [s.slot, s.occupied]), [[1, false], [2, false], [3, false]]);
  await Promise.all([slots.save(career(2, "Arden"), 1), slots.save(career(8, "Robin"), 2), slots.save(career(14, "Sage"), 3)]);
  await Promise.all([slots.save(career(3, "Arden"), 1), slots.save(career(9, "Robin"), 2), slots.save(career(15, "Sage"), 3)]);
  const reopened = new SaveSlots(location);
  for (const [slot, week, name] of [[1, 3, "Arden"], [2, 9, "Robin"], [3, 15, "Sage"]]) {
    assert.equal(await reopened.load(slot), career(week, name)); assert.equal(await reopened.loadBackup(slot), career(week - 1, name));
  }
  const summaries = await reopened.list();
  assert.deepEqual(summaries.map(s => [s.slot, s.name, s.tier, s.week, s.backupAvailable]), [[1, "Arden", 0, 3, true], [2, "Robin", 0, 9, true], [3, "Sage", 0, 15, true]]);
  assert.ok(summaries.every(s => Number.isFinite(s.lastSavedAt) && !s.error));
});

test("a late autosave retains its original slot after another career opens", async t => {
  const slots = new SaveSlots(await directory(t)); await slots.save(career(2, "Arden"), 1);
  let release;
  const late = new Promise(resolve => { release = resolve; }).then(() => slots.save(career(3, "Arden"), 1));
  await slots.save(career(20, "Robin"), 2); release(); await late;
  assert.equal(await slots.load(1), career(3, "Arden")); assert.equal(await slots.load(2), career(20, "Robin"));
  assert.equal(await slots.loadBackup(1), career(2, "Arden")); assert.equal(await slots.loadBackup(2), null);
});

test("legacy career and preceding backup migrate to slot 1 with originals intact", async t => {
  const location = await directory(t), legacy = new SaveStore(location);
  await legacy.save(career(6, "Morgan")); await legacy.save(career(7, "Morgan"));
  const slots = new SaveSlots(location);
  assert.equal(await slots.load(), career(7, "Morgan")); assert.equal(await slots.loadBackup(), career(6, "Morgan")); assert.equal(await slots.load(2), null);
  await slots.save(career(8, "Morgan"), 1);
  assert.equal(await fs.readFile(legacy.current, "utf8"), career(7, "Morgan")); assert.equal(await fs.readFile(legacy.backup, "utf8"), career(6, "Morgan"));
  assert.equal(await new SaveSlots(location).load(1), career(8, "Morgan"));
});

test("older legacy data never replaces an existing damaged slot", async t => {
  const location = await directory(t); await new SaveStore(location).save(career(12, "Old scout"));
  const first = new SaveStore(path.join(location, "slot-1"));
  await first.save(career(25, "New scout")); await first.save(career(26, "New scout")); await fs.writeFile(first.current, "{damaged-new-career");
  const slots = new SaveSlots(location); await assert.rejects(slots.load(1), /unreadable JSON/);
  const summary = (await slots.list())[0]; assert.equal(summary.occupied, true); assert.equal(summary.backupAvailable, true); assert.match(summary.error, /unreadable JSON/);
  assert.equal(await slots.loadBackup(1), career(25, "New scout")); assert.equal(await fs.readFile(first.current, "utf8"), "{damaged-new-career");
});

test("corrupt and missing primary saves remain occupied and retain usable recovery", async t => {
  const slots = new SaveSlots(await directory(t));
  await slots.save(career(1, "Arden"), 1); await slots.save(career(2, "Arden"), 1);
  await slots.save(career(5, "Robin"), 2); await slots.save(career(6, "Robin"), 2);
  await fs.writeFile(slots.stores.get(1).current, "{broken"); await fs.unlink(slots.stores.get(2).current);
  for (const summary of (await slots.list()).slice(0, 2)) {
    assert.equal(summary.occupied, true); assert.equal(summary.backupAvailable, true); assert.equal(summary.name, null); assert.ok(summary.error);
  }
  await slots.save(await slots.loadBackup(1), 1);
  assert.equal(await slots.load(1), career(1, "Arden")); assert.equal(await slots.loadBackup(1), career(1, "Arden")); assert.equal(await slots.loadBackup(2), career(5, "Robin"));
});

test("a corrupt legacy career remains occupied and its valid backup can be restored", async t => {
  const location = await directory(t), legacy = new SaveStore(location);
  await legacy.save(career(9)); await legacy.save(career(10)); await fs.writeFile(legacy.current, "{legacy-corrupt");
  const slots = new SaveSlots(location), summary = (await slots.list())[0];
  assert.equal(summary.occupied, true); assert.equal(summary.backupAvailable, true); assert.match(summary.error, /unreadable JSON/);
  await slots.save(await slots.loadBackup(1), 1); assert.equal(await slots.load(1), career(9)); assert.equal(await fs.readFile(legacy.current, "utf8"), "{legacy-corrupt");
});

test("an unreadable legacy file does not prevent independent slot play and recovery", async t => {
  const location = await directory(t), legacy = new SaveStore(location);
  await fs.mkdir(legacy.current); await fs.writeFile(legacy.backup, career(8));
  const slots = new SaveSlots(location), summaries = await slots.list();
  assert.equal(summaries[0].occupied, true); assert.ok(summaries[0].error); assert.equal(summaries[0].backupAvailable, true); assert.equal(summaries[1].occupied, false);
  await slots.save(career(1, "Robin"), 2); assert.equal(await slots.load(2), career(1, "Robin"));
  await assert.rejects(slots.load(1), /previous SCOUT save is unreadable/);
  await slots.save(await slots.loadBackup(1), 1); assert.equal(await slots.load(1), career(8)); assert.ok((await fs.stat(legacy.current)).isDirectory());
});

test("invalid slot identities and career records cannot change an existing career", async t => {
  const slots = new SaveSlots(await directory(t)); await slots.save(career(5), 1);
  for (const slot of [0, 4, -1, "2", "../career", null, {}, 1.5]) {
    await assert.rejects(slots.load(slot), /save file 1, 2 or 3/); await assert.rejects(slots.loadBackup(slot), /save file 1, 2 or 3/);
    await assert.rejects(slots.save(career(20), slot), /save file 1, 2 or 3/);
  }
  await assert.rejects(slots.save("{}", 1), /supported SCOUT career/); assert.equal(await slots.load(1), career(5)); assert.equal(await slots.load(2), null);
});

test("strict update flush reports failed saves even after a different slot saves", async t => {
  const slots = new SaveSlots(await directory(t)); await slots.ready;
  await fs.mkdir(slots.stores.get(2).current, { recursive: true }); await assert.rejects(slots.save(career(5), 2));
  await slots.save(career(7), 1); await slots.flush(); await assert.rejects(slots.flushStrict(), /latest career could not be saved/);
  await fs.rm(slots.stores.get(2).current, { recursive: true }); await slots.save(career(6), 2); await slots.flushStrict();
  assert.equal(await slots.load(1), career(7)); assert.equal(await slots.load(2), career(6));
});

test("process interruption cannot publish only half of a migrated career and backup", async t => {
  const location = await directory(t), legacy = new SaveStore(location);
  await legacy.save(career(30)); await legacy.save(career(31));
  const script = `
    const fs = require('node:fs/promises'); const rename = fs.rename;
    fs.rename = async (from, to) => { if (to.endsWith('slot-1')) { process.send({ copying: true }); await new Promise(() => {}); } return rename(from, to); };
    const { SaveSlots } = require(process.argv[1]); new SaveSlots(process.argv[2]).ready.catch(() => process.exit(1)); setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ["-e", script, path.resolve(__dirname, "../save-store.cjs"), location], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const exited = once(child, "exit"); t.after(() => { if (!child.killed) child.kill(); });
  await once(child, "message"); child.kill("SIGKILL"); await exited;
  await assert.rejects(fs.stat(path.join(location, "slot-1")), { code: "ENOENT" });
  const reopened = new SaveSlots(location); assert.equal(await reopened.load(1), career(31)); assert.equal(await reopened.loadBackup(1), career(30));
  assert.equal(await fs.readFile(legacy.current, "utf8"), career(31));
});
