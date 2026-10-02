# SCOUT for Apple silicon Mac

Requires an Apple silicon Mac (M1 or newer) running macOS 13 Ventura or newer.
This package is a native ARM64 app. Intel Macs are not supported by this build.

## Install and play

1. Download `SCOUT-3.0.0-macOS-Apple-Silicon.zip` and double-click it in Finder.
2. Drag the extracted `SCOUT.app` into **Applications**.
3. Open **Applications → SCOUT**. Choose one of the three save slots and create your scout.

No Node.js, Terminal commands, Windows emulator, or internet connection is needed to play the packaged app. All game assets, recordings and models are included.

This development app uses an ad-hoc signature. It has not been notarized by Apple. If macOS blocks the first launch, try opening SCOUT once, then go to **System Settings → Privacy & Security → Open Anyway** and confirm **Open**. This creates an exception for this app; do not turn off Gatekeeper globally. Apple's instructions: https://support.apple.com/en-us/102445.

The GitHub build also produces a DMG. Open it, drag SCOUT to Applications, eject the disk image, then open SCOUT from Applications.

## Controls and fullscreen

- WASD / arrows: walk; mouse: look; E: interact or enter your car.
- In the car: W accelerates; S brakes and then reverses; A / D steer; Space applies the handbrake.
- M: map; J / Tab: journal; R: radio; Escape: release the mouse or pause.
- Settings → Display: Borderless Fullscreen, Fullscreen, or Windowed.
- Control + Command + F toggles fullscreen. F11 works too; some keyboards require Fn + F11.
- Command + Q quits after saving. Native Mac menus provide copy, paste, hide and quit shortcuts.

## Offline saves and updates

SCOUT stores three independent careers in `~/Library/Application Support/SCOUT/save`. Settings → Career can export and import JSON backups, including backups made on Windows.

The Mac app checks the publisher's release channel after opening. Offline or unavailable updates never block play. A newer Apple silicon app appears in Settings → Updates & offline information. **Open Mac download** opens the publisher's verified download URL. Quit SCOUT, replace only the app in Applications, and reopen it; careers stay in Application Support. The Mac app does not run the Windows update helper or replace a running app.

## Build through GitHub

Upload the updated source to your existing repository, then open **Actions → Build Windows and Mac game → Run workflow**. The workflow builds Windows and Apple silicon in separate jobs. Download `SCOUT-Mac-Apple-Silicon-3.0.0` when it succeeds; it contains the app ZIP, DMG and this guide.

The repository may stay private for building and downloading Actions artifacts. Startup release checks use public GitHub releases. Publishing the workflow uploads both Windows and Mac packages to the same versioned release.

To build on an Apple silicon Mac with Node.js 22.18 or 24 installed:

```bash
npm ci
npm run dist:mac:dmg
npm run verify:mac
npm run verify:mac:archive
npm run test:mac:smoke
```

Packages are written to `release`. Future builds can use Apple Developer signing and notarization after the publisher supplies its own credentials; none are required for this development build.

## Verification limits

The supplied ZIP has been checked for native ARM64 binaries, signature digests, archive CRCs, preserved framework symlinks and executable permissions, and complete offline asset bytes. All 74 desktop regression tests pass, including Mac updates and display behavior. GitHub Actions additionally runs Apple's signature verifier and launches the packaged app to check native saves, fullscreen, offline startup and its 3D scene. That workflow has not yet been run with this source. A physical Apple silicon Mac playtest is still needed; the local checks do not measure Mac frame rate or prove first-launch Gatekeeper behavior. See `QA-3.0.md` for the checks and their limits.
