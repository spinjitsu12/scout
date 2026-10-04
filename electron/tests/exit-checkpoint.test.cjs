"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createExitCheckpoint } = require("../exit-checkpoint.cjs");
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test("simultaneous native close requests await one live checkpoint and one durable flush", async () => {
  const calls = []; let releaseCheckpoint, releaseFlush;
  const controller = createExitCheckpoint({
    checkpoint: () => { calls.push("checkpoint"); return new Promise(resolve => { releaseCheckpoint = resolve; }); },
    flush: () => { calls.push("flush"); return new Promise(resolve => { releaseFlush = resolve; }); },
    finish: () => calls.push("quit"), failed: () => { throw new Error("Unexpected failure"); },
  });
  const first = controller.request(); const second = controller.request();
  assert.equal(first, second); assert.deepEqual(calls, ["checkpoint"]);
  releaseCheckpoint(); await nextTurn(); assert.deepEqual(calls, ["checkpoint", "flush"]);
  releaseFlush(); assert.deepEqual(await first, { ok: true }); assert.deepEqual(calls, ["checkpoint", "flush", "quit"]);
  assert.deepEqual(await controller.request(), { ok: true }); assert.equal(calls.length, 3);
});

test("a rejected renderer save keeps the game open and a later corrected save can exit", async () => {
  let blocked = true, flushed = 0, quit = 0; const errors = [];
  const controller = createExitCheckpoint({
    checkpoint: async () => { if (blocked) throw new Error("The drive is full."); },
    flush: async () => { flushed++; }, finish: () => { quit++; },
    failed: async error => { errors.push(error.message); return false; },
  });
  assert.deepEqual(await controller.request(), { ok: false, error: "The drive is full." });
  assert.equal(flushed, 0); assert.equal(quit, 0); assert.deepEqual(errors, ["The drive is full."]);
  blocked = false; assert.deepEqual(await controller.request(), { ok: true }); assert.equal(flushed, 1); assert.equal(quit, 1);
});

test("a failed native flush cannot be reported as saved or close the window", async () => {
  let quit = false;
  const controller = createExitCheckpoint({ checkpoint: async () => {}, flush: async () => { throw new Error("File sync failed"); },
    finish: () => { quit = true; }, failed: async () => false });
  assert.deepEqual(await controller.request(), { ok: false, error: "File sync failed" }); assert.equal(quit, false);
});

test("quitting after a failed save requires the player's explicit native choice", async () => {
  let quit = false;
  const controller = createExitCheckpoint({ checkpoint: async () => { throw new Error("Renderer stopped"); }, flush: async () => {},
    finish: () => { quit = true; }, failed: async () => true });
  assert.deepEqual(await controller.request(), { ok: true, error: "Renderer stopped" }); assert.equal(quit, true);
});

test("an error dialog failure leaves the game open and does not poison subsequent close attempts", async () => {
  let attempts = 0, quit = false;
  const controller = createExitCheckpoint({ checkpoint: async () => { if (++attempts === 1) throw new Error("Save interrupted"); },
    flush: async () => {}, finish: () => { quit = true; }, failed: async () => { throw new Error("Dialog unavailable"); } });
  assert.deepEqual(await controller.request(), { ok: false, error: "Save interrupted" }); assert.equal(quit, false);
  assert.deepEqual(await controller.request(), { ok: true }); assert.equal(quit, true);
});
