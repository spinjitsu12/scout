import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CarFront, ChevronLeft, Compass, Feather, RotateCcw, Settings2, Upload } from "lucide-react";
import type { SaveSlot, SaveSlotSummary } from "@/lib/desktop";
import CareerLandscape from "./CareerLandscape";
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
  if (!value) return "Continue your journey";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Continue your journey" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CareerSetup({ slots, busy = false, error, onSelect, onCreate, onRecover, onImport, onSettings, onQuit, renderScoutPreview }: CareerSetupProps) {
  const [creating, setCreating] = useState<SaveSlot | null>(null), [draft, setDraft] = useState<ScoutCreationDraft>(newDraft);
  const [submitting, setSubmitting] = useState(false), [localError, setLocalError] = useState<string | null>(null), [touched, setTouched] = useState(false);
  const nameField = useRef<HTMLInputElement>(null), plateField = useRef<HTMLInputElement>(null), slotButtons = useRef(new Map<SaveSlot, HTMLButtonElement>()), id = useId(), working = busy || submitting;
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
  function backToCareers() { const previousSlot = creating; setCreating(null); setLocalError(null); requestAnimationFrame(() => { if (previousSlot) slotButtons.current.get(previousSlot)?.focus(); }); }
  async function createCareer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTouched(true);
    if (!creating || working) return;
    if (nameError || plateError) { (nameError ? nameField : plateField).current?.focus(); return; }
    const slot = slots.find(item => item.slot === creating);
    if (slot?.occupied || slot?.error) { setLocalError("This slot already contains a career. Choose an empty slot to begin."); return; }
    await perform(() => onCreate(creating, { ...draft, name, plate }));
  }
  return <main className={`career-setup${creating ? " is-creating" : ""}`} aria-busy={working} onKeyDown={event => { if (event.key === "Escape" && creating && !working) { event.preventDefault(); event.stopPropagation(); backToCareers(); } }}>
    <div className="career-drag-strip" aria-hidden="true"/>
    <div className="career-landscape"><CareerLandscape/></div>
    <header className="career-topbar"><span className="career-brand"><Compass size={25} strokeWidth={1.3}/><b>SCOUT</b><span>A life on the road</span></span><div className="career-top-actions">{onSettings && <button type="button" className="career-quiet-button" disabled={working} onClick={onSettings}><Settings2 size={18}/>Settings</button>}{onQuit && <button type="button" className="career-quiet-button" disabled={working} onClick={onQuit}>Exit game</button>}</div></header>
    <div className={`career-content ${creating ? "career-creation-content" : ""}`}>
      {!creating ? <>
        <header className="career-introduction"><span className="career-eyebrow"><i aria-hidden="true"/>YOUR NEXT CHAPTER</span><h1>Take the<br/><em>long way.</em></h1><p>Out past the city, there’s a story<br/>you haven’t heard yet.</p></header><div className="career-selection-heading"><span>Choose your career</span><span>Three journals. Your own story.</span></div>
        <div className="career-slots" aria-label="Choose one of three career save slots">{([1, 2, 3] as SaveSlot[]).map(number => {
          const summary = slots.find(slot => slot.slot === number), occupied = summary?.occupied ?? false, unreadable = !!summary?.error;
          return <article className={`career-slot ${occupied ? "occupied" : "empty"} ${unreadable ? "career-slot-error" : ""}`} key={number} data-slot={number}>
            <button className="career-slot-main" ref={button => { if (button) slotButtons.current.set(number, button); else slotButtons.current.delete(number); }} type="button" disabled={working || unreadable} onClick={() => occupied ? void perform(() => onSelect(number)) : openCreation(number)} aria-label={unreadable ? `Saved career in slot ${number} needs recovery` : occupied ? `Continue ${summary?.name || "career"} in save slot ${number}` : `Create a new career in save slot ${number}`}>
              <div className="career-slot-top"><span className="career-slot-number">0{number}</span><span className="career-status"><i/>{unreadable ? "Needs attention" : occupied ? "In progress" : "A fresh page"}</span></div>
              <span className="career-slot-symbol" aria-hidden="true">{occupied ? <Feather size={29} strokeWidth={1.2}/> : <Compass size={29} strokeWidth={1.2}/>}</span><h2>{occupied ? summary?.name || "Your scout" : "Begin your story"}</h2><p>{unreadable ? "Choose a recovery option below to return to your story." : occupied ? `${CHAPTERS[Math.max(0, Math.min(2, summary?.tier ?? 0))]} · Week ${summary?.week ?? 1}` : "A name, a notebook, and an open road."}</p>
              <div className="career-slot-bottom"><span>{unreadable ? "Recovery options below" : occupied ? "Continue the journey" : "Create your scout"}</span>{occupied && !unreadable && <small>{savedAt(summary?.lastSavedAt)}</small>}{!unreadable && <ArrowRight size={20}/>}</div>
            </button>
            {unreadable && <p className="career-slot-recovery" role="status">{summary?.error}</p>}
            <div className="career-slot-tools">{summary?.backupAvailable && onRecover && <button type="button" disabled={working} onClick={() => void perform(() => onRecover(number))}><RotateCcw size={14}/>Recover backup</button>}{onImport && (!occupied || unreadable) && <button type="button" disabled={working} onClick={() => void perform(() => onImport(number))}><Upload size={14}/>{unreadable ? "Import a backup" : "Import a career"}</button>}</div>
          </article>;
        })}</div>
      </> : <>
        <button type="button" className="career-back" disabled={working} onClick={backToCareers}><ChevronLeft size={18}/>Back to careers</button>
        <header className="career-creation-heading"><span className="career-eyebrow">JOURNAL 0{creating} / THE FIRST PAGE</span><h1>Who’s behind the wheel?</h1><p>A face. A name. A way of seeing the world.</p></header>
        <form className="career-creation-grid" onSubmit={event => void createCareer(event)} noValidate>
          <aside className="career-preview-panel"><div className="career-preview-mark">FIELD SCOUT <span>0{creating}</span></div><div className="career-scout-preview" aria-label={`Scout appearance ${draft.avatar + 1} preview`}>{renderScoutPreview ? renderScoutPreview(draft.avatar) : <ScoutPortrait avatar={draft.avatar}/>}</div><div className="career-preview-identity"><h2>{name || "Your scout"}</h2><p>{BACKGROUNDS.find(item => item.id === draft.background)?.title}</p></div><div className="career-vehicle-note"><CarFront size={25} strokeWidth={1.25}/><span><b>Your first set of keys</b><small>A dependable compact. Plenty of road ahead.</small></span></div><span className="career-plate-preview">{plate || "YOUR PLATE"}</span></aside>
          <div className="career-creation-fields">
            <section className="career-form-section"><h2><span>01</span>Your identity</h2><div className="career-input-grid"><label className="career-field"><span>Scout name</span><input ref={nameField} autoFocus value={draft.name} maxLength={24} autoComplete="off" spellCheck={false} placeholder="Your name" aria-invalid={touched && !!nameError} aria-describedby={`${id}-name-help`} disabled={working} onBlur={() => setTouched(true)} onChange={event => update("name", event.target.value)}/><small id={`${id}-name-help`} className={touched && nameError ? "career-field-error" : ""}>{touched && nameError ? nameError : "The name on your field journal."}</small></label><label className="career-field"><span>License plate</span><input ref={plateField} value={draft.plate} maxLength={8} autoComplete="off" spellCheck={false} placeholder="SCOUT" aria-invalid={!!plateError} aria-describedby={`${id}-plate-help`} disabled={working} onChange={event => update("plate", event.target.value.toUpperCase())}/><small id={`${id}-plate-help`} className={plateError ? "career-field-error" : ""}>{plateError || "1–8 letters, numbers, or hyphens."}</small></label></div></section>
            <fieldset className="career-form-section"><legend><span>02</span>Choose your scout</legend><p className="career-form-hint">A familiar face for a long road.</p><div className="career-avatar-grid">{Array.from({ length: 16 }, (_, avatar) => <button key={avatar} type="button" disabled={working} aria-label={`Scout appearance ${avatar + 1}`} aria-pressed={draft.avatar === avatar} className={draft.avatar === avatar ? "selected" : ""} onClick={() => update("avatar", avatar)}><ScoutAppearancePreview avatar={avatar}/><span>{String(avatar + 1).padStart(2, "0")}</span></button>)}</div></fieldset>
            <fieldset className="career-form-section"><legend><span>03</span>What brought you here?</legend><p className="career-form-hint">Every scout sees something different.</p><div className="career-backgrounds">{BACKGROUNDS.map(background => <label key={background.id} className={draft.background === background.id ? "selected" : ""}><input type="radio" name={`${id}-background`} value={background.id} checked={draft.background === background.id} disabled={working} onChange={() => update("background", background.id)}/><span><strong>{background.title}</strong><small>{background.description}</small></span></label>)}</div></fieldset>
            <div className="career-create-actions"><p>The road will wait.<br/>Make yourself at home.</p><button type="submit" className="career-primary-button" disabled={working || !!plateError || (touched && !!nameError)}>{working ? "Preparing your career…" : "Begin the journey"}<ArrowRight size={19}/></button></div>
          </div>
        </form>
      </>}
      {message && <div className="career-message" role="alert">{message}</div>}{working && <p className="career-loading-message" role="status" aria-live="polite">Getting your field journal ready…</p>}
    </div>
    <footer className="career-footer"><span>Coast. City. Countryside.</span><span>Find something worth slowing down for.</span></footer>
  </main>;
}
