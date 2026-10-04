"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const brandExecutable = require("../after-pack.cjs");
const writeUpdateManifest = require("../after-artifacts.cjs");
const { executableIdentity } = require("../update-manager.cjs");
const metadata = require("../../package.json");
const root = path.resolve(__dirname, "../..");
const resources = import("resedit");

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "scout-windows-packaging-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function nativeSections(executable) {
  return executable.getAllSections().filter(section => section.info.name !== ".rsrc")
    .map(section => ({ name: section.info.name, data: Buffer.from(section.data) }));
}

function iconBytes(icon) {
  return Buffer.from(icon.isRaw() ? icon.bin : icon.generate());
}

// A PE data fixture exercises the actual resource editor; it is never run and
// does not build or download an Electron runtime outside the release workflow.
async function executableFixture({ includeIcon = true, includeVersion = true } = {}) {
  const { NtExecutable, NtExecutableResource, Data, Format, Resource } = await resources;
  const executable = NtExecutable.createEmpty(false, false);
  executable.setSectionByEntry(Format.ImageDirectoryEntry.Export, {
    info: {
      name: ".text", virtualSize: 512, virtualAddress: 0, sizeOfRawData: 512,
      pointerToRawData: 0, pointerToRelocations: 0, pointerToLineNumbers: 0,
      numberOfRelocations: 0, numberOfLineNumbers: 0, characteristics: 0x60000020,
    },
    data: Uint8Array.from({ length: 512 }, (_, index) => (index * 37) % 256).buffer,
  });
  const resource = NtExecutableResource.from(executable);
  const icon = Data.IconFile.from(await fs.readFile(path.join(root, "build", "icon.ico")));
  if (includeIcon) Resource.IconGroupEntry.replaceIconsForResource(resource.entries, 1, 1033, [icon.icons[0].data]);
  if (includeVersion) {
    const version = Resource.VersionInfo.create(1033, {}, [{
      lang: 1033, codepage: 1200,
      values: { ProductName: "Electron", ProductVersion: "1.0.0", FileVersion: "1.0.0" },
    }]);
    version.setFileVersion(1, 0, 0, 0);
    version.setProductVersion(1, 0, 0, 0);
    version.outputToResourceEntries(resource.entries);
  }
  resource.outputResource(executable);
  return Buffer.from(executable.generate());
}

function packContext(directory) {
  return {
    electronPlatformName: "win32", appOutDir: directory,
    packager: { projectDir: root, appInfo: { version: metadata.version } },
  };
}

test("Windows branding changes identity and icons while preserving x64 runtime sections", async t => {
  const { NtExecutable, NtExecutableResource, Data, Resource } = await resources;
  const directory = await temporaryDirectory(t);
  const filename = path.join(directory, "SCOUT.exe");
  const original = await executableFixture();
  await fs.writeFile(filename, original);
  const before = NtExecutable.from(original);
  assert.equal(before.newHeader.fileHeader.machine, 0x8664);
  await brandExecutable(packContext(directory));
  const branded = NtExecutable.from(await fs.readFile(filename));
  assert.equal(branded.newHeader.fileHeader.machine, 0x8664);
  assert.deepEqual(nativeSections(branded), nativeSections(before));
  assert.deepEqual(await executableIdentity(filename), { product: "SCOUT", version: metadata.version });
  const actualResources = NtExecutableResource.from(branded);
  const groups = Resource.IconGroupEntry.fromEntries(actualResources.entries);
  assert.equal(groups.length, 1);
  const expected = Data.IconFile.from(await fs.readFile(path.join(root, "build", "icon.ico")));
  assert.deepEqual(groups[0].getIconItemsFromEntries(actualResources.entries).map(iconBytes),
    expected.icons.map(item => iconBytes(item.data)));
  const version = Resource.VersionInfo.fromEntries(actualResources.entries)[0];
  const language = version.getAllLanguagesForStringValues()[0];
  const strings = version.getStringValues(language);
  assert.equal(strings.OriginalFilename, "SCOUT.exe");
  assert.equal(strings.FileVersion, metadata.version);
  assert.equal(strings.ProductVersion, metadata.version);
  const [major, minor, patch] = metadata.version.split(".").map(Number);
  assert.equal(version.fixedInfo.fileVersionMS, (major << 16) | minor);
  assert.equal(version.fixedInfo.fileVersionLS, patch << 16);
  assert.equal(version.fixedInfo.productVersionMS, version.fixedInfo.fileVersionMS);
  assert.equal(version.fixedInfo.productVersionLS, version.fixedInfo.fileVersionLS);
});

test("Windows branding rejects missing native resources without overwriting its input", async t => {
  const directory = await temporaryDirectory(t);
  const filename = path.join(directory, "SCOUT.exe");
  for (const [options, message] of [
    [{ includeIcon: false }, /executable icon group/],
    [{ includeVersion: false }, /executable version data/],
  ]) {
    const original = await executableFixture(options);
    await fs.writeFile(filename, original);
    await assert.rejects(brandExecutable(packContext(directory)), message);
    assert.deepEqual(await fs.readFile(filename), original);
  }
});

test("Mac packing bypasses Windows executable branding", async t => {
  const directory = await temporaryDirectory(t);
  await brandExecutable({ ...packContext(directory), electronPlatformName: "darwin" });
  assert.deepEqual(await fs.readdir(directory), []);
});

test("Windows update manifest hashes the exact portable artifact bytes", async t => {
  const directory = await temporaryDirectory(t);
  const file = `SCOUT-${metadata.version}-Windows-Portable.exe`;
  const filename = path.join(directory, file);
  // Span multiple stream chunks to catch incomplete or text-mode hashing.
  const bytes = Buffer.from(Uint8Array.from({ length: 196_613 }, (_, index) => index % 256));
  await fs.writeFile(filename, bytes);
  const outputs = await writeUpdateManifest({ outDir: directory, artifactPaths: [filename] });
  const manifestPath = path.join(directory, "SCOUT-update.json");
  assert.deepEqual(outputs, [manifestPath]);
  const encoded = await fs.readFile(manifestPath, "utf8");
  assert(encoded.endsWith("\n"));
  assert.deepEqual(JSON.parse(encoded), {
    schema: 1, product: "SCOUT", appId: "com.scout.talentsimulator",
    target: "windows-portable-x64", version: metadata.version, file,
    size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  assert.deepEqual(await fs.readFile(filename), bytes);
});

test("Mac artifacts produce no Windows update manifest", async t => {
  const directory = await temporaryDirectory(t);
  const artifact = path.join(directory, `SCOUT-${metadata.version}-macOS-Apple-Silicon.zip`);
  await fs.writeFile(artifact, "Mac artifact fixture");
  assert.deepEqual(await writeUpdateManifest({ outDir: directory, artifactPaths: [artifact] }), []);
  assert.deepEqual(await fs.readdir(directory), [path.basename(artifact)]);
});
