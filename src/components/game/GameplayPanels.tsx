"use client";

import { useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Dialog, Tabs } from "radix-ui";
import { StaticScoutPortrait } from "./ScoutPortrait";
import PersonalConversation from "./PersonalConversation";
function PersonPortrait({id,index=0,size=96}:{id?:string;index?:number;size?:number}) {
  const avatar=id?Math.abs(Number(id.split('-')[1])||0)%16:index;
  return <div className="gp-model-portrait" style={{width:size,height:size,flexShrink:0}}><StaticScoutPortrait avatar={avatar}/></div>;
}
import {
  TIERS, MOTIVES, SKILLS, members, payroll, money, weeklyActions,
  missions, canPrestige, intelCost,
  type Game, type Candidate, type Motive, type Action, type Mission,
} from "@/lib/game";
import type { GameplayPanelsProps, RunAction } from "@/lib/game-ui";
import { FIELD_LOCATIONS, candidateLocation, fieldOf, locationOf, atVenue, GAS_PRICES, FUEL_CAPACITY } from "@/lib/expedition";
import { assignmentReadiness, candidateAssignmentClue } from "@/lib/scouting-advice";
import { getImmersiveLocations, REGIONAL_SETTLEMENTS, WORLD_ROADS, WORLD_SIZE } from "@/lib/immersive-locations";
import { findRegionalRoute } from "@/lib/regional-roads";

type PanelProps = { game: Game; run: RunAction; close: () => void };
type TestMethod = "interview" | "sample" | "reference" | "trial";

function PixelButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`gp-button ${className}`} {...props}>{children}</button>;
}

function PanelHeading({ label, title, description }: { label: string; title: string; description: string }) {
  return <header className="gp-heading"><span className="gp-label">{label}</span><Dialog.Title className="gp-title">{title}</Dialog.Title><Dialog.Description className="gp-description">{description}</Dialog.Description></header>;
}

function ActionReason({ children }: { children: ReactNode }) {
  return <p className="gp-action-reason">{children}</p>;
}

function resourceReason(g: Game, actions: number, cost: number): string | null {
  if (g.actions < actions) return `Need ${actions} ${actions === 1 ? "action" : "actions"}. Visit the week clock to recover time.`;
  if (g.cash < cost) return `Need ${money(cost)}. Your budget is ${money(g.cash)}.`;
  return null;
}

function perform(run: RunAction, action: Action, close: () => void) {
  if (run(action)) close();
}

export default function GameplayPanels({ game: g, panel, onClose, onOpen, run, onTravel, onFindCandidate }: GameplayPanelsProps) {
  const active = g.report ? "report" : g.briefing ? "briefing" : panel?.kind;
  const close = () => {
    if (g.report) run({ type: "dismissReport" });
    else if (g.briefing) run({ type: "briefing" });
    onClose();
  };
  const travel = (source: number) => {
    if (onTravel) onTravel(source);
    else {
      if (fieldOf(g).scene === "office" && !run({ type: "fieldEnter" })) return;
      perform(run, { type: "setDestination", destination: source + 1 }, onClose);
    }
  };
  const findCandidate = (id: string) => {
    if (onFindCandidate) onFindCandidate(id);
    else travel(candidateLocation(id) - 1);
  };
  const candidate = panel?.kind === "candidate" ? g.candidates.find(c => c.id === panel.id) : undefined;
  return <Dialog.Root open={!!active} onOpenChange={open => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="gp-overlay" />
      <Dialog.Content className={`gp-modal gp-modal-${active || "closed"}`}>
        <div className="gp-window-bar"><span>SCOUT / {TIERS[g.tier].employer.toUpperCase()}</span><Dialog.Close asChild><button type="button" className="gp-close" aria-label={g.report ? "Dismiss report" : g.briefing ? "Enter the office" : "Close game menu"}>×</button></Dialog.Close></div>
        <div className="gp-scroll">
          {active === "report" && <ReportPanel game={g} run={run} close={onClose} />}
          {active === "briefing" && <BriefingPanel game={g} run={run} close={onClose} />}
          {active === "candidate" && candidate && <CandidatePanel key={candidate.id} candidate={candidate} game={g} run={run} close={onClose} openWeek={() => onOpen({ kind: "week" })} findCandidate={findCandidate} />}
          {active === "candidate" && !candidate && <><PanelHeading label="KNOWN LEAD" title="They have moved on." description="This person is no longer available. Plan a route to a scouting venue for new leads." /><PixelButton onClick={() => onOpen({ kind: "sources" })}>Open route planner</PixelButton></>}
          {active === "sources" && <SourcesPanel game={g} travel={travel} findCandidate={findCandidate} />}
          {active === "venue" && panel?.kind === "venue" && <VenuePanel game={g} run={run} close={onClose} source={panel.source} findCandidate={findCandidate} travel={travel} />}
          {active === "missions" && <MissionsPanel game={g} run={run} close={onClose} openTeam={() => onOpen({ kind: "team" })} />}
          {active === "team" && <TeamPanel game={g} openCandidate={id => onOpen({ kind: "candidate", id })} openSources={() => onOpen({ kind: "sources" })} openMissions={() => onOpen({ kind: "missions" })} />}
          {active === "career" && <CareerPanel game={g} run={run} close={onClose} />}
          {active === "week" && <WeekPanel game={g} run={run} close={onClose} />}
          {active === "help" && <HelpPanel close={onClose} />}
        </div>
        <div className="gp-window-footer"><span>{g.report ? "REPORT RECEIVED" : g.briefing ? "INCOMING DIRECTOR CALL" : "GAME PAUSED"}</span><span>ESC · CLOSE</span></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function BriefingPanel({ game: g, run, close }: PanelProps) {
  const t = TIERS[g.tier];
  const nextStep = `Your compact is parked outside. Set a route to ${FIELD_LOCATIONS[g.tier][1].name}. Walk to the driver’s door and press E. W accelerates, S brakes, and A/D steer. Drive to the actual parking area, come to a stop, and press E to step out. Enter the building, explore, and press E near a person to meet them. Your first interview costs one action and no cash.`;
  return <>
    <PanelHeading label={`CHAPTER ${t.number} / DIRECTOR CALL`} title={`Welcome to ${t.employer}.`} description={t.description} />
    <div className="gp-director-conversation"><div className="gp-speaker-stage"><PersonPortrait id="t0-4" size={144} /><span>THE DIRECTOR</span></div><div><blockquote className="gp-quote">“{t.briefing}”</blockquote><div className="gp-quest"><span className="gp-label">YOUR FIRST QUEST</span><p>{nextStep}</p></div></div></div>
    <p className="gp-small gp-brief-fuel">Watch the gas gauge. Fuel costs cash: park near the station, step out, and walk to the pump to refill.</p>
    <div className="gp-mandate-preview"><span>CHAPTER MANDATE</span><b>{t.goals.hires} hires</b><b>{t.goals.missions} successful assignments</b><b>{t.goals.reputation} reputation</b></div>
    <PixelButton className="gp-primary gp-wide" onClick={() => perform(run, { type: "briefing" }, close)}>Enter the office</PixelButton>
  </>;
}

const MOTIVE_QUOTES: Record<Motive, string> = {
  autonomy: "Give me a problem worth solving and let me decide how.",
  security: "I need to know this role will still exist next month.",
  mentorship: "I want to work with someone who can help me grow.",
  purpose: "Tell me why this work matters to someone.",
  privacy: "I need to know who gets access to my information.",
};

function CandidatePanel({ candidate: c, game: g, run, close, openWeek, findCandidate }: PanelProps & { candidate: Candidate; openWeek: () => void; findCandidate: (id: string) => void }) {
  const [tab, setTab] = useState("talk");
  const [asked, setAsked] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [release, setRelease] = useState(false);
  const t = TIERS[g.tier];
  const knowsMotive = c.tested.includes("interview");
  const met = c.status !== "available" || fieldOf(g).met.includes(c.id);
  const venue = locationOf(g, c.id);
  const contactReason = met ? null : `Meet ${c.name.split(" ")[0]} in person at ${venue.name} before talking, investigating, or making an offer.`;
  const days = c.deadline - g.week;
  const interviewReason = contactReason || resourceReason(g, 1, 0);
  const mentorCost = intelCost(g, t.trial * .6);
  const mentorReason = resourceReason(g, 1, mentorCost);
  function investigate(method: TestMethod) {
    if (!met) return;
    if (run({ type: "investigate", id: c.id, method })) {
      setFeedback(method === "interview" ? "Conversation complete. Your estimates and notes have updated." : "Investigation complete. Your estimates and notes have updated.");
      if (method !== "interview") setTab("investigate");
    }
  }
  return <>
    <PanelHeading label={c.status === "hired" ? "TEAM CONVERSATION" : c.status === "rival" ? "MISSED CONNECTION" : met ? "RECRUIT CONVERSATION" : "KNOWN LEAD / NOT YET MET"} title={c.name} description={`${c.role} · ${c.origin}${c.status === "available" ? ` · ${venue.name}` : ""}`} />
    {!met && <div className="gp-meet-banner"><div><span className="gp-label">FIRST MEETING REQUIRED</span><p>This is a lead, not a conversation yet. Set a route, park outside {venue.name}, then explore inside and press E near them.</p></div><PixelButton className="gp-primary" onClick={() => findCandidate(c.id)}>Meet in person</PixelButton></div>}
    <div className="gp-conversation-layout">
      <aside className="gp-character-column"><div className="gp-character-stage"><PersonPortrait id={c.id} size={176} /></div><span className="gp-role-tag">{c.role}</span>{c.status === "available" ? <><span className={`gp-deadline ${days <= 1 ? "gp-danger-text" : ""}`}>{days <= 0 ? "Last chance this week" : `${days} ${days === 1 ? "week" : "weeks"} before rival offer`}</span><span className="gp-small">Requests {money(c.salary)}/week</span></> : <span className="gp-small">{c.status === "hired" ? "ON YOUR TEAM" : `JOINED ${t.rival.toUpperCase()}`}</span>}<PixelButton className="gp-small-button" onClick={() => run({ type: "star", id: c.id })}>{c.starred ? "★ Saved to shortlist" : "☆ Save to shortlist"}</PixelButton></aside>
      <div className="gp-conversation-content">
        <Tabs.Root value={tab} onValueChange={setTab} className="gp-tabs"><Tabs.List className="gp-tab-list" aria-label={`${c.name} conversation topics`}><Tabs.Trigger className="gp-tab" value="talk">Talk</Tabs.Trigger><Tabs.Trigger className="gp-tab" value="investigate">Investigate</Tabs.Trigger><Tabs.Trigger className="gp-tab" value="offer">{c.status === "hired" ? "Team" : "Offer"}</Tabs.Trigger><Tabs.Trigger className="gp-tab" value="notes">Notes <span>{c.evidence.length}</span></Tabs.Trigger></Tabs.List>
          <Tabs.Content value="talk" className="gp-tab-content">
            <blockquote className="gp-quote">“{knowsMotive ? MOTIVE_QUOTES[c.motive] : c.hook}”</blockquote><p className="gp-story">{c.bio}</p>{c.status === "available" && <PersonalConversation candidate={c} disabled={!met}/>}
            {c.status === "available" && <>
              {!asked && <PixelButton className="gp-dialogue-choice" disabled={!met} onClick={() => setAsked(true)}><span>“Where should we start?”</span><b>FREE</b></PixelButton>}
              {asked && <div className="gp-quest"><span className="gp-label">NEXT CONVERSATION CHOICE</span><p>{!knowsMotive ? "Ask what matters to me. That reveals which benefit fits, and estimates my composure and teamwork." : !c.tested.includes("sample") ? `Look at my ${g.tier === 2 ? "ability under controlled conditions" : "work sample"}. That estimates ${t.skillNames.craft.toLowerCase()} and ${t.skillNames.insight.toLowerCase()}.` : "Check my references or arrange a paid trial. A trial narrows all four ability ranges. Then consider an offer."}</p></div>}
              {!knowsMotive ? <><PixelButton className="gp-primary gp-wide" disabled={!!interviewReason} onClick={() => investigate("interview")}>“What matters to you?” · 1 action · $0</PixelButton>{interviewReason && <ActionReason>{interviewReason}</ActionReason>}</> : <div className="gp-known-motive"><span className="gp-label">YOU LEARNED: {MOTIVES[c.motive].name.toUpperCase()}</span><p>{MOTIVES[c.motive].description}</p><div className="gp-button-row"><PixelButton onClick={() => setTab("investigate")}>Investigate their work</PixelButton><PixelButton onClick={() => setTab("offer")}>Discuss an offer</PixelButton></div></div>}
            </>}
            {c.status === "hired" && <><p className="gp-quest">{c.completed ? "We have worked together in the field. Check my observed abilities, or mentor me before the next assignment." : "Put me on an assignment with one or two teammates. That is how you verify what I can do."}</p><MemberSummary candidate={c} /><PixelButton className="gp-primary gp-wide" onClick={() => setTab("offer")}>Discuss team development</PixelButton></>}
            {c.status === "rival" && <div className="gp-quest"><p>{t.rival} recruited this person. Your investigation notes remain, but this recruit can no longer be hired.</p></div>}
          </Tabs.Content>
          <Tabs.Content value="investigate" className="gp-tab-content"><SkillRanges candidate={c} game={g} /><CandidateRoleClue candidate={c} game={g} />{c.status === "available" && <InvestigationChoices candidate={c} game={g} investigate={investigate} contactReason={contactReason} />}{c.evidence.length > 0 && <EvidenceNote note={c.evidence[c.evidence.length - 1]} />}</Tabs.Content>
          <Tabs.Content value="offer" className="gp-tab-content">
            {c.status === "available" && <OfferChoice candidate={c} game={g} run={run} close={close} contactReason={contactReason} />}
            {c.status === "hired" && <><MemberSummary candidate={c} /><SkillRanges candidate={c} game={g} /><PixelButton className="gp-primary gp-wide" disabled={!!mentorReason} onClick={() => { if (run({ type: "mentor", id: c.id })) setFeedback(`${c.name.split(" ")[0]} completed mentoring. Skills and morale improved.`); }}>Mentor together · {money(mentorCost)} · 1 action</PixelButton><ActionReason>{mentorReason || "Mentoring improves all four abilities and adds 6 morale."}</ActionReason>{!release ? <PixelButton className="gp-danger-button gp-wide" onClick={() => setRelease(true)}>Discuss leaving the team…</PixelButton> : <div className="gp-confirm"><h3>Release {c.name}?</h3><p>This ends their place on your team. Pay {money(c.wage || 0)} for one week of severance.</p><div className="gp-button-row"><PixelButton onClick={() => setRelease(false)}>Keep on team</PixelButton><PixelButton className="gp-danger-button" disabled={g.cash < (c.wage || 0)} onClick={() => perform(run, { type: "release", id: c.id }, close)}>Confirm release</PixelButton></div>{g.cash < (c.wage || 0) && <ActionReason>Your budget cannot cover the severance.</ActionReason>}</div>}</>}
            {c.status === "rival" && <p className="gp-quest">This recruit is no longer available. Scout a destination for three new leads.</p>}
          </Tabs.Content>
          <Tabs.Content value="notes" className="gp-tab-content"><SkillRanges candidate={c} game={g} />{c.evidence.length ? <div className="gp-evidence-list">{c.evidence.slice().reverse().map(note => <EvidenceNote note={note} key={note.kind} />)}</div> : <div className="gp-quest"><span className="gp-label">NO EVIDENCE YET</span><p>A first conversation costs no money and reveals what they value. Work samples, references, and trials reveal different parts of the picture.</p><PixelButton onClick={() => setTab("talk")}>Return to conversation</PixelButton></div>}</Tabs.Content>
        </Tabs.Root>
        {feedback && <p className="gp-feedback" role="status">✓ {feedback}</p>}
        {g.actions === 0 && <div className="gp-time-warning"><span>No time left this week.</span><PixelButton className="gp-small-button" onClick={openWeek}>Visit the week clock</PixelButton></div>}
      </div>
    </div>
  </>;
}

function MemberSummary({ candidate: c }: { candidate: Candidate }) {
  return <div className="gp-member-summary"><div><span>WAGE / WEEK</span><b>{money(c.wage || 0)}</b></div><div><span>MORALE</span><b>{Math.round(c.morale ?? 85)}/100</b></div><div><span>ASSIGNMENTS</span><b>{c.completed || 0}</b></div></div>;
}

function CandidateRoleClue({ candidate, game }: { candidate: Candidate; game: Game }) {
  const clue = candidateAssignmentClue(game, candidate, missions(game));
  if (!clue.names.length) return null;
  return <section className="gp-role-clue"><span className="gp-label">WHERE THIS SPECIALTY MATTERS</span><p>{candidate.role} supports <b>{clue.names.join(" and ")}</b>.</p><p className="gp-small">For these jobs, look closely at {clue.abilities.join(" and ").toLowerCase()}. Meet complementary specialists before choosing a lineup.</p></section>;
}

function SkillRanges({ candidate: c, game: g }: { candidate: Candidate; game: Game }) {
  return <section className="gp-skills"><div className="gp-section-heading"><h3>{c.verified ? "Observed abilities" : "Your ability estimates"}</h3><span>{c.verified ? "FIELD VERIFIED" : "EVIDENCE ONLY"}</span></div><p className="gp-small">{c.verified ? "Verified through an assignment. Experience and mentoring improve abilities." : "Unknowns stay hidden. Investigations narrow the colored ranges."}</p><div className="gp-skill-list">{SKILLS.map(skill => {
    const range = c.verified ? [Math.round(c.skills[skill]), Math.round(c.skills[skill])] : c.ranges[skill];
    const low = range ? Math.round(range[0]) : 0, high = range ? Math.round(range[1]) : 0;
    return <div className="gp-skill" key={skill}><div><span>{TIERS[g.tier].skillNames[skill]}</span><b>{range ? low === high ? `${low}` : `${low}–${high}` : "UNKNOWN"}</b></div><div className={`gp-meter ${range ? "" : "gp-meter-unknown"}`} role="img" aria-label={`${TIERS[g.tier].skillNames[skill]}: ${range ? low === high ? low : `estimated ${low} to ${high}` : "not investigated"}`}><span className="gp-meter-fill" style={{ width: `${low}%` }} />{range && <span className="gp-meter-band" style={{ left: `${low}%`, width: `${Math.max(high - low, 2)}%` }} />}</div></div>;
  })}</div></section>;
}

function InvestigationChoices({ candidate: c, game: g, investigate, contactReason }: { candidate: Candidate; game: Game; investigate: (method: TestMethod) => void; contactReason?: string | null }) {
  const t = TIERS[g.tier];
  const tests: { method: TestMethod; name: string; detail: string; actions: number; cost: number }[] = [
    { method: "interview", name: "Ask what matters", detail: "Motivation, composure & teamwork", actions: 1, cost: 0 },
    { method: "sample", name: g.tier === 2 ? "Observe the ability" : "See a work sample", detail: `${t.skillNames.craft} & ${t.skillNames.insight.toLowerCase()}`, actions: 1, cost: intelCost(g, t.trial * .25) },
    { method: "reference", name: "Call a reference", detail: "Reliability, growth & teamwork", actions: 1, cost: intelCost(g, t.trial * .15) },
    { method: "trial", name: g.tier === 2 ? "Containment trial" : "Arrange a paid trial", detail: "Narrows all four ability estimates", actions: 2, cost: intelCost(g, t.trial) },
  ];
  return <section className="gp-investigations"><div className="gp-section-heading"><h3>Choose an investigation</h3><span>{g.actions} ACTIONS LEFT</span></div>{tests.map(test => {
    const done = c.tested.includes(test.method), reason = contactReason || resourceReason(g, test.actions, test.cost);
    return <div className="gp-investigation-row" key={test.method}><PixelButton className={`gp-investigation-choice ${done ? "gp-completed-choice" : ""}`} disabled={done || !!reason} onClick={() => investigate(test.method)}><span className="gp-choice-symbol">{done ? "✓" : "?"}</span><span><strong>{test.name}</strong><small>{test.detail}</small></span><b>{done ? "COMPLETE" : `${test.cost ? money(test.cost) : "$0"} · ${test.actions} ${test.actions === 1 ? "action" : "actions"}`}</b></PixelButton>{!done && reason && <ActionReason>{reason}</ActionReason>}</div>;
  })}</section>;
}

function EvidenceNote({ note }: { note: Candidate["evidence"][number] }) {
  return <article className="gp-evidence"><div><h3>{note.title}</h3><span>WEEK {note.week}</span></div><p>{note.text}</p></article>;
}

function OfferChoice({ candidate: c, game: g, run, close, contactReason }: PanelProps & { candidate: Candidate; contactReason?: string | null }) {
  const [percent, setPercent] = useState(100);
  const [perk, setPerk] = useState<Motive | "none">("none");
  const wage = Math.round(c.salary * percent / 100);
  const benefitCost = perk === "none" ? 0 : MOTIVES[perk].cost * (g.tier + 1);
  const signing = Math.round(wage * 1.5) + benefitCost;
  const knowsMotive = c.tested.includes("interview");
  const cashAfterSigning = g.cash - signing;
  const nextWeekCash = cashAfterSigning + TIERS[g.tier].stipend - payroll(g) - wage;
  const reason = contactReason || (members(g).length >= 5 ? "Team full: release a member before hiring. Maximum 5." : c.lastOffer === g.week ? "They need time to consider. Try a new offer next week." : resourceReason(g, 1, signing));
  return <div className="gp-offer"><div className="gp-quest"><span className="gp-label">{knowsMotive ? `WHAT MATTERS: ${MOTIVES[c.motive].name.toUpperCase()}` : "WHAT MATTERS: STILL UNKNOWN"}</span><p>{knowsMotive ? MOTIVES[c.motive].description : "Ask what matters in the Talk tab to learn which benefit fits."}</p></div><div className="gp-section-heading"><h3>Weekly salary</h3><span>REQUEST: {money(c.salary)}</span></div><div className="gp-salary-stepper"><PixelButton aria-label="Decrease weekly salary by five percent" disabled={percent <= 85} onClick={() => setPercent(value => value - 5)}>−</PixelButton><output aria-live="polite"><b>{money(wage)}</b><span>{percent}% OF REQUEST</span></output><PixelButton aria-label="Increase weekly salary by five percent" disabled={percent >= 135} onClick={() => setPercent(value => value + 5)}>+</PixelButton></div><p className="gp-small">Choose 85–135% of the requested salary, in 5% steps.</p><fieldset className="gp-benefits"><legend>Choose one benefit</legend><label className={perk === "none" ? "gp-benefit-selected" : ""}><input type="radio" name={`benefit-${c.id}`} value="none" checked={perk === "none"} onChange={() => setPerk("none")} /><span><strong>Salary only</strong><small>No additional benefit</small></span><b>$0</b></label>{Object.entries(MOTIVES).map(([key, benefit]) => <label key={key} className={`${perk === key ? "gp-benefit-selected" : ""} ${knowsMotive && key === c.motive ? "gp-benefit-match" : ""}`}><input type="radio" name={`benefit-${c.id}`} value={key} checked={perk === key} onChange={() => setPerk(key as Motive)} /><span><strong>{benefit.offer}</strong><small>{knowsMotive && key === c.motive ? "✓ Matches what matters to them" : benefit.description}</small></span><b>{money(benefit.cost * (g.tier + 1))}</b></label>)}</fieldset><div className="gp-offer-total"><div><span>SIGNING PAYMENT</span><b>{money(signing)}</b><small>1.5× salary + benefit · once</small></div><div><span>NEW WEEKLY PAYROLL</span><b>{money(payroll(g) + wage)}</b><small>Includes {money(wage)} for this hire</small></div></div><div className="gp-offer-cash"><div><span>BUDGET AFTER SIGNING</span><b className={cashAfterSigning < 0 ? "gp-danger-text" : ""}>{money(Math.max(0, cashAfterSigning))}</b></div><div><span>AFTER NEXT PAYROLL</span><b className={nextWeekCash < 0 ? "gp-danger-text" : ""}>{money(Math.max(0, nextWeekCash))}</b></div><p>{nextWeekCash < 0 ? "This hire would leave you short for payroll. Complete an assignment or adjust the offer before advancing the week." : "If accepted, this includes next week’s operating support and the whole team’s wages. Future assignment rewards are not counted."}</p></div><PixelButton className="gp-primary gp-wide" disabled={!!reason} onClick={() => perform(run, { type: "offer", id: c.id, salary: wage, perk }, close)}>Make this offer · 1 action</PixelButton><ActionReason>{reason || "A declined offer spends the action. Signing money is paid only if accepted."}</ActionReason></div>;
}

function SourcesPanel({ game: g, travel, findCandidate }: { game: Game; travel: (source: number) => void; findCandidate: (id: string) => void }) {
  const t = TIERS[g.tier], field = fieldOf(g), locations = FIELD_LOCATIONS[g.tier].filter(location => location.source !== null);
  const cost = intelCost(g, t.sourceCost), gas = FIELD_LOCATIONS[g.tier][4], gasPrice = GAS_PRICES[g.tier];
  const worldLocations = getImmersiveLocations(g.tier), car = g.immersion?.vehicle ?? {x:field.car.x,z:field.car.y};
  return <>
    <PanelHeading label="ROUTE PLANNER / FIELD SCOUTING" title="Your next recruit is out there." description="Set your GPS, get behind the wheel, and follow the roads to a real scouting venue. Driving uses fuel, but no weekly actions." />
    <div className="gp-region-survey" aria-label="Cirrus regional roads and settlements">
      <svg viewBox={`0 0 ${WORLD_SIZE.width} ${WORLD_SIZE.depth}`} role="img" aria-label="Roads connecting seven settlements">
        <rect width={WORLD_SIZE.width} height={WORLD_SIZE.depth} fill="#d5deba"/>
        {REGIONAL_SETTLEMENTS.map(region=><g key={region.id}><ellipse cx={region.center.x} cy={region.center.z} rx="590" ry="470" fill="#ebdfc4"/><text x={region.center.x} y={region.center.z-530} textAnchor="middle" fill="#234b56" fontSize="280">{region.name}</text></g>)}
        {WORLD_ROADS.map(road=><rect key={road.id} x={road.x-road.width/2} y={road.z-road.depth/2} width={road.width} height={road.depth} fill={road.kind==='highway'?'#b89b69':'#8faaa0'}/>)}
        {worldLocations.filter(location=>location.id>=1&&location.id<=3).map(location=><g key={location.id}><circle cx={location.parking.x} cy={location.parking.z} r="145" fill="#234b56"/><text x={location.parking.x} y={location.parking.z+90} textAnchor="middle" fontSize="260" fill="#fff4df">{location.id}</text></g>)}
      </svg>
      <span>Cirrus region · interstate, town roads & quiet lanes</span>
    </div>
    <div className="gp-button-row"><PixelButton onClick={()=>travel(-1)}>Headquarters</PixelButton><PixelButton onClick={()=>travel(3)}>Highway Fuel</PixelButton></div>
    <div className="gp-route-instructions"><span className="gp-label">GET THERE ON YOUR OWN TERMS</span><p><kbd>E</kbd> Get in beside your car · <kbd>WASD</kbd> / arrows to drive · <kbd>E</kbd> Park and exit · walk to a person and press <kbd>E</kbd>.</p></div>
    <div className="gp-route-cards">{locations.map(location => {
      const leads = g.candidates.filter(c => c.discovered && c.status === "available" && candidateLocation(c.id) === location.id);
      const visited = field.visited.includes(location.id);
      return <article className="gp-route-card" key={location.id}>
        <div className="gp-route-card-top"><span className="gp-destination-marker">{location.id}</span><div><span className="gp-label">{visited ? "✓ VISITED" : "UNEXPLORED"} / {t.sources[location.source!].tag}</span><h3>{location.name}</h3><p>{location.subtitle} · {(findRegionalRoute(car,worldLocations[location.id].parking).distance/1000).toFixed(1)} km by road</p></div></div>
        <div className="gp-route-known"><span className="gp-label">KNOWN LEADS / {leads.length}</span>{leads.length ? leads.slice(0, 4).map(c => <button type="button" key={c.id} onClick={() => findCandidate(c.id)}><span>{c.name}</span><b>{field.met.includes(c.id) ? "✓ MET" : "NOT MET"}</b></button>) : <p>No open contacts yet. Search when you arrive.</p>}{leads.length > 4 && <p>+{leads.length - 4} more contacts at this venue</p>}</div>
        <PixelButton className="gp-primary gp-wide" onClick={() => travel(location.source!)}>Set route to {location.name}</PixelButton>
        <span className="gp-small">GPS is free · Search after arrival: {money(cost)} + 1 action for 3 leads</span>
      </article>;
    })}</div>
    <section className="gp-route-fuel-stop"><div className="gp-fuel-sign" aria-hidden="true"><b>GAS</b><span>${gasPrice.toFixed(2)}</span></div><div><span className="gp-label">FUEL STOP / {gas.name.toUpperCase()}</span><h3>Keep the scouting route going.</h3><div className="gp-route-fuel-meter"><span>Tank: {field.fuel.toFixed(1)} / {FUEL_CAPACITY} gal</span><div className="gp-meter"><span className="gp-meter-fill" style={{ width: `${field.fuel / FUEL_CAPACITY * 100}%`, background: field.fuel <= FUEL_CAPACITY * .2 ? "#e8a879" : undefined }} /></div></div><p>Park near the station, step out, and walk to the pump. Refilling costs cash and no actions.</p><PixelButton className="gp-primary" onClick={() => travel(3)}>Set route to the fuel stop</PixelButton><span className="gp-small">${gasPrice.toFixed(2)}/gallon · Fill this tank for about ${(Math.max(0, FUEL_CAPACITY - field.fuel) * gasPrice).toFixed(2)}</span></div></section>
    <p className="gp-small gp-route-footnote">Setting a route changes your destination. Your car stays where you parked it. Rival deadlines advance only when you advance the week.</p>
  </>;
}

function VenuePanel({ game: g, run, close, source, findCandidate, travel }: PanelProps & { source: number; findCandidate: (id: string) => void; travel: (source: number) => void }) {
  const sourceIndex = Math.max(0, Math.min(2, Math.floor(source)));
  const location = FIELD_LOCATIONS[g.tier][sourceIndex + 1], field = fieldOf(g), t = TIERS[g.tier];
  const here = atVenue(g, location.id);
  const leads = g.candidates.filter(c => c.discovered && c.status === "available" && candidateLocation(c.id) === location.id);
  const cost = intelCost(g, t.sourceCost);
  const reason = here ? resourceReason(g, 1, cost) : `Park and step out near ${location.name}'s entrance to search this venue.`;
  return <>
    <PanelHeading label={here ? "FIELD VISIT / ARRIVED" : "FIELD VISIT / VENUE NOTES"} title={location.name} description={`${location.subtitle}. ${t.sources[sourceIndex].detail}`} />
    <div className="gp-venue-intro"><span className="gp-destination-marker">{location.id}</span><div><span className="gp-label">{field.visited.includes(location.id) ? "✓ LOCATION VISITED" : "LOCATION NOT YET VISITED"}</span><p>Explore the building and find the people working inside. Press E near a recruit to begin a conversation.</p></div></div>
    <section className="gp-venue-contacts"><div className="gp-section-heading"><h3>People to meet</h3><span>{leads.length} OPEN LEADS</span></div>{leads.length ? <div className="gp-roster">{leads.map(c => <button type="button" className="gp-roster-member gp-venue-person" key={c.id} onClick={() => findCandidate(c.id)}><PersonPortrait id={c.id} size={80} /><span><strong>{c.name}</strong><small>{c.role} · {c.origin}</small><small>{field.met.includes(c.id) ? "✓ You have met" : "First meeting still ahead"} · {c.deadline <= g.week ? "Last chance this week" : `${c.deadline - g.week} weeks before rival offer`}</small></span><b>Find in person</b></button>)}</div> : <div className="gp-quest"><p>No open contacts remain at this venue. Search for another three leads.</p></div>}</section>
    <div className="gp-venue-search"><div><span className="gp-label">FOLLOW THE LOCAL NETWORK</span><h3>Find three more leads</h3><p>A search spends 1 action and {money(cost)}. New contacts appear here for you to meet.</p></div><PixelButton className="gp-primary gp-wide" disabled={!!reason} onClick={() => { if (atVenue(g, location.id)) perform(run, { type: "scout", source: sourceIndex }, close); }}>Search this venue · {money(cost)} · 1 action</PixelButton>{reason && <ActionReason>{reason}</ActionReason>}</div>
    {!here && <PixelButton className="gp-wide" onClick={() => travel(sourceIndex)}>Set route to {location.name}</PixelButton>}
  </>;
}

function MissionsPanel({ game: g, run, close, openTeam }: PanelProps & { openTeam: () => void }) {
  const jobs = missions(g), team = members(g);
  const [missionId, setMissionId] = useState(jobs[0].id);
  const [ids, setIds] = useState<string[]>([]);
  const mission = jobs.find(job => job.id === missionId) || jobs[0];
  const currentIds = ids.filter(id => team.some(c => c.id === id));
  const assigned = team.filter(c => currentIds.includes(c.id));
  const reason = g.missionThisWeek ? "Assignment already completed this week. Advance the clock for another." : team.length < 2 ? "Recruit at least 2 people before dispatching." : currentIds.length < 2 ? "Choose 2 or 3 team members for this assignment." : resourceReason(g, 1, 0);
  function toggle(id: string) { setIds(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 3 ? [...current, id] : current); }
  return <><PanelHeading label="ASSIGNMENT BOARD" title="Send the right people." description="Choose a job and a team of two or three. One assignment is available each week." /><div className="gp-mission-layout"><nav className="gp-job-list" aria-label="Current assignments">{jobs.map((job, index) => <button type="button" key={job.id} className={`gp-job-choice ${mission.id === job.id ? "gp-job-selected" : ""}`} aria-pressed={mission.id === job.id} onClick={() => setMissionId(job.id)}><span className="gp-label">JOB 0{index + 1} / TARGET {job.difficulty}</span><strong>{job.name}</strong><span>{money(job.reward)} · +{job.reputation} reputation</span></button>)}</nav><section className="gp-mission-details"><h3>{mission.name}</h3><p>{mission.description}</p><MissionRequirements mission={mission} game={g} assigned={assigned} /><div className="gp-reward-line"><span>SUCCESS: {money(mission.reward)}</span><span>SETBACK: {money(Math.round(mission.reward * .3))}</span></div>{g.tier === 2 && <p className="gp-small gp-danger-text">Public exposure +{mission.exposure} on success, +{mission.exposure + 12} on a setback.</p>}</section></div><section className="gp-assignment-team"><div className="gp-section-heading"><h3>Choose your lineup</h3><span>{currentIds.length} / 3 SELECTED</span></div>{team.length ? <div className="gp-lineup">{team.map(c => <button type="button" key={c.id} className={`gp-lineup-member ${currentIds.includes(c.id) ? "gp-lineup-selected" : ""}`} aria-pressed={currentIds.includes(c.id)} disabled={!currentIds.includes(c.id) && currentIds.length >= 3} onClick={() => toggle(c.id)}><span className="gp-lineup-check">{currentIds.includes(c.id) ? "✓" : "+"}</span><PersonPortrait id={c.id} size={88} /><strong>{c.name}</strong><span>{c.role}</span><small>Morale {Math.round(c.morale ?? 85)} · {c.verified ? "Verified" : "Unverified"}</small></button>)}</div> : <div className="gp-quest"><p>No team members yet. Talk, investigate, and make an offer to hire your first recruit.</p><PixelButton onClick={openTeam}>Open team menu</PixelButton></div>}<p className="gp-small">Abilities are verified by field work. Cover the required specialties; morale, reliability, and this chapter’s conditions also affect performance.</p></section><AssignmentPlan game={g} mission={mission} assigned={assigned} /><PixelButton className="gp-primary gp-wide" disabled={!!reason} onClick={() => perform(run, { type: "mission", mission: mission.id, ids: currentIds }, close)}>Dispatch team · 1 action</PixelButton><ActionReason>{reason || `Target score ${mission.difficulty}. The result is revealed after dispatch.`}</ActionReason></>;
}

function MissionRequirements({ mission, game: g, assigned }: { mission: Mission; game: Game; assigned: Candidate[] }) {
  return <><div className="gp-required-roles"><span className="gp-label">REQUIRED SPECIALTIES</span><div>{mission.roles.map(role => <span key={role} className={assigned.some(c => c.role === role) ? "gp-covered-role" : ""}>{assigned.some(c => c.role === role) ? "✓" : "□"} {role}</span>)}</div></div><div className="gp-mission-weights"><span className="gp-label">WEIGHTED ABILITIES</span>{SKILLS.map(skill => <div key={skill}><span>{TIERS[g.tier].skillNames[skill]}</span><div className="gp-meter"><span className="gp-meter-fill" style={{ width: `${mission.weights[skill] * 100}%` }} /></div><b>{Math.round(mission.weights[skill] * 100)}%</b></div>)}</div>{g.tier === 1 && <p className="gp-small">Different specialties earn +3 collaboration points per extra specialty.</p>}{g.tier === 2 && g.exposure > 40 && <p className="gp-small gp-danger-text">Exposure above 40 reduces the team’s score. Run cover from Career.</p>}</>;
}

function AssignmentPlan({ game, mission, assigned }: { game: Game; mission: Mission; assigned: Candidate[] }) {
  const plan = assignmentReadiness(game, mission, assigned);
  return <section className={`gp-assignment-plan gp-plan-${plan.tone}`} aria-live="polite">
    <div className="gp-section-heading"><h3>{plan.label}</h3><span>SCOUT’S ESTIMATE</span></div>
    {plan.range && <div className="gp-plan-score"><div><span>ESTIMATED SCORE RANGE</span><b>{plan.range[0]}–{plan.range[1]}</b></div><div><span>JOB TARGET</span><b>{mission.difficulty}</b></div><div><span>SPECIALTIES</span><b>{mission.roles.length - plan.missingRoles.length}/{mission.roles.length}</b></div></div>}
    <div className="gp-plan-advice">{plan.advice.map(advice => <p key={advice}>{advice}</p>)}</div>
    {plan.range && <p className="gp-small">Based on observed skills, investigation ranges, reference notes, morale, and chapter conditions. Unknowns widen the range.</p>}
  </section>;
}

function TeamPanel({ game: g, openCandidate, openSources, openMissions }: { game: Game; openCandidate: (id: string) => void; openSources: () => void; openMissions: () => void }) {
  const team = members(g), shortlist = g.candidates.filter(c => c.starred && c.status === "available" && c.discovered);
  return <><PanelHeading label="TEAM QUARTERS" title={`${team.length} people. Shared possibilities.`} description={`Your team holds up to five members. Current weekly payroll: ${money(payroll(g))}.`} /><div className="gp-roster">{team.map(c => <button type="button" className="gp-roster-member" key={c.id} onClick={() => openCandidate(c.id)}><PersonPortrait id={c.id} size={88} /><span><strong>{c.name}</strong><small>{c.role} · {money(c.wage || 0)}/week</small><small>Morale {Math.round(c.morale ?? 85)} · {c.completed || 0} assignments · {c.verified ? "Verified" : "Unverified"}</small></span><b>Talk</b></button>)}{team.length < 5 && <div className="gp-empty-slot"><span>+</span><p>{5 - team.length} open {5 - team.length === 1 ? "place" : "places"} on the team</p><PixelButton onClick={openSources}>Scout new recruits</PixelButton></div>}</div>{shortlist.length > 0 && <section className="gp-shortlist"><div className="gp-section-heading"><h3>Recruits you saved</h3><span>{shortlist.length} CONTACTS</span></div><div className="gp-button-row">{shortlist.map(c => <PixelButton key={c.id} onClick={() => openCandidate(c.id)}>★ {c.name}</PixelButton>)}</div></section>}<div className="gp-button-row"><PixelButton className="gp-primary" disabled={team.length < 2} onClick={openMissions}>Choose an assignment</PixelButton><PixelButton onClick={openSources}>Visit travel board</PixelButton></div>{team.length < 2 && <ActionReason>Hire at least 2 members to take an assignment.</ActionReason>}</>;
}

function CareerPanel({ game: g, run, close }: PanelProps) {
  const [confirm, setConfirm] = useState<"prestige" | "repeat" | null>(null);
  const [feedback, setFeedback] = useState("");
  const t = TIERS[g.tier], team = members(g), ready = canPrestige(g);
  const goals = [{ label: "People on the team", current: team.length, target: t.goals.hires }, { label: "Successful assignments", current: g.completed, target: t.goals.missions }, { label: "Reputation earned", current: g.reputation, target: t.goals.reputation }];
  const coverReason = g.exposure === 0 ? "Your exposure is already zero." : resourceReason(g, 1, 3500);
  const rescueReason = g.rescueUsed ? "Emergency funding already used this chapter." : g.cash > t.budget * .25 ? "Available at 25% of the starting budget or lower." : null;
  return <><PanelHeading label="DIRECTOR'S OFFICE / CAREER" title={g.won ? "Director clearance granted." : "Earn your next chapter."} description={g.won ? "All three organizations recognize your judgment. Continue the career or begin a fresh season here." : "Meet the current mandate to prestige. Each new chapter begins with its own people, budget, and goals."} /><ol className="gp-chapters">{TIERS.map((tier, index) => <li key={tier.name} className={`${g.tier === index ? "gp-chapter-current" : ""} ${g.tier < index ? "gp-chapter-locked" : ""}`}><span className="gp-label">CHAPTER {tier.number}</span><strong>{tier.employer}</strong><span>{g.tier > index ? "✓ COMPLETE" : g.tier === index ? g.won ? "✓ COMPLETE" : "CURRENT" : "LOCKED"}</span><small>{g.tier < index ? `Complete Chapter 0${index}'s mandate` : tier.name}</small></li>)}</ol><section className="gp-career-goals"><div className="gp-section-heading"><h3>{t.employer} mandate</h3><span>{ready ? "READY" : "IN PROGRESS"}</span></div>{goals.map(goal => <div className="gp-goal" key={goal.label}><span className={goal.current >= goal.target ? "gp-goal-check gp-goal-done" : "gp-goal-check"}>{goal.current >= goal.target ? "✓" : ""}</span><span>{goal.label}</span><b>{goal.current} / {goal.target}</b><div className="gp-meter"><span className="gp-meter-fill" style={{ width: `${Math.min(100, goal.current / goal.target * 100)}%` }} /></div></div>)}{g.tier === 2 && <div className="gp-goal"><span className={g.exposure < 60 ? "gp-goal-check gp-goal-done" : "gp-goal-check"}>{g.exposure < 60 ? "✓" : ""}</span><span>Exposure below 60</span><b>{g.exposure} / 100</b><div className="gp-meter"><span className="gp-meter-fill" style={{ width: `${g.exposure}%`, background: g.exposure >= 60 ? "#e79b7d" : undefined }} /></div></div>}</section><div className="gp-quest"><span className="gp-label">{g.prestige ? `${g.prestige} PRESTIGE PERKS ACTIVE` : "YOUR NEXT UNLOCK"}</span><p>{t.perk}</p><span className="gp-small">Current time allowance: {weeklyActions(g)} actions each week.{g.prestige >= 2 ? " Investigations and mentoring cost 20% less." : ""}</span></div>{confirm === "prestige" ? <div className="gp-confirm"><h3>{g.tier === 2 ? "Accept Director clearance?" : `Move to ${t.next}?`}</h3><p>{g.tier === 2 ? "You can keep running The Veil after accepting your final clearance." : `Your current team stays at ${t.employer}. Begin the next chapter with a new budget and recruits. Completed chapters and prestige experience carry forward.`}</p><div className="gp-button-row"><PixelButton onClick={() => setConfirm(null)}>Stay here</PixelButton><PixelButton className="gp-primary" onClick={() => perform(run, { type: "prestige" }, close)}>{g.tier === 2 ? "Accept clearance" : "Prestige & advance"}</PixelButton></div></div> : !g.won && <><PixelButton className="gp-primary gp-wide" disabled={!ready} onClick={() => setConfirm("prestige")}>{g.tier === 2 ? "Earn Director clearance" : `Prestige ${t.next}`}</PixelButton>{!ready && <ActionReason>Complete every condition in the mandate to unlock this chapter.</ActionReason>}</>}{g.tier === 2 && <section className="gp-career-actions"><div className="gp-section-heading"><h3>Protect the operation</h3><span>EXPOSURE {g.exposure}</span></div><p>Cover removes 25 exposure. Each week removes 3. At 75 or higher after that reduction, outside attention costs $10,000 and 5 reputation.</p><PixelButton disabled={!!coverReason} onClick={() => { if (run({ type: "cover" })) setFeedback("Cover completed. Public exposure fell by 25."); }}>Run cover · $3,500 · 1 action</PixelButton>{coverReason && <ActionReason>{coverReason}</ActionReason>}</section>}<section className="gp-career-actions"><div className="gp-section-heading"><h3>Emergency funding</h3><span>ONCE PER CHAPTER</span></div><p>Receive {money(t.budget * .45)} in funding. Your reputation falls by 10.</p><PixelButton disabled={!!rescueReason} onClick={() => { if (run({ type: "rescue" })) setFeedback("Emergency funding received. Reputation fell by 10."); }}>Request operating funds · 0 actions</PixelButton>{rescueReason && <ActionReason>{rescueReason}</ActionReason>}</section>{feedback && <p className="gp-feedback" role="status">✓ {feedback}</p>}{g.history.length > 0 && <div className="gp-career-record"><span className="gp-label">COMPLETED CHAPTERS</span>{g.history.map(history => <p key={history.tier}>{TIERS[history.tier].employer} · Week {history.week} · {history.hires} hires · {history.successes} wins · {history.reputation} reputation</p>)}</div>}{confirm === "repeat" ? <div className="gp-confirm"><h3>Restart this chapter?</h3><p>Reset this chapter’s recruits, team, budget, and results. Your completed chapters and prestige perks remain.</p><div className="gp-button-row"><PixelButton onClick={() => setConfirm(null)}>Keep this career</PixelButton><PixelButton className="gp-danger-button" onClick={() => perform(run, { type: "repeat" }, close)}>Confirm restart</PixelButton></div></div> : <PixelButton className="gp-danger-button gp-wide" onClick={() => setConfirm("repeat")}>Restart this chapter…</PixelButton>}</>;
}

function WeekPanel({ game: g, run, close }: PanelProps) {
  const t = TIERS[g.tier], wages = payroll(g), nextCash = g.cash + t.stipend - wages;
  const leaving = g.candidates.filter(c => c.status === "available" && c.discovered && c.deadline < g.week + 1);
  return <><PanelHeading label="WEEK CLOCK" title={`Advance to week ${g.week + 1}?`} description="Time moves for your team and your rivals. Wages are paid as the new week begins." /><div className="gp-clock-scene" aria-hidden="true"><div className="gp-clock-face"><span /><b>{String(g.week + 1).padStart(2, "0")}</b></div><div><strong>A new week.</strong><span>{weeklyActions(g)} actions restored</span></div></div><dl className="gp-week-accounting"><div><dt>Current budget</dt><dd>{money(g.cash)}</dd></div><div><dt>Operating support</dt><dd className="gp-good-text">+{money(t.stipend)}</dd></div><div><dt>Team payroll</dt><dd>−{money(wages)}</dd></div><div className="gp-account-total"><dt>Next week’s budget</dt><dd className={nextCash < 0 ? "gp-danger-text" : ""}>{money(Math.max(0, nextCash))}</dd></div></dl>{g.actions > 0 && <p className="gp-warning-box">{g.actions} unused {g.actions === 1 ? "action expires" : "actions expire"}. Unused time does not carry forward.</p>}{nextCash < 0 && <p className="gp-warning-box">This budget misses payroll. Cash stops at $0, reputation falls by 8, and each member loses 15 morale.</p>}<div className="gp-quest"><span className="gp-label">RIVAL RECRUITING / {t.rival.toUpperCase()}</span><p>{leaving.length ? `${leaving.map(c => c.name).join(", ")} will accept rival offers when you advance.` : "No known recruits reach their deadline this week. Other recruits' deadlines still get closer."}</p></div>{g.tier === 2 && <p className="gp-small">Exposure falls by 3. If it remains at least 75, outside attention costs $10,000 and 5 reputation.</p>}<p className="gp-small">You can make new offers and take another assignment next week.</p><div className="gp-button-row"><PixelButton onClick={close}>Stay this week</PixelButton><PixelButton className="gp-primary" onClick={() => perform(run, { type: "nextWeek" }, close)}>Advance the clock</PixelButton></div></>;
}

function HelpPanel({ close }: { close: () => void }) {
  return <>
    <PanelHeading label="FIELD GUIDE / CONTROLS" title="Take the wheel. Look closer." description="Explore the region, drive to real venues, and get to know the people inside." />
    <div className="gp-controls">
      <div><kbd>W A S D</kbd><span>Walk · In car: W gas, S brake/reverse, A/D steer. Arrows also work.</span></div>
      <div><kbd>E</kbd><span>Enter car / park & exit / interact</span></div>
      <div><kbd>SPACE</kbd><span>Hold to brake while driving</span></div>
      <div><kbd>MOUSE</kbd><span>Look around. Click the world to capture the mouse; Escape releases it.</span></div>
      <div><kbd>M</kbd><span>Open the regional map and choose a driving destination.</span></div>
      <div><kbd>T</kbd><span>Call a tow while standing beside a stranded car.</span></div>
      <div><kbd>J / TAB</kbd><span>Open your field journal.</span></div>
      <div><kbd>RIGHT CLICK</kbd><span>Walk to a nearby place while the mouse is free. Left click never moves you.</span></div>
      <div><kbd>ESC</kbd><span>Pause the world / close a menu</span></div>
    </div>
    <ol className="gp-help-steps">
      <li><span>1</span><div><strong>Make the scout yours.</strong><p>Choose one of three save slots and create your scout before the story begins. You start with a basic compact and your own license plate.</p></div></li>
      <li><span>2</span><div><strong>Plan a real route.</strong><p>The route planner shows three scouting venues and their known leads. Set your GPS, press E beside your parked car, and drive with WASD or arrows. Follow the route in your cockpit. Take the turns yourself, enjoy the drive, and watch your fuel gauge. Driving costs no weekly actions.</p></div></li>
      <li><span>3</span><div><strong>Park, step out, meet.</strong><p>Press E to park and exit at the venue. Walk through the entrance, explore the rooms, and press E near a person to meet. A known lead must be met in person before an interview, investigation, or offer. Ask at the community desk inside for three new leads at the displayed cost.</p></div></li>
      <li><span>4</span><div><strong>Follow the evidence.</strong><p>An interview costs 1 action and $0, revealing motivation. Samples, references, and trials narrow ability estimates. A matching benefit helps an offer; accepted hires cost 1.5× salary plus benefit once, then wages each week.</p></div></li>
      <li><span>5</span><div><strong>Build the right lineup.</strong><p>Choose 2–3 hires for an assignment. Cover the required specialties and compare your estimated score range with the target. Unknown abilities and reliability widen that range. Field work verifies abilities. Mentoring raises skills and morale.</p></div></li>
      <li><span>6</span><div><strong>Advance, then prestige.</strong><p>The week clock pays support and payroll and restores actions; rival deadlines get closer. Meet your chapter mandate in the director’s office to prestige. Each prestige adds an action; the second reduces investigation costs. Final clearance needs exposure below 60.</p></div></li>
    </ol>
    <div className="gp-quest"><span className="gp-label">TAKE CARE OF YOUR COMPACT</span><p>Your dashboard shows speed, fuel and condition. Service stations sell fuel and repairs. If the tank runs dry or a serious crash disables the engine, stop, step out, and press T beside the car. A $150 tow takes you to the nearest station; fuel and repairs are purchased there.</p></div>
    <p className="gp-small">Settings has audio sliders, display and mouse comfort controls, and Save & exit.</p>
    <PixelButton className="gp-primary gp-wide" onClick={close}>Back to the field</PixelButton>
  </>;
}

function ReportPanel({ game: g, run, close }: PanelProps) {
  const report = g.report!;
  const cast = report.contributions ? report.contributions.map(contribution => g.candidates.find(c => c.name === contribution.name)).filter((candidate): candidate is Candidate => !!candidate) : g.candidates.filter(c => report.body.includes(c.name)).slice(0, 3);
  const targetMatch = report.body.match(/target (\d+)/);
  const target = targetMatch ? Number(targetMatch[1]) : undefined;
  const average = report.contributions?.length ? Math.round(report.contributions.reduce((sum, contribution) => sum + contribution.score, 0) / report.contributions.length) : 0;
  const modifier = typeof report.score === "number" ? report.score - average : 0;
  return <><PanelHeading label={report.contributions ? "FIELD REPORT / ASSIGNMENT" : "INCOMING REPORT"} title={report.title} description={report.body} /><div className={`gp-report-scene ${report.success ? "gp-report-success" : "gp-report-setback"}`}><span className="gp-report-stamp">{report.success ? "✓" : "!"}</span><div className="gp-report-cast">{cast.length ? cast.map((c, index) => <div key={c.id} style={{ animationDelay: `${index * 100}ms` }}><PersonPortrait id={c.id} size={104} /><span>{c.name.split(" ")[0]}</span></div>) : <PersonPortrait id="t0-4" size={104} />}</div><span className="gp-label">{report.contributions ? report.success ? "TEAM DELIVERED" : "REGROUP & LEARN" : report.success ? "A NEW POSSIBILITY" : "TRY AGAIN NEXT WEEK"}</span></div>{typeof report.score === "number" && <><div className="gp-result-score"><div><span>TEAM SCORE</span><b>{report.score}</b></div>{target !== undefined && <div><span>TARGET</span><b>{target}</b></div>}<div><span>EARNED</span><b>{money(report.reward || 0)}</b></div></div><section className="gp-score-breakdown"><div className="gp-section-heading"><h3>Performance breakdown</h3><span>FIELD OBSERVED</span></div>{report.contributions?.map(contribution => <div className="gp-contribution" key={contribution.name}><span>{contribution.name}</span><div className="gp-meter"><span className="gp-meter-fill" style={{ width: `${Math.min(100, contribution.score)}%` }} /></div><b>{contribution.score}</b></div>)}<div className="gp-score-math"><span>Member average <b>{average}</b></span><span>Specialties & chapter conditions <b>{modifier >= 0 ? "+" : ""}{modifier}</b></span><span>Final score <b>{report.score}</b></span></div></section><p className="gp-small">Participants’ abilities are now verified. Experience improves skills; success lifts morale and setbacks lower it.</p></>}<PixelButton className="gp-primary gp-wide" onClick={() => { run({ type: "dismissReport" }); close(); }}>{fieldOf(g).scene === "district" ? "Back to scouting" : "Back to the office"}</PixelButton></>;
}
