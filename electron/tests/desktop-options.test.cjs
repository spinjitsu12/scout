"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { titleBarOptions, applicationMenu } = require("../desktop-options.cjs");

test("Mac traffic lights have a dedicated placement and Windows retains its native overlay", () => {
  const mac = titleBarOptions("darwin"), windows = titleBarOptions("win32");
  assert.equal(mac.titleBarStyle, "hidden"); assert.equal(mac.trafficLightPosition.x, 16);
  assert.equal(mac.titleBarOverlay, undefined); assert.equal(windows.titleBarOverlay.height, 32);
  assert.equal(windows.trafficLightPosition, undefined);
});

test("Mac menus provide quit, editing and fullscreen shortcuts without replacing Windows menus", () => {
  let toggles = 0;
  const menu = applicationMenu("darwin", () => { toggles++; });
  assert.ok(menu[0].submenu.some(item => item.role === "quit")); assert.equal(menu[1].role, "editMenu");
  assert.equal(menu[2].submenu[0].accelerator, "Control+Command+F"); menu[2].submenu[0].click();
  assert.equal(toggles, 1); assert.equal(applicationMenu("win32", () => {}), null);
});
