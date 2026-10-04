import type { SaveSlot } from './desktop.ts';

export const AUTOSAVE_INTERVAL_MS = 150_000;
export type CareerWriteState = 'Saving' | 'Saved' | 'Save interrupted';
type WriteResult = { ok: boolean; error?: string };
type Request = { json: string; promise: Promise<void>; revision: number };

/** Serializes durable checkpoints. Live world snapshots belong in memory. */
export class CareerWriter {
  private tail: Promise<void> = Promise.resolve();
  private committed = new Map<SaveSlot, string>();
  private requests = new Map<SaveSlot, Request>();
  private revision = 0;
  private writeBrowser: (json: string, slot: SaveSlot) => void;
  private writeNative?: (json: string, slot: SaveSlot) => Promise<WriteResult>;
  private onState: (slot: SaveSlot, state: CareerWriteState, error?: Error) => void;

  constructor(options: {
    writeBrowser: (json: string, slot: SaveSlot) => void;
    writeNative?: (json: string, slot: SaveSlot) => Promise<WriteResult>;
    onState: (slot: SaveSlot, state: CareerWriteState, error?: Error) => void;
  }) {
    this.writeBrowser = options.writeBrowser;
    this.writeNative = options.writeNative;
    this.onState = options.onState;
  }

  save(json: string, slot: SaveSlot): Promise<void> {
    const preceding = this.requests.get(slot);
    if (preceding?.json === json) return preceding.promise;
    const revision = ++this.revision;
    // Keep the browser's recovery copy current immediately. A pending native
    // file write must not later overwrite a newer page-close checkpoint.
    let browserFailed = false;
    try { this.writeBrowser(json, slot); } catch { browserFailed = true; }
    this.onState(slot, 'Saving');
    const operation = this.tail.then(async () => {
      if (this.committed.get(slot) === json) return;
      if (this.writeNative) {
        const result = await this.writeNative(json, slot);
        if (!result.ok) throw new Error(result.error || 'Your progress could not be saved. Try again or export a career backup.');
      } else if (browserFailed) {
        throw new Error('Your progress could not be saved. Export a career backup before leaving.');
      }
      this.committed.set(slot, json);
    });
    const reported = operation.then(() => {
      if (this.requests.get(slot)?.revision === revision) this.onState(slot, 'Saved');
    }, failure => {
      const error = failure instanceof Error ? failure : new Error('Your progress could not be saved.');
      if (this.requests.get(slot)?.revision === revision) {
        this.requests.delete(slot);
        this.onState(slot, 'Save interrupted', error);
      }
      throw error;
    });
    this.requests.set(slot, { json, revision, promise: reported });
    // A failed checkpoint must remain retryable and cannot poison later saves.
    this.tail = reported.catch(() => {});
    return reported;
  }
}
