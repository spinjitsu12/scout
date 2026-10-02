import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CarFront, ChevronLeft, Compass, FolderHeart, RotateCcw, Settings2, ShieldCheck, Upload } from "lucide-react";
import type { SaveSlot, SaveSlotSummary } from "@/lib/desktop";
import ScoutPortrait, { ScoutAppearancePreview } from "./ScoutPortrait";
import "./CareerSetup.css";

export type ScoutBackground = "observer" | "connector" | "analyst";
export type ScoutCreationDraft = { name: string; avatar: number; plate: string; background: ScoutBackground; car: "compact"; paint: "slate"; camera: "cockpit" };
export type CareerSetupProps = {
  slots: SaveSlotSummary[]; busy?: boolean; error?: string | null;
  onSelect: (slot: SaveSlot) => void | Promise<void>;
  onCreate: (slot: SaveSlot, draft: ScoutCreationDraft) => void | Promise<void>;
  onRecover?: (slot: SaveSlot) => void | Promise<void>;
  onImport?: (slot: SaveSlot) => void | Promise<void>;
  onSettings?: () => void; onQuit?: () => void;
  renderScoutPreview?: (avatar: number) => ReactNode;
};
const CHAPTERS = ["Cirrus Works", "Aster Institute", "The Veil"];
const BACKGROUNDS: { id: ScoutBackground; title: string; description: string }[] = [
  { id: "observer", title: "The observer", description: "You notice the quiet work that everyone else walks past." },
  { id: "connector", title: "The connector", description: "You listen first. A good conversation opens a whole new world." },
  { id: "analyst", title: "The analyst", description: "You follow the details until an overlooked talent starts to shine." },
];
const newDraft = (): ScoutCreationDraft => ({ name: "", avatar: 0, plate: "SCOUT", background: "observer", car: "compact", paint: "slate", camera: "cockpit" });
function savedAt(value?: number): string {
  if (!value) return "A local career";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "A local career" : `Saved ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export default function CareerSetup({ slots, busy = false, error, onSelect, onCreate, onRecover, onImport, onSettings, onQuit, renderScoutPreview }: CareerSetupProps) {
  const [creating, setCreating] = useState<SaveSlot | null>(null), [draft, setDraft] = useState<ScoutCreationDraft>(newDraft);
  const [submitting, setSubmitting] = useState(false), [localError, setLocalError] = useState<string | null>(null), [touched, setTouched] = useState(false);
  const nameField = useRef<HTMLInputElement>(null), id = useId(), working = busy || submitting;
  const name = draft.name.trim(), plate = draft.plate.trim().toUpperCase();
  const nameError = !name ? "Give your scout a name." : /[\u0000-\u001f\u007f]/u.test(name) ? "Use readable characters for your scout’s name." : name.length > 24 ? "Use 24 characters or fewer." : null;
  const plateError = /^[A-Z0-9-]{1,8}$/u.test(plate) ? null : "Use 1–8 letters, numbers, or a hyphen.";
  const message = localError || error;
  function update<K extends keyof ScoutCreationDraft>(key: K, value: ScoutCreationDraft[K]) { setDraft(current => ({ ...current, [key]: value })); setLocalError(null); }
  async function perform(action: () => void | Promise<void>) {
    if (working) return;
    setSubmitting(true); setLocalError(null);
    try { await action(); } catch (failure) { setLocalError(failure instanceof Error ? failure.message : "That career could not be opened. Please try again."); }
    finally { setSubmitting(false); }
  }
  function openCreation(slot: SaveSlot) { setCreating(slot); setLocalError(null); setTouched(false); setDraft(newDraft()); }
  async function createCareer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTouched(true);
    if (!creating || working) return;
    if (nameError || plateError) { nameField.current?.focus(); return; }
    const slot = slots.find(item => item.slot === creating);
    if (slot?.occupied || slot?.error) { setLocalError("This slot already contains a career. Choose an empty slot to begin."); return; }
    await perform(() => onCreate(creating, { ...draft, name, plate }));
  }
  return <main className="career-setup" aria-busy={working}>
    <div className="career-drag-strip" aria-hidden="true"/>
    <div className="career-landscape" aria-hidden="true"><i className="career-landscape-sun"/><i className="career-landscape-hill distant"/><i className="career-landscape-hill near"/><i className="career-landscape-road"/></div>
    <header className="career-topbar"><span className="career-brand"><Compass size={25} strokeWidth={1.3}/><b>SCOUT</b><span>A life on the road</span></span><div className="career-top-actions">{onSettings && <button type="button" className="career-quiet-button" disabled={working} onClick={onSettings}><Settings2 size={18}/>Settings</button>}{onQuit && <button type="button" className="career-quiet-button" disabled={working} onClick={onQuit}>Quit</button>}</div></header>
    <div className={`career-content ${creating ? "career-creation-content" : ""}`}>
      {!creating ? <>
        <header className="career-introduction"><span className="career-eyebrow">THE ROAD IS YOURS</span><h1>A career worth<br/>taking your time with.</h1><p>New places. Quiet conversations. People waiting to be discovered.<br className="career-desktop-break"/> Choose a career and settle in.</p></header>
        <div className="career-slots" aria-label="Choose one of three career save slots">{([1, 2, 3] as SaveSlot[]).map(number => {
          const summary = slots.find(slot => slot.slot === number), occupied = summary?.occupied ?? false, unreadable = !!summary?.error;
          return <article className={`career-slot ${occupied ? "occupied" : "empty"} ${unreadable ? "career-slot-error" : ""}`} key={number}>
            <button className="career-slot-main" type="button" disabled={working || unreadable} onClick={() => occupied ? void perform(() => onSelect(number)) : openCreation(number)} aria-label={unreadable ? `Saved career in slot ${number} needs recovery` : occupied ? `Continue ${summary?.name || "career"} in save slot ${number}` : `Create a new career in save slot ${number}`}>
              <div className="career-slot-top"><span className="career-slot-number">0{number}</span><span className="career-status"><i/>{unreadable ? "Needs attention" : occupied ? "Your career" : "A new beginning"}</span></div>
              <span className="career-slot-symbol" aria-hidden="true">{occupied ? <FolderHeart size={29} strokeWidth={1.2}/> : <Compass size={29} strokeWidth={1.2}/>}</span><h2>{occupied ? summary?.name || "Your scout" : "Begin your story"}</h2><p>{unreadable ? "Your saved file is kept. Choose a recovery option below." : occupied ? `${CHAPTERS[Math.max(0, Math.min(2, summary?.tier ?? 0))]} · Week ${summary?.week ?? 1}` : "An empty journal. A basic compact. An open road."}</p>
              <div className="career-slot-bottom"><span>{unreadable ? "Recovery options below" : occupied ? savedAt(summary?.lastSavedAt) : "Create your scout"}</span>{!unreadable && <ArrowRight size={20}/>}</div>
            </button>
            {unreadable && <p className="career-slot-recovery" role="status">{summary?.error}</p>}
            <div className="career-slot-tools">{summary?.backupAvailable && onRecover && <button type="button" disabled={working} onClick={() => void perform(() => onRecover(number))}><RotateCcw size={14}/>Recover backup</button>}{onImport && (!occupied || unreadable) && <button type="button" disabled={working} onClick={() => void perform(() => onImport(number))}><Upload size={14}/>{unreadable ? "Import a backup" : "Import a career"}</button>}</div>
          </article>;
        })}</div>
      </> : <>
        <button type="button" className="career-back" disabled={working} onClick={() => { setCreating(null); setLocalError(null); }}><ChevronLeft size={18}/>Back to careers</button>
        <header className="career-creation-heading"><span className="career-eyebrow">CAREER 0{creating} / YOUR FIRST PAGE</span><h1>Who’s behind the wheel?</h1><p>Make your scout. The rest of your story happens out there.</p></header>
        <form className="career-creation-grid" onSubmit={event => void createCareer(event)} noValidate>
          <aside className="career-preview-panel"><div className="career-preview-mark">FIELD SCOUT <span>0{creating}</span></div><div className="career-scout-preview" aria-label={`Scout appearance ${draft.avatar + 1} preview`}>{renderScoutPreview ? renderScoutPreview(draft.avatar) : <ScoutPortrait avatar={draft.avatar}/>}</div><div className="career-preview-identity"><h2>{name || "Your scout"}</h2><p>{BACKGROUNDS.find(item => item.id === draft.background)?.title}</p></div><div className="career-vehicle-note"><CarFront size={25} strokeWidth={1.25}/><span><b>A humble beginning</b><small>Your first car is a dependable basic compact.</small></span></div><span className="career-plate-preview">{plate || "YOUR PLATE"}</span></aside>
          <div className="career-creation-fields">
            <section className="career-form-section"><h2><span>01</span>Your identity</h2><div className="career-input-grid"><label className="career-field"><span>Scout name</span><input ref={nameField} autoFocus value={draft.name} maxLength={24} autoComplete="off" spellCheck={false} placeholder="Your name" aria-invalid={touched && !!nameError} aria-describedby={`${id}-name-help`} disabled={working} onBlur={() => setTouched(true)} onChange={event => update("name", event.target.value)}/><small id={`${id}-name-help`} className={touched && nameError ? "career-field-error" : ""}>{touched && nameError ? nameError : "The name on your field journal."}</small></label><label className="career-field"><span>License plate</span><input value={draft.plate} maxLength={8} autoComplete="off" spellCheck={false} placeholder="SCOUT" aria-invalid={!!plateError} aria-describedby={`${id}-plate-help`} disabled={working} onChange={event => update("plate", event.target.value.toUpperCase())}/><small id={`${id}-plate-help`} className={plateError ? "career-field-error" : ""}>{plateError || "1–8 letters, numbers, or hyphens."}</small></label></div></section>
            <fieldset className="career-form-section"><legend><span>02</span>Choose your scout</legend><p className="career-form-hint">A familiar face for a long road.</p><div className="career-avatar-grid">{Array.from({ length: 16 }, (_, avatar) => <button key={avatar} type="button" disabled={working} aria-label={`Scout appearance ${avatar + 1}`} aria-pressed={draft.avatar === avatar} className={draft.avatar === avatar ? "selected" : ""} onClick={() => update("avatar", avatar)}><ScoutAppearancePreview avatar={avatar}/><span>{String(avatar + 1).padStart(2, "0")}</span></button>)}</div></fieldset>
            <fieldset className="career-form-section"><legend><span>03</span>What brought you here?</legend><p className="career-form-hint">The way you see the world becomes part of your story.</p><div className="career-backgrounds">{BACKGROUNDS.map(background => <label key={background.id} className={draft.background === background.id ? "selected" : ""}><input type="radio" name={`${id}-background`} value={background.id} checked={draft.background === background.id} disabled={working} onChange={() => update("background", background.id)}/><span><strong>{background.title}</strong><small>{background.description}</small></span></label>)}</div></fieldset>
            <div className="career-create-actions"><p>No clock to beat.<br/>Take the road at your own pace.</p><button type="submit" className="career-primary-button" disabled={working || !!plateError || (touched && !!nameError)}>{working ? "Preparing your career…" : "Begin the journey"}<ArrowRight size={19}/></button></div>
          </div>
        </form>
      </>}
      {message && <div className="career-message" role="alert">{message}</div>}{working && <p className="career-loading-message" role="status" aria-live="polite">Getting your field journal ready…</p>}
    </div>
    <footer className="career-footer"><span><ShieldCheck size={16}/>Saved on this device · Ready for offline play</span><span>Find something worth slowing down for.</span></footer>
  </main>;
}
