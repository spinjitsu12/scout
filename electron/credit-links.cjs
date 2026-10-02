"use strict";

// These are the fixed source and license pages credited by the installation.
// A URL parameter from a game link cannot become a general OS-browser API.
const CREDIT_URLS = new Set([
  ...["simplicity", "effervescence", "golden-hour", "chasing-daylight", "at-the-end-of-all-things", "the-long-dark", "using-this-music"]
    .map(slug => `https://www.scottbuckley.com.au/library/${slug}/`),
  "https://kenney.nl/assets/rpg-audio",
  "https://kenney.nl/assets/impact-sounds",
  "https://kenney.nl/assets/interface-sounds",
  "https://opengameart.org/content/ambient-bird-sounds",
  "https://creativecommons.org/licenses/by/4.0/",
  "https://creativecommons.org/publicdomain/zero/1.0/",
]);

function creditedURL(value) {
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
    return CREDIT_URLS.has(url.href) ? url.href : null;
  } catch { return null; }
}

function creditWindowHandler(openExternal) {
  return details => {
    const source = creditedURL(details?.url);
    // Credit anchors deliberately use target=_blank. Their fixed public pages
    // open outside the game; no popup or remote renderer window is allowed.
    if (source) void Promise.resolve().then(() => openExternal(source)).catch(() => {});
    return { action: "deny" };
  };
}

module.exports = { creditedURL, creditWindowHandler };
