"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { validGame } = require("./game-engine.cjs");

const MAX_SAVE_BYTES = 1024 * 1024;

function validateCareerJSON(json) {
  if (typeof json !== "string" || Buffer.byteLength(json, "utf8") > MAX_SAVE_BYTES) {
    throw new Error("Career backups must be JSON files smaller than 1 MB.");
  }
  let record;
  try { record = JSON.parse(json); } catch { throw new Error("This career file contains unreadable JSON."); }
  if (!validGame(record)) {
    throw new Error("This is not a supported SCOUT career file.");
  }
  return json;
}

async function writeAtomic(filename, json) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(json, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, filename);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
  }
}

class SaveStore {
  constructor(directory) {
    this.current = path.join(directory, "career.json");
    this.backup = path.join(directory, "career.previous.json");
    this.pending = Promise.resolve();
    this.lastError = null;
  }

  async read(filename) {
    try {
      const info = await fs.stat(filename);
      if (!info.isFile() || info.size > MAX_SAVE_BYTES) throw new Error("The saved career is too large or unreadable.");
      return validateCareerJSON(await fs.readFile(filename, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async load() {
    await this.pending;
    return this.read(this.current);
  }

  async loadBackup() {
    await this.pending;
    return this.read(this.backup);
  }

  save(json) {
    validateCareerJSON(json);
    const operation = this.pending.then(async () => {
      let previous = null;
      // A successful restore may replace a corrupt current save. It must not
      // replace the last usable backup with that corrupt data.
      try { previous = await this.read(this.current); } catch { /* Keep the valid backup. */ }
      if (previous && previous !== json) await writeAtomic(this.backup, previous);
      await writeAtomic(this.current, json);
    });
    this.pending = operation.then(
      () => { this.lastError = null; },
      (error) => { this.lastError = error; },
    );
    return operation;
  }

  async flush() { await this.pending; }
  async flushStrict() {
    await this.pending;
    if (this.lastError) throw new Error(`The latest career could not be saved: ${this.lastError.message}`);
  }
}

const SAVE_SLOTS = Object.freeze([1, 2, 3]);

function validateSlot(slot = 1) {
  if (!SAVE_SLOTS.includes(slot)) throw new Error("Choose save file 1, 2 or 3.");
  return slot;
}

async function fileInfo(filename) {
  try { return await fs.stat(filename); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

// Every operation captures a slot identity. A delayed autosave cannot follow
// the menu's selected slot and overwrite a different career.
class SaveSlots {
  constructor(directory) {
    this.directory = directory;
    this.stores = new Map(SAVE_SLOTS.map(slot => [slot, new SaveStore(path.join(directory, `slot-${slot}`))]));
    this.migrationError = null;
    this.ready = this.migrateLegacy().catch(error => { this.migrationError = error; });
  }

  async migrateLegacy() {
    const first = this.stores.get(1);
    // A damaged primary or backup-only career is still an existing career.
    if (await fileInfo(first.current) || await fileInfo(first.backup)) return;
    const legacy = new SaveStore(this.directory);
    const sources = [legacy.current, legacy.backup];
    const infos = await Promise.all(sources.map(fileInfo));
    if (!infos.some(Boolean)) return;
    const destination = path.dirname(first.current);
    const destinationInfo = await fileInfo(destination);
    if (destinationInfo && (!destinationInfo.isDirectory() || (await fs.readdir(destination)).length)) return;
    const temporary = `${destination}.migration-${randomUUID()}.tmp`;
    await fs.mkdir(temporary, { recursive: true });
    try {
      for (let index = 0; index < sources.length; index += 1) {
        const info = infos[index];
        if (!info) continue;
        if (!info.isFile()) throw new Error("The previous SCOUT save is unreadable. Its original files have been kept.");
        // Keep raw bytes and the originals, including corrupt records that
        // must remain occupied and available for explicit player recovery.
        const target = path.join(temporary, path.basename(sources[index]));
        await fs.copyFile(sources[index], target);
        const handle = await fs.open(target, "r+");
        try { await handle.sync(); } finally { await handle.close(); }
      }
      if (destinationInfo) await fs.rmdir(destination);
      // Publish the complete slot with its preceding backup in one rename.
      // A process interruption leaves the originals available for a retry.
      await fs.rename(temporary, destination);
    } finally { await fs.rm(temporary, { recursive: true, force: true }).catch(() => {}); }
  }

  async load(slot = 1) {
    const selected = validateSlot(slot);
    await this.ready;
    if (selected === 1 && this.migrationError) throw this.migrationError;
    return this.stores.get(selected).load();
  }

  async loadBackup(slot = 1) {
    const selected = validateSlot(slot);
    await this.ready;
    if (selected === 1 && this.migrationError) return new SaveStore(this.directory).loadBackup();
    return this.stores.get(selected).loadBackup();
  }

  async save(json, slot = 1) {
    const selected = validateSlot(slot);
    validateCareerJSON(json);
    await this.ready;
    await this.stores.get(selected).save(json);
    if (selected === 1) this.migrationError = null;
  }

  async list() {
    await this.ready;
    return Promise.all(SAVE_SLOTS.map(async slot => {
      const store = this.stores.get(slot);
      await store.flush();
      let currentInfo, backupInfo;
      try { [currentInfo, backupInfo] = await Promise.all([fileInfo(store.current), fileInfo(store.backup)]); }
      catch (error) {
        return { slot, occupied: true, name: null, tier: null, week: null, backupAvailable: false, error: `This save file could not be read: ${error.message}` };
      }
      const legacyError = slot === 1 && this.migrationError;
      const summary = { slot, occupied: Boolean(currentInfo || backupInfo || legacyError), name: null, tier: null, week: null, backupAvailable: false };
      if (!summary.occupied) return summary;
      try {
        if (legacyError) throw legacyError;
        const raw = await store.read(store.current);
        if (!raw) throw new Error("This career's primary save is missing. Restore its previous save to continue.");
        const career = JSON.parse(raw);
        summary.name = career.style?.name || "Scout";
        summary.tier = career.tier;
        summary.week = career.week;
        summary.lastSavedAt = currentInfo.mtimeMs;
      } catch (error) { summary.error = error.message; }
      try { summary.backupAvailable = Boolean(await this.loadBackup(slot)); }
      catch { /* A damaged backup must not be offered as playable recovery. */ }
      return summary;
    }));
  }

  async flush() { await this.ready; await Promise.all([...this.stores.values()].map(store => store.flush())); }
  async flushStrict() {
    await this.ready;
    if (this.migrationError) throw this.migrationError;
    await Promise.all([...this.stores.values()].map(store => store.flushStrict()));
  }
}

module.exports = { SaveStore, SaveSlots, SAVE_SLOTS, validateSlot, validateCareerJSON, writeAtomic, MAX_SAVE_BYTES };
