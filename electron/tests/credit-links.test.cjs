"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { creditedURL, creditWindowHandler } = require("../credit-links.cjs");

test("every bundled source and license page has a browser credit destination", async () => {
  const credits = await fs.readFile(path.resolve(__dirname, "../../public/audio/CREDITS.txt"), "utf8");
  const urls = [...new Set(credits.match(/https:\/\/[^\s]+/g))];
  assert.ok(urls.length >= 10);
  for (const url of urls) assert.equal(creditedURL(url), url, `Unlisted bundled credit: ${url}`);
});

test("uncredited pages, lookalike hosts, redirects, credentials and non-web protocols cannot launch", () => {
  for (const url of [
    "https://example.com/", "https://www.scottbuckley.com.au/", "https://kenney.nl/assets/uncredited-asset",
    "http://creativecommons.org/licenses/by/4.0/", "https://creativecommons.org.evil.example/licenses/by/4.0/",
    "https://creativecоmmons.org/licenses/by/4.0/", "https://www.scottbuckley.com.au.evil.example/library/simplicity/",
    "https://user:pass@creativecommons.org/licenses/by/4.0/", "https://creativecommons.org:8443/licenses/by/4.0/",
    "https://www.scottbuckley.com.au/library/simplicity/?redirect=https://example.com",
    "https://creativecommons.org/licenses/by/4.0/#unlisted", "https://www.scottbuckley.com.au/library/../wp-admin/",
    "file:///C:/Windows/System32/cmd.exe", "javascript:alert(1)", "data:text/html,test", "mailto:test@example.com",
    "smb://server/share", "steam://open", "not a URL", null, {}, "x".repeat(513),
  ]) assert.equal(creditedURL(url), null, String(url));
});

test("intentional fixed credit popups use the OS browser and every native popup stays denied", async () => {
  const opened = [], handler = creditWindowHandler(url => { opened.push(url); return Promise.resolve(); });
  assert.deepEqual(handler({ url: "https://kenney.nl/assets/rpg-audio" }), { action: "deny" });
  assert.deepEqual(handler({ url: "https://example.com/" }), { action: "deny" });
  assert.deepEqual(handler({ url: "file:///C:/Windows/System32/cmd.exe" }), { action: "deny" });
  assert.deepEqual(handler(null), { action: "deny" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(opened, ["https://kenney.nl/assets/rpg-audio"]);
});

test("an unavailable OS browser does not create a game popup or reject the window handler", async () => {
  const handler = creditWindowHandler(() => { throw new Error("No browser is installed"); });
  assert.deepEqual(handler({ url: "https://creativecommons.org/licenses/by/4.0/" }), { action: "deny" });
  await new Promise(resolve => setImmediate(resolve));
});
