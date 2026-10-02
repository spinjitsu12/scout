"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import World from "@/components/game/World";
import RoadWorld from "@/components/game/RoadWorld";
import CustomizationPanel from "@/components/game/CustomizationPanel";
import AudioSettings from "@/components/game/AudioSettings";
import Prologue from "@/components/game/Prologue";
import UpdatePanel, { useDesktopUpdateStatus, updateLabel } from "@/components/game/UpdatePanel";
import GameplayPanels from "@/components/game/GameplayPanels";
import PixelCharacter from "@/components/game/PixelCharacter";
import { scoutAudio } from "@/lib/audio";
import { act, newGame, validGame, normalizeGame, TIERS, members, money, goalProgress, canPrestige, weeklyActions, type Game, type Action } from "@/lib/game";
import { fieldOf, styleOf, candidateLocation, locationOf } from "@/lib/expedition";
import { desktopBridge, localSaveLabel } from "@/lib/desktop";
import { RADIO_TRACKS } from "@/lib/radio-score";
import type { GamePanel, WorldTarget } from "@/lib/game-ui";

const SAVE_KEY = "scout-pixel-career-v1";
const BACKUP_KEY = "scout-pixel-career-backup";
type Notice = { text: string; tone: "good" | "bad" };

export default function ScoutGame() {
  const [game, setGame] = useState<Game | null>(null);
  const current = useRef<Game | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("Loading");
  const [panel, setPanel] = useState<GamePanel>(null);
  const [journal, setJournal] = useState(false);
  const [settings, setSettings] = useState(false);
  const [customization, setCustomization] = useState(false);
  const [soundSettings, setSoundSettings] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [quitError, setQuitError] = useState("");
  const [quitting, setQuitting] = useState(false);
  const [questExpanded, setQuestExpanded] = useState(true);
  const [journalFilter, setJournalFilter] = useState<"available" | "hired" | "starred">("available");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [audioStatus, setAudioStatus] = useState(scoutAudio.getStatus);
  const importInput = useRef<HTMLInputElement>(null);
  const nativeSave = useRef("");
  const saveRevision = useRef(0);
  const updates = useDesktopUpdateStatus(!!game);
  const inPrologue = !!game?.story && game.story.phase !== "complete";
  const scenePaused = !!panel || journal || settings || customization || soundSettings || restarting || quitting || (!inPrologue && (!!game?.briefing || !!game?.report));

  const showPause = useCallback(() => {
    window.dispatchEvent(new Event("scout:flush-field"));
    setPanel(null); setJournal(false); setCustomization(false); setSoundSettings(false); setSettings(true); setQuitError("");
  }, []);

  const persistCareer = useCallback((next: Game) => {
    try {
      const raw = JSON.stringify(next);
      const previous = localStorage.getItem(SAVE_KEY);
      if (previous !== raw) {
        if (previous) { try { if (validGame(JSON.parse(previous))) localStorage.setItem(BACKUP_KEY, previous); } catch { /* A restored career replaces an unreadable save. */ } }
        localStorage.setItem(SAVE_KEY, raw);
      }
      if (!desktopBridge()) setSaveStatus("Saved");
    } catch { if (!desktopBridge()) setSaveStatus("Save interrupted"); }
    const desktop = desktopBridge();
    if (desktop) {
      const raw = JSON.stringify(next);
      if (nativeSave.current === raw) return;
      nativeSave.current = raw;
      const revision = ++saveRevision.current;
      setSaveStatus("Saving");
      void desktop.saveCareer(raw).then(result => {
        if (revision !== saveRevision.current) return;
        setSaveStatus(result.ok ? "Saved" : "Save interrupted");
        if (!result.ok) nativeSave.current = "";
      }).catch(() => { if (revision === saveRevision.current) { setSaveStatus("Save interrupted"); nativeSave.current = ""; } });
    }
  }, []);

  const saveBeforeRestart = useCallback(async () => {
    // RoadWorld publishes its live car/player position synchronously here.
    window.dispatchEvent(new Event("scout:flush-field"));
    const latest = current.current;
    if (!latest) throw new Error("Your career is still opening. Try again when the scene is ready.");
    persistCareer(latest);
    const desktop = desktopBridge();
    if (!desktop) return;
    const raw = JSON.stringify(latest);
    const revision = ++saveRevision.current;
    setSaveStatus("Saving");
    try {
      // Await an explicit final write, even when an autosave already queued the same state.
      const result = await desktop.saveCareer(raw);
      if (!result.ok) throw new Error(result.error || "Your career could not be saved. Export a backup before restarting.");
      nativeSave.current = raw;
      if (revision === saveRevision.current) setSaveStatus("Saved");
    } catch (error) {
      if (revision === saveRevision.current) { setSaveStatus("Save interrupted"); nativeSave.current = ""; }
      throw error;
    }
  }, [persistCareer]);

  const loadCareer = useCallback(async () => {
    try {
      const desktop = desktopBridge();
      const raw = desktop ? await desktop.loadCareer() : localStorage.getItem(SAVE_KEY);
      const state: unknown = raw ? JSON.parse(raw) : null;
      if (raw && !validGame(state)) throw new Error("Your save could not be read. Import a saved career or restore the previous save.");
      const next = validGame(state) ? normalizeGame(state) : newGame();
      current.current = next; setGame(next); setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Your saved career could not be loaded.");
    }
  }, []);
  useEffect(() => { loadCareer(); setQuestExpanded(window.innerWidth >= 1050); }, [loadCareer]);
  useEffect(() => {
    const desktop = desktopBridge();
    if (!game || !desktop?.confirmReady) return;
    // A valid local career and painted scene acknowledge a successful launch.
    const frame = requestAnimationFrame(() => { void desktop.confirmReady?.().catch(() => { /* A normal launch has no pending update handshake. */ }); });
    return () => cancelAnimationFrame(frame);
  }, [!!game]);
  useEffect(() => {
    if (!game) return;
    persistCareer(game);
  }, [game, persistCareer]);
  useEffect(() => {
    const desktop = desktopBridge();
    if (!desktop) return;
    return desktop.onBeforeClose(async () => { if (current.current) await saveBeforeRestart(); });
  }, [saveBeforeRestart]);
  useEffect(() => scoutAudio.subscribe(status => setAudioStatus(status)), []);
  useEffect(() => { scoutAudio.setRadioTracks(RADIO_TRACKS); }, []);
  useEffect(() => {
    if (!game) return;
    const style = styleOf(game), field = fieldOf(game);
    scoutAudio.setTier(game.tier);
    scoutAudio.setMusicEnabled(style.music !== false);
    scoutAudio.setSoundEnabled(style.sound !== false);
    scoutAudio.setEngineEnabled(style.engine !== false);
    scoutAudio.setRadio(!!style.radio, style.station || 0);
    scoutAudio.setEngineKind(game.story && game.story.phase !== "complete" && game.story.phase !== "wake" ? "luxury" : style.car === "coupe" ? "coupe" : "standard");
    scoutAudio.setInVehicle(game.story?.phase === "sky" || game.story?.phase === "cruise" || (field.scene === "district" && field.driving));
  }, [game?.tier, game?.style, game?.field?.scene, game?.field?.driving, game?.story?.phase]);
  useEffect(() => { scoutAudio.setSuspended(scenePaused); }, [scenePaused]);
  useEffect(() => () => { scoutAudio.setSuspended(false); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape" && !event.repeat) {
        // Existing dialogs handle their own Escape key; a second menu must not open.
        if (document.querySelector('[role="dialog"][data-state="open"], [role="dialog"]:not([data-state])')) return;
        if (restarting || quitting) return;
        event.preventDefault(); showPause(); return;
      }
      if (current.current?.story && current.current.story.phase !== "complete") return;
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[role=dialog]")) return;
      if (event.key.toLowerCase() === "j" && !event.repeat) { window.dispatchEvent(new Event("scout:flush-field")); setJournal(value => !value); setPanel(null); setSettings(false); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [showPause, restarting, quitting]);

  const run = useCallback((action: Action, throwing = false): boolean => {
    const original = current.current;
    if (!original) return false;
    try {
      const next = act(original, action);
      current.current = next; setGame(next); persistCareer(next);
      if (action.type === "prestige" || action.type === "repeat") { setPanel(null); setFocusId(null); setJournal(false); }
      if (action.type === "briefing" && !scoutAudio.getStatus().started) void scoutAudio.start(next.tier);
      if (action.type === "offer") scoutAudio.sfx(next.report?.success ? "recruit" : "error");
      else if (action.type === "mission") scoutAudio.sfx(next.report?.success ? "success" : "error");
      else if (action.type === "prestige") scoutAudio.sfx("prestige");
      else if (action.type === "nextWeek") scoutAudio.sfx("week");
      else if (action.type === "mentor") { scoutAudio.sfx("success"); setNotice({ text: "Mentoring complete. Skills and morale improved.", tone: "good" }); }
      else if (action.type === "cover") { scoutAudio.sfx("success"); setNotice({ text: "Cover secured. Exposure reduced by 25.", tone: "good" }); }
      else if (action.type === "customize") { scoutAudio.sfx("paint"); setNotice({ text: "Your scout and vehicle are ready. Changes saved.", tone: "good" }); }
      else if (action.type === "refuel") { setNotice({text:`Tank topped up: ${(fieldOf(next).fuel-fieldOf(original).fuel).toFixed(1)} gal · $${(original.cash-next.cash).toFixed(2)}`,tone:"good"}); }
      else if (action.type === "roadside") { scoutAudio.sfx("arrival"); setNotice({text:"Roadside assistance brought your car to Highway Fuel. Visit the pump to refill.",tone:"good"}); }
      else if (!["dismissReport", "star", "fieldSnapshot", "setDestination", "meet", "fieldEnter", "fieldReturn", "preferences", "story"].includes(action.type)) scoutAudio.sfx("interact");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "That action could not be completed.";
      if (throwing) throw new Error(message);
      setNotice({ text: message, tone: "bad" }); scoutAudio.sfx("error"); return false;
    }
  }, [persistCareer]);

  const interact = useCallback((target: WorldTarget) => {
    setJournal(false); setSettings(false); setFocusId(null);
    if (target.kind === "station" && target.station === "garage") { run({ type: "fieldEnter" }); setPanel(null); return; }
    setPanel(target.kind === "candidate" ? { kind: "candidate", id: target.id } : { kind: target.station as Exclude<Extract<GamePanel, { kind: string }>['kind'], "candidate" | "venue"> });
  }, [run]);
  const open = useCallback((next: GamePanel) => { setPanel(next); setJournal(false); setSettings(false); scoutAudio.sfx("interact"); }, []);

  const travel = useCallback((source: number) => {
    if (!current.current) return;
    setPanel(null); setJournal(false); setSettings(false); setFocusId(null);
    if (fieldOf(current.current).scene === "office" && !run({ type: "fieldEnter" })) return;
    run({ type: "setDestination", destination: source + 1 });
    setQuestExpanded(false);
  }, [run]);
  const findCandidate = useCallback((id: string) => {
    if (!current.current) return;
    const person = current.current.candidates.find(candidate => candidate.id === id);
    if (!person) return;
    if (person.status === "hired") { open({ kind: "candidate", id }); return; }
    travel(candidateLocation(id) - 1); setFocusId(id);
  }, [travel, open]);

  async function exportCareer() {
    window.dispatchEvent(new Event("scout:flush-field"));
    if (!current.current) return;
    const desktop = desktopBridge();
    if (desktop) {
      try {
        const result = await desktop.exportCareer(JSON.stringify(current.current, null, 2));
        if (result.canceled) return;
        setNotice({text:result.ok ? "Career backup exported." : result.error || "Unable to export this career.",tone:result.ok ? "good" : "bad"});
      } catch { setNotice({text:"Unable to export this career.",tone:"bad"}); }
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "scout-career.json"; link.click(); URL.revokeObjectURL(url);
    setNotice({ text: "Career exported. Keep the file to move your save between devices.", tone: "good" });
  }
  async function importCareer(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Choose a SCOUT career file smaller than 1 MB.");
      const next: unknown = JSON.parse(await file.text());
      if (!validGame(next)) throw new Error("This file is not a valid SCOUT career.");
      if (current.current && !window.confirm("Replace your current career with this save?")) return;
      const restored = normalizeGame(next);
      current.current = restored; setGame(restored); persistCareer(restored); setLoadError(""); setPanel(null); setJournal(false); setSettings(false); setCustomization(false); setSoundSettings(false); setFocusId(null);
      setNotice({ text: "Career restored. Welcome back, scout.", tone: "good" });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "Unable to read this save.", tone: "bad" }); }
    if (importInput.current) importInput.current.value = "";
  }
  async function requestImport() {
    const desktop = desktopBridge();
    if (!desktop) { importInput.current?.click(); return; }
    try {
      const raw = await desktop.importCareer();
      if (raw !== null) await importCareer(new File([raw],"scout-career.json",{type:"application/json"}));
    } catch { setNotice({text:"Unable to open this career file.",tone:"bad"}); }
  }
  async function restoreBackup() {
    try {
      const desktop = desktopBridge();
      const raw = desktop ? await desktop.loadBackup() : localStorage.getItem(BACKUP_KEY);
      const next: unknown = JSON.parse(raw || "null");
      if (!validGame(next)) throw new Error("No readable previous save was found.");
      const restored = normalizeGame(next);
      current.current = restored; setGame(restored); persistCareer(restored); setLoadError("");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Previous save unavailable."); }
  }
  async function toggleMusic() {
    if (!game) return;
    const enabled = !styleOf(game).music;
    run({type:"preferences",music:enabled});
    scoutAudio.setMusicEnabled(enabled);
    if (enabled) { scoutAudio.setMuted(false); if (!scoutAudio.getStatus().started) await scoutAudio.start(game.tier); }
  }
  async function saveAndQuit() {
    const desktop = desktopBridge();
    if (!desktop) return;
    setQuitting(true); setQuitError("");
    try { await saveBeforeRestart(); await desktop.quit(); }
    catch (error) { setQuitError(error instanceof Error ? error.message : "Your career could not be saved. Export a backup before quitting."); setQuitting(false); }
  }
  const fileInput = <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={event => void importCareer(event.target.files?.[0])} />;

  if (!game) return <main className="game-loading"><div className="loading-emblem">S</div><h1>SCOUT</h1><p>{loadError || "Opening the office…"}</p>{loadError ? <div className="loading-actions"><button className="pixel-button" onClick={loadCareer}>Retry loading</button><button className="pixel-button" onClick={restoreBackup}>Restore previous save</button><button className="pixel-button" onClick={() => void requestImport()}>Import career</button></div> : <div className="loading-blocks" aria-label="Loading"><i/><i/><i/></div>}{fileInput}{notice && <p role="alert">{notice.text}</p>}</main>;


  const g = game, t = TIERS[g.tier], team = members(g), field = fieldOf(g), style = styleOf(g);
  const localStatus = localSaveLabel(saveStatus, updates.status);
  const updateNotice = updates.status && ["checking", "available", "downloading", "validating", "ready"].includes(updates.status.state);
  const saveIndicator = <div className={`game-save-status ${saveStatus === "Save interrupted" ? "save-warning" : ""} ${updates.status?.connection === "offline" ? "game-save-status--offline" : ""}`} role="status"><span aria-hidden="true">{saveStatus === "Saved" ? "▣" : saveStatus === "Saving" ? "·" : "!"}</span> {localStatus}{saveStatus === "Save interrupted" && <button onClick={exportCareer}>Export save</button>}{updateNotice && <button className={`save-update-link ${updates.status?.state === "ready" ? "save-update-link--ready" : ""}`} onClick={showPause}>{updateLabel(updates.status)}</button>}</div>;
  const sharedMenus = <>
    {customization && <CustomizationPanel game={g} run={run} onClose={() => setCustomization(false)}/>} {soundSettings && <AudioSettings game={g} run={run} onClose={() => setSoundSettings(false)}/>}
    <Dialog open={settings} onOpenChange={value => { if (!restarting && !quitting) setSettings(value); }}><DialogContent className="pause-desk pixel-game-modal" showCloseButton={!restarting && !quitting} onEscapeKeyDown={event => { if (restarting || quitting) event.preventDefault(); }} onInteractOutside={event => { if (restarting || quitting) event.preventDefault(); }}>
      <div className="pause-window-bar"><span>SCOUT / CAREER DESK</span><b>{inPrologue ? "PROLOGUE" : `CHAPTER ${t.number}`}</b></div>
      <div className="pause-body">
        <aside className="pause-profile">
          <DialogHeader><span className="game-eyebrow">TAKE A BREATHER</span><DialogTitle>Game paused</DialogTitle><DialogDescription>Your world waits here. Make yourself comfortable, then get back to scouting.</DialogDescription></DialogHeader>
          <div className="pause-player"><PixelCharacter index={style.avatar} size={72}/><span><b>{style.name}</b><small>{inPrologue ? "A career in the making" : ["Talent scout", "Senior scout", "Field director"][g.tier]}</small></span></div>
          <div className="pause-location"><span>{inPrologue ? "Your story" : field.scene === "district" ? "Out in the district" : "At headquarters"}</span><b>Week {String(g.week).padStart(2,"0")}</b></div>
          <nav className="pause-actions" aria-label="Pause menu">
            <button className="pixel-button primary" disabled={restarting || quitting} onClick={() => setSettings(false)}>Resume game <kbd>ESC</kbd></button>
            <button className="pixel-button" disabled={restarting || quitting} onClick={() => { setSettings(false); setSoundSettings(true); }}>Radio & sound <span aria-hidden="true">♫</span></button>
            <button className="pixel-button" disabled={restarting || quitting} onClick={() => { setSettings(false); setCustomization(true); }}>Customize scout & car <span aria-hidden="true">♢</span></button>
            {!inPrologue && <button className="pixel-button" disabled={restarting || quitting} onClick={() => open({kind:"help"})}>Controls & field guide <span aria-hidden="true">?</span></button>}
            {(desktopBridge() || document.fullscreenEnabled) && <button className="pixel-button" disabled={restarting || quitting} onClick={() => { const desktop=desktopBridge(); if(desktop) void desktop.toggleFullscreen().catch(() => setQuitError("Fullscreen is unavailable.")); else void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => setQuitError("Fullscreen is unavailable.")); }}>Toggle fullscreen <span aria-hidden="true">▣</span></button>}
            {desktopBridge() && <button className="pixel-button" disabled={restarting || quitting} onClick={() => void saveAndQuit()}>{quitting ? "Saving career…" : "Save and quit"} <span aria-hidden="true">↗</span></button>}
          </nav>
          {quitError && <p className="pause-error" role="status">{quitError}</p>}
        </aside>
        <div className="pause-main">
          <section className="pause-save-card" aria-label="Career saves"><div className="pause-section-title"><span>YOUR CAREER</span><b>LOCAL SAVE</b></div><h3>{localStatus}</h3><p>Your story, recruits, vehicle, fuel, and customization save automatically on this device. Updates keep this career. Export a backup to move it to another device.</p><div className="pause-save-actions"><button className="pixel-button" disabled={restarting || quitting} onClick={exportCareer}>Export backup</button><button className="pixel-button" disabled={restarting || quitting} onClick={() => void requestImport()}>Import career</button></div></section>
          <UpdatePanel status={updates.status} onStatus={updates.setStatus} saveBeforeRestart={saveBeforeRestart} onResume={() => setSettings(false)} onRestarting={setRestarting}/>
        </div>
      </div>
      <div className="pause-footer"><span>{inPrologue ? "YOUR STORY WAITS" : "WORLD PAUSED"} · {localStatus.toUpperCase()}</span><span>ESC · RETURN TO GAME</span></div>
    </DialogContent></Dialog>
    {fileInput}
  </>;
  if (g.story && g.story.phase !== "complete") return <main className="prologue-shell"><Prologue paused={scenePaused} state={g.story} style={style} onChange={state => run({type:"story",state})} onComplete={() => run({type:"story",state:{phase:"complete",choice:current.current?.story?.choice || null}})}/><button className="pixel-button prologue-menu-button" aria-label="Pause story and open game settings" onClick={showPause}>Menu <kbd>ESC</kbd></button>{saveIndicator}{sharedMenus}{notice && <div className={`game-notice ${notice.tone}`} role="status"><p>{notice.text}</p><button aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}</main>;
  const available = g.candidates.filter(c => c.discovered && c.status === "available");
  const paused = scenePaused;
  const journalPeople = journalFilter === "hired" ? team : journalFilter === "starred" ? available.filter(c => c.starred) : available;
  const earlyTarget = available.find(c => !c.tested.includes("interview")) || available[0];
  let nextHint = "Find people. Follow the evidence.";
  let nextLabel = "Meet a candidate";
  let nextAction = () => { if (earlyTarget) findCandidate(earlyTarget.id); else open({ kind: "sources" }); };
  if (g.won) { nextHint = "Director clearance earned. The impossible is yours."; nextLabel = "Your career"; nextAction = () => open({ kind: "career" }); }
  else if (canPrestige(g)) { nextHint = "Mandate complete. Your next organization is waiting."; nextLabel = "Visit the director"; nextAction = () => open({ kind: "career" }); }
  else if (g.actions === 0) { nextHint = "Your time is used. Close the week to keep scouting."; nextLabel = "Begin next week"; nextAction = () => open({ kind: "week" }); }
  else if (team.length >= 2 && !g.missionThisWeek) { nextHint = "Put your recruits to the test at the project table."; nextLabel = "Choose a project"; nextAction = () => open({ kind: "missions" }); }
  else if (team.length < t.goals.hires) { nextHint = earlyTarget ? `${earlyTarget.name.split(" ")[0]} is at ${locationOf(g, earlyTarget.id).name}. Take your car and meet them.` : "Set a route to find new leads."; nextLabel = "Set scouting route"; }
  else if (g.missionThisWeek) { nextHint = "A project is done. Investigate, mentor, or start the next week."; nextLabel = "Close this week"; nextAction = () => open({ kind: "week" }); }
  else { nextHint = "Successful projects earn the reputation you need to advance."; nextLabel = "Visit the project table"; nextAction = () => open({ kind: "missions" }); }

  return <main className={`game-shell stage-${g.tier} scene-${field.scene}`} style={{ "--stage-accent": t.accent } as CSSProperties}>
    <div className="game-world-slot">{field.scene === "district" ? <RoadWorld game={g} paused={paused} run={run} onCandidate={id => { setFocusId(null); open({kind:"candidate",id}); }} onVenue={source => open({kind:"venue",source})} onOffice={() => { run({type:"fieldReturn"}); setFocusId(null); }} focusId={focusId}/> : <World game={g} paused={paused} onInteract={interact} officeOnly/>}</div>
    <header className="game-top-hud">
      <div className="hud-brand pixel-panel"><b>SCOUT</b><span>{t.employer}</span><small>CHAPTER {t.number}</small></div>
      <div className="hud-resources pixel-panel">
        <div className="hud-money"><span className="pixel-coin" aria-hidden="true">$</span><span><small>Budget</small><b>{money(g.cash)}</b></span></div>
        <div className="hud-reputation"><span className="pixel-star" aria-hidden="true">★</span><span><small>Reputation</small><b>{g.reputation}<em>/100</em></b></span></div>
        <div className="hud-time"><small>Time this week</small><div className="action-blocks" aria-label={`${g.actions} of ${weeklyActions(g)} actions remaining`}>{Array.from({length: weeklyActions(g)}, (_, i) => <i key={i} className={i < g.actions ? "filled" : ""}/>)}</div><span>{g.actions} actions left</span></div>
      </div>
      <div className="hud-utilities"><button className={`pixel-button audio-toggle ${audioStatus.playing ? "audio-on" : ""}`} onClick={() => void toggleMusic()} aria-label={style.music ? "Disable background music" : "Enable background music"}><span aria-hidden="true">♪</span><span>{style.music ? "Music on" : "Music off"}</span></button><button className="pixel-button sound-desk" aria-label="Radio and sound settings" onClick={() => { setSoundSettings(true); setPanel(null); setJournal(false); setSettings(false); }}><span>♫</span><span>Sound</span></button><button className="pixel-button icon-control" aria-label="Customize scout and vehicle" onClick={() => { setCustomization(true); setPanel(null); setJournal(false); setSettings(false); }}>♢</button><button className="pixel-button icon-control" aria-label="Pause game and open settings" onClick={showPause}>☷</button><button className="pixel-button icon-control" aria-label="How to play" onClick={() => open({ kind: "help" })}>?</button></div>
    </header>
    <aside className={`quest-hud pixel-panel ${questExpanded ? "expanded" : "collapsed"}`}><button className="quest-kicker" aria-label={questExpanded ? "Collapse mandate" : "Expand mandate"} aria-expanded={questExpanded} onClick={() => setQuestExpanded(value => !value)}><span>YOUR MANDATE</span><b>{Math.round(goalProgress(g))}% {questExpanded ? "−" : "+"}</b></button><div className="quest-progress"><i style={{width: `${goalProgress(g)}%`}}/></div><div className="quest-objectives"><span className={team.length >= t.goals.hires ? "done" : ""}>▣ Team <b>{team.length}/{t.goals.hires}</b></span><span className={g.completed >= t.goals.missions ? "done" : ""}>▣ Projects <b>{g.completed}/{t.goals.missions}</b></span><span className={g.reputation >= t.goals.reputation ? "done" : ""}>▣ Reputation <b>{g.reputation}/{t.goals.reputation}</b></span></div>{g.tier === 2 && <div className={`quest-exposure ${g.exposure >= 60 ? "danger" : ""}`}>Exposure <b>{g.exposure}/100</b><span>Keep below 60</span></div>}<p>{nextHint}</p><button className="quest-action" onClick={nextAction}>{nextLabel}</button></aside>
    <div className="week-hud pixel-panel"><span>WEEK</span><b>{String(g.week).padStart(2,"0")}</b><small>{g.missionThisWeek ? "Project complete" : "Office open"}</small></div>
    <div className="game-bottom-hud">
      <div className="scout-id pixel-panel"><PixelCharacter index={style.avatar} size={62}/><span><b>{style.name}</b><small>{["Talent scout", "Senior scout", "Field director"][g.tier]}</small></span></div>
      <nav className="game-hotbar pixel-panel" aria-label="Game menus"><button onClick={() => { setJournal(true); setPanel(null); setSettings(false); }}><span>▤</span><b>Fieldbook</b><kbd>J</kbd></button><button onClick={() => open({ kind: "sources" })}><span>⌖</span><b>Routes</b></button><button className="garage-hotkey" onClick={() => { if (field.scene === "office") { run({type:"fieldEnter"}); setFocusId(null); setPanel(null); setJournal(false); setSettings(false); setQuestExpanded(false); } else open({kind:"sources"}); }}><span>▰</span><b>{field.scene === "office" ? "Garage" : "Map"}</b></button><button onClick={() => open({ kind: "team" })}><span>♟</span><b>Team</b><i>{team.length}/5</i></button><button onClick={() => open({ kind: "missions" })}><span>▣</span><b>Projects</b></button><button className={canPrestige(g) ? "ready" : ""} onClick={() => open({ kind: "career" })}><span>★</span><b>Career</b></button></nav>
      <button className={`pixel-button end-week ${g.actions === 0 ? "ready" : ""}`} onClick={() => open({ kind: "week" })}><span>◷</span><b>Next week</b></button>
    </div>
    <div className="game-control-tip">{field.scene === "district" ? "WASD / arrows to drive or walk · E to enter, park, or talk · Fuel at the gas station · ESC pause" : "WASD / arrows to walk · E to interact · Visit the garage to scout · ESC pause"}</div>
    {saveIndicator}
    {notice && <div className={`game-notice ${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}><span>{notice.tone === "bad" ? "!" : "✓"}</span><p>{notice.text}</p><button aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}
    <GameplayPanels game={g} panel={panel} onClose={() => setPanel(null)} onOpen={open} run={run} onTravel={travel} onFindCandidate={findCandidate}/>
    <Dialog open={journal} onOpenChange={setJournal}><DialogContent className="fieldbook-modal pixel-game-modal"><DialogHeader><span className="game-eyebrow">YOUR SCOUTING JOURNAL</span><DialogTitle>Fieldbook</DialogTitle><DialogDescription>Keep track of the people you meet. Choose someone to open your notes.</DialogDescription></DialogHeader><div className="journal-tabs" role="group" aria-label="Fieldbook view">{(["available","hired","starred"] as const).map(filter => <button aria-pressed={journalFilter === filter} className={journalFilter === filter ? "selected" : ""} key={filter} onClick={() => setJournalFilter(filter)}>{filter === "available" ? "Candidates" : filter === "hired" ? "Your team" : "Shortlist"}</button>)}</div><div className="journal-people">{journalPeople.map(c => <button className="journal-person" key={c.id} onClick={() => open({kind:"candidate",id:c.id})}><PixelCharacter id={c.id} size={66}/><span><strong>{c.name}</strong><small>{c.role} · {c.status === "hired" ? "Headquarters" : locationOf(g,c.id).name}</small><p>{c.hook}</p></span><span className={`journal-deadline ${c.deadline - g.week <= 1 ? "urgent" : ""}`}>{c.status === "hired" ? "ON TEAM" : `${Math.max(0,c.deadline-g.week)}w left`}<small>{c.evidence.length} clues</small></span></button>)}{!journalPeople.length && <p className="journal-empty">{journalFilter === "hired" ? "Your first recruit is out there." : journalFilter === "starred" ? "Mark someone in their conversation to save them here." : "Visit the scouting board to find more people."}</p>}</div><div className="journal-footer"><span>{available.length} leads · {team.length} recruits</span><button className="pixel-button" onClick={() => open({kind:"sources"})}>Find new leads</button></div></DialogContent></Dialog>
    {sharedMenus}
  </main>;
}
