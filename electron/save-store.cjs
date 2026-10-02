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

module.exports = { SaveStore, validateCareerJSON, writeAtomic, MAX_SAVE_BYTES };
