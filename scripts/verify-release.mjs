import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const { sha256File, executableIdentity } = require('../electron/update-manager.cjs');
const root = path.resolve(import.meta.dirname, '..');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'release');
const manifest = JSON.parse(await fs.readFile(path.join(release, 'SCOUT-update.json'), 'utf8'));
assert.equal(manifest.product, 'SCOUT');
assert.equal(manifest.appId, 'com.scout.talentsimulator');
assert.equal(manifest.version, metadata.version);
assert.equal(manifest.target, 'windows-portable-x64');
const expectedFile = `SCOUT-${metadata.version}-Windows-Portable.exe`;
assert.equal(manifest.file, expectedFile);
const executable = path.join(release, expectedFile);
assert.equal((await fs.stat(executable)).size, manifest.size);
assert.equal(await sha256File(executable), manifest.sha256);
const identity = await executableIdentity(executable);
assert.equal(identity.product, 'SCOUT');
assert.equal(identity.version, metadata.version);
const bundle = path.join(release, 'win-unpacked', 'resources', 'app.asar');
const entries = new Set(asar.listPackage(bundle).map(name => name.replace(/^\//, '')));
for (const file of ['electron/main.cjs', 'electron/preload.cjs', 'electron/save-store.cjs',
  'electron/update-manager.cjs', 'electron/update-worker.ps1', 'electron/update-config.json',
  'electron/game-engine.cjs', 'dist/index.html', 'dist/fonts/PixelifySans.ttf',
  'dist/pixel/characters.png', 'dist/pixel/apartment.png', 'dist/pixel/company-district.png',
  'dist/pixel/elite-district.png', 'dist/pixel/veil-district.png']) {
  assert(entries.has(file), `The offline release must include ${file}`);
}
const packagedMetadata = JSON.parse(asar.extractFile(bundle, 'package.json').toString('utf8'));
assert.equal(packagedMetadata.version, metadata.version);
for (const file of ['main.cjs', 'preload.cjs', 'save-store.cjs', 'game-engine.cjs',
  'update-manager.cjs', 'update-worker.ps1', 'update-config.json']) {
  assert.deepEqual(asar.extractFile(bundle, `electron/${file}`),
    await fs.readFile(path.join(root, 'electron', file)), `The release must contain the current ${file}`);
}
async function verifyDirectory(relative) {
  for (const entry of await fs.readdir(path.join(root, relative), {withFileTypes:true})) {
    const file = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await verifyDirectory(file);
    else if (entry.isFile()) assert.deepEqual(asar.extractFile(bundle, file),
      await fs.readFile(path.join(root, file)), `The release must contain the current ${file}`);
  }
}
await verifyDirectory('dist');
console.log(`PASS: SCOUT ${metadata.version} release hash, executable identity, updater, save engine and bundled offline content.`);
