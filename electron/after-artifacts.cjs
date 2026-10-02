"use strict";

const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

module.exports = async function writeUpdateManifest(context) {
  const metadata = JSON.parse(await fs.readFile(path.join(__dirname, "..", "package.json"), "utf8"));
  const version = metadata.version;
  const file = `SCOUT-${version}-Windows-Portable.exe`;
  if (!context.artifactPaths.some((artifact) => path.basename(artifact) === file)) return [];
  const filename = path.join(context.outDir, file);
  let info;
  try { info = await fs.stat(filename); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  const manifest = {
    schema: 1,
    product: "SCOUT",
    appId: "com.scout.talentsimulator",
    target: "windows-portable-x64",
    version,
    file,
    size: info.size,
    sha256: hash.digest("hex"),
  };
  const output = path.join(context.outDir, "SCOUT-update.json");
  await fs.writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return [output];
};
