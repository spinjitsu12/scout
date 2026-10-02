"use strict";

const path = require("node:path");
const asar = require("@electron/asar");

function listArchiveEntries(bundle) {
  return new Set(asar.listPackage(bundle).map(name =>
    name.replaceAll("\\", "/").replace(/^\/+/, "")));
}

function readArchiveFile(bundle, relative) {
  // ASAR traverses directories using path.sep, so nested reads need host paths.
  return asar.extractFile(bundle, path.normalize(relative));
}

module.exports = { listArchiveEntries, readArchiveFile };
