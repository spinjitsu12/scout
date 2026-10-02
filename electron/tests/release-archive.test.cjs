"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test, before, after } = require("node:test");
const asar = require("@electron/asar");
const helpersPath = path.resolve(__dirname, "../../scripts/release-archive.cjs");
const { listArchiveEntries, readArchiveFile } = require(helpersPath);
const asarDirectory = path.dirname(require.resolve("@electron/asar"));
const disk = require(path.join(asarDirectory, "disk.js"));

// Use the installed ASAR implementation with Windows path rules, even on Linux.
function loadWithWindowsPaths(filename) {
  const module = { exports: {} };
  const nativeRequire = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, Buffer, process,
    require: name => name === "path" || name === "node:path"
      ? path.win32 : nativeRequire(name),
  }, { filename });
  return module.exports;
}

const { Filesystem: WindowsFilesystem } = loadWithWindowsPaths(
  path.join(asarDirectory, "filesystem.js"));
const windowsHelpers = loadWithWindowsPaths(helpersPath);
const contents = {
  "electron/main.cjs": '"use strict";\n',
  "dist/assets/style.css": "body { background: #101821; }\n",
  "dist/assets/nested/chunk.js": "export const offline = true;\n",
  "dist/fonts/font.ttf": "bundled font fixture",
  "dist/pixel/characters.png": "bundled artwork fixture",
};
let temporary, bundle;

before(async () => {
  temporary = await fsp.mkdtemp(path.join(os.tmpdir(), "scout-release-paths-"));
  const source = path.join(temporary, "source");
  for (const [relative, content] of Object.entries(contents)) {
    const file = path.join(source, ...relative.split("/"));
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, content);
  }
  bundle = path.join(temporary, "fixture.asar");
  await asar.createPackage(source, bundle);
});

after(async () => {
  asar.uncacheAll();
  if (temporary) await fsp.rm(temporary, { recursive: true, force: true });
});

function withWindowsArchive(check) {
  const originalRead = disk.readFilesystemSync;
  const filesystems = new Map();
  disk.readFilesystemSync = archive => {
    if (!filesystems.has(archive)) {
      const original = originalRead(archive);
      const windows = new WindowsFilesystem(archive);
      // Keep the actual archive readable on this host; its internal paths are Windows paths.
      windows.src = original.getRootPath();
      windows.setHeader(structuredClone(original.getHeader()), original.getHeaderSize());
      filesystems.set(archive, windows);
    }
    return filesystems.get(archive);
  };
  try { check(); } finally { disk.readFilesystemSync = originalRead; }
}

test("release archive lists and reads every nested offline asset on the host", () => {
  const entries = listArchiveEntries(bundle);
  for (const [relative, content] of Object.entries(contents)) {
    assert(entries.has(relative), relative);
    assert.equal(readArchiveFile(bundle, relative).toString(), content, relative);
  }
});

test("Windows ASAR extraction reads nested assets with normalized paths", () => {
  withWindowsArchive(() => {
    assert.throws(() => asar.extractFile(bundle, "dist/assets/style.css"), /not found in this archive/);
    const entries = windowsHelpers.listArchiveEntries(bundle);
    for (const [relative, content] of Object.entries(contents)) {
      assert(entries.has(relative), relative);
      assert.equal(windowsHelpers.readArchiveFile(bundle, relative).toString(), content, relative);
    }
  });
});

test("missing offline assets still fail archive reads on both platforms", () => {
  assert.throws(() => readArchiveFile(bundle, "dist/pixel/missing.png"), /not found in this archive/);
  withWindowsArchive(() => {
    assert.throws(() => windowsHelpers.readArchiveFile(bundle, "dist/pixel/missing.png"), /not found in this archive/);
  });
});
