import { build } from "rolldown";
import path from "node:path";
import fs from "node:fs/promises";

const root = path.resolve(import.meta.dirname, "..");
const configFile = path.join(root, "electron", "update-config.json");
const config = JSON.parse(await fs.readFile(configFile, "utf8"));
const configured = process.env.SCOUT_UPDATE_REPOSITORY;
if (configured !== undefined) config.repository = configured.trim() || null;
if (config.repository !== null && (typeof config.repository !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(config.repository) || /\/(?:\.|\.\.)$/.test(config.repository))) {
  throw new Error("SCOUT_UPDATE_REPOSITORY must be a GitHub owner/repository name.");
}
await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
await build({
  input: path.join(root, "src", "lib", "game.ts"),
  platform: "node",
  output: {
    file: path.join(root, "electron", "game-engine.cjs"),
    format: "cjs",
    exports: "named",
    sourcemap: false,
    banner: "// Generated from src/lib/game.ts. Run npm run build to refresh; edit the shared TypeScript engine instead.",
  },
});
