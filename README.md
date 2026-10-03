# SCOUT 3.0

A relaxed, first-person scout simulator. Drive across a connected 3D town, park at an actual venue, explore its interior, and get to know the people behind the work. Three careers are saved independently on your device. All gameplay, recordings, models, and saves work offline; startup update checks happen in the background.

This version replaces the overhead gameplay with a stylized 3D world. Each chapter includes headquarters, three spacious scouting venues, a fuel stop, and a furnished apartment, surrounded by neighborhoods, woodland, a river, parks, and connected streets. Company, institute, and mysterious-organization chapters unlock sequentially. Optional personal conversations, investigations, offers, team assignments, and mentoring give discoveries a purpose.

## Start playing

On Windows, open `SCOUT-3.0.0-Windows-Portable.exe`. On an Apple silicon Mac running macOS 13 or newer, extract `SCOUT-3.0.0-macOS-Apple-Silicon.zip`, drag `SCOUT.app` into Applications, and open it. The packaged apps include their runtime and need no Node.js installation. Mac installation and first-launch instructions are in `README-MAC.md`.

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
| M | Town map and driving destination |
| J / Tab | Field journal |
| R in the car | Toggle the radio |
| Right click with free cursor | Walk to a nearby open floor position |
| Escape | Release the mouse, close a local panel, or pause |
| F11 | Toggle fullscreen; return to the prior window mode |
| Control + Command + F on Mac | Toggle fullscreen |
| Command + Q on Mac | Save and quit |

The compact takes about 16.5 seconds to reach 60 mph. Steering turns the car rather than sliding it sideways. Park in the venue forecourt, then find the entrance and explore inside. A map selection never moves the car. You can wander on foot; scouting visits and first meetings require bringing your vehicle to the destination. Deadlines advance only when you finish a week, so driving and exploring have no real-time countdown.

## Saves and offline updates

The older career migrates safely into slot 1; original files remain intact. Each slot has its own current and previous save. Unreadable careers stay occupied and offer recovery/import instead of being silently replaced. Settings allows export and import of JSON backups. Native writes and exports are atomic; closing the game waits for the latest live position and durable writes.

On Mac, careers are stored in `~/Library/Application Support/SCOUT/save` separately from the app. Startup checks announce newer Apple silicon packages without blocking play. A download click opens the publisher's release asset; quit SCOUT before replacing the app in Applications. Windows portable updates retain their existing verified in-game install flow. Exported JSON careers can be moved between platforms.

Default display mode is Borderless Fullscreen. Fullscreen, Windowed, field of view, mouse sensitivity, head bob, and five audio volume sliders are available in settings. The soundtrack includes six complete credited composer recordings, natural bird ambience, local foley, and RPM-sensitive engine audio. Credits and license links are available in settings and `CREDITS-AUDIO.md`.

## Replace your GitHub source and build

You do not need to make the repository public to build or download Actions artifacts. Public, unauthenticated GitHub releases are needed for the existing public automatic-update channel. A private game build still works offline.

1. Extract this source ZIP with Windows **Extract All**. The project is the `SCOUT` folder containing `package.json`, `src`, `public`, `electron`, and `.github`.
2. Install Git for Windows and Node.js 22.18 or a supported Node.js 24 version.
3. Open PowerShell in the extracted `SCOUT` folder. Run the following script. It clones the existing repository into a separate folder, replaces its working files while preserving Git history, and commits this version.

```powershell
$scoutSource = (Get-Location).Path
$scoutCheckout = Join-Path (Split-Path $scoutSource -Parent) 'SCOUT-GitHub-3.0'
if (Test-Path $scoutCheckout) { throw 'Choose a new checkout folder name before continuing.' }
git clone https://github.com/spinjitsu12/scout.git $scoutCheckout
if ($LASTEXITCODE -ne 0) { throw 'Git clone failed.' }
robocopy $scoutSource $scoutCheckout /MIR /XD .git node_modules dist release /XF *.log
if ($LASTEXITCODE -ge 8) { throw 'Copy failed.' }
Set-Location $scoutCheckout
git add -A
git commit -m 'Add Apple silicon Mac build to SCOUT 3.0'
git push origin HEAD
```

4. On GitHub open **Actions → Build Windows and Mac game → Run workflow**. Choose your main branch. Enable the publish option only when you want to release 3.0.0.
5. After a successful build, download `SCOUT-Windows-3.0.0` or `SCOUT-Mac-Apple-Silicon-3.0.0` and extract the artifact. The Mac artifact contains an ARM64 app ZIP, a DMG and installation instructions. For Windows automatic updates, publish the portable EXE and `SCOUT-update.json`; the same release includes the Mac ZIP and DMG for Mac startup notifications. Use the new `v3.0.0` release tag.

The supplied portable executable can also be played directly without rebuilding. Source assets are already bundled. `public/models` contains original GLB exports for editing in Blender, and the procedural asset constructors are in `src/lib/immersive-assets.ts`.

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

`npm run dist:mac` builds just the installable app ZIP. `verify:mac` checks ARM64 runtime binaries, app identity, macOS minimum version, signatures and framework links, and compares every offline asset to the current build. On a Mac it additionally runs Apple's native signature verification. `verify:mac:archive` checks the delivered ZIP's CRCs, executable permissions and framework symlinks, then extracts and verifies the app on a Mac. `test:mac:smoke` launches a private copy on an Apple silicon Mac with isolated saves to check native startup, fullscreen, offline play and first-person WebGL rendering. The combined GitHub workflow runs these checks and builds both platforms before optional publishing.

Tests cover three-chapter progression, legacy and 3D saves, honest physical arrivals, measured driving/braking, actual road and driveway access, apartment rooms, shared furniture collision, interior contact approaches, independent audio sliders, recording integrity, and safe native updates. Release verification checks executable identity and hash, current native helpers, and every bundled offline asset byte. Native rendering/media QA is recorded in `QA-3.0.md`.
