"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const moduleReady = import("../../src/lib/career-writer.ts");
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test("durable writes are serialized and keep the slot captured when each checkpoint was requested", async () => {
  const { CareerWriter } = await moduleReady; const writes = []; let release;
  const writer = new CareerWriter({ writeBrowser: (json, slot) => writes.push(["browser", slot, json]), onState: () => {},
    writeNative: async (json, slot) => { writes.push(["native", slot, json]); if (json === "first") await new Promise(resolve => { release = resolve; }); return { ok: true }; } });
  const first = writer.save("first", 1); const second = writer.save("second", 3);
  await nextTurn(); assert.deepEqual(writes, [["browser", 1, "first"], ["browser", 3, "second"], ["native", 1, "first"]]);
  release(); await Promise.all([first, second]);
  assert.deepEqual(writes, [["browser", 1, "first"], ["browser", 3, "second"], ["native", 1, "first"], ["native", 3, "second"]]);
});

test("identical pending checkpoints share their durable completion rather than double-writing", async () => {
  const { CareerWriter } = await moduleReady; let release, writes = 0; const states = [];
  const writer = new CareerWriter({ writeBrowser: () => {}, onState: (_slot, state) => states.push(state),
    writeNative: () => { writes++; return new Promise(resolve => { release = resolve; }); } });
  const first = writer.save("same-position", 2), second = writer.save("same-position", 2); assert.equal(first, second);
  await nextTurn(); assert.equal(writes, 1); assert.deepEqual(states, ["Saving"]);
  release({ ok: true }); await second; assert.deepEqual(states, ["Saving", "Saved"]);
  await writer.save("same-position", 2); assert.equal(writes, 1);
});

test("a restore queued behind a changed career wins instead of reusing a stale earlier checkpoint", async () => {
  const { CareerWriter } = await moduleReady; const saved = [];
  const writer = new CareerWriter({ writeBrowser: json => saved.push(json), onState: () => {} });
  await Promise.all([writer.save("original", 1), writer.save("changed", 1), writer.save("original", 1)]);
  assert.deepEqual(saved, ["original", "changed", "original"]);
});

test("failed native checkpoints remain retryable and subsequent saves are not blocked by a rejected queue", async () => {
  const { CareerWriter } = await moduleReady; let failing = true; const states = [];
  const writer = new CareerWriter({ writeBrowser: () => {}, onState: (_slot, state) => states.push(state),
    writeNative: async () => failing ? { ok: false, error: "The drive is full." } : { ok: true } });
  await assert.rejects(writer.save("latest", 1), /drive is full/); assert.deepEqual(states, ["Saving", "Save interrupted"]);
  failing = false; await writer.save("latest", 1); assert.deepEqual(states, ["Saving", "Save interrupted", "Saving", "Saved"]);
});

test("a native save remains usable when its browser mirror is unavailable, while browser-only failures stay visible", async () => {
  const { CareerWriter } = await moduleReady; const states = [];
  const native = new CareerWriter({ writeBrowser: () => { throw new Error("Quota exceeded"); }, writeNative: async () => ({ ok: true }), onState: (_slot, state) => states.push(state) });
  await native.save("career", 3); assert.deepEqual(states, ["Saving", "Saved"]);
  const browser = new CareerWriter({ writeBrowser: () => { throw new Error("Quota exceeded"); }, onState: (_slot, state) => states.push(state) });
  await assert.rejects(browser.save("career", 3), /backup before leaving/); assert.equal(states.at(-1), "Save interrupted");
});

test("completion of an older write cannot hide the Saving state of a newer checkpoint", async () => {
  const { CareerWriter } = await moduleReady; const states = []; const releases = [];
  const writer = new CareerWriter({ writeBrowser: () => {}, onState: (_slot, state) => states.push(state),
    writeNative: () => new Promise(resolve => releases.push(resolve)) });
  const first = writer.save("one", 1), second = writer.save("two", 1); await nextTurn();
  releases[0]({ ok: true }); await first; await nextTurn(); assert.deepEqual(states, ["Saving", "Saving"]);
  releases[1]({ ok: true }); await second; assert.deepEqual(states, ["Saving", "Saving", "Saved"]);
});
