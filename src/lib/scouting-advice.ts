import { SKILLS, TIERS, type Candidate, type Game, type Mission } from "./game.ts";

export type AssignmentReadiness = {
  range: [number, number] | null;
  missingRoles: string[];
  label: string;
  tone: "ready" | "uncertain" | "shortfall";
  advice: string[];
};

// The planning desk must not inspect an unverified recruit's actual abilities.
// References reveal a reliability category, not an exact reliability number.
function knownReliability(candidate: Candidate): [number, number] {
  const reference = candidate.evidence.find(note => note.kind === "reference")?.text || "";
  if (reference.includes("follows through, even under pressure")) return [90, 100];
  if (reference.includes("dependable when expectations are clear")) return [80, 90];
  if (reference.includes("missed commitments")) return [0, 80];
  return [0, 100];
}

export function assignmentReadiness(game: Game, mission: Mission, assigned: Candidate[]): AssignmentReadiness {
  const missingRoles = mission.roles.filter(role => !assigned.some(candidate => candidate.role === role));
  if (assigned.length < 2) return {
    range: null, missingRoles, label: "Choose your lineup", tone: "uncertain",
    advice: ["Choose two or three teammates. The estimate updates as you build the lineup."],
  };

  const contributions = assigned.map(candidate => {
    let low = 0, high = 0;
    for (const skill of SKILLS) {
      const range = candidate.verified ? [candidate.skills[skill], candidate.skills[skill]] : candidate.ranges[skill] || [0, 100];
      low += range[0] * mission.weights[skill];
      high += range[1] * mission.weights[skill];
    }
    const reliability = knownReliability(candidate), morale = .85 + (candidate.morale ?? 85) / 667;
    return [Math.round(low * (.84 + reliability[0] / 625) * morale), Math.round(high * (.84 + reliability[1] / 625) * morale)];
  });
  const coverage = mission.roles.length - missingRoles.length;
  const roles = new Set(assigned.map(candidate => candidate.role)).size;
  const modifier = coverage / mission.roles.length * 8 - missingRoles.length * 4
    + (game.tier === 1 ? Math.max(0, roles - 1) * 3 : 0)
    - (game.tier === 2 ? Math.max(0, game.exposure - 40) / 8 : 0);
  const range: [number, number] = [0, 1].map(bound => Math.max(0, Math.round(
    contributions.reduce((sum, contribution) => sum + contribution[bound], 0) / assigned.length + modifier,
  ))) as [number, number];
  const tone = range[0] >= mission.difficulty ? "ready" : range[1] < mission.difficulty ? "shortfall" : "uncertain";
  const advice: string[] = [];
  if (missingRoles.length) advice.push(`Missing ${missingRoles.join(" and ")}. An uncovered specialty lowers the team’s score.`);
  if (assigned.some(candidate => !candidate.verified)) advice.push("Some abilities are still estimates. Field work verifies them; an easier assignment can establish what this team can do.");
  if (assigned.some(candidate => (candidate.morale ?? 85) < 60)) advice.push("Low morale is limiting performance. Mentoring restores confidence and develops skills.");
  if (game.tier === 2 && game.exposure > 40) advice.push("Outside attention is reducing performance. A cover operation lowers exposure by 25.");
  if (!advice.length) advice.push(tone === "shortfall" ? "Try a job weighted toward this team’s strongest observed abilities, or mentor before dispatch." : "Compare this estimate with the target. Reliability is known only as far as your references establish.");
  return { range, missingRoles, label: tone === "ready" ? "Evidence supports this lineup" : tone === "shortfall" ? "This lineup needs development" : "There is still uncertainty", tone, advice: advice.slice(0, 3) };
}

export function candidateAssignmentClue(game: Game, candidate: Candidate, jobs: Mission[]): { names: string[]; abilities: string[] } {
  const relevant = jobs.filter(job => job.roles.includes(candidate.role));
  const weights = SKILLS.map(skill => ({ skill, value: relevant.reduce((sum, job) => sum + job.weights[skill], 0) }));
  weights.sort((a, b) => b.value - a.value);
  return {
    names: relevant.slice(0, 2).map(job => job.name),
    abilities: weights.slice(0, 2).map(({ skill }) => TIERS[game.tier].skillNames[skill]),
  };
}
