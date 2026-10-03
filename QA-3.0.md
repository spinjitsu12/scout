# SCOUT 3.0 verification

Validation performed on 2 October 2026. This release establishes the playable stylized first-person world; it is a development build, with further art, world activity, and hardware performance testing still appropriate before calling it a finished product.

## Automated gameplay and geometry

`npm test` passes all fourteen suites. These cover complete three-chapter careers, legacy save compatibility, scouting decisions, payroll and assignments, recording integrity, radio behavior, and the new physical world.

The basic compact reaches 30 mph in 6.90 seconds and 60 mph in 16.52 seconds. A stop from 30 mph takes 2.48 seconds and 17.0 metres. Tests check true wheel steering, reverse interlock, ground contact, swept body collisions, fuel use, and frame-rate consistency.

Tests exercise all three town layouts: 72 actual parking poses, 12 driveway approaches, the main road network, home and fuel access, 108 interior contact approaches, and 39 points of interest. Apartment checks include the bedroom, bathroom, laptop chair, and window. Furniture, walls, characters, and the parked vehicle block movement.

Physical career checks reject meetings from the road, remote arrival claims, forged parking flags, fuel refills through snapshots, and legacy actions that would teleport a 3D player. Dream-to-apartment transition restores the starter car's real fuel.

## Native saves and updates

`npm run test:desktop` passes 74 tests. Cases include independent save slots, explicit slot identities, legacy migration, corrupt-file recovery, concurrent and interrupted writes, atomic exports, display preferences, preload close acknowledgements, offline startup, unavailable or hung update services, staged update integrity, and rollback. Mac additions cover asynchronous fullscreen transitions, the native green button, Mac menus and preload identity, and validated manual Apple silicon update downloads.

Credit links open only the fixed credited HTTPS pages. Gameplay and save loading do not wait for the update service.

## Actual rendering and media

Native Electron fixtures render the real models and geometry for the cockpit, apartment study, and Maker Yard. Separate media checks use bundled files with HTTP and HTTPS blocked: all 13 pass. They verify audible local MP3 playback, Ogg decoding, natural playlist changes, bounded crossfades, independent controls, pause/mute/focus recovery, engine/fuel behavior, and resource cleanup.

Actual game checks confirm three startup slots, player creation, the grounded car intro, gradual W acceleration and S braking, physical state in native slot 1, default borderless selection, and independent volume persistence. The creation action fits a 1440 × 900 window. Apartment fixtures verify W movement in the native save, the solid chair, chair-side laptop review, and Escape closing notes/maps without opening settings. An interior fixture verifies that E records the meeting before opening the recruit conversation.

The phone fixture retains the full 1280 × 800 world canvas while showing the animated scout and the conversation. Answering the call continues over the world; the scene does not shrink to a small viewport. All ten final interior/story fixture checks pass with zero renderer errors, including paused rendering and arrival guidance. The paused GPU counter stayed at 104 clears across the observation interval.

Paused menus stop continuous world rendering. Returning to play, changing the field of view, and resizing mark the scene for a new render.

The renderer tests run on Linux with an offscreen window and SwiftShader. The actual game main process, preload bridge, renderer, and isolated native save files are used for gameplay captures. The QA harness substitutes an offscreen window and bypasses the host's unavailable OS singleton socket; those substitutions are not included in the product.

## Release and remaining verification

The Windows portable release is cross-built on Linux. `npm run verify:release` checks its product/version identity, manifest size and SHA-256, current native helper bytes, and every bundled renderer/audio/model asset against the build output. Source ZIP validation checks CRCs and Windows-compatible folder entries.

This environment does not provide a physical Windows desktop or a hardware GPU. Native Windows monitor switching, pointer capture, first launch, and performance on target PCs still need a Windows playtest. Linux offscreen rendering is evidence of working scenes and UI, not a Windows frame-rate measurement or a complete manual playthrough of every route.

## Apple silicon package

The Mac package is a native ARM64 `SCOUT.app` for macOS 13 or newer, with an ad-hoc signature and the JIT entitlements required by Electron. Intel binaries are not included. The final ZIP contains 598 CRC-checked entries, all 13 ARM64 runtime binaries with executable permissions, 14 preserved framework symlinks, and 441,346,419 unpacked bytes. App verification compares 85 bundled offline files and every current native helper with the build source.

Local signature checks validate all 54,361 signed code pages, Info.plist and resource-seal digests, 236 sealed resources, and the app and helper JIT entitlements. These checks run on Linux; Apple's native signature verifier and the native app have not been run here. The app is not notarized. First-launch approval instructions are in `README-MAC.md`.

The combined GitHub workflow builds the Mac app ZIP and DMG on an Apple silicon macOS runner. It runs Apple's `codesign --verify --deep --strict`, extracts and re-verifies the delivered ZIP, then launches a private test copy of the packaged app with its real main process, preload, UI and engine. The test checks three independent career files, native fullscreen transitions, offline update behavior and a full-size first-person WebGL scene. It isolates save files and uses software rendering for CI; the delivered app is untouched. Diagnostic JSON and screenshots are retained if the launch test fails.

The updated GitHub workflow has not been executed from this workspace. A physical Apple silicon Mac playtest is still needed for first launch, display and pointer behavior, audio, and hardware frame rate.
