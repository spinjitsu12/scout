# SCOUT for Apple silicon Mac

Requires an Apple silicon Mac (M1 or newer) running macOS 13 Ventura or newer.
This package is a native ARM64 app. Intel Macs are not supported by this build.

## Install and play

1. Download `SCOUT-3.0.1-macOS-Apple-Silicon.zip` and double-click it in Finder.
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

The Mac app checks the publisher's release channel after opening. Offline or unavailable updates never block play. A newer Apple silicon app appears in Settings → Career → Game updates. **Open Mac download** opens the publisher's verified download URL. Quit SCOUT, replace only the app in Applications, and reopen it; careers stay in Application Support. The Mac app does not run the Windows update helper or replace a running app.

## Build through GitHub

Both platforms use `.github/workflows/desktop-release.yml`. Updating this workflow on `main` automatically starts the Windows and Apple silicon builds.

Commit the updated files in your existing repository using GitHub Desktop, then click **Push origin**. On GitHub open **Actions → Build Windows and Mac game → Run workflow**. The workflow builds Windows and Apple silicon in separate jobs. Download `SCOUT-Mac-Apple-Silicon-3.0.1` when it succeeds; it contains the app ZIP, DMG and this guide.

Keep your existing public repository. Publishing the workflow uploads both Windows and Mac packages to the same public, versioned release. Startup checks read that public release channel.

For local development, open the same cloned `scout` folder in Codex. Ask it to read `AGENTS.md` and `CODEX-HANDOFF.md`, build the Apple silicon app and DMG, verify the app and delivered archive, and run the native Mac smoke check. The developer checks are listed in `README.md` for Codex to run.

Packages are written to `release`. Future builds can use Apple Developer signing and notarization after the publisher supplies its own credentials; none are required for this development build.

## Verification limits

The previous 3.0.0 ZIP was checked for native ARM64 binaries, signature digests, archive CRCs, preserved framework symlinks and executable permissions, and complete offline asset bytes. This 3.0.1 development checkpoint still needs fresh native packages and platform verification. Desktop regression tests cover Mac updates, display behavior and the startup test harness.

GitHub run `37078613457` passed Windows packaging, native Mac signature verification, delivered ZIP verification, native save loading and fullscreen checks. Its 3D smoke check failed because the test forced SwiftShader's Vulkan renderer. The corrected smoke test uses Metal, waits for the saved-career button to become enabled, and checks actual rendered scene pixels. It captures a screenshot, the failing stage, renderer errors and GPU details when a check fails. Artifact uploads can be repeated safely when jobs are rerun.

The corrected native Mac smoke check still needs a new GitHub run. A physical Apple silicon Mac playtest is also needed for first launch, pointer behavior, audio and frame rate. See `QA-3.01.md` for this checkpoint's fresh checks and remaining release gates, and `QA-3.0.md` for the previous build's evidence.
