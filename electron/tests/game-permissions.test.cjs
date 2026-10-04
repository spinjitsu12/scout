"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createGamePermissionHandlers } = require("../game-permissions.cjs");

function fixture() {
  const entryURL = "file:///Applications/SCOUT.app/Contents/Resources/app.asar/dist/index.html";
  const contents = { isDestroyed: () => false, getURL: () => entryURL, mainFrame: { url: entryURL } };
  let window = { isDestroyed: () => false, webContents: contents };
  const handlers = createGamePermissionHandlers({ getWindow: () => window, entryURL });
  const details = { isMainFrame: true, requestingUrl: entryURL };
  function permitted(permission = "pointerLock", requesting = contents, frame = details) {
    const check = handlers.check(requesting, permission, "file://", frame);
    const answers = [];
    handlers.request(requesting, permission, answer => answers.push(answer), frame);
    assert.deepEqual(answers, [check], "check and request must make the same decision exactly once");
    return check;
  }
  return { entryURL, contents, details, permitted, setWindow: value => { window = value; } };
}

test("the bundled game main frame can capture the mouse, including a local route fragment", () => {
  const f = fixture();
  assert.equal(f.permitted(), true);
  f.contents.getURL = () => f.entryURL + "#career/2";
  f.contents.mainFrame.url = f.entryURL + "#career/2";
  assert.equal(f.permitted("pointerLock", f.contents, { ...f.details, requestingUrl: f.entryURL + "#career/2" }), true);
});

test("same-file subframes and undocumented frame identities cannot acquire mouse capture", () => {
  const f = fixture();
  for (const frame of [{ ...f.details, isMainFrame: false }, { requestingUrl: f.entryURL }, { isMainFrame: true }, {}, null]) {
    assert.equal(f.permitted("pointerLock", f.contents, frame), false);
  }
});

test("other local files, lookalike paths and remote documents cannot capture the game mouse", () => {
  const f = fixture();
  for (const requestingUrl of ["file:///tmp/index.html", f.entryURL + "?other=1", f.entryURL + "/other", "https://example.com/index.html", "about:blank", "data:text/html,test"]) {
    assert.equal(f.permitted("pointerLock", f.contents, { ...f.details, requestingUrl }), false);
  }
  f.contents.getURL = () => "https://example.com/";
  assert.equal(f.permitted(), false);
  f.contents.getURL = () => f.entryURL;
  f.contents.mainFrame.url = "https://example.com/";
  assert.equal(f.permitted(), false);
});

test("a popup with the same file URL and a service-worker permission check remain denied", () => {
  const f = fixture();
  assert.equal(f.permitted("pointerLock", { ...f.contents }), false);
  assert.equal(f.permitted("pointerLock", null), false);
});

test("camera, microphone, external launch, fullscreen and unrelated permissions remain denied", () => {
  const f = fixture();
  for (const permission of ["media", "geolocation", "notifications", "openExternal", "fullscreen", "automatic-fullscreen", "keyboardLock", "clipboard-read", "fileSystem", "unknown"]) {
    assert.equal(f.permitted(permission), false);
  }
});

test("closing or destroyed native windows never grant mouse capture", () => {
  const f = fixture();
  f.contents.isDestroyed = () => true;
  assert.equal(f.permitted(), false);
  f.contents.isDestroyed = () => false;
  f.setWindow({ isDestroyed: () => true, webContents: f.contents });
  assert.equal(f.permitted(), false);
  f.setWindow(null);
  assert.equal(f.permitted(), false);
});
