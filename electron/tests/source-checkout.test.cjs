"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");

test("Windows Git checkout preserves the original hashed license bytes", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "scout-source-checkout-"));
  try {
    const source = path.join(temporary, "source");
    const checkout = path.join(temporary, "checkout");
    const emptyAttributes = path.join(temporary, "empty-attributes");
    await fs.mkdir(source);
    await fs.mkdir(checkout);
    await fs.writeFile(emptyAttributes, "");

    // Use Git's real conversion machinery, while isolating this throwaway index
    // from user repositories and their global/system attribute rules.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_ATTR_NOSYSTEM = "1";
    env.GIT_CONFIG_GLOBAL = path.join(temporary, "no-global-config");
    const git = (...args) => execFileSync("git", [
      "-c", "core.autocrlf=true", "-c", "core.eol=crlf",
      "-c", "core.safecrlf=false", "-c", `core.attributesFile=${emptyAttributes}`,
      ...args,
    ], { cwd: source, env, stdio: ["ignore", "pipe", "pipe"] });

    git("init", "--quiet");
    const manifest = JSON.parse(await fs.readFile(path.join(root, "public/audio/manifest.json"), "utf8"));
    const originals = new Map();
    for (const notice of manifest.licenseDocuments) {
      const relative = `public/${notice.file}`;
      originals.set(relative, await fs.readFile(path.join(root, relative)));
    }
    const engineNotice = "public/licenses/cannon-es-MIT.txt";
    originals.set(engineNotice, await fs.readFile(path.join(root, engineNotice)));
    // Also exercise nested future assets, and prove the Windows conversion mode
    // would alter ordinary LF text without the project's checkout rules.
    originals.set("public/audio/foley/checkout-fixture.txt", Buffer.from("Original\r\nrecording notice\r\n"));
    originals.set("public/audio/music/checkout-fixture.mp3", Buffer.from("original\r\naudio\nbytes"));
    for (const [relative, bytes] of originals) {
      await fs.mkdir(path.dirname(path.join(source, relative)), { recursive: true });
      await fs.writeFile(path.join(source, relative), bytes);
    }
    await fs.writeFile(path.join(source, "windows-default.txt"), "first\nsecond\n");
    git("add", "--", "windows-default.txt");
    git("checkout-index", "--all", `--prefix=${checkout.replaceAll("\\", "/")}/`);
    assert.equal(await fs.readFile(path.join(checkout, "windows-default.txt"), "utf8"), "first\r\nsecond\r\n");

    await fs.copyFile(path.join(root, ".gitattributes"), path.join(source, ".gitattributes"));
    await fs.writeFile(path.join(source, "source.cjs"), "// source\nmodule.exports = {};\n");
    git("add", "--", ".gitattributes", "public", "source.cjs");
    git("checkout-index", "--all", "--force", `--prefix=${checkout.replaceAll("\\", "/")}/`);
    for (const [relative, bytes] of originals) {
      assert.deepEqual(git("show", `:${relative}`), bytes, `Git staging must preserve ${relative}`);
      assert.deepEqual(await fs.readFile(path.join(checkout, relative)), bytes, `Windows checkout must preserve ${relative}`);
    }
    assert.equal(await fs.readFile(path.join(checkout, "source.cjs"), "utf8"), "// source\nmodule.exports = {};\n");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
