import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Check, Download, ExternalLink, FolderHeart, Keyboard, Monitor, Save, SlidersHorizontal, Upload, Volume2, X } from "lucide-react";
import type { DisplayMode } from "@/lib/desktop";
import type { AudioVolumes } from "@/lib/audio";
import { AUDIO_CREDITS } from "@/lib/audio-credits";
import "./ImmersiveSettings.css";

export type ImmersivePreferences = { displayMode: DisplayMode; volumes: AudioVolumes; mouseSensitivity: number; headBob: number; fieldOfView: number };
export const DEFAULT_IMMERSIVE_PREFERENCES: ImmersivePreferences = { displayMode: "borderless", volumes: { master: .8, music: .38, ambient: .6, effects: .7, engine: .35 }, mouseSensitivity: 1, headBob: .15, fieldOfView: 70 };
export type SettingsTab = "display" | "audio" | "controls" | "career" | "credits";
export type ImmersiveSettingsProps = {
  preferences: ImmersivePreferences; onChange: (preferences: ImmersivePreferences) => void; onClose: () => void;
  saveStatus?: string; busy?: boolean; audioStatus?: string;
  onSave?: () => void | Promise<void>; onExport?: () => void | Promise<void>; onImport?: () => void | Promise<void>;
  onReturnToSlots?: () => void | Promise<void>; onQuit?: () => void | Promise<void>; updatePanel?: ReactNode; initialTab?: SettingsTab;
};
const TABS = [
  { id: "display", title: "Display & comfort", Icon: Monitor }, { id: "audio", title: "Sound", Icon: Volume2 },
  { id: "controls", title: "Controls", Icon: Keyboard }, { id: "career", title: "Your career", Icon: FolderHeart },
  { id: "credits", title: "Credits", Icon: SlidersHorizontal },
] as const;
const VOLUMES: { key: keyof AudioVolumes; label: string; description: string }[] = [
  { key: "master", label: "Master volume", description: "The overall level of the world around you." },
  { key: "music", label: "Music & car radio", description: "The soundtrack to a slower journey." },
  { key: "ambient", label: "World ambience", description: "Wind, birds, rain, and life in the city." },
  { key: "effects", label: "Interactions & footsteps", description: "Doors, conversations, movement, and your phone." },
  { key: "engine", label: "Engine & road", description: "Your compact’s motor and the tires on the road." },
];
const DISPLAY_OPTIONS: { id: DisplayMode; title: string; description: string }[] = [
  { id: "borderless", title: "Borderless fullscreen", description: "Fill your screen and switch smoothly to other apps." },
  { id: "fullscreen", title: "Fullscreen", description: "A fully focused view of the world." },
  { id: "windowed", title: "Windowed", description: "Play in a movable, resizable window." },
];
function RangeSetting({ label, description, value, min, max, step = 1, suffix = "", format, disabled, onChange }: { label: string; description: string; value: number; min: number; max: number; step?: number; suffix?: string; format?: (value: number) => string; disabled?: boolean; onChange: (value: number) => void }) {
  const id = useId(), safeValue = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
  return <div className="immersive-range-setting"><div className="immersive-setting-label"><label htmlFor={id}>{label}<span id={`${id}-description`}>{description}</span></label><output htmlFor={id}>{format ? format(safeValue) : `${Math.round(safeValue)}${suffix}`}</output></div><input id={id} type="range" min={min} max={max} step={step} value={safeValue} aria-describedby={`${id}-description`} disabled={disabled} onChange={event => onChange(Number(event.target.value))} style={{ "--range-fill": `${(safeValue - min) / (max - min) * 100}%` } as CSSProperties}/></div>;
}
export default function ImmersiveSettings({ preferences, onChange, onClose, saveStatus = "Saved locally", busy = false, audioStatus, onSave, onExport, onImport, onReturnToSlots, onQuit, updatePanel, initialTab = "display" }: ImmersiveSettingsProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab), [working, setWorking] = useState(false), [message, setMessage] = useState<string | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]), id = useId(), blocked = busy || working, hasCareer = !!onSave || !!onExport;
  const headings: Record<SettingsTab, { title: string; description: string }> = {
    display: { title: "Make yourself comfortable.", description: "Settle into a view that feels right for you." },
    audio: { title: "Listen to the place.", description: "Make space for the music, or let the world speak for itself." },
    controls: { title: "A few familiar controls.", description: "Get comfortable on foot and behind the wheel." },
    career: hasCareer ? { title: "Your story stays with you.", description: "Your career saves on this device, including when you’re offline." } : { title: "A place for your story.", description: "Choose a career slot to begin, or bring a saved career with you." },
    credits: { title: "The people behind the sound.", description: "Real recordings and a carefully credited soundtrack." },
  };
  function change<K extends keyof ImmersivePreferences>(key: K, value: ImmersivePreferences[K]) { onChange({ ...preferences, [key]: value }); }
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + direction + TABS.length) % TABS.length; setTab(TABS[next].id); tabs.current[next]?.focus();
  }
  async function perform(action: (() => void | Promise<void>) | undefined) {
    if (!action || blocked) return; setWorking(true); setMessage(null);
    try { await action(); } catch (failure) { setMessage(failure instanceof Error ? failure.message : "That action could not be completed. Please try again."); }
    finally { setWorking(false); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !blocked) onClose(); }}><Dialog.Portal><Dialog.Overlay className="immersive-settings-overlay"/>
    <Dialog.Content className="immersive-settings-modal" onEscapeKeyDown={event => { if (blocked) event.preventDefault(); }} onInteractOutside={event => { if (blocked) event.preventDefault(); }}>
      <header className="immersive-settings-top"><span>SCOUT <i/> A MOMENT TO PAUSE</span><button type="button" className="immersive-close" disabled={blocked} onClick={onClose} aria-label="Close settings and resume"><X size={21}/></button></header>
      <div className="immersive-settings-grid"><aside className="immersive-settings-sidebar"><Dialog.Title className="immersive-settings-title">Settings</Dialog.Title><Dialog.Description className="immersive-settings-description">Take your time.</Dialog.Description>
        <div role="tablist" aria-label="Settings categories" aria-orientation="vertical" className="immersive-settings-tabs">{TABS.map(({ id: category, title, Icon }, index) => <button type="button" key={category} ref={element => { tabs.current[index] = element; }} role="tab" id={`${id}-${category}-tab`} aria-controls={`${id}-settings-panel`} aria-selected={tab === category} tabIndex={tab === category ? 0 : -1} className={tab === category ? "selected" : ""} onClick={() => setTab(category)} onKeyDown={event => navigateTabs(event, index)}><Icon size={17} strokeWidth={1.5}/><span>{title}</span></button>)}</div>
        <div className="immersive-sidebar-note"><span className="immersive-save-dot"/><span>{saveStatus}</span></div>
      </aside>
      <div role="tabpanel" className="immersive-settings-body" id={`${id}-settings-panel`} aria-labelledby={`${id}-${tab}-tab`} tabIndex={0}>
        <header className="immersive-panel-heading"><span>{TABS.find(item => item.id === tab)?.title.toUpperCase()}</span><h2>{headings[tab].title}</h2><p>{headings[tab].description}</p></header>
        {tab === "display" && <>
          <fieldset className="immersive-display-modes"><legend>Display mode</legend>{DISPLAY_OPTIONS.map(option => <label className={preferences.displayMode === option.id ? "selected" : ""} key={option.id}><input type="radio" name={`${id}-display-mode`} value={option.id} checked={preferences.displayMode === option.id} disabled={blocked} onChange={() => change("displayMode", option.id)}/><span><b>{option.title}{option.id === "borderless" && <em>DEFAULT</em>}</b><small>{option.description}</small></span><Check size={17} aria-hidden="true"/></label>)}</fieldset>
          <p className="immersive-key-note"><kbd>F11</kbd> Switch fullscreen on or off.</p><div className="immersive-setting-group"><h3>Camera comfort</h3><RangeSetting label="Mouse sensitivity" description="How quickly you turn your head." min={.35} max={2.5} step={.05} value={preferences.mouseSensitivity} format={value => `${value.toFixed(2)}×`} disabled={blocked} onChange={value => change("mouseSensitivity", value)}/><RangeSetting label="Field of view" description="A wider view shows more of your surroundings." min={60} max={100} value={preferences.fieldOfView} suffix="°" disabled={blocked} onChange={value => change("fieldOfView", value)}/><RangeSetting label="Walking camera motion" description="Set to zero for a completely steady view." min={0} max={100} value={preferences.headBob * 100} suffix="%" disabled={blocked} onChange={value => change("headBob", value / 100)}/></div>
        </>}
        {tab === "audio" && <><div className="immersive-audio-mix">{VOLUMES.map(setting => <RangeSetting key={setting.key} label={setting.label} description={setting.description} min={0} max={100} value={preferences.volumes[setting.key] * 100} suffix="%" disabled={blocked} onChange={value => change("volumes", { ...preferences.volumes, [setting.key]: value / 100 })}/>)}</div><div className="immersive-note"><Volume2 size={18}/><p>Setting a slider to zero mutes that part of the mix. Your audio preferences are remembered.</p></div>{audioStatus && <p className="immersive-audio-status" role="status">{audioStatus}</p>}</>}
        {tab === "controls" && <><div className="immersive-controls-grid"><section><h3>On foot</h3><dl><div><dt>Move</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dd></div><div><dt>Look around</dt><dd>Mouse</dd></div><div><dt>Walk to a nearby point</dt><dd>Right click</dd></div><div><dt>Talk · open · use</dt><dd><kbd>E</kbd></dd></div></dl></section><section><h3>Behind the wheel</h3><dl><div><dt>Accelerate</dt><dd><kbd>W</kbd></dd></div><div><dt>Brake · reverse</dt><dd><kbd>S</kbd></dd></div><div><dt>Turn the wheel</dt><dd><kbd>A</kbd><kbd>D</kbd></dd></div><div><dt>Handbrake</dt><dd><kbd>Space</kbd></dd></div><div><dt>Enter · exit the car</dt><dd><kbd>E</kbd></dd></div></dl></section></div><div className="immersive-controls-common"><div><span>Open your field journal</span><span><kbd>J</kbd> <kbd>Tab</kbd></span></div><div><span>View the map</span><kbd>M</kbd></div><div><span>Pause · release the mouse</span><kbd>Esc</kbd></div></div><p className="immersive-driving-advice">Ease onto the accelerator, leave room to brake, and park near an entrance. Right click sets a nearby walking destination while the mouse cursor is free.</p></>}
        {tab === "career" && <><section className="immersive-career-status"><span><span className="immersive-save-dot"/>{hasCareer ? "LOCAL CAREER" : "THREE CAREER SLOTS"}</span><h3>{saveStatus}</h3><p>{hasCareer ? "Your scout, discoveries, car, and journey stay on this device. Export a backup when you want a copy of your career." : "Each slot keeps its own scout and journey. Begin a new story in an empty slot, or import a career you’ve already saved."}</p></section><div className="immersive-career-actions">{onSave && <button type="button" disabled={blocked} onClick={() => void perform(onSave)}><Save size={18}/><span><b>Save now</b><small>Keep a fresh copy of your progress.</small></span></button>}{onExport && <button type="button" disabled={blocked} onClick={() => void perform(onExport)}><Download size={18}/><span><b>Export a backup</b><small>Take this career with you.</small></span></button>}{onImport && <button type="button" disabled={blocked} onClick={() => void perform(onImport)}><Upload size={18}/><span><b>Import a career</b><small>Choose a saved career file.</small></span></button>}</div>{updatePanel && <div className="immersive-update-panel">{updatePanel}</div>}<div className="immersive-leave-actions">{onReturnToSlots && <button type="button" disabled={blocked} onClick={() => void perform(onReturnToSlots)}>{hasCareer ? "Save & choose another career" : "Choose a career"}</button>}{onQuit && <button type="button" disabled={blocked} onClick={() => void perform(onQuit)}>{hasCareer ? "Save & quit" : "Quit"}</button>}</div></>}
        {tab === "credits" && <><p className="immersive-credits-intro">Thank you to the musicians and recordists whose work gives this world its character.</p><div className="immersive-credits">{AUDIO_CREDITS.map(credit => <article key={`${credit.title}-${credit.artist}`}><h3>{credit.title}</h3><p className="immersive-credit-artist">{credit.artist}</p><p>{credit.description}</p><small>{credit.attribution}</small><div><a href={credit.source} target="_blank" rel="noreferrer">Source <ExternalLink size={12}/></a><a href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license} <ExternalLink size={12}/></a></div></article>)}</div></>}
        {message && <p className="immersive-settings-message" role="alert">{message}</p>}{working && <p className="immersive-operation-status" role="status">Taking care of your career…</p>}
      </div></div>
      <footer className="immersive-settings-footer"><span>Preferences apply as you adjust them.</span><button type="button" className="immersive-resume" disabled={blocked} onClick={onClose}>{hasCareer ? "Back to the journey" : "Back to careers"}<span aria-hidden="true">→</span></button></footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
