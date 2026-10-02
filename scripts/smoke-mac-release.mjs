import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const plist = require('plist');
const { computeData } = require('app-builder-lib/out/asar/integrity');
const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'release', 'mac-arm64', 'SCOUT.app');
const output = path.join(root, 'qa-mac');

// This fixture runs on a Mac runner. It wraps the real packaged main/preload/UI
// in a private test copy; it never edits the delivered app or a player's saves.
const fixture = String.raw`
"use strict";
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const main = process.env.SCOUT_MAC_SMOKE_MAIN;
const result = process.env.SCOUT_MAC_SMOKE_RESULT;
const problems = [], checks = [];
app.setPath('appData', process.env.SCOUT_MAC_SMOKE_PROFILE);
const updateModule = require(path.join(path.dirname(main), 'mac-updates.cjs'));
const RealUpdates = updateModule.MacUpdateManager;
updateModule.MacUpdateManager = class extends RealUpdates {
  constructor(options) {
    super({ ...options, transport: { fetchJSON: async () => { throw Object.assign(new Error('Offline smoke fixture'), { code: 'ENOTFOUND' }); } },
      openExternal: async () => { throw new Error('The startup check must never open a browser.'); } });
  }
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(action) {
  const start = Date.now();
  while (Date.now() - start < 25000) { if (await action()) return; await delay(100); }
  throw new Error('The native Mac game did not become ready.');
}
async function run(window) {
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  try {
    await until(() => evaluate("!!document.querySelector('.career-slots') && !document.querySelector('.career-setup')?.getAttribute('aria-busy')?.includes('true')"));
    const platform = await evaluate('window.scoutDesktop.platform');
    assert.equal(platform, 'macos-desktop'); checks.push('Native Mac preload and startup UI');
    const slots = await evaluate('window.scoutDesktop.listSaveSlots()');
    assert.equal(slots.length, 3); assert(slots.every(slot => !slot.occupied)); checks.push('Three isolated native save slots');
    const { newGame } = require(path.join(path.dirname(main), 'game-engine.cjs'));
    for (let slot = 1; slot <= 3; slot++) {
      const career = newGame(6100 + slot);
      career.style.name = 'Mac QA ' + slot;
      if (career.story) career.story.phase = 'complete';
      const saved = await evaluate('window.scoutDesktop.saveCareer(' + JSON.stringify(JSON.stringify(career)) + ', ' + slot + ')');
      assert.equal(saved.ok, true);
    }
    for (let slot = 1; slot <= 3; slot++) {
      const saved = JSON.parse(await evaluate('window.scoutDesktop.loadCareer(' + slot + ')'));
      assert.equal(saved.style.name, 'Mac QA ' + slot);
    }
    checks.push('Independent careers write and reload through the real sandbox bridge');
    await evaluate('window.scoutDesktop.setDisplayMode("windowed")');
    assert.equal(await evaluate('window.scoutDesktop.getDisplayMode()'), 'windowed');
    assert.equal(await evaluate('window.scoutDesktop.toggleFullscreen()'), true);
    assert.equal(await evaluate('window.scoutDesktop.toggleFullscreen()'), false);
    assert.equal(await evaluate('window.scoutDesktop.getDisplayMode()'), 'windowed');
    checks.push('Native Mac window/fullscreen transitions restore the prior mode');
    window.webContents.reload();
    await until(() => evaluate("document.querySelector('.career-slot-main')?.textContent.includes('Mac QA 1')"));
    await evaluate("document.querySelector('.career-slot-main').click()");
    await until(() => evaluate("!!document.querySelector('.scout-immersive-shell canvas')"));
    await until(() => evaluate("document.querySelector('.scout-immersive-shell canvas')?.width > 600"));
    const viewport = await evaluate("(() => { const canvas=document.querySelector('.scout-immersive-shell canvas'); const gl=canvas.getContext('webgl2'); return {width:canvas.width,height:canvas.height,webgl:!!gl&&!gl.isContextLost()}; })()");
    assert(viewport.width >= 640 && viewport.height >= 480 && viewport.webgl);
    checks.push('First-person WebGL scene opens at full viewport size');
    await until(() => evaluate('window.scoutDesktop.getUpdateStatus().then(status => status.state === "offline")'));
    checks.push('Offline update check leaves the playable world and local careers available');
    assert.deepEqual(problems, []);
    await window.webContents.capturePage().then(image => fs.writeFile(result.replace(/\.json$/, '.png'), image.toPNG()));
    await fs.writeFile(result, JSON.stringify({ ok:true, platform, checks, viewport, errors:problems }, null, 2));
    await evaluate('window.scoutDesktop.quit()');
  } catch (error) {
    await fs.writeFile(result, JSON.stringify({ ok:false, checks, errors:problems, error:String(error.stack||error) }, null, 2));
    app.exit(1);
  }
}
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('did-fail-load', (_event, code, description) => { if (code !== -3) problems.push(description); });
  window.webContents.on('render-process-gone', (_event, details) => problems.push('Renderer lost: ' + details.reason));
  window.webContents.on('console-message', (_event, details) => { if (details.level === 'error' || details.level === 3) problems.push(details.message); });
  window.once('ready-to-show', () => { void run(window); });
});
require(main);
`;
new Function(fixture); // Validate the generated CJS harness on every host.
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The packaged native smoke check requires an Apple silicon Mac. It is run by the macos-15 GitHub build job.');
}
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-mac-smoke-'));
try {
  await fs.mkdir(output, { recursive: true });
  const profile = path.join(temporary, 'profile'), harness = path.join(temporary, 'harness');
  await fs.mkdir(profile); await fs.mkdir(harness);
  await fs.writeFile(path.join(harness, 'main.cjs'), fixture);
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.writeFile(path.join(harness, 'package.json'), JSON.stringify({ name:'scout-mac-smoke-fixture', version:metadata.version, main:'main.cjs' }));
  const copy = path.join(temporary, 'SCOUT.app');
  await fs.cp(app, copy, { recursive: true, verbatimSymlinks: true });
  await asar.createPackage(harness, path.join(copy, 'Contents', 'Resources', 'app.asar'));
  // A new ASAR belongs to the test copy only; refresh its integrity hash before
  // re-signing so Electron launches this private harness normally.
  const plistFile = path.join(copy, 'Contents', 'Info.plist');
  const testPlist = plist.parse(await fs.readFile(plistFile, 'utf8'));
  const resources = path.join(copy, 'Contents', 'Resources');
  testPlist.ElectronAsarIntegrity = await computeData({resourcesPath:resources,resourcesRelativePath:'Resources',resourcesDestinationPath:resources});
  await fs.writeFile(plistFile, plist.build(testPlist));
  execFileSync('codesign', ['--force', '--sign', '-', '--entitlements', path.join(root,'build','entitlements.mac.plist'), copy], { stdio:'inherit' });
  const result = path.join(output, 'startup.json');
  await fs.rm(result, { force: true });
  const child = spawn(path.join(copy, 'Contents', 'MacOS', 'SCOUT'), ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], {
    stdio:'inherit', env:{ ...process.env, SCOUT_MAC_SMOKE_MAIN:path.join(app,'Contents','Resources','app.asar','electron','main.cjs'),
      SCOUT_MAC_SMOKE_PROFILE:profile, SCOUT_MAC_SMOKE_RESULT:result },
  });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Mac app startup smoke check timed out.')); }, 50000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', value => { clearTimeout(timer); resolve(value); });
  });
  let report;
  try { report = JSON.parse(await fs.readFile(result, 'utf8')); }
  catch { throw new Error(`The native Mac smoke process exited with ${code} before writing its startup report.`); }
  if (code !== 0 || !report.ok) console.error(JSON.stringify(report, null, 2));
  assert.equal(code, 0, 'The native Mac app smoke check failed; see the startup report above.');
  assert.equal(report.ok, true, report.error);
  console.log(`PASS: ${report.checks.length} packaged native Mac startup, save, fullscreen, offline and 3D-rendering checks.`);
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
