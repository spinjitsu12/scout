"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { spawn, spawnSync } = require("node:child_process");
const vm = require("node:vm");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const smokeFile = path.resolve(__dirname, "../../scripts/smoke-mac-release.mjs");
const support = import(pathToFileURL(smokeFile).href);

function canvasFixture({ blank=false, lost=false }={}) {
  const gl = {
    RGBA:0x1908, UNSIGNED_BYTE:0x1401, RENDERER:0x1F01, VENDOR:0x1F00, VERSION:0x1F02,
    drawingBufferWidth:1280, drawingBufferHeight:720,
    isContextLost:() => lost,
    getExtension:() => ({ UNMASKED_RENDERER_WEBGL:0x9246, UNMASKED_VENDOR_WEBGL:0x9245 }),
    getParameter:parameter => parameter === 0x9246 ? "ANGLE Metal Renderer: Apple M1" : parameter === 0x9245 ? "Apple" : "WebGL 2.0",
    readPixels(x,y,_width,_height,_format,_type,pixel) { pixel.set(blank ? [0,0,0,0] : [x%255,y%255,92,255]); },
    getError:() => 0,
  };
  return { width:1280, height:720, className:"immersive-world__canvas", getContext:type => type === "webgl2" ? gl : null };
}

async function runFixture(options={}) {
  const { MAC_SMOKE_FIXTURE } = await support;
  const app = new EventEmitter(), window = new EventEmitter(), contents = new EventEmitter();
  const careers = new Map(), stats = { clicks:0, disabledReads:0, captures:0, reloads:0, quit:0 };
  const canvas = canvasFixture(options);
  let loaded = false, navigationPolls = 0, consoleListenerArity;
  const button = {
    get textContent() { return careers.size ? "Mac QA 1" : "Begin your story"; },
    get disabled() { stats.disabledReads++; return !!options.initiallyDisabled && stats.disabledReads < 3; },
    click() { assert(!this.disabled, "The harness must never click a disabled save button."); stats.clicks++; loaded=true; },
  };
  const renderer = vm.createContext({
    Uint8Array, Set, Array,
    requestAnimationFrame:callback => queueMicrotask(callback),
    document:{
      title:"SCOUT", readyState:"complete",
      querySelector(selector) {
        if (selector === ".career-slots") return loaded ? null : {};
        if (selector === ".career-setup") return loaded ? null : { getAttribute:() => "false" };
        if (selector === ".career-slot-main") return loaded ? null : button;
        if (selector === ".scout-immersive-shell canvas") return loaded && !options.graphicsError ? canvas : null;
        if (selector === ".immersive-world__error") return loaded && options.graphicsError ? { textContent:options.graphicsError } : null;
        return null;
      },
      querySelectorAll:() => loaded ? [canvas] : [],
    },
    window:{ scoutDesktop:{
      platform:"macos-desktop",
      listSaveSlots:async () => [1,2,3].map(slot => ({slot,occupied:careers.has(slot)})),
      saveCareer:async (raw,slot) => { careers.set(slot,raw); return {ok:true}; },
      loadCareer:async slot => careers.get(slot),
      setDisplayMode:async () => { renderer.window.scoutDesktop.mode="windowed"; return "windowed"; },
      getDisplayMode:async () => renderer.window.scoutDesktop.mode || "borderless",
      toggleFullscreen:async () => { const current=renderer.window.scoutDesktop.mode; renderer.window.scoutDesktop.mode=current === "fullscreen" ? "windowed" : "fullscreen"; return current !== "fullscreen"; },
      getUpdateStatus:async () => ({state:"offline"}),
      quit:async () => { stats.quit++; finish({exitCode:0}); },
    } },
  });
  let report, finish;
  const finished = new Promise(resolve => { finish=resolve; });
  app.setPath=() => {};
  app.getGPUFeatureStatus=() => ({webgl:"enabled",webgl2:"enabled"});
  app.getGPUInfo=async () => ({gpuDevice:[{vendorString:"Apple",deviceString:"M1"}]});
  app.exit=exitCode => finish({exitCode});
  window.isDestroyed=() => false;
  contents.isDestroyed=() => false;
  contents.isLoadingMainFrame=() => navigationPolls-- > 0;
  contents.executeJavaScript=async (code,userGesture) => {
    if (code.includes(".click()")) assert.equal(userGesture,true);
    return vm.runInContext(code,renderer);
  };
  contents.reload=() => { stats.reloads++; navigationPolls=2; };
  contents.capturePage=async () => { stats.captures++; if (options.captureError) throw new Error("Screenshot failed"); return {toPNG:() => Buffer.from("fixture-image")}; };
  window.webContents=contents;
  const mainFile="/fixture/electron/main.cjs";
  const updates={ MacUpdateManager:class {} };
  const engine=require("../game-engine.cjs");
  const context=vm.createContext({
    process:{env:{SCOUT_MAC_SMOKE_MAIN:mainFile,SCOUT_MAC_SMOKE_RESULT:"/fixture/startup.json",SCOUT_MAC_SMOKE_PROFILE:"/fixture/profile"}},
    require(id) {
      if(id === "electron")return {app,BrowserWindow:class {}};
      if(id === "node:fs/promises")return { writeFile:async (file,content) => { if(file.endsWith(".json")) report=JSON.parse(content); } };
      // The fixture always runs on macOS, even when this regression suite runs
      // on Windows. Keep its simulated bundle paths in POSIX form.
      if(id === "node:path")return path.posix;
      if(id === "node:assert/strict")return assert;
      if(id.endsWith("/mac-updates.cjs"))return updates;
      if(id.endsWith("/game-engine.cjs"))return engine;
      if(id === mainFile) {
        app.emit("browser-window-created",{},window);
        const listener=contents.listeners("console-message")[0];
        consoleListenerArity=listener.length;
        if(options.consoleError)contents.emit("console-message",{level:"error",message:options.consoleError});
        if(options.gpuCrash)app.emit("child-process-gone",{},{type:"GPU",reason:"crashed"});
        window.emit("ready-to-show");
        return {};
      }
      throw new Error("Unexpected fixture import: "+id);
    },
    setTimeout:(callback,ms) => setTimeout(callback,Math.min(ms,2)), clearTimeout,
    console,
  });
  vm.runInContext(MAC_SMOKE_FIXTURE,context,{filename:"mac-smoke-fixture.cjs"});
  const {exitCode}=await finished;
  return {report,stats,careers,exitCode,consoleListenerArity};
}

test("native Mac smoke requests Metal without software Vulkan or disabled graphics",async () => {
  const {MAC_SMOKE_ARGUMENTS}=await support;
  assert.deepEqual(MAC_SMOKE_ARGUMENTS,["--use-angle=metal"]);
});

test("the smoke command still rejects execution outside native Apple silicon macOS",{skip:process.platform === "darwin" && process.arch === "arm64"},() => {
  const result=spawnSync(process.execPath,[smokeFile],{encoding:"utf8"});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/requires an Apple silicon Mac/);
});

test("smoke waits for an enabled save slot and verifies real frame pixels",async () => {
  const result=await runFixture({initiallyDisabled:true});
  assert.equal(result.exitCode,0);
  assert.equal(result.report.ok,true);
  assert.equal(result.stats.clicks,1);
  assert(result.stats.disabledReads >= 3);
  assert.equal(result.stats.reloads,1);
  assert.equal(result.stats.quit,1);
  assert.equal(result.careers.size,3);
  for(const raw of result.careers.values())assert.equal(JSON.parse(raw).briefing,false);
  assert.equal(result.report.checks.length,6);
  assert.equal(result.report.viewport.webgl,true);
  assert.equal(result.report.viewport.paintedSamples,16);
  assert(result.report.viewport.distinctColors > 1);
  assert.match(result.report.viewport.renderer,/Metal/);
});

test("a renderer error on the modern console event is a failing smoke check",async () => {
  const result=await runFixture({consoleError:"WebGL initialization failed"});
  assert.equal(result.consoleListenerArity,1);
  assert.equal(result.exitCode,1);
  assert.equal(result.report.ok,false);
  assert.deepEqual(result.report.errors,["WebGL initialization failed"]);
  assert.match(result.report.error,/WebGL initialization failed/);
});

test("a lost GPU or game graphics error cannot become a successful smoke result",async () => {
  for(const options of [{gpuCrash:true},{graphicsError:"The 3D renderer could not start."}]) {
    const result=await runFixture(options);
    assert.equal(result.exitCode,1);
    assert.equal(result.report.ok,false);
    assert.match(result.report.error,/GPU process lost|3D renderer could not start/);
    assert(result.report.diagnostics.gpu);
    assert.equal(result.stats.quit,0);
  }
});

test("an empty or lost WebGL world fails even when a full-size canvas exists",async () => {
  for(const options of [{blank:true},{lost:true}]) {
    const result=await runFixture(options);
    assert.equal(result.exitCode,1);
    assert.equal(result.report.ok,false);
    assert.match(result.report.error,/visible scene pixels|live full-size WebGL2/);
    assert.equal(result.report.checks.length,4);
  }
});

test("a failed screenshot cannot erase the renderer error and startup report",async () => {
  const result=await runFixture({consoleError:"WebGL initialization failed",captureError:true});
  assert.equal(result.exitCode,1);
  assert.equal(result.report.ok,false);
  assert.match(result.report.error,/WebGL initialization failed/);
  assert.match(result.report.diagnostics.screenshotError,/Screenshot failed/);
});

test("process wait returns nonzero exit status without treating it as success",async () => {
  const {waitForSmokeProcess}=await support;
  const result=await waitForSmokeProcess(spawn(process.execPath,["-e","process.exit(7)"],{stdio:"ignore"}),{timeoutMs:5000});
  assert.equal(result.code,7);
  assert.equal(result.signal,null);
});

test("process wait terminates a hanging app before rejecting and allowing cleanup",async () => {
  const {waitForSmokeProcess}=await support;
  const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});
  let closed=false;
  child.once("close",() => {closed=true;});
  await assert.rejects(waitForSmokeProcess(child,{timeoutMs:40,killGraceMs:30}),/timed out.*was terminated/);
  assert.equal(closed,true);
});

test("process wait escalates when a hung app ignores the termination request",async () => {
  const {waitForSmokeProcess}=await support;
  const child=new EventEmitter(), signals=[];
  child.kill=signal => {
    signals.push(signal);
    if(signal === "SIGKILL")queueMicrotask(() => child.emit("close",null,signal));
    return true;
  };
  await assert.rejects(waitForSmokeProcess(child,{timeoutMs:10,killGraceMs:10}),/timed out.*SIGKILL/);
  assert.deepEqual(signals,["SIGTERM","SIGKILL"]);
});

test("process launch errors propagate without waiting for the whole startup deadline",async () => {
  const {waitForSmokeProcess}=await support;
  const child=spawn(path.join(__dirname,"no-such-smoke-executable"),[],{stdio:"ignore"});
  await assert.rejects(waitForSmokeProcess(child,{timeoutMs:5000}),{code:"ENOENT"});
});
