"use client";

import { useEffect, useRef, useState } from "react";
import { CloudOff, Sparkles } from "lucide-react";
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
  if (status.state === "checking") return { title: "Checking for updates", detail: "Keep exploring while we check." };
  if (status.state === "downloading") return { title: `Downloading ${status.availableVersion ? `v${status.availableVersion}` : "update"}`, detail: "Continue your career while the files download in the background." };
  if (status.state === "validating") return { title: "Getting your update ready", detail: "Almost there. You can keep playing." };
  if (status.state === "installing") return { title: "Preparing a safe restart", detail: "Your career has been saved. The game will reopen when the update is ready." };
  if (status.state === "ready") return { title: `v${status.availableVersion || "Next"} ready to play`, detail: "Restart when you’re ready. Your career comes with you." };
  if (status.state === "available") return { title: `v${status.availableVersion || "Next"} available`, detail: "Download now or keep playing your current edition." };
  if (status.state === "offline" || status.connection === "offline") return { title: "You can keep playing", detail: "Try checking again when you’re connected." };
  if (!status.repository || status.state === "unconfigured") return { title: "Your current edition is ready", detail: "There’s no update available here right now." };
  if ((!status.supported && !status.manualUpdate) || status.state === "unsupported") return { title: "Your current edition", detail: "You’re ready to keep exploring." };
  if (status.state === "error") return { title: "Update postponed", detail: status.message || "The update could not finish. Your current game is ready to play." };
  return { title: status.lastCheckedAt ? "You are up to date" : "Ready for your next outing", detail: "Updates are checked when the game opens." };
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
  const operationId = useRef(0);
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
  const content = status ? presentation(status) : { title: "Checking your edition", detail: "You can return to your journey at any time." };
  const progress = Math.round(Math.max(0, Math.min(1, status?.progress || 0)) * 100);

  return <section className={`update-desk ${status?.state === "ready" ? "update-desk--ready" : ""}`} aria-label="Game updates">
    <div className="update-desk-top"><span>GAME UPDATES</span><b>{status ? `v${status.currentVersion}` : "SCOUT"}</b></div>
    <div className="update-desk-heading"><span className={`update-signal ${status?.connection === "offline" ? "update-signal--offline" : ""}`} aria-hidden="true">{status?.connection==='offline'?<CloudOff size={19}/>:<Sparkles size={19}/>}</span><div><h3>{content.title}</h3><p>{content.detail}</p></div></div>
    {(status?.state === "downloading" || status?.state === "validating") && <div className="update-progress"><div role="progressbar" aria-label={status.state === "validating" ? "Verifying update" : "Update download"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }}/></div><span>{status.state === "validating" ? "FILES DOWNLOADED · VERIFYING" : `${MB(status.downloadedBytes)} / ${MB(status.totalBytes)} · ${progress}%`}</span></div>}
    {status?.notes && ["available", "downloading", "validating", "ready"].includes(status.state) && <details className="update-notes"><summary>What is new</summary><p>{status.notes}</p></details>}
    {status?.lastResult && status.lastResult.status !== "installed" && <p className="update-last-result">{status.lastResult.message}</p>}
    {error && <p className="update-inline-error" role="status">{error}</p>}
    <div className="update-desk-actions">
      {status?.state === "ready" ? <button className="pixel-button primary" disabled={busy} onClick={() => void restart()}>{operation === "restart" ? "Saving and restarting…" : "Save and restart"}</button> : status?.state === "available" ? <button className="pixel-button primary" disabled={busy} onClick={() => void perform("download", () => desktop.downloadUpdate())}>{status.manualUpdate ? "Open Mac download" : "Download update"}{!!status.totalBytes&&` · ${MB(status.totalBytes)}`}</button> : <button className="pixel-button" disabled={busy || !(status?.supported || status?.manualUpdate) || !status.repository} onClick={() => void perform("check", () => desktop.checkForUpdate())}>{status?.connection === "offline" ? "Try update check" : "Check for updates"}</button>}
      {activity && <button className="pixel-button" onClick={() => void cancel()}>Cancel {status?.state === "checking" ? "check" : "download"}</button>}
    </div>
    {(activity || status?.state === "ready" || status?.state === "available") && <button className="update-continue" disabled={operation === "restart" || status?.state === "installing"} onClick={onResume}>Keep playing <span aria-hidden="true">→</span></button>}
    {status?.supported&&<details className="update-channel"><summary>Install a downloaded update</summary><p>Choose an update you’ve already downloaded.</p><button className="pixel-button update-local" disabled={busy} onClick={()=>void perform("local",()=>desktop.prepareLocalUpdate())}>Choose update file</button></details>}
    {status?.manualUpdate && <p className="update-last-result">Quit SCOUT before replacing the app in Applications. Your careers will be ready when you reopen it.</p>}
    {status?.lastCheckedAt && <div className="update-desk-footer"><span>Last checked {new Date(status.lastCheckedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>}
  </section>;
}
