import { Dialog } from "radix-ui";
import { scoutAudio } from "@/lib/audio";
import { styleOf } from "@/lib/expedition";
import { RADIO_STATIONS } from "@/lib/radio-score";
import type { Game, Action } from "@/lib/game";

export default function AudioSettings({ game, run, onClose }: { game: Game; run: (action: Action) => boolean; onClose: () => void }) {
  const style = styleOf(game);
  function change(action: Action, enable = false) {
    if (!run(action)) return;
    if (enable) {
      // An explicit click also recovers a context interrupted by device sleep.
      void scoutAudio.start(game.tier);
    }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="gp-overlay" />
    <Dialog.Content className="gp-modal audio-settings-modal">
      <div className="gp-window-bar"><span>SCOUT / SOUND DESK</span><Dialog.Close className="gp-close" aria-label="Close sound settings">×</Dialog.Close></div>
      <div className="gp-scroll">
        <header className="gp-heading"><span className="gp-label">AN ORIGINAL PIXEL SOUNDTRACK</span><Dialog.Title className="gp-title">Tune the road.</Dialog.Title><Dialog.Description className="gp-description">Your car radio plays while you’re behind the wheel. Choose a station, or listen to the world around you.</Dialog.Description></header>
        <div className="audio-toggle-rows">
          <div><span><b>Car radio</b><small>Replaces background music while driving.</small></span><button className={`gp-button ${style.radio ? "gp-primary" : ""}`} aria-pressed={style.radio} onClick={() => change({type:"preferences",radio:!style.radio},!style.radio)}>{style.radio ? "On" : "Off"}</button></div>
          <div><span><b>Background music</b><small>A different original theme for every chapter.</small></span><button className={`gp-button ${style.music ? "gp-primary" : ""}`} aria-pressed={style.music} onClick={() => change({type:"preferences",music:!style.music},!style.music)}>{style.music ? "On" : "Off"}</button></div>
          <div><span><b>World sounds</b><small>Footsteps, phones, and interaction cues.</small></span><button className={`gp-button ${style.sound ? "gp-primary" : ""}`} aria-pressed={style.sound} onClick={() => change({type:"preferences",sound:!style.sound},!style.sound)}>{style.sound ? "On" : "Off"}</button></div>
          <div><span><b>Engine & road</b><small>Your car’s motor and the rush of the road.</small></span><button className={`gp-button ${style.engine ? "gp-primary" : ""}`} aria-pressed={style.engine} onClick={() => change({type:"preferences",engine:!style.engine},!style.engine)}>{style.engine ? "On" : "Off"}</button></div>
        </div>
        <fieldset className="radio-stations"><legend>Choose a station</legend>{RADIO_STATIONS.map((station,index) => <button className={`radio-station ${style.station === index ? "selected" : ""}`} key={station.name} aria-pressed={style.station === index} onClick={() => change({type:"preferences",station:index as 0|1|2,radio:true},true)}><span className="radio-number">0{index+1}</span><span><b>{station.name}</b><small>{station.tagline}</small></span><span aria-hidden="true">{style.station === index ? "▰" : "▱"}</span></button>)}</fieldset>
        <p className="gp-small">Your stations are available offline. Every sound setting saves with your career.</p>
        <button className="gp-button gp-primary gp-wide" onClick={onClose}>Back to the game</button>
      </div><div className="gp-window-footer"><span>RADIO / MUSIC / WORLD / MOTOR</span><span>ESC · CLOSE</span></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
