"use strict";

/** One close request owns the checkpoint, including simultaneous Cmd-Q/close. */
function createExitCheckpoint({ checkpoint, flush, finish, failed }) {
  let pending = null;
  let finished = false;
  const request = () => {
    if (pending) return pending;
    if (finished) return Promise.resolve({ ok: true });
    pending = (async () => {
      try {
        await checkpoint();
        await flush();
        finished = true;
        finish();
        return { ok: true };
      } catch (failure) {
        const error = failure instanceof Error ? failure : new Error('Your latest progress could not be saved.');
        let force = false;
        try { force = Boolean(await failed(error)); }
        catch { /* A failed error dialog must also keep the window open. */ }
        if (force) { finished = true; finish(); }
        return { ok: Boolean(force), error: error.message };
      }
    })().finally(() => { pending = null; });
    return pending;
  };
  return { request };
}

module.exports = { createExitCheckpoint };
