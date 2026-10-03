import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const plist = require('plist');
const { computeData } = require('app-builder-lib/out/asar/integrity');
const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'release', 'mac-arm64', 'SCOUT.app');
const output = path.join(root, 'qa-mac');

// Apple silicon uses ANGLE's native Metal renderer. SwiftShader forces a
// Vulkan software device that does not initialize on the Mac CI image.
export const MAC_SMOKE_ARGUMENTS = Object.freeze(['--use-angle=metal']);

// Run inside the actual game's renderer, after its own frame callback. Reading
// within that frame avoids the cleared default framebuffer after compositing;
// a live context alone is not enough to prove that the world was rendered.
export function probeWorldViewport() {
  return new Promise(resolve => requestAnimationFrame(() => {
    const canvas = document.querySelector('.scout-immersive-shell canvas');
    const gl = canvas?.getContext('webgl2');
    const viewport = { width:canvas?.width ?? 0, height:canvas?.height ?? 0,
      webgl:!!gl && !gl.isContextLost(), paintedSamples:0, distinctColors:0 };
    if (!viewport.webgl) return resolve(viewport);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    viewport.renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    viewport.vendor = gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR);
    viewport.version = gl.getParameter(gl.VERSION);
    const pixel = new Uint8Array(4), colors = new Set();
    for (const y of [.2, .4, .6, .8]) for (const x of [.2, .4, .6, .8]) {
      gl.readPixels(Math.floor((gl.drawingBufferWidth-1)*x), Math.floor((gl.drawingBufferHeight-1)*y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[3] && (pixel[0] || pixel[1] || pixel[2])) viewport.paintedSamples++;
      colors.add(Array.from(pixel).join(','));
    }
    viewport.distinctColors = colors.size;
    viewport.glError = gl.getError();
    resolve(viewport);
  }));
}

// Wait for close, rather than deleting the temporary .app while its process is
// still exiting. A timed-out process must terminate before cleanup proceeds.
export function waitForSmokeProcess(child, { timeoutMs=150000, killGraceMs=5000 }={}) {
  return new Promise((resolve, reject) => {
    let timedOut = false, killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
    }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => {
      cleanup();
      if (timedOut) reject(new Error(`Mac app smoke check timed out after ${timeoutMs} ms and was terminated (${signal || code}).`));
      else resolve({ code, signal });
    });
  });
}

// This fixture runs on a Mac runner. It wraps the real packaged main/preload/UI
// in a private test copy; it never edits the delivered app or a player's saves.
export const MAC_SMOKE_FIXTURE = String.raw`
"use strict";
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const main = process.env.SCOUT_MAC_SMOKE_MAIN;
const result = process.env.SCOUT_MAC_SMOKE_RESULT;
const problems = [], checks = [];
let stage = 'Starting the packaged app', viewport;
const probeWorldViewport = ${probeWorldViewport.toString()};
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
async function bounded(action, description, timeoutMs=3000) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(action), new Promise((_resolve,reject) => {
      timer = setTimeout(() => reject(new Error(description + ' timed out.')), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
async function until(description, window, action, timeoutMs=25000) {
  stage = description;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (problems.length) throw new Error(problems.join('\n'));
    if (window.isDestroyed() || window.webContents.isDestroyed()) throw new Error('The native Mac window closed during ' + description + '.');
    if (!window.webContents.isLoadingMainFrame() && await action()) return;
    await delay(100);
  }
  throw new Error('Timed out waiting for ' + description + ' after ' + timeoutMs + ' ms.');
}
async function diagnostics(window) {
  const gpu = {};
  try { gpu.features = app.getGPUFeatureStatus(); } catch (error) { gpu.featuresError = String(error); }
  try { gpu.basic = await bounded(() => app.getGPUInfo('basic'), 'GPU diagnostics'); } catch (error) { gpu.error = String(error); }
  let page;
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    try { page = await bounded(() => window.webContents.executeJavaScript("({ title:document.title, ready:document.readyState, graphicsError:document.querySelector('.immersive-world__error')?.textContent, careerError:document.querySelector('.career-message')?.textContent, canvases:Array.from(document.querySelectorAll('canvas')).map(canvas=>({width:canvas.width,height:canvas.height,className:canvas.className})) })"), 'Page diagnostics'); } catch (error) { page = { error:String(error) }; }
  }
  return { gpu, page };
}
async function run(window) {
  const evaluate = code => window.webContents.executeJavaScript(code, true);
  try {
    await until('the native career menu', window, () => evaluate("!!document.querySelector('.career-slots') && document.querySelector('.career-setup')?.getAttribute('aria-busy') === 'false'"));
    const platform = await evaluate('window.scoutDesktop.platform');
    assert.equal(platform, 'macos-desktop'); checks.push('Native Mac preload and startup UI');
    const slots = await evaluate('window.scoutDesktop.listSaveSlots()');
    assert.equal(slots.length, 3); assert(slots.every(slot => !slot.occupied)); checks.push('Three isolated native save slots');
    const { newGame } = require(path.join(path.dirname(main), 'game-engine.cjs'));
    for (let slot = 1; slot <= 3; slot++) {
      const career = newGame(6100 + slot);
      career.style.name = 'Mac QA ' + slot;
      if (career.story) career.story.phase = 'complete';
      career.briefing = false;
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
    // The saved name can appear before async initialization enables its button.
    // Do not lose the only click by sending it to a disabled slot.
    await until('the saved career button to become enabled', window, () => evaluate("(() => { const button=document.querySelector('.career-slot-main'); return button?.textContent.includes('Mac QA 1') && !button.disabled && document.querySelector('.career-setup')?.getAttribute('aria-busy') === 'false'; })()"));
    await evaluate("(() => { const button=document.querySelector('.career-slot-main'); if(!button || button.disabled)throw new Error('The saved career button is not enabled.'); button.click(); })()");
    await until('the first-person world and its full-size WebGL canvas', window, async () => {
      const state = await evaluate("(() => { const canvas=document.querySelector('.scout-immersive-shell canvas'); return { ready:!!canvas && canvas.width>=640 && canvas.height>=480 && !document.querySelector('.immersive-world__loading'), error:document.querySelector('.immersive-world__error')?.textContent || document.querySelector('.career-message')?.textContent }; })()");
      if (state.error) throw new Error(state.error);
      return state.ready;
    }, 45000);
    viewport = await evaluate('(' + probeWorldViewport.toString() + ')()');
    assert(viewport.width >= 640 && viewport.height >= 480 && viewport.webgl, 'The first-person world must have a live full-size WebGL2 context.');
    assert.equal(viewport.glError, 0, 'The native world framebuffer must be readable without a GL error.');
    assert(viewport.paintedSamples > 0 && viewport.distinctColors > 1, 'The first-person world must render visible scene pixels, not an empty canvas.');
    checks.push('First-person WebGL scene renders visible pixels at full viewport size');
    await until('the offline startup update status', window, () => evaluate('window.scoutDesktop.getUpdateStatus().then(status => status.state === "offline")'));
    checks.push('Offline update check leaves the playable world and local careers available');
    assert.deepEqual(problems, []);
    await bounded(() => window.webContents.capturePage().then(image => fs.writeFile(result.replace(/\.json$/, '.png'), image.toPNG())), 'Startup screenshot', 5000);
    const details = await diagnostics(window);
    assert.deepEqual(problems, []);
    await fs.writeFile(result, JSON.stringify({ ok:true, platform, checks, viewport, errors:problems, diagnostics:details }, null, 2));
    await evaluate('window.scoutDesktop.quit()');
  } catch (error) {
    try {
      const details = await diagnostics(window);
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        try { await bounded(() => window.webContents.capturePage().then(image => fs.writeFile(result.replace(/\.json$/, '.png'), image.toPNG())), 'Failure screenshot', 3000); }
        catch (captureError) { details.screenshotError = String(captureError); }
      }
      await fs.writeFile(result, JSON.stringify({ ok:false, stage, checks, viewport, errors:problems, error:String(error.stack||error), diagnostics:details }, null, 2));
    } finally { app.exit(1); }
  }
}
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => { if (code !== -3 && isMainFrame) problems.push('Page load failed (' + code + '): ' + description); });
  window.webContents.on('preload-error', (_event, _path, error) => problems.push('Preload failed: ' + error));
  window.webContents.on('render-process-gone', (_event, details) => problems.push('Renderer lost: ' + details.reason));
  window.webContents.on('console-message', ({level,message}) => { if (level === 'error') problems.push(message); });
  window.once('ready-to-show', () => { void run(window); });
});
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' && !['clean-exit', 'normal-exit'].includes(details.reason)) problems.push('GPU process lost: ' + details.reason);
});
require(main);
`;
new Function(MAC_SMOKE_FIXTURE); // Validate the generated CJS harness on every host.
async function main() {
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The packaged native smoke check requires an Apple silicon Mac. It is run by the macos-15 GitHub build job.');
}
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scout-mac-smoke-'));
try {
  await fs.mkdir(output, { recursive: true });
  const profile = path.join(temporary, 'profile'), harness = path.join(temporary, 'harness');
  await fs.mkdir(profile); await fs.mkdir(harness);
  await fs.writeFile(path.join(harness, 'main.cjs'), MAC_SMOKE_FIXTURE);
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
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', copy], { stdio:'inherit' });
  const result = path.join(output, 'startup.json');
  await fs.rm(result, { force: true });
  await fs.rm(result.replace(/\.json$/, '.png'), { force: true });
  const child = spawn(path.join(copy, 'Contents', 'MacOS', 'SCOUT'), [...MAC_SMOKE_ARGUMENTS], {
    stdio:'inherit', env:{ ...process.env, SCOUT_MAC_SMOKE_MAIN:path.join(app,'Contents','Resources','app.asar','electron','main.cjs'),
      SCOUT_MAC_SMOKE_PROFILE:profile, SCOUT_MAC_SMOKE_RESULT:result },
  });
  const { code, signal } = await waitForSmokeProcess(child);
  let report;
  try { report = JSON.parse(await fs.readFile(result, 'utf8')); }
  catch { throw new Error(`The native Mac smoke process exited with ${signal || code} before writing its startup report.`); }
  if (code !== 0 || !report.ok) console.error(JSON.stringify(report, null, 2));
  assert.equal(code, 0, 'The native Mac app smoke check failed; see the startup report above.');
  assert.equal(report.ok, true, report.error);
  console.log(`PASS: ${report.checks.length} packaged native Mac startup, save, fullscreen, offline and 3D-rendering checks.`);
} finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

// Importing the helpers lets regression tests exercise the harness on any host;
// running this release command still requires a native Apple silicon Mac.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
