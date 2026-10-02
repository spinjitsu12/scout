"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Dialog } from "radix-ui";
import PixelCharacter from "./PixelCharacter";
import { drawPixelCar } from "@/lib/driving";
import { CAR_NAMES, PAINTS, styleOf, type ScoutStyle } from "@/lib/expedition";
import type { Game } from "@/lib/game";
import type { RunAction } from "@/lib/game-ui";
import "./customization.css";

type CustomizationPanelProps = { game: Game; run: RunAction; onClose: () => void };

function CarPreview({ car, paint, plate, className = "" }: { car: ScoutStyle["car"]; paint: ScoutStyle["paint"]; plate?: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 128, 72);
    context.imageSmoothingEnabled = false;
    context.save();
    context.translate(64, 36);
    drawPixelCar(context, car, PAINTS[paint], 0, plate);
    context.restore();
  }, [car, paint, plate]);
  return <canvas ref={canvas} width={128} height={72} className={`cp-car-canvas ${className}`} aria-hidden="true" />;
}

const PAINT_LABELS: Record<ScoutStyle["paint"], string> = { mint: "Mint", coral: "Coral", gold: "Gold", violet: "Violet", slate: "Slate" };
const CAR_DETAILS: Record<ScoutStyle["car"], string> = { compact: "Best fuel economy.", wagon: "Roomier. Uses more fuel.", coupe: "Style with balanced economy." };

export default function CustomizationPanel({ game, run, onClose }: CustomizationPanelProps) {
  const [draft, setDraft] = useState<ScoutStyle>(() => ({ ...styleOf(game), name: styleOf(game).name }));
  const name = draft.name.trim(), plate = draft.plate.trim().toUpperCase();
  const nameError = !name ? "Give your scout a name." : /[\u0000-\u001f\u007f]/u.test(name) ? "Use a name with readable characters." : null;
  const plateError = /^[A-Z0-9-]{1,8}$/u.test(plate) ? null : "Use 1–8 letters, numbers, or a hyphen.";
  const valid = !nameError && !plateError;
  function update<K extends keyof ScoutStyle>(key: K, value: ScoutStyle[K]) { setDraft(current => ({ ...current, [key]: value })); }
  function apply() {
    if (valid && run({ type: "customize", style: { ...draft, name, plate } })) onClose();
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="gp-overlay cp-overlay" />
      <Dialog.Content className="gp-modal cp-modal">
        <div className="gp-window-bar"><span>SCOUT / THE GARAGE</span><Dialog.Close asChild><button type="button" className="gp-close" aria-label="Close garage customization">×</button></Dialog.Close></div>
        <div className="gp-scroll cp-scroll">
          <header className="gp-heading"><span className="gp-label">YOUR SCOUT. YOUR RIDE.</span><Dialog.Title className="gp-title">Make an entrance.</Dialog.Title><Dialog.Description className="gp-description">Choose a look and a car for the road ahead. Every option is yours from the start.</Dialog.Description></header>
          <div className="cp-workshop">
            <aside className="cp-preview" aria-label="Live scout and vehicle preview">
              <div className="cp-preview-sign">FIELD SCOUT</div>
              <div className="cp-preview-scene"><span className="cp-garage-light" /><PixelCharacter index={draft.avatar} size={144} /><div className="cp-preview-road"><CarPreview car={draft.car} paint={draft.paint} plate={plate} /></div></div>
              <div className="cp-preview-identity"><strong>{name || "Your scout"}</strong><span>{CAR_NAMES[draft.car]} · {PAINT_LABELS[draft.paint]}</span><span className="cp-license">{plate || "YOUR PLATE"}</span></div>
              <p>Head back to the garage any time you want a change.</p>
              <span className="cp-free-badge">NO CASH · NO ACTIONS</span>
            </aside>
            <div className="cp-options">
              <div className="cp-identity-fields">
                <label className="cp-field"><span>Scout name</span><input value={draft.name} maxLength={24} autoComplete="off" spellCheck={false} placeholder="Scout" aria-describedby="cp-name-help" aria-invalid={!!nameError} onChange={event => update("name", event.target.value)} /><small id="cp-name-help">{nameError || `${draft.name.length}/24 characters`}</small></label>
                <label className="cp-field"><span>License plate</span><input value={draft.plate} maxLength={8} autoComplete="off" spellCheck={false} placeholder="SCOUT" aria-describedby="cp-plate-help" aria-invalid={!!plateError} onChange={event => update("plate", event.target.value.toUpperCase())} /><small id="cp-plate-help">{plateError || "Letters, numbers & hyphens"}</small></label>
              </div>
              <fieldset className="cp-picker"><legend>Choose your scout</legend><div className="cp-avatar-grid">{Array.from({ length: 16 }, (_, index) => <button type="button" key={index} className={`cp-avatar-choice ${draft.avatar === index ? "cp-selected" : ""}`} aria-label={`Select scout appearance ${index + 1}`} aria-pressed={draft.avatar === index} onClick={() => update("avatar", index)}><PixelCharacter index={index} size={56} /><span>{String(index + 1).padStart(2, "0")}</span>{draft.avatar === index && <b aria-hidden="true">✓</b>}</button>)}</div></fieldset>
              <fieldset className="cp-picker"><legend>Choose your vehicle</legend><div className="cp-car-choices">{(Object.keys(CAR_NAMES) as ScoutStyle["car"][]).map(car => <button type="button" key={car} className={`cp-car-choice ${draft.car === car ? "cp-selected" : ""}`} aria-pressed={draft.car === car} onClick={() => update("car", car)}><CarPreview car={car} paint={draft.paint} /><strong>{CAR_NAMES[car]}</strong><small>{CAR_DETAILS[car]}</small>{draft.car === car && <b className="cp-option-check" aria-hidden="true">✓</b>}</button>)}</div><p className="cp-economy-note">The compact has the longest range per gallon. The wagon uses more fuel; the coupe falls between them.</p></fieldset>
              <fieldset className="cp-picker"><legend>Choose your paint</legend><div className="cp-paint-choices">{(Object.keys(PAINTS) as ScoutStyle["paint"][]).map(paint => <button type="button" key={paint} className={`cp-paint-choice ${draft.paint === paint ? "cp-selected" : ""}`} aria-pressed={draft.paint === paint} style={{ "--car-paint": PAINTS[paint] } as CSSProperties} onClick={() => update("paint", paint)}><span className="cp-paint-chip" aria-hidden="true">{draft.paint === paint ? "✓" : ""}</span><strong>{PAINT_LABELS[paint]}</strong></button>)}</div></fieldset>
            </div>
          </div>
          <div className="cp-apply-row"><p>Your name, appearance, and car follow you through every chapter.</p><button type="button" className="gp-button gp-primary" disabled={!valid} onClick={apply}>Save scout & vehicle</button></div>
        </div>
        <div className="gp-window-footer"><span>GARAGE OPEN / GAME PAUSED</span><span>ESC · CLOSE</span></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
