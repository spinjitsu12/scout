"use strict";

function titleBarOptions(platform = process.platform) {
  return platform === "darwin"
    ? { titleBarStyle: "hidden", trafficLightPosition: { x: 16, y: 10 } }
    : { titleBarStyle: "hidden", titleBarOverlay: { color: "#111b28", symbolColor: "#e7e4d8", height: 32 } };
}

function applicationMenu(platform, toggleFullscreen) {
  if (platform !== "darwin") return null;
  return [
    { label: "SCOUT", submenu: [
      { role: "about" }, { type: "separator" }, { role: "hide" },
      { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" },
    ] },
    { role: "editMenu" },
    { label: "View", submenu: [
      { label: "Toggle Fullscreen", accelerator: "Control+Command+F", click: toggleFullscreen },
    ] },
  ];
}

module.exports = { titleBarOptions, applicationMenu };
