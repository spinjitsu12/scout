"use client";

import { useEffect, useRef, useState } from "react";
import { desktopBridge, type DesktopUpdateStatus } from "@/lib/desktop";
import "./update-panel.css";

/** Subscribe after the local career has opened. Startup checks belong to the main process. */
export function useDesktopUpdateStatus(enabled: boolean) {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  useEffect(() => {
    const desktop = desktopBridge();
    if (!enabled || !desktop?.getUpdateStatus || !desktop.onUpdateStatus) return;
    let mounted = true;
    let receivedEvent = false;
    const unsubscribe = desktop.onUpdateStatus(next => { receivedEvent = true; if (mounted) setStatus(next); });
    void desktop.getUpdateStatus().then(next => { if (mounted && !receivedEvent) setStatus(next); }).catch(() => { /* The local game does not depend on the update service. */ });
    return () => { mounted = false; unsubscribe(); };
  }, [enabled]);
  return { status, setStatus };
}

export function updateLabel(status: DesktopUpdateStatus | null): string {
  if (!status) return "Updates";
  if (status.state === "ready") return "Update ready";
  if (status.state === "available") return "Update available";
  if (status.state === "downloading") return "Downloading update";
  if (status.state === "validating") return "Verifying update";
  return "Updates";
}

const MB = (bytes = 0) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function presentation(status: DesktopUpdateStatus) {
  if (status.state === "checking") return { title: "Checking for updates", detail: "Your game is ready. You can continue playing during the check." };
  if (status.state === "downloading") return { title: `Downloading ${status.availableVersion ? `v${status.availableVersion}` : "update"}`, detail: "Continue your career while the files download in the background." };
  if (status.state === "validating") return { title: "Verifying update files", detail: "Checking the release before it can replace the current game." };
  if (status.state === "installing") return { title: "Preparing a safe restart", detail: "Your career has been saved. The game will reopen when the update is ready." };
  if (status.state === "ready") return { title: `v${status.availableVersion || "Next"} ready to play`, detail: "Install when you are ready. Your scout, car, and career stay on this device." };
  if (status.state === "available") return { title: `v${status.availableVersion || "Next"} available`, detail: "Download now or keep playing your current edition." };
  if (status.state === "offline" || status.connection === "offline") return { title: "Offline play", detail: "The update service is unreachable. Your world, music, and career are available locally." };
  if (!status.repository || status.state === "unconfigured") return { title: "Release channel not connected", detail: "The publisher has not connected this build to a release channel yet. Your game and saves work locally." };
  if (!status.supported || status.state === "unsupported") return { title: "Current edition", detail: "In-game updates are supported by the Windows portable edition. Your career still saves locally." };
  if (status.state === "error") return { title: "Update postponed", detail: status.message || "The update could not finish. Your current game is ready to play." };
  return { title: status.lastCheckedAt ? "You are up to date" : "Startup checks enabled", detail: "Checks run in the background when the game opens. Playing and saving never require a connection." };
}

type Props = {
  status: DesktopUpdateStatus | null;
  onStatus: (status: DesktopUpdateStatus) => void;
  saveBeforeRestart: () => Promise<void>;
  onResume: () => void;
  onRestarting: (restarting: boolean) => void;
};

export default function UpdatePanel({ status, onStatus, saveBeforeRestart, onResume, onRestarting }: Props) {
  const [operation, setOperation] = useState("");
  const [error, setError] = useState("");
  const [repository, setRepository] = useState(status?.repository || "");
  const operationId = useRef(0);
  useEffect(() => { setRepository(status?.repository || ""); }, [status?.repository]);
  const desktop = desktopBridge();
  if (!desktop) return null;

  const perform = async (name: string, action: () => Promise<DesktopUpdateStatus>) => {
    const id = ++operationId.current;
    setOperation(name); setError("");
    try { const next = await action(); if (id === operationId.current) onStatus(next); }
    catch (problem) { if (id === operationId.current) setError(problem instanceof Error ? problem.message : "The update could not finish. You can keep playing."); }
    finally { if (id === operationId.current) setOperation(""); }
  };
  const cancel = async () => {
    ++operationId.current; setOperation(""); setError("");
    try { onStatus(await desktop.cancelUpdate()); } catch { /* A canceled network check never stops the game. */ }
  };
  const restart = async () => {
    setOperation("restart"); setError(""); onRestarting(true);
    try {
      await saveBeforeRestart();
      const result = await desktop.installUpdate();
      if (!result.ok) throw new Error(result.error || "The update could not start. Your current game is still available.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Your career could not be saved. Keep playing or export a backup.");
      setOperation(""); onRestarting(false);
    }
  };
  const activity = status && ["checking", "downloading", "validating"].includes(status.state);
  const busy = activity || !!operation || status?.state === "installing";
  const content = status ? presentation(status) : { title: "Opening update desk", detail: "Your career is saved on this device. Playing does not require an update check." };
  const progress = Math.round(Math.max(0, Math.min(1, status?.progress || 0)) * 100);

  return <section className={`update-desk ${status?.state === "ready" ? "update-desk--ready" : ""}`} aria-label="Game updates">
    <div className="update-desk-top"><span>GAME UPDATES</span><b>{status ? `v${status.currentVersion}` : "SCOUT"}</b></div>
    <div className="update-desk-heading"><span className={`update-signal ${status?.connection === "offline" ? "update-signal--offline" : ""}`} aria-hidden="true">▣</span><div><h3>{content.title}</h3><p>{content.detail}</p></div></div>
    {(status?.state === "downloading" || status?.state === "validating") && <div className="update-progress"><div role="progressbar" aria-label={status.state === "validating" ? "Verifying update" : "Update download"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }}/></div><span>{status.state === "validating" ? "FILES DOWNLOADED · VERIFYING" : `${MB(status.downloadedBytes)} / ${MB(status.totalBytes)} · ${progress}%`}</span></div>}
    {status?.notes && ["available", "downloading", "validating", "ready"].includes(status.state) && <details className="update-notes"><summary>What is new</summary><p>{status.notes}</p></details>}
    {status?.lastResult && status.lastResult.status !== "installed" && <p className="update-last-result">{status.lastResult.message}</p>}
    {error && <p className="update-inline-error" role="status">{error}</p>}
    <div className="update-desk-actions">
      {status?.state === "ready" ? <button className="pixel-button primary" disabled={busy} onClick={() => void restart()}>{operation === "restart" ? "Saving and restarting…" : "Save and restart"}</button> : status?.state === "available" ? <button className="pixel-button primary" disabled={busy} onClick={() => void perform("download", () => desktop.downloadUpdate())}>Download update · {MB(status.totalBytes)}</button> : <button className="pixel-button" disabled={busy || !status?.supported || !status.repository} onClick={() => void perform("check", () => desktop.checkForUpdate())}>{status?.connection === "offline" ? "Try update check" : "Check for updates"}</button>}
      {activity && <button className="pixel-button" onClick={() => void cancel()}>Cancel {status?.state === "checking" ? "check" : "download"}</button>}
      {status?.supported && !busy && <button className="pixel-button update-local" onClick={() => void perform("local", () => desktop.prepareLocalUpdate())}>Use local update file</button>}
    </div>
    {(activity || status?.state === "ready" || status?.state === "available") && <button className="update-continue" disabled={operation === "restart" || status?.state === "installing"} onClick={onResume}>Keep playing <span aria-hidden="true">→</span></button>}
    {status?.supported && status.configurable && <details className="update-channel"><summary>Publisher release channel</summary><p>Connect the public GitHub repository that publishes this game’s releases.</p><form onSubmit={event => { event.preventDefault(); void perform("channel", () => desktop.setUpdateRepository(repository.trim() || null)); }}><label htmlFor="update-repository">GitHub owner/repository</label><div><input id="update-repository" value={repository} disabled={busy} onChange={event => setRepository(event.target.value)} placeholder="owner/scout" spellCheck={false} autoCapitalize="off" autoComplete="off"/><button className="pixel-button" type="submit" disabled={busy}>Connect</button></div></form></details>}
    <div className="update-desk-footer"><span>{status?.repository ? `CHANNEL · ${status.repository}` : "LOCAL CAREER · NO LOGIN REQUIRED"}</span>{status?.lastCheckedAt && <span>CHECKED {new Date(status.lastCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}</div>
  </section>;
}
