import assert from 'node:assert/strict';
import { act, newGame, validGame, members, missions, payroll, canPrestige, MOTIVES, SKILLS } from '../src/lib/game.ts';
import { candidatePosition } from '../src/lib/expedition.ts';
import { assignmentReadiness, candidateAssignmentClue } from '../src/lib/scouting-advice.ts';

// A beginner can finish the opening project with six actions using only dossier evidence.
let game = newGame(20261001);
const take = (action) => {
  game = act(game, action);
  assert(validGame(game), 'Player actions must produce a reloadable career');
};
const candidate = (id) => game.candidates.find(person => person.id === id);
// These engine tests fixture a pedestrian arrival; field-journey tests drive
// and walk the same trip through the actual collision and fuel simulation.
const introduce = (id) => {
  if (game.field.scene === 'office') take({ type: 'fieldEnter' });
  take({ type: 'fieldSnapshot', field: { ...game.field, driving: false, player: candidatePosition(game, id) } });
  take({ type: 'meet', id });
};
const speakAndRecruit = (id, sample = false) => {
  introduce(id);
  take({ type: 'investigate', id, method: 'interview' });
  const conversation = candidate(id).evidence.find(note => note.kind === 'interview');
  const learnedMotive = Object.entries(MOTIVES).find(([, motive]) =>
    conversation.text.includes(`values ${motive.name.toLowerCase()}.`)
  )?.[0];
  assert(learnedMotive, 'The conversation gives the player a usable offer benefit');
  if (sample) take({ type: 'investigate', id, method: 'sample' });
  take({ type: 'offer', id, salary: candidate(id).salary, perk: learnedMotive });
  assert.equal(candidate(id).status, 'hired');
  assert.equal(game.report.title, 'Offer accepted');
  take({ type: 'dismissReport' });
};

assert.equal(game.actions, 6);
assert.equal(game.candidates.filter(person => person.discovered).length, 6);
assert(SKILLS.every(skill => !candidate('t0-0').ranges[skill]), 'Untested skills begin unknown');
take({ type: 'briefing' });
speakAndRecruit('t0-0', true); // Maya: conversation, visible work sample, matching offer.
speakAndRecruit('t0-1'); // Theo: conversation and matching offer.
assert.equal(game.actions, 1, 'Two informed offers leave time for the first project');
assert.equal(candidate('t0-0').verified, false, 'An offer does not reveal exact skills');
assert.equal(candidate('t0-1').ranges.craft, undefined, 'Unreviewed ability remains unknown');
assert.equal(game.candidates.filter(person => person.discovered).length, 8, 'Hires open referral trails');

const project = missions(game)[0];
assert(project.roles.every(role => members(game).some(person => person.role === role)));
take({ type: 'mission', mission: project.id, ids: members(game).map(person => person.id) });
assert.equal(game.actions, 0);
assert.equal(game.completed, 1);
assert.equal(game.report.success, true, 'A complementary opening team can succeed immediately');
assert(game.cash > 42000, 'The opening project covers investigation and signing payments');
assert(members(game).every(person => person.verified), 'The project unlocks observed performance');
take({ type: 'dismissReport' });

const saved = JSON.stringify(game);
game = JSON.parse(saved);
assert(validGame(game));
assert.equal(JSON.stringify(game), saved, 'An offline reload preserves career and cleared report');
const nextCash = game.cash + 1200 - payroll(game);
take({ type: 'nextWeek' });
assert.equal(game.week, 2);
assert.equal(game.actions, 6);
assert.equal(game.cash, nextCash);
assert.equal(game.missionThisWeek, false);
assert(members(game).every(person => person.status === 'hired'));

// Planning reflects learned evidence and never peeks at hidden skill or
// reliability values. Every observed result fits the planning range.
const planGame = newGame(924);
const planJob = missions(planGame)[0];
const untestedTeam = planGame.candidates.slice(0, 2);
const unknownPlan = assignmentReadiness(planGame, planJob, untestedTeam);
const changedHidden = structuredClone(untestedTeam);
changedHidden.forEach(person => {
  person.reliability = 1; person.growth = 0; person.motive = 'privacy';
  SKILLS.forEach(skill => { person.skills[skill] = 1; });
});
assert.deepEqual(assignmentReadiness(planGame, planJob, changedHidden), unknownPlan, 'Unknown values do not affect advice');
assert.equal(unknownPlan.range[0], 8, 'Only the visible specialty bonus is certain before investigation');
assert.deepEqual(unknownPlan.missingRoles, []);
assert.equal(assignmentReadiness(planGame, planJob, [untestedTeam[0]]).range, null, 'A one-person team cannot generate a dispatch estimate');
assert(candidateAssignmentClue(planGame, untestedTeam[0], missions(planGame)).names.includes(planJob.name));
const observedPlan = assignmentReadiness(game, missions(game)[0], members(game));
assert.equal(observedPlan.tone, 'ready', 'The successful opening lineup has evidence for another release');
assert(observedPlan.range[0] >= missions(game)[0].difficulty);
const poorLineup = members(game).map(person => ({ ...structuredClone(person), role: 'Operations', morale: 35 }));
const poorPlan = assignmentReadiness(game, missions(game)[0], poorLineup);
assert.deepEqual(poorPlan.missingRoles, ['Engineering', 'Design']);
assert(poorPlan.advice.some(advice => advice.includes('Low morale')));
const scoreBeforeDispatch = observedPlan.range;
take({ type: 'mission', mission: missions(game)[0].id, ids: members(game).map(person => person.id) });
assert(game.report.score >= scoreBeforeDispatch[0] && game.report.score <= scoreBeforeDispatch[1], 'Observed team performance stays within evidence bounds');
take({ type: 'dismissReport' });

// Isolate the final mandate's exact exposure boundary, which the low-exposure careers skip.
const veil = { ...structuredClone(game), tier: 2, prestige: 2, actions: 8, completed: 5, reputation: 65, exposure: 60 };
veil.candidates.slice(0, 4).forEach(person => {
  person.status = 'hired'; person.wage = person.salary; person.hiredWeek = veil.week;
  person.morale = 98; person.verified ??= false; person.completed ??= 0;
});
assert(validGame(veil));
assert.equal(canPrestige(veil), false, 'A completed mandate at exposure 60 cannot grant clearance');
assert.equal(canPrestige({ ...veil, exposure: 59 }), true);
const covered = act(veil, { type: 'cover' });
assert.equal(covered.exposure, 35);
assert.equal(covered.actions, 7);
assert.equal(covered.cash, veil.cash - 3500);
assert.equal(canPrestige(covered), true, 'Cover clears the final mandate gate');
assert.equal(act(covered, { type: 'prestige' }).won, true);

const brokenReport = newGame(31);
brokenReport.report = {};
assert.equal(validGame(brokenReport), false, 'A malformed report cannot reach the report menu');
const missingMotive = newGame(32);
missingMotive.candidates[0].tested = ['interview'];
delete missingMotive.candidates[0].motive;
assert.equal(validGame(missingMotive), false, 'A learned motive must exist before the conversation menu reads it');
const brokenHistory = newGame(33);
brokenHistory.history = [null];
assert.equal(validGame(brokenHistory), false, 'Completed chapter records must be objects');

// Valid imported edge values must remain valid after a normal decision. A
// player must never get an unsaveable career after a successful load.
let highTrust = newGame(34);
highTrust.field.met = ['t0-0'];
highTrust.candidates[0].trust = 100;
assert(validGame(highTrust));
for (const method of ['interview', 'trial']) {
  highTrust = act(highTrust, { type: 'investigate', id: 't0-0', method });
  assert.equal(highTrust.candidates[0].trust, 100, 'Building trust at its limit keeps it bounded');
  assert(validGame(highTrust), 'A fully trusted imported contact remains saveable after investigation');
}
const lowSkills = newGame(35);
lowSkills.candidates.slice(0, 2).forEach(person => {
  Object.assign(person, { status: 'hired', role: 'Operations', hiredWeek: 1, wage: person.salary, morale: 50, verified: false, completed: 0 });
  SKILLS.forEach(skill => { person.skills[skill] = 0; });
});
assert(validGame(lowSkills), 'A zero-skill imported team is a valid career');
const lowResult = act(lowSkills, { type: 'mission', mission: 'm0', ids: lowSkills.candidates.slice(0, 2).map(person => person.id) });
assert.equal(lowResult.report.score, 0, 'Specialty penalties cannot create a negative report score');
assert.equal(lowResult.report.success, false);
assert(validGame(lowResult), 'Even the worst imported lineup leaves a saveable setback');

console.log('PASS: opening journey, evidence-led offers, honest planning ranges, unknown skills, referrals, first project, offline reload/payroll, exposure/cover, bounded imported edges and malformed import rejection.');
