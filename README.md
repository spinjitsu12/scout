# SCOUT 3.01

A relaxed, first-person scout simulator. Drive across a connected 3D region, park at an actual venue, explore its interior, and get to know the people behind the work. Three careers are saved independently on your device. All gameplay, recordings, models, and saves work offline; startup update checks happen in the background.

This version replaces the overhead gameplay with a stylized 3D region measuring 12 × 10 km, with seven connected settlements and multi-kilometre scouting drives. Each chapter includes headquarters, three spacious scouting venues, a fuel stop, and a furnished apartment, surrounded by neighborhoods, woodland, a river, parks, and connected streets. Company, institute, and mysterious-organization chapters unlock sequentially. Optional personal conversations, investigations, offers, team assignments, and mentoring give discoveries a purpose.

## Start playing

This source checkpoint contains development code and assets. Build and verify the native packages before distributing 3.0.1; the package names below describe the workflow outputs.

On Windows, open `SCOUT-3.0.1-Windows-Portable.exe`. On an Apple silicon Mac running macOS 13 or newer, extract `SCOUT-3.0.1-macOS-Apple-Silicon.zip`, drag `SCOUT.app` into Applications, and open it. The packaged apps include their runtime and need no Node.js installation. Mac installation and first-launch instructions are in `README-MAC.md`.

Choose a save slot, create your scout, and begin the story. You start with a basic compact. Your vehicle and appearance are created before play; settings contains display, audio, and comfort controls.

The opening dream begins with the car already on the ground. Take the drive for the accelerator, braking, and steering lessons, or skip the dream to wake up at home. Review your laptop from the chair side, walk outside, enter your car, and drive to headquarters for the first briefing.

## Controls

| Control | Action |
|---|---|
| WASD / arrows | Walk relative to your view |
| Mouse | Look around; click the scene to capture the mouse |
| E | Interact, enter your car, or step out after stopping |
| W in the car | Accelerate gently |
| S in the car | Brake; hold after stopping to reverse |
| A / D in the car | Turn the steering wheel |
| Space | Handbrake |
| M | Regional map and driving destination |
| J / Tab | Field journal |
| R in the car | Toggle the radio |
| T beside a stranded car | Call a tow to the nearest service station |
| Right click with free cursor | Walk to a nearby open floor position |
| Escape | Release the mouse, close a local panel, or pause |
| F11 | Toggle fullscreen; return to the prior window mode |
| Control + Command + F on Mac | Toggle fullscreen |
| Command + Q on Mac | Save and quit |

The compact takes about 16.5 seconds to reach 60 mph. Steering turns the car rather than sliding it sideways. Park in the venue forecourt, then find the entrance and explore inside. A map selection never moves the car. You can wander on foot; scouting visits and first meetings require bringing your vehicle to the destination. Deadlines advance only when you finish a week, so driving and exploring have no real-time countdown.

People walk through local plazas and public interiors. Cannon ES handles shared vehicle, character, furniture and debris contacts. A serious vehicle impact produces an articulated physical ragdoll and brings regional police. Fines, reputation loss, fewer completed assignments, lost actions and damaged team trust are saved immediately. Quitting does not cancel the response; police impound the compact at a service station while retaining its fuel, mileage and damage.

## Saves and offline updates

The older career migrates safely into slot 1; original files remain intact. Each slot has its own current and previous save. Unreadable careers stay occupied and offer recovery/import instead of being silently replaced. Settings allows export and import of JSON backups. Native writes and exports are atomic; closing the game waits for the latest live position and durable writes.

On Mac, careers are stored in `~/Library/Application Support/SCOUT/save` separately from the app. Startup checks announce newer Apple silicon packages without blocking play. A download click opens the publisher's release asset; quit SCOUT before replacing the app in Applications. Windows portable updates retain their existing verified in-game install flow. Exported JSON careers can be moved between platforms.

Default display mode is Borderless Fullscreen. Fullscreen, Windowed, field of view, mouse sensitivity, head bob, and five audio volume sliders are available in settings. The soundtrack includes six complete credited composer recordings, natural bird ambience, local foley, and RPM-sensitive engine audio. Credits and license links are available in settings and `CREDITS-AUDIO.md`.

## Continue development on your Mac

Open the existing `scout` repository in GitHub Desktop and choose **Repository → Show in Finder** to locate it. In the desktop app, select **Codex** and open that same folder. Ask Codex to read `AGENTS.md` and `CODEX-HANDOFF.md` before editing. Keep development work on a branch and save regular Git commits. Use **Push origin** in GitHub Desktop to preserve those checkpoints remotely.

The handoff records current test results and remaining release work; development checkpoints are not published game binaries. Exact Finder and GitHub Desktop update steps are in `UPDATE-3.01-MAC.md`.

## Build from your existing local repository

The combined build workflow is `.github/workflows/desktop-release.yml`. Changes to this workflow on `main` start both platform builds automatically. Manual runs appear as **Build Windows and Mac game** in Actions.

Keep the existing public `spinjitsu12/scout` repository. Work in its already-cloned local `scout` folder: the one containing `package.json`, `src`, `public`, `electron`, and `.github`. Apply source fixes in that folder and commit the changed files using your normal Git workflow. A separate clone and GitHub's web editor are not required.

1. Use Node.js 22.18 or a supported Node.js 24 version for local development. The workflow installs its own Node.js runtime.
2. Commit the changed files locally and push to `main`. A change to `.github/workflows/desktop-release.yml` starts both builds automatically. Source changes without a workflow change can be built with a manual run.
3. On GitHub open **Actions → Build Windows and Mac game → Run workflow**, choosing `main`. Leave publishing unchecked while validating a fix. Start a fresh run after pushing new code; rerunning an older failed run checks its original commit.
4. After a successful build, download `SCOUT-Windows-3.0.1` or `SCOUT-Mac-Apple-Silicon-3.0.1` and extract the artifact. The Mac artifact contains an ARM64 app ZIP, a DMG and installation instructions.
5. To publish this version, run the same workflow with **Publish this version to the public update channel** enabled. Both builds must pass before the workflow creates `v3.0.1` with the Windows EXE and update manifest plus the Mac ZIP and DMG. For later published builds, increment the package version first.

The workflow's portable executable can be played directly without rebuilding. Source assets are already bundled. `public/models` contains original GLB exports for editing in Blender, and the procedural asset constructors are in `src/lib/immersive-assets.ts`.

Mac builds use a native Apple silicon GitHub runner and an ad-hoc signature; Apple notarization credentials are not included. See `README-MAC.md` for the app-specific first-launch approval in macOS Privacy & Security. Intel builds are intentionally not produced.

## Development and verification

```powershell
npm ci
npm test
npm run test:desktop
npm run build
npm run desktop
```

To build the Windows portable release:

```powershell
$env:SCOUT_UPDATE_REPOSITORY = 'spinjitsu12/scout'
npm run dist:portable
npm run verify:release
```

To build the Apple silicon app and DMG on a Mac:

```bash
npm ci
npm run dist:mac:dmg
npm run verify:mac
npm run verify:mac:archive
npm run test:mac:smoke
```

`npm run dist:mac` builds just the installable app ZIP. `verify:mac` checks ARM64 runtime binaries, app identity, macOS minimum version, signatures and framework links, and compares every offline asset to the current build. On a Mac it additionally runs Apple's native signature verification. `verify:mac:archive` checks the delivered ZIP's CRCs, executable permissions and framework symlinks, then extracts and verifies the app on a Mac. `test:mac:smoke` launches a private copy on an Apple silicon Mac with native Metal rendering and isolated saves to check startup, fullscreen, offline play and actual first-person scene pixels. It retains stage-specific JSON, GPU diagnostics and screenshots. `test:desktop` includes regression tests for that harness. The combined GitHub workflow runs these checks and builds both platforms before optional publishing; artifact uploads support job reruns.

Tests cover three-chapter progression, legacy and 3D saves, honest physical arrivals, measured driving/braking, actual road and driveway access, apartment rooms, shared furniture collision, interior contact approaches, independent audio sliders, recording integrity, and safe native updates. Release verification checks executable identity and hash, current native helpers, and every bundled offline asset byte. Fresh checkpoint checks and remaining native release work are recorded in `QA-3.01.md`; `QA-3.0.md` records the previous build.
