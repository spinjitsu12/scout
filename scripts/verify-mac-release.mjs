import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { listArchiveEntries, readArchiveFile } = require('./release-archive.cjs');
const root = path.resolve(import.meta.dirname, '..');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const app = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'release', 'mac-arm64', 'SCOUT.app');
const contents = path.join(app, 'Contents');
const plist = await fs.readFile(path.join(contents, 'Info.plist'), 'utf8');
function plistString(key) {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  assert(match, `The Mac app must define ${key}`);
  return match[1];
}
assert.equal(plistString('CFBundleExecutable'), 'SCOUT');
assert.equal(plistString('CFBundleIdentifier'), 'com.scout.talentsimulator');
assert.equal(plistString('CFBundleShortVersionString'), metadata.version);
assert.equal(plistString('LSMinimumSystemVersion'), '13.0');

async function verifyMachO(relative) {
  const filename = path.join(contents, relative);
  const info = await fs.stat(filename);
  assert(info.isFile() && (info.mode & 0o111), `${relative} must retain its executable permission`);
  const data = await fs.readFile(filename);
  assert.equal(data.readUInt32LE(0), 0xfeedfacf, `${relative} must be a 64-bit Mach-O binary`);
  assert.equal(data.readUInt32LE(4), 0x0100000c, `${relative} must run natively on Apple silicon`);
  const commands = data.readUInt32LE(16);
  let offset = 32, signature = false;
  for (let index = 0; index < commands; index++) {
    assert(offset + 8 <= data.length, 'Invalid Mach-O command table');
    const command = data.readUInt32LE(offset), size = data.readUInt32LE(offset + 4);
    assert(size >= 8 && offset + size <= data.length, 'Invalid Mach-O command length');
    if (command === 0x1d) {
      const start = data.readUInt32LE(offset + 8), length = data.readUInt32LE(offset + 12);
      assert(length > 0 && start + length <= data.length, `${relative} must contain its complete signature`);
      assert.equal(data.readUInt32BE(start), 0xfade0cc0, `${relative} has an invalid signature container`);
      signature = true;
    }
    offset += size;
  }
  assert(signature, `${relative} must be signed for Apple silicon execution`);
}
await verifyMachO('MacOS/SCOUT');
await verifyMachO('Frameworks/Electron Framework.framework/Versions/A/Electron Framework');
for (const suffix of ['', ' (GPU)', ' (Renderer)', ' (Plugin)']) {
  await verifyMachO(`Frameworks/SCOUT Helper${suffix}.app/Contents/MacOS/SCOUT Helper${suffix}`);
}

const framework = path.join(contents, 'Frameworks', 'Electron Framework.framework');
for (const [relative, target] of [['Versions/Current', 'A'], ['Electron Framework', 'Versions/Current/Electron Framework'], ['Resources', 'Versions/Current/Resources']]) {
  assert((await fs.lstat(path.join(framework, relative))).isSymbolicLink(), `Framework link ${relative} must be preserved`);
  assert.equal(await fs.readlink(path.join(framework, relative)), target);
}
assert((await fs.stat(path.join(contents, '_CodeSignature', 'CodeResources'))).size > 0, 'The app resource seal is missing');
assert((await fs.stat(path.join(contents, 'Resources', 'icon.icns'))).size > 0, 'The Mac icon is missing');

const bundle = path.join(contents, 'Resources', 'app.asar');
const entries = listArchiveEntries(bundle);
assert.equal(JSON.parse(readArchiveFile(bundle, 'package.json').toString('utf8')).version, metadata.version);
for (const name of ['main.cjs', 'preload.cjs', 'save-store.cjs', 'display-mode.cjs', 'credit-links.cjs', 'desktop-options.cjs',
  'mac-updates.cjs', 'game-engine.cjs', 'update-manager.cjs', 'update-worker.ps1', 'update-config.json']) {
  const relative = `electron/${name}`;
  assert(entries.has(relative), `The Mac app must include ${relative}`);
  assert.deepEqual(readArchiveFile(bundle, relative), await fs.readFile(path.join(root, relative)), `The Mac app must contain the current ${name}`);
}
let assets = 0;
async function verifyDirectory(relative) {
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const filename = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await verifyDirectory(filename);
    else if (entry.isFile()) {
      assert.deepEqual(readArchiveFile(bundle, filename), await fs.readFile(path.join(root, filename)), `The Mac app must contain the current ${filename}`);
      assets++;
    }
  }
}
await verifyDirectory('dist');
if (process.platform === 'darwin') execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
console.log(`PASS: SCOUT ${metadata.version} Apple silicon app, six signed ARM64 runtime binaries, framework links, native helpers and ${assets} bundled offline files.`);
