"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");

function nativeSectionHashes(executable) {
  return executable.getAllSections().filter((section) => section.info.name !== ".rsrc")
    .map((section) => [section.info.name, section.data && createHash("sha256").update(Buffer.from(section.data)).digest("hex")]);
}

// Electron's own packager uses this same JavaScript PE resource library. The
// native Windows runtime is untouched; only its icon and version data change.
// This works on Windows and Linux without requiring a running Wine process.
module.exports = async function brandExecutable(context) {
  if (context.electronPlatformName !== "win32") return;
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import("resedit");
  const filename = path.join(context.appOutDir, "SCOUT.exe");
  const executable = NtExecutable.from(await fs.readFile(filename), { ignoreCert: true });
  const nativeBefore = JSON.stringify(nativeSectionHashes(executable));
  const resources = NtExecutableResource.from(executable);
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  if (groups.length !== 1) throw new Error("SCOUT packaging could not identify the executable icon group.");
  const icon = Data.IconFile.from(await fs.readFile(path.join(context.packager.projectDir, "build", "icon.ico")));
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, groups[0].id, groups[0].lang, icon.icons.map((item) => item.data));
  const versions = Resource.VersionInfo.fromEntries(resources.entries);
  if (versions.length !== 1) throw new Error("SCOUT packaging could not identify the executable version data.");
  const version = context.packager.appInfo.version;
  const numeric = version.split(".").map((part) => Number.parseInt(part, 10));
  while (numeric.length < 4) numeric.push(0);
  versions[0].setFileVersion(...numeric.slice(0, 4));
  versions[0].setProductVersion(...numeric.slice(0, 4));
  const languages = versions[0].getAllLanguagesForStringValues();
  versions[0].setStringValues(languages[0] || { lang: 1033, codepage: 1200 }, {
    CompanyName: "SCOUT development team",
    FileDescription: "SCOUT — Talent Simulator",
    ProductName: "SCOUT",
    FileVersion: version,
    ProductVersion: version,
    InternalName: "SCOUT",
    OriginalFilename: "SCOUT.exe",
    LegalCopyright: "SCOUT development team",
  });
  versions[0].outputToResourceEntries(resources.entries);
  resources.outputResource(executable);
  const branded = Buffer.from(executable.generate());
  const reparsed = NtExecutable.from(branded);
  if (JSON.stringify(nativeSectionHashes(reparsed)) !== nativeBefore) {
    throw new Error("Executable branding unexpectedly changed native runtime sections.");
  }
  await fs.writeFile(filename, branded);
};
