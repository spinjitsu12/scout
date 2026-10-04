"use strict";

/** Mouse capture belongs to the bundled game, never an embedded page or popup. */
function createGamePermissionHandlers({ getWindow, entryURL }) {
  const documentURL = value => typeof value === "string" ? value.split("#")[0] : null;
  function allowed(contents, permission, details) {
    if (permission !== "pointerLock" || details?.isMainFrame !== true || documentURL(details.requestingUrl) !== entryURL) return false;
    try {
      const window = getWindow();
      return !!window && !window.isDestroyed() && contents === window.webContents &&
        !contents.isDestroyed() && documentURL(contents.getURL()) === entryURL &&
        documentURL(contents.mainFrame.url) === entryURL;
    } catch { return false; }
  }
  return {
    check: (contents, permission, _origin, details) => allowed(contents, permission, details),
    request: (contents, permission, callback, details) => callback(allowed(contents, permission, details)),
  };
}

module.exports = { createGamePermissionHandlers };
