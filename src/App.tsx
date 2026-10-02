import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, Compass, Pause, ShieldCheck, Map, Users, BriefcaseBusiness } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import CareerSetup, { type ScoutCreationDraft } from '@/components/game/CareerSetup';
import ImmersiveSettings, { DEFAULT_IMMERSIVE_PREFERENCES, type ImmersivePreferences } from '@/components/game/ImmersiveSettings';
import ImmersiveWorld from '@/components/game/ImmersiveWorld';
import GameplayPanels from '@/components/game/GameplayPanels';
import UpdatePanel, { useDesktopUpdateStatus } from '@/components/game/UpdatePanel';
import { scoutAudio } from '@/lib/audio';
import { act, newGame, normalizeGame, validGame, TIERS, members, money, type Action, type Game } from '@/lib/game';
import { candidateLocation, fieldOf, styleOf } from '@/lib/expedition';
import { freshImmersion } from '@/lib/immersive-runtime';
import { desktopBridge, localSaveLabel, type SaveSlot, type SaveSlotSummary } from '@/lib/desktop';
import type { GamePanel, WorldTarget } from '@/lib/game-ui';
import './immersive-shell.css';
import './macos-shell.css';

const key = (slot: SaveSlot) => 'scout-career-slot-' + slot;
const backup = (slot: SaveSlot) => key(slot) + '-previous';
const PREFS = 'scout-immersive-preferences-v1';
const emptySlots = (): SaveSlotSummary[] => ([1,2,3] as SaveSlot[]).map(slot => ({slot,occupied:false,name:null,tier:null,week:null}));
function readPreferences(): ImmersivePreferences {
  const defaults = DEFAULT_IMMERSIVE_PREFERENCES;
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS) || 'null'); if (!saved || typeof saved !== 'object') return defaults;
    const clamp = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;
    return {displayMode:['borderless','fullscreen','windowed'].includes(saved.displayMode) ? saved.displayMode : defaults.displayMode,
      volumes:Object.fromEntries(Object.entries(defaults.volumes).map(([channel,value])=>[channel,clamp(saved.volumes?.[channel],0,1,value)])) as ImmersivePreferences['volumes'],
      mouseSensitivity:clamp(saved.mouseSensitivity,.35,2.5,1),headBob:clamp(saved.headBob,0,1,.15),fieldOfView:clamp(saved.fieldOfView,60,100,70)};
  } catch {return defaults;}
}
function browserSlots(): SaveSlotSummary[] {
  if (localStorage.getItem(key(1))===null&&localStorage.getItem(backup(1))===null) {
    const previous=localStorage.getItem('scout-pixel-career-v1'); if(previous)localStorage.setItem(key(1),previous);
    const oldBackup=localStorage.getItem('scout-pixel-career-backup'); if(oldBackup&&!localStorage.getItem(backup(1)))localStorage.setItem(backup(1),oldBackup);
  }
  return emptySlots().map(summary=>{
    const raw=localStorage.getItem(key(summary.slot)),old=localStorage.getItem(backup(summary.slot));
    let backupAvailable=false;try{backupAvailable=old!==null&&validGame(JSON.parse(old));}catch{}
    if(raw===null)return old===null?summary:{...summary,occupied:true,error:'The current save is missing. Recover this career from its previous save or import a backup.',backupAvailable};
    try {const value:unknown=JSON.parse(raw); if(!validGame(value))throw new Error();return {...summary,occupied:true,name:styleOf(value).name,tier:value.tier,week:value.week,backupAvailable};}
    catch {return {...summary,occupied:true,error:'This career needs recovery. Your files have been kept.',backupAvailable};}
  });
}
export default function ScoutGame() {
  const [game,setGame]=useState<Game|null>(null), current=useRef<Game|null>(null);
  const [generation,setGeneration]=useState(0);
  const [slot,setSlot]=useState<SaveSlot|null>(null), activeSlot=useRef<SaveSlot|null>(null);
  const [slots,setSlots]=useState<SaveSlotSummary[]>(emptySlots), [loading,setLoading]=useState(true), [error,setError]=useState('');
  const [panel,setPanel]=useState<GamePanel>(null), [journal,setJournal]=useState(false), [settings,setSettings]=useState(false), [updatesOpen,setUpdatesOpen]=useState(false);
  const [preferences,setPreferences]=useState(readPreferences), [saveStatus,setSaveStatus]=useState('Saved'), [busy,setBusy]=useState(false), [restarting,setRestarting]=useState(false);
  const [notice,setNotice]=useState<{text:string;bad?:boolean}|null>(null), [focusId,setFocusId]=useState<string|null>(null), [audioStatus,setAudioStatus]=useState(scoutAudio.getStatus);
  const nativeSave=useRef(''), revision=useRef(0), importInput=useRef<HTMLInputElement>(null), importSlot=useRef<SaveSlot>(1);
  const updates=useDesktopUpdateStatus(true);
  const prologue=!!game?.story&&game.story.phase!=='complete';
  const paused=!!panel||journal||settings||updatesOpen||busy||restarting||(!prologue&&(!!game?.report||!!game?.briefing));
  const alertError=(failure:unknown)=>setNotice({text:failure instanceof Error?failure.message:'That action could not finish.',bad:true});
  const guard=(action:()=>void|Promise<void>)=>{Promise.resolve().then(action).catch(alertError);};
  const refreshSlots=useCallback(async()=>{
    try {setSlots(desktopBridge()?await desktopBridge()!.listSaveSlots():browserSlots());setError('');}
    catch(failure){setError(failure instanceof Error?failure.message:'Your careers could not be opened.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refreshSlots();},[refreshSlots]);
  useEffect(()=>{document.documentElement.dataset.scoutPlatform=desktopBridge()?.platform||'browser';},[]);
  useEffect(()=>{if(loading)return;const frame=requestAnimationFrame(()=>void desktopBridge()?.confirmReady?.().catch(()=>{}));return()=>cancelAnimationFrame(frame);},[loading]);
  const persist=useCallback((next:Game)=>{
    const selected=activeSlot.current;if(selected===null)return;const raw=JSON.stringify(next),desktop=desktopBridge();
    try {const previous=localStorage.getItem(key(selected));if(previous!==raw){if(previous){try{if(validGame(JSON.parse(previous)))localStorage.setItem(backup(selected),previous);}catch{}}localStorage.setItem(key(selected),raw);}if(!desktop)setSaveStatus('Saved');}
    catch{if(!desktop)setSaveStatus('Save interrupted');}
    if(!desktop||nativeSave.current===selected+':'+raw)return;
    nativeSave.current=selected+':'+raw;const count=++revision.current;setSaveStatus('Saving');
    void desktop.saveCareer(raw,selected).then(result=>{if(count!==revision.current||selected!==activeSlot.current)return;setSaveStatus(result.ok?'Saved':'Save interrupted');if(!result.ok)nativeSave.current='';}).catch(()=>{if(count===revision.current){nativeSave.current='';setSaveStatus('Save interrupted');}});
  },[]);
  const save=useCallback(async()=>{
    window.dispatchEvent(new Event('scout:flush-field'));const latest=current.current,selected=activeSlot.current;if(!latest||selected===null)return;
    persist(latest);const raw=JSON.stringify(latest),desktop=desktopBridge();
    if(!desktop){if(localStorage.getItem(key(selected))!==raw)throw new Error('The save could not finish. Export a backup before quitting.');return;}
    const count=++revision.current;setSaveStatus('Saving');const result=await desktop.saveCareer(raw,selected);
    if(!result.ok){nativeSave.current='';setSaveStatus('Save interrupted');throw new Error(result.error||'Your save could not finish. Export a backup before quitting.');}
    nativeSave.current=selected+':'+raw;if(count===revision.current)setSaveStatus('Saved');
  },[persist]);
  useEffect(()=>{if(game)persist(game);},[game,persist]);
  useEffect(()=>desktopBridge()?.onBeforeClose(save),[save]);
  useEffect(()=>scoutAudio.subscribe(setAudioStatus),[]);
  useEffect(()=>{scoutAudio.setVolumes(preferences.volumes);try{localStorage.setItem(PREFS,JSON.stringify(preferences));}catch{}},[preferences]);
  useEffect(()=>{const desktop=desktopBridge();if(!desktop)return;void desktop.getDisplayMode().then(displayMode=>setPreferences(value=>({...value,displayMode}))).catch(()=>{});return desktop.onDisplayMode(displayMode=>setPreferences(value=>({...value,displayMode})));},[]);
  useEffect(()=>{if(game){scoutAudio.setTier(game.tier);scoutAudio.setMusicEnabled(true);scoutAudio.setSoundEnabled(true);scoutAudio.setEngineEnabled(true);}},[game?.tier]);
  useEffect(()=>{scoutAudio.setSuspended(paused||!game);},[paused,!!game]);
  useEffect(()=>{if(notice){const timer=setTimeout(()=>setNotice(null),6500);return()=>clearTimeout(timer);}},[notice]);
  const activate=useCallback((value:Game,selected:SaveSlot)=>{
    if(current.current)window.dispatchEvent(new Event('scout:flush-field'));
    setGeneration(value=>value+1);
    const next=normalizeGame(value);if(!next.immersion)next.immersion=freshImmersion(next);
    activeSlot.current=selected;setSlot(selected);nativeSave.current='';current.current=next;setGame(next);setError('');setPanel(null);setJournal(false);setSettings(false);setFocusId(null);persist(next);void scoutAudio.start(next.tier);
  },[persist]);
  async function selectCareer(selected:SaveSlot){setBusy(true);try{const raw=desktopBridge()?await desktopBridge()!.loadCareer(selected):localStorage.getItem(key(selected));const value:unknown=raw?JSON.parse(raw):null;if(!validGame(value))throw new Error('Restore this slot’s previous save or import a backup.');activate(value,selected);}finally{setBusy(false);}}
  async function createCareer(selected:SaveSlot,draft:ScoutCreationDraft){
    const latest=desktopBridge()?await desktopBridge()!.listSaveSlots():browserSlots();if(latest.find(item=>item.slot===selected)?.occupied)throw new Error('This slot already has a career. Choose an empty slot.');
    const next=newGame();next.style={...styleOf(next),name:draft.name,avatar:draft.avatar,plate:draft.plate,car:'compact',paint:'slate',camera:'cockpit'};next.playerProfile={background:draft.background};next.immersion=freshImmersion(next);
    next.log.unshift({id:next.event++,week:1,tone:'neutral',text:draft.background==='observer'?'You came here to notice the quiet work that others overlook.':draft.background==='connector'?'You came here to listen and bring good people together.':'You came here to follow the evidence beyond an impressive résumé.'});activate(next,selected);
  }
  async function recoverCareer(selected:SaveSlot){const raw=desktopBridge()?await desktopBridge()!.loadBackup(selected):localStorage.getItem(backup(selected));const value:unknown=raw?JSON.parse(raw):null;if(!validGame(value))throw new Error('No readable previous save exists for this slot.');activate(value,selected);setNotice({text:'Previous save restored. Your other careers are safe.'});}
  const run=useCallback((action:Action):boolean=>{
    if(!current.current)return false;try{const next=act(current.current,action);current.current=next;setGame(next);persist(next);
      if(action.type==='prestige'||action.type==='repeat'){setPanel(null);setJournal(false);setFocusId(null);}
      if(action.type==='offer')scoutAudio.sfx(next.report?.success?'recruit':'error');else if(action.type==='mission')scoutAudio.sfx(next.report?.success?'success':'error');else if(action.type==='refuel')setNotice({text:'Fuel purchased. Your tank and career are saved.'});
      return true;
    }catch(failure){setNotice({text:failure instanceof Error?failure.message:'That action could not finish.',bad:true});return false;}
  },[persist]);
  const openPanel=useCallback((next:GamePanel)=>{window.dispatchEvent(new Event('scout:flush-field'));setPanel(next);setJournal(false);setSettings(false);},[]);
  const interact=useCallback((target:WorldTarget)=>{if(target.kind==='candidate'){const person=current.current?.candidates.find(item=>item.id===target.id);if(person?.status==='available'&&!fieldOf(current.current!).met.includes(target.id)&&!run({type:'meet',id:target.id}))return;setFocusId(null);openPanel({kind:'candidate',id:target.id});}else if(target.station==='garage')setNotice({text:'Walk to your car outside and press E.'});else openPanel({kind:target.station});},[openPanel,run]);
  const travel=useCallback((source:number)=>{window.dispatchEvent(new Event('scout:flush-field'));run({type:'setDestination',destination:source+1});setPanel(null);setJournal(false);setFocusId(null);},[run]);
  const findCandidate=useCallback((id:string)=>{const person=current.current?.candidates.find(item=>item.id===id);if(!person)return;if(person.status==='hired'){openPanel({kind:'candidate',id});return;}travel(candidateLocation(id)-1);setFocusId(id);},[travel,openPanel]);
  const openJournal=useCallback(()=>{window.dispatchEvent(new Event('scout:flush-field'));setJournal(value=>!value);setPanel(null);},[]);
  const openSettings=useCallback(()=>{window.dispatchEvent(new Event('scout:flush-field'));setPanel(null);setJournal(false);setSettings(true);},[]);
  useEffect(()=>{const keydown=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[role=dialog]'))return;if(event.code==='Escape'&&!document.querySelector('[role=dialog]')){event.preventDefault();openSettings();}};window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[openSettings]);
  async function changePreferences(next:ImmersivePreferences){setPreferences(next);const desktop=desktopBridge();try{if(desktop&&next.displayMode!==preferences.displayMode){const displayMode=await desktop.setDisplayMode(next.displayMode);setPreferences(value=>({...value,displayMode}));}else if(!desktop&&next.displayMode==='fullscreen'&&!document.fullscreenElement)await document.documentElement.requestFullscreen();else if(!desktop&&next.displayMode!=='fullscreen'&&document.fullscreenElement)await document.exitFullscreen();}catch(failure){alertError(failure);}}
  async function returnToSlots(){setBusy(true);try{await save();current.current=null;activeSlot.current=null;setGame(null);setSlot(null);nativeSave.current='';++revision.current;setSettings(false);setJournal(false);setPanel(null);await refreshSlots();}catch(failure){alertError(failure);}finally{setBusy(false);}}
  async function quit(){setBusy(true);try{await save();await desktopBridge()?.quit();}catch(failure){setBusy(false);alertError(failure);}}
  async function exportCareer(){window.dispatchEvent(new Event('scout:flush-field'));if(!current.current)return;persist(current.current);const raw=JSON.stringify(current.current,null,2),desktop=desktopBridge();if(desktop){const result=await desktop.exportCareer(raw);if(!result.canceled)setNotice({text:result.ok?'Career backup exported.':result.error||'Export failed.',bad:!result.ok});return;}const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='SCOUT-Slot-'+activeSlot.current+'-Backup.json';link.click();URL.revokeObjectURL(url);}
  async function importCareer(file:File,selected:SaveSlot){if(file.size>1024*1024)throw new Error('Choose a SCOUT backup smaller than 1 MB.');const value:unknown=JSON.parse(await file.text());if(!validGame(value))throw new Error('This file is not a readable SCOUT career.');const latest=desktopBridge()?await desktopBridge()!.listSaveSlots():browserSlots();if(latest.find(item=>item.slot===selected)?.occupied&&!window.confirm('Replace slot '+selected+' with this backup? Its previous save will be kept.'))return;activate(value,selected);setNotice({text:'Career restored in slot '+selected+'.'});}
  async function requestImport(selected:SaveSlot=activeSlot.current||1){importSlot.current=selected;if(!desktopBridge()){importInput.current?.click();return;}const raw=await desktopBridge()!.importCareer();if(raw!==null)await importCareer(new File([raw],'SCOUT-Backup.json'),selected);}
  const fileInput=<input ref={importInput} type="file" accept=".json,application/json" hidden onChange={event=>{const file=event.target.files?.[0];if(file)guard(()=>importCareer(file,importSlot.current));event.target.value='';}}/>;
  const settingsDialog=settings&&<ImmersiveSettings preferences={preferences} onChange={next=>void changePreferences(next)} onClose={()=>setSettings(false)} saveStatus={game?localSaveLabel(saveStatus,updates.status):'Choose a career to begin'} busy={busy} onSave={game?save:undefined} onExport={game?exportCareer:undefined} onImport={()=>requestImport()} onReturnToSlots={returnToSlots} onQuit={desktopBridge()?quit:undefined} audioStatus={audioStatus.started?'Sound is ready for offline play.':'Sound starts when you open a career.'} updatePanel={<button className="scout-update-link" onClick={()=>{setSettings(false);setUpdatesOpen(true);}}>Updates &amp; offline information</button>}/>;
  const updateDialog=<Dialog open={updatesOpen} onOpenChange={setUpdatesOpen}><DialogContent className="scout-journal-dialog"><DialogHeader><DialogTitle>Updates &amp; offline play</DialogTitle><DialogDescription>Update checks happen in the background. Your game, recordings, and saves stay on this device.</DialogDescription></DialogHeader><UpdatePanel status={updates.status} onStatus={updates.setStatus} saveBeforeRestart={save} onResume={()=>setUpdatesOpen(false)} onRestarting={()=>setRestarting(true)}/></DialogContent></Dialog>;
  const toast=notice&&<div className={'scout-notice'+(notice.bad?' bad':'')} role="status">{notice.text}<button onClick={()=>setNotice(null)} aria-label="Dismiss notice">×</button></div>;
  if(!game)return <><CareerSetup slots={slots} busy={loading||busy} error={error} onSelect={selectCareer} onCreate={createCareer} onRecover={recoverCareer} onImport={requestImport} onSettings={openSettings} onQuit={desktopBridge()?()=>void quit():undefined}/>{settingsDialog}{updateDialog}{fileInput}{toast}</>;
  const tier=TIERS[game.tier];
  return <main className="scout-immersive-shell" style={{'--accent':tier.accent} as CSSProperties}>
    <ImmersiveWorld key={generation} game={game} paused={paused} run={run} onInteract={interact} onPanelOpen={openPanel} onJournalOpen={openJournal} preferences={preferences} focusId={focusId}/>
    <div className="scout-drag-strip" aria-hidden="true"/>
    <header className="scout-topbar"><div className="scout-brand"><Compass size={22}/><span>SCOUT<small>{tier.employer} · Week {game.week}</small></span></div><div className="scout-topbar-actions"><span className="scout-save-status"><ShieldCheck size={13}/>{localSaveLabel(saveStatus,updates.status)} · Slot {slot}</span>{!prologue&&<button onClick={openJournal} aria-label="Open field journal (J)"><BookOpen size={18}/><span>Journal</span></button>}<button onClick={openSettings} aria-label="Open settings (Escape)"><Pause size={18}/></button></div></header>
    {!prologue&&<div className="scout-quiet-objective"><span>FIELD NOTES</span><p>{!fieldOf(game).met.length?'Drive to a venue. Look around. Meet someone worth listening to.':members(game).length<tier.goals.hires?'Listen, investigate the work, and find the right fit.':'Return to headquarters to plan your team’s next assignment.'}</p></div>}
    <GameplayPanels game={prologue?{...game,briefing:false,report:null}:game} panel={panel} onClose={()=>setPanel(null)} onOpen={openPanel} run={run} onTravel={travel} onFindCandidate={findCandidate}/>
    <Dialog open={journal} onOpenChange={setJournal}><DialogContent className="scout-journal-dialog"><DialogHeader><span className="scout-eyebrow">{styleOf(game).name.toUpperCase()} / FIELD JOURNAL</span><DialogTitle>A place for your discoveries.</DialogTitle><DialogDescription>Plan an outing or revisit a conversation. Deadlines advance when you finish the week.</DialogDescription></DialogHeader><nav className="scout-journal-tabs"><button onClick={()=>openPanel({kind:'sources'})}><Map size={18}/>Routes &amp; places</button><button onClick={()=>openPanel({kind:'team'})}><Users size={18}/>Your team</button><button onClick={()=>openPanel({kind:'missions'})}><BriefcaseBusiness size={18}/>Assignments</button><button onClick={()=>openPanel({kind:'career'})}><Compass size={18}/>Career</button><button onClick={()=>openPanel({kind:'help'})}><BookOpen size={18}/>Guide</button></nav><div className="scout-journal-summary"><span>Budget <strong>{money(game.cash)}</strong></span><span>Actions <strong>{game.actions}</strong></span><span>Reputation <strong>{game.reputation}</strong></span></div><div className="scout-journal-contacts">{game.candidates.filter(person=>person.discovered).map(person=><button key={person.id} onClick={()=>{if(fieldOf(game).met.includes(person.id)||person.status!=='available')openPanel({kind:'candidate',id:person.id});else findCandidate(person.id);}}><span className="scout-monogram">{person.name.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><span><strong>{person.name}</strong><small>{person.role} · {person.status==='hired'?'Your team':fieldOf(game).met.includes(person.id)?'Met in person':'Explore their venue'}</small></span><span>{person.starred?'★':'→'}</span></button>)}</div><div className="scout-journal-notes">{game.log.slice(0,6).map(note=><p key={note.id}><small>Week {note.week}</small>{note.text}</p>)}</div></DialogContent></Dialog>
    {settingsDialog}{updateDialog}{fileInput}{toast}
  </main>;
}
