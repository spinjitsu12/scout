import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { crc32 } from 'node:zlib';

// Use the ZIP reader shipped with the pinned electron-builder dependency.
// Read entry bodies as streams: the Electron framework and app.asar are large.
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
const { Open } = builderRequire('unzipper');
const root = path.resolve(import.meta.dirname, '..');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const filename = process.argv[2] ? path.resolve(process.argv[2]) :
  path.join(root, 'release', `SCOUT-${metadata.version}-macOS-Apple-Silicon.zip`);
const appRoot = 'SCOUT.app';
const regularType = 0o100000, directoryType = 0o040000, symlinkType = 0o120000;
const machoMagic = new Set([0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe,
  0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca]);
const nativeFiles = [
  'Contents/MacOS/SCOUT',
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework',
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler',
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib',
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib',
  'Contents/Frameworks/Mantle.framework/Versions/A/Mantle',
  'Contents/Frameworks/ReactiveObjC.framework/Versions/A/ReactiveObjC',
  'Contents/Frameworks/Squirrel.framework/Versions/A/Squirrel',
  'Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt',
  ...['', ' (GPU)', ' (Renderer)', ' (Plugin)'].map(suffix =>
    `Contents/Frameworks/SCOUT Helper${suffix}.app/Contents/MacOS/SCOUT Helper${suffix}`),
].map(name => `${appRoot}/${name}`);
const requiredFiles = [
  'Contents/Info.plist', 'Contents/_CodeSignature/CodeResources',
  'Contents/Resources/app.asar', 'Contents/Resources/icon.icns',
  ...['Electron Framework', 'Mantle', 'ReactiveObjC', 'Squirrel'].map(framework =>
    `Contents/Frameworks/${framework}.framework/Versions/A/Resources/Info.plist`),
  ...['', ' (GPU)', ' (Renderer)', ' (Plugin)'].map(suffix =>
    `Contents/Frameworks/SCOUT Helper${suffix}.app/Contents/Info.plist`),
].map(name => `${appRoot}/${name}`);
const expectedLinks = new Map();
for (const framework of ['Electron Framework', 'Mantle', 'ReactiveObjC', 'Squirrel']) {
  const base = `${appRoot}/Contents/Frameworks/${framework}.framework`;
  expectedLinks.set(`${base}/Versions/Current`, 'A');
  expectedLinks.set(`${base}/${framework}`, `Versions/Current/${framework}`);
  expectedLinks.set(`${base}/Resources`, 'Versions/Current/Resources');
  if (framework === 'Electron Framework') {
    expectedLinks.set(`${base}/Helpers`, 'Versions/Current/Helpers');
    expectedLinks.set(`${base}/Libraries`, 'Versions/Current/Libraries');
  }
}

function insideApp(name) {
  assert(name === appRoot || name.startsWith(`${appRoot}/`), `ZIP path escapes ${appRoot}: ${name}`);
}

function entryName(entry) {
  const name = entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path;
  assert(name && !/[\\\x00-\x1f\x7f]/.test(name), `Invalid ZIP path: ${entry.path}`);
  assert.equal(path.posix.normalize(name), name, `Non-canonical ZIP path: ${entry.path}`);
  assert(Buffer.from(entry.path, 'utf8').equals(entry.pathBuffer), 'ZIP filenames must be valid UTF-8');
  insideApp(name);
  return name;
}

async function readExactly(handle, length, offset) {
  const result = Buffer.alloc(length);
  let consumed = 0;
  while (consumed < length) {
    const { bytesRead } = await handle.read(result, consumed, length - consumed, offset + consumed);
    assert(bytesRead > 0, 'The ZIP is truncated');
    consumed += bytesRead;
  }
  return result;
}

// Locate the actual end record backwards. Supplying its exact tail length also
// prevents the ZIP reader from mistaking bytes in compressed data for a record.
async function endRecord(handle, size) {
  assert(size >= 22, 'The Mac ZIP is empty or truncated');
  const length = Math.min(size, 22 + 0xffff);
  const tail = await readExactly(handle, length, size - length);
  for (let offset = length - 22; offset >= 0; offset--) {
    if (tail.readUInt32LE(offset) !== 0x06054b50 ||
      offset + 22 + tail.readUInt16LE(offset + 20) !== length) continue;
    assert.equal(tail.readUInt16LE(offset + 4), 0, 'Multi-volume ZIPs are not supported');
    assert.equal(tail.readUInt16LE(offset + 6), 0, 'Multi-volume ZIPs are not supported');
    assert.equal(tail.readUInt16LE(offset + 8), tail.readUInt16LE(offset + 10), 'Incomplete ZIP directory');
    return { offset: size - length + offset, tailSize: length - offset };
  }
  assert.fail('The Mac ZIP has no complete end-of-directory record');
}

async function verifyLocalHeader(handle, entry, centralOffset) {
  assert(Number.isSafeInteger(entry.offsetToLocalFileHeader) && entry.offsetToLocalFileHeader >= 0,
    `Invalid ZIP entry offset: ${entry.path}`);
  const header = await readExactly(handle, 30, entry.offsetToLocalFileHeader);
  assert.equal(header.readUInt32LE(0), 0x04034b50, `Invalid ZIP local header: ${entry.path}`);
  assert.equal(header.readUInt16LE(6), entry.flags, `ZIP flag mismatch: ${entry.path}`);
  assert.equal(header.readUInt16LE(8), entry.compressionMethod, `ZIP compression mismatch: ${entry.path}`);
  const nameLength = header.readUInt16LE(26), extraLength = header.readUInt16LE(28);
  const localName = await readExactly(handle, nameLength, entry.offsetToLocalFileHeader + 30);
  assert(localName.equals(entry.pathBuffer), `ZIP local filename mismatch: ${entry.path}`);
  const dataOffset = entry.offsetToLocalFileHeader + 30 + nameLength + extraLength;
  assert(dataOffset + entry.compressedSize <= centralOffset, `ZIP entry overlaps its directory: ${entry.path}`);
  if (!(entry.flags & 0x08)) {
    assert.equal(header.readUInt32LE(14), entry.crc32, `ZIP header CRC mismatch: ${entry.path}`);
    for (const [offset, value] of [[18, entry.compressedSize], [22, entry.uncompressedSize]]) {
      const localSize = header.readUInt32LE(offset);
      assert(localSize === 0xffffffff || localSize === value, `ZIP header size mismatch: ${entry.path}`);
    }
  }
  return { start: entry.offsetToLocalFileHeader, end: dataOffset + entry.compressedSize };
}

async function readEntry(entry, capture) {
  let size = 0, checksum = 0, prefix = Buffer.alloc(0);
  const pieces = capture ? [] : null;
  for await (const piece of entry.stream()) {
    size += piece.length;
    assert(size <= entry.uncompressedSize, `ZIP entry expands beyond its declared size: ${entry.path}`);
    checksum = crc32(piece, checksum);
    if (prefix.length < 32) prefix = Buffer.concat([prefix, piece.subarray(0, 32 - prefix.length)]);
    if (pieces) pieces.push(piece);
  }
  assert.equal(size, entry.uncompressedSize, `Truncated ZIP entry: ${entry.path}`);
  assert.equal(checksum >>> 0, entry.crc32 >>> 0, `ZIP entry CRC failed: ${entry.path}`);
  return { prefix, data: pieces ? Buffer.concat(pieces) : null };
}

const records = new Map(), links = new Map(), implicitDirectories = new Set(), ranges = [];
let nativeCount = 0, uncompressedBytes = 0, archiveInfo;
const handle = await fs.open(filename, 'r');
try {
  archiveInfo = await handle.stat();
  const end = await endRecord(handle, archiveInfo.size);
  const directory = await Open.file(filename, { tailSize: end.tailSize });
  assert.equal(directory.diskNumber, 0, 'Multi-volume ZIPs are not supported');
  assert.equal(directory.diskStart, 0, 'Multi-volume ZIPs are not supported');
  assert(directory.files.length > 0, 'The Mac ZIP contains no app');
  assert.equal(directory.files.length, directory.numberOfRecords, 'Incomplete ZIP directory');
  const centralOffset = directory.offsetToStartOfCentralDirectory;
  assert(Number.isSafeInteger(centralOffset) && centralOffset >= 0 &&
    centralOffset + directory.sizeOfCentralDirectory <= end.offset, 'Invalid ZIP directory bounds');

  for (const entry of directory.files) {
    const name = entryName(entry);
    assert(!records.has(name), `Duplicate ZIP path: ${name}`);
    assert.equal(entry.signature, 0x02014b50, `Invalid ZIP directory entry: ${name}`);
    assert.equal(entry.diskNumber, 0, 'Multi-volume ZIPs are not supported');
    assert(!(entry.flags & 0x01), `Encrypted ZIP entries are not supported: ${name}`);
    assert([0, 8].includes(entry.compressionMethod), `Unsupported ZIP compression: ${name}`);
    for (const value of [entry.compressedSize, entry.uncompressedSize]) {
      assert(Number.isSafeInteger(value) && value >= 0, `Invalid ZIP entry size: ${name}`);
    }
    assert([3, 19].includes(entry.versionMadeBy >>> 8), `ZIP entry lacks Unix mode metadata: ${name}`);
    const mode = entry.externalFileAttributes >>> 16, type = mode & 0o170000;
    assert([regularType, directoryType, symlinkType].includes(type), `Unsupported Unix file type: ${name}`);
    assert.equal(entry.path.endsWith('/'), type === directoryType, `ZIP directory mode mismatch: ${name}`);
    if (type !== symlinkType) assert(mode & 0o400, `ZIP entry is not readable by its owner: ${name}`);
    if (type === directoryType) {
      assert(mode & 0o100, `ZIP directory is not searchable: ${name}`);
      assert.equal(entry.uncompressedSize, 0, `ZIP directory contains data: ${name}`);
    }
    const isInfo = name === `${appRoot}/Contents/Info.plist`;
    if (type === symlinkType) assert(entry.uncompressedSize <= 4096, `Oversized ZIP symlink: ${name}`);
    if (isInfo) assert(entry.uncompressedSize <= 128 * 1024, 'The app Info.plist is unexpectedly large');
    ranges.push(await verifyLocalHeader(handle, entry, centralOffset));
    const { prefix, data } = await readEntry(entry, type === symlinkType || isInfo);
    records.set(name, { type, mode, size: entry.uncompressedSize, prefix, data });
    for (let parent = path.posix.dirname(name); parent !== '.'; parent = path.posix.dirname(parent)) {
      implicitDirectories.add(parent);
    }
    uncompressedBytes += entry.uncompressedSize;
    if (type === symlinkType) {
      const target = new TextDecoder('utf-8', { fatal: true }).decode(data);
      assert(target && !/[\\\x00-\x1f\x7f]/.test(target) && !path.posix.isAbsolute(target),
        `Invalid ZIP symlink target: ${name}`);
      insideApp(path.posix.normalize(path.posix.join(path.posix.dirname(name), target)));
      links.set(name, target);
    } else if (type === regularType && prefix.length >= 4 && machoMagic.has(prefix.readUInt32LE(0))) {
      assert(prefix.length === 32 && prefix.readUInt32LE(0) === 0xfeedfacf &&
        prefix.readUInt32LE(4) === 0x0100000c, `ZIP native binary must be ARM64 only: ${name}`);
      assert(mode & 0o100, `ZIP native binary lost owner executable permissions: ${name}`);
      nativeCount++;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < ranges.length; index++) {
    assert(ranges[index - 1].end <= ranges[index].start, 'ZIP entry data overlaps another entry');
  }
  const after = await handle.stat();
  assert(archiveInfo.size === after.size && archiveInfo.mtimeMs === after.mtimeMs,
    'The Mac ZIP changed during verification; finish packaging before checking it');
} finally {
  await handle.close();
}

assert.equal(records.get(appRoot)?.type, directoryType, `The ZIP must contain the ${appRoot} directory`);
for (const name of [...requiredFiles, ...nativeFiles]) {
  assert.equal(records.get(name)?.type, regularType, `The ZIP must contain the regular file ${name}`);
  assert(records.get(name).size > 0, `Required ZIP file is empty: ${name}`);
}
for (const name of nativeFiles) {
  const { prefix, mode } = records.get(name);
  assert(prefix.length === 32 && prefix.readUInt32LE(0) === 0xfeedfacf &&
    prefix.readUInt32LE(4) === 0x0100000c, `Required ZIP runtime must be native ARM64: ${name}`);
  assert(mode & 0o100, `Required ZIP runtime lost owner executable permissions: ${name}`);
}
for (const name of records.keys()) {
  for (let parent = path.posix.dirname(name); parent !== '.'; parent = path.posix.dirname(parent)) {
    if (records.has(parent)) assert.equal(records.get(parent).type, directoryType,
      `ZIP entry is nested beneath a file or symlink: ${name}`);
  }
}
for (const [name, target] of expectedLinks) {
  assert.equal(records.get(name)?.type, symlinkType, `Framework symlink was flattened or omitted: ${name}`);
  assert.equal(links.get(name), target, `Incorrect framework symlink target: ${name}`);
}
for (const [name, target] of links) {
  let resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
  const seen = new Set([name]);
  while (true) {
    insideApp(resolved);
    const parts = resolved.split('/');
    const next = parts.map((_, index) => parts.slice(0, index + 1).join('/')).find(candidate => links.has(candidate));
    if (!next) break;
    assert(!seen.has(next), `Cyclic ZIP symlink: ${name}`);
    seen.add(next);
    const suffix = resolved.slice(next.length);
    resolved = path.posix.normalize(`${path.posix.join(path.posix.dirname(next), links.get(next))}${suffix}`);
  }
  assert(records.has(resolved) || implicitDirectories.has(resolved), `Broken ZIP symlink: ${name} -> ${target}`);
  if (expectedLinks.has(name)) {
    const isDirectory = ['Current', 'Resources', 'Helpers', 'Libraries'].includes(path.posix.basename(name));
    assert.equal(records.get(resolved)?.type, isDirectory ? directoryType : regularType,
      `Framework symlink resolves to the wrong file type: ${name}`);
  }
}
const plist = records.get(`${appRoot}/Contents/Info.plist`).data.toString('utf8');
for (const [key, value] of [['CFBundleExecutable', 'SCOUT'], ['CFBundleIdentifier', 'com.scout.talentsimulator'],
  ['CFBundleShortVersionString', metadata.version], ['LSMinimumSystemVersion', '13.0']]) {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  assert.equal(match?.[1], value, `The ZIP app must define ${key}=${value}`);
}

if (process.platform === 'darwin') {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-mac-archive-'));
  try {
    execFileSync('ditto', ['-x', '-k', filename, temporary], { stdio: 'inherit' });
    execFileSync(process.execPath, [path.join(root, 'scripts', 'verify-mac-release.mjs'),
      path.join(temporary, appRoot)], { stdio: 'inherit' });
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
console.log(`PASS: SCOUT ${metadata.version} Mac ZIP, ${records.size} CRC-checked entries, ${nativeCount} ARM64 binaries, ` +
  `${links.size} preserved symlinks and ${uncompressedBytes} unpacked bytes${process.platform === 'darwin' ? ', extracted app signatures and assets' : ''}.`);
