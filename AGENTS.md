# SCOUT development

Read `CODEX-HANDOFF.md` before continuing development. Preserve working files and existing careers; this is an evolving game, not a fresh website scaffold.

## Product direction

SCOUT is a relaxed, immersive, first-person scouting RPG with a modeled driving cockpit, real venue entrances and interiors, and a large connected region. Prioritize smooth motion, patient conversations, exploration, and a coherent original stylized art direction. Use the user's references as quality aspirations; do not copy their assets or branding.

- Keep intuitive WASD/arrows, mouse look, E interaction, M map, J/Tab journal, and right-click local walking. Journeys between venues require driving.
- Keep three separate career slots and character creation. Begin with a basic compact. Do not expose car selection in settings.
- Maintain offline play, bundled assets, startup update checks, existing saves, and save-before-exit behavior.
- Keep the public `spinjitsu12/scout` repository public. Build Windows x64 and macOS Apple silicon only through `.github/workflows/desktop-release.yml`.
- The user uses a Mac and GitHub Desktop. Give Finder/GitHub Desktop instructions, never require them to type Terminal commands or use GitHub's web code editor.
- Player interfaces should contain player-relevant information. Keep technical persistence, build, and development details in documentation.
- Keep original owner-created assets under their existing ownership. External audio must have documented commercial-use permission, attribution, source URLs, and hashes. Do not introduce NC/ND music.

## Implementation and checks

Use the shared location and road geometry contracts. Keep simulation at a fixed timestep with render interpolation. Query nearby collision cells rather than every world object each frame. Preserve context-loss and native startup diagnostics. Disable destructive catch-up after pauses and background tabs.

Prefer established engines and libraries over inventing replacements. Physics uses the existing Cannon ES engine; keep it bundled for offline play. Vehicle impacts should produce articulated NPC ragdolls over the hood/windshield, summon police, and apply a major career setback that persists across quit/reload. Preserve unrelated save slots.

Use multiple developers when useful, dividing file ownership to avoid conflicting edits. Coordinate interfaces before integrating modules. Run TypeScript/build, gameplay regressions, and desktop regressions after integration. Mac native smoke requires a real Apple silicon Mac or its GitHub runner; do not report it as passed after only Linux tests.

## Durable progress

Maintain `CODEX-HANDOFF.md` with what is complete, tested, still pending, and the next action. Make a Git checkpoint after meaningful verified milestones when working in the user's local clone. Keep unfinished work on a development branch. Preserve existing uncommitted user changes. Do not force-push or silently discard files. Publish a release only once the intended build is ready and the user's publishing instruction applies.
