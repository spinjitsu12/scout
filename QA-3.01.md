# SCOUT 3.01 checkpoint verification

Checked on **4 October 2026**. Package version is **3.0.1**. This is validated development source; new Windows and Apple silicon release packages still require their own native checks.

## Windows build repair verification — 4 October 2026

The user supplied a Windows failure at `tests/audio-theme.mjs:41` (19,053 vs 18,657 bytes) and reported that the earlier Apple silicon build passed. That Mac result has not been independently inspected in this repair. The Windows mismatch exactly equals the 396 extra CR bytes introduced into the CC BY notice by checkout line-ending conversion.

Root `.gitattributes` now preserves audio/license asset bytes with `-text`, including original upstream CRLF. Manifest byte counts and SHA-256 checks remain exact. A real Git regression enables Windows CRLF conversion, verifies its control, then checks unchanged index/checkout notice bytes using the new project rules. All six corresponding committed notice blobs in the existing clone match the original assets; no notice or manifest was rewritten.

The full desktop run also revealed an ASAR write-completion race. Both the archive regression fixture and the private Mac smoke archive now await the returned writable stream before reading/hash/sign/launch steps. Five new Windows packaging-hook checks exercise real PE branding/resources/native-section preservation and portable update-manifest hashing without building a desktop package locally.

| Repair check | Result | Evidence |
| --- | --- | --- |
| Gameplay regressions | All **29 suites passed**, exit 0 | `npm test` on this Mac; recorded in `qa/3.01-windows-build-fix/verification.json` |
| Desktop regressions including checkout and Windows packaging hooks | **108 passed**, 1 expected platform skip, 0 failed (109 discovered) | `qa/3.01-windows-build-fix/desktop-tests.log` |
| TypeScript/Vite/native-engine production build | Passed, exit 0 | `qa/3.01-windows-build-fix/production-build.log` |
| New Windows x64 packaged artifact/runtime | **Pending** | Fresh combined GitHub workflow after the user's push, then Windows launch |
| New genuine native Mac smoke | **Not run locally** | Existing Mac success is user-reported; new commit still needs its own workflow |

Repair host: **Darwin ARM64, Node 24.21.0**. The skipped test rejects Mac smoke on non-Apple-silicon hosts; it correctly skips on this Apple silicon host. No native application launch was attempted. Package version, dependencies, lockfile and generated native engine are unchanged. The existing large-chunk build notice remains nonfatal. Initial archive-race failures and the original Windows log are retained alongside the final passing desktop log.

This source folder has no Git metadata. Per the user's instruction, fixes remain here for their own GitHub Desktop push; the separate clone was not edited. The user keeps `CODEX-HANDOFF.md` local for Codex and will not add it to GitHub; it is not a build dependency. See `qa/3.01-windows-build-fix/README.md` for exact changed files and fresh-run steps. The historical results below remain evidence for their original source/runtime and do not replace verification of the repaired Windows package.

## Current results

| Check | Result | Evidence |
| --- | --- | --- |
| Full gameplay regressions after the final physics integration | All **29 suites passed** | `qa/3.01-polish/gameplay-tests.log` |
| Native save/update/display/permission/close regressions | All **103 tests passed** | `qa/3.01-polish/desktop-tests.log` |
| Final production TypeScript/Vite/native-engine build | Passed, exit 0 | `qa/3.01-polish/production-build.log` |
| Actual main/preload/game UI across four fresh Linux processes | All **45 checks passed** | `qa/3.01-polish/native-linux/native-linux-settled-result.json` |
| Separate compositor-synchronized visual check | All **6 checks passed**, six scene captures | `qa/3.01-polish/native-linux-art-review/native-linux-art-review-result.json` |
| Fresh production offline assets and engine inspection | Passed | `qa/3.01-polish/release-review.md` |

The final UI corrections were checked with the final production build and real-window layout assertions; they do not change the gameplay reducer or native engine tested by the full suites. The four native phases use one frozen build: their cumulative counts are **27 → 35 → 39 → 45** and all share the final HTML SHA-256 `9c3534e45acef3d21b2ccd2aeecc6cfe730d8c1393aab639f9c85a83337e8494`. Their main-process hash also agrees. Renderer/preload error lists are empty; all recorded scene probes have zero GL errors.

The build retains a nonfatal JavaScript chunk-size warning. Linux process logs also retain container service/graphics diagnostics. A passing report is not a claim that every stderr line is empty or that hardware performance has been measured.

## Gameplay and physics evidence

- The shared region is **12 × 10 km**, with seven connected settlements and 63 roads. Headquarters-to-scouting routes are approximately **4.1, 7.4 and 8.9 km**, use the interstate and end in actual visitor forecourts. Tests also check services, accessible plazas, chunk visibility and instance disposal.
- All **702 rendered street facades** are checked before batching for physical footprint and actual road-facing panes on both sides of both street axes. Wayfinding checks cover **126 grounded signs** across three chapters and **120 accessible pump contacts**.
- Resident tests inspect **3,102 actual routes** and **1,430,106 geometry probes** across the three chapters. Actor IDs, bounded pools, pause behavior, obstacle yielding, physical standing feedback, eleven-part articulated model binding and retirement/disposal are checked.
- Cannon ES **0.20.0** is the existing engine, bundled offline with its unchanged MIT notice. Actual engine tests cover ground support, walking and tangential wall sliding, controller-to-engine movement occurring once, thin walls, traffic/furniture, reverse and high-speed contacts, dynamic falling props, and eleven-part bonnet/sloped-windshield ragdolls.
- Audit regressions prove one mechanical damage charge per impact, another charge for a genuinely fresh collision after cooldown, and selection of the greatest material-weighted loss for simultaneous geometry. Local body replacement/expiry clears prepared-impact tracking instead of accumulating dead engine IDs. Mileage and fuel count actual solved travel.
- Motion tests compare 30/60/120/144 Hz presentation, discard pauses/background gaps, bound long active frames without freezing or replaying missed time, and test automatic graphics pressure, recovery and manual settings. These are deterministic control/clock tests, not target-hardware FPS measurements.
- Save/law checks include old-career migration, atomic penalties, replay prevention, pending/resolved fresh-process reload, protected career actions, saved 18/28/30-second police visual timing, three isolated careers, vehicle services and nearest-station tow preservation.
- Audio checks verify the bundled recording/effect/license manifest and hashes, regional pacing, bounded crossfades/voices, effects/master controls, silent pause/mute/broken-engine behavior and original bounded emergency audio. CC BY 4.0/CC0 recordings are credited; owner-created effects retain their existing ownership.

## Four-process actual native game run

The fixture uses the real native main process, sandbox preload, save validator/store, production UI and an isolated temporary profile. It never injects an NPC strike or substitutes a dummy renderer.

1. **Initial:** three isolated slots; real painted first-person/cockpit pixels; native W/A driving, brake/handbrake and grounded car exit; 300 ms delayed active frames and automatic render-resolution adaptation; paused input discard and no catch-up; both map scopes and fully bounded map names; background controls hidden/restored around map/service dialogs; fuel, repairs, car re-entry and $150 tow; latest-position Save and exit.
2. **Reopen:** exact durable career reload in a fresh process, real Nearby coordinates, grounded highway/campus/coast scenes, then W driving into a deterministic actual plaza resident. The contact occurred at **4.8813 m/s** and immediately saved a **$18,900 fine, 40 reputation, two completed missions, six actions, 45 trust and 30 hired-team morale** losses. Quit retained the pending response and penalties.
3. **Resolve:** another process preserved that pending clock and every penalty, advanced the real active simulation to visible patrol arrival and impound, and retained destination, gear, condition, fuel and mileage at the nearest service. Scene adoption and native Save and exit agreed.
4. **Settled:** another process retained the resolved case without a second charge, then used the actual Career confirmation UI to restart a progressed second slot in the same chapter. A new canvas and headquarters spawn replaced the old scene; real WASD and a live save stayed in the reset chapter. Slots one and three remained byte-for-byte unchanged.

Native DOM measurements also verify the driving route card stays above the lower cockpit instruments, police status clears journal/settings controls, and wrapped strike messages have a **12 px gap** before the emergency card. The route card yields to an active police response.

## Visual evidence and capture correction

Final pixel review covers the original coastal career menu, grounded compact and connected glazing, readable physical dashboard, separate modal controls, road-facing Eastmere windows/awnings, real directional/welcome signs, continuous coast/water/hills, marked patrol arrival, the impound transition, settled car re-entry and the reset headquarters interior.

The first capture helper could read a preceding compositor frame after a UI change. One nominal Region screenshot showed the exterior instead of the open modal; this was a QA capture-timing defect, while real DOM/layout assertions passed. The helper now waits for animation frames and a native compositor paint. Definitive Region/Nearby/cockpit and regional art retakes are in **`qa/3.01-polish/native-linux-art-review`**, with their own six-check report and separate profile. Resolve/restart screenshots in the final four-process pass also use the synchronized helper. Historical/early captures remain available and must not override these final retakes.

The immediate contact still is not proof of the complete ragdoll trajectory. Articulated contacts, constraints and pose binding are established by the actual engine/model regressions; screenshots establish visible framing, not the entire motion.

## Scope and remaining release gates

The local host is Linux x64 with Node 24.19.0 and Electron 44.5.1, using offscreen SwiftShader. The fixture supplies a synthetic monitor/cursor, omits native titlebar options, bypasses an unavailable singleton socket and immediately rejects unavailable pointer capture. The OS sandbox is disabled only in this diagnostic process. Production security/GPU settings are unchanged. HTTP/HTTPS renderer requests remain blocked; all gameplay assets are local.

Before publishing **v3.0.1**:

1. Run the combined `.github/workflows/desktop-release.yml` on the new commit with publishing unchecked. Both Windows x64 and Apple silicon jobs must pass.
2. Verify the Apple silicon app/signature and delivered ZIP, and pass the genuine native **Metal** smoke. The earlier Vulkan failure and this Linux pass do not prove that Mac result.
3. Install and launch the delivered Mac app/DMG through Finder; launch the Windows portable EXE on Windows. The workflow verifies Windows payload bytes but does not launch its UI.
4. Playtest pointer capture, fullscreen/window restoration, audio balance, three careers, 150-second autosave, save/quit, services/tows, long interstate drives and sustained frame-time/memory behavior on target hardware.

No 3.0.1 build was committed, pushed or published from this workspace. The user's existing public repository stays public. Follow `UPDATE-3.01-MAC.md` with Finder/GitHub Desktop. `CODEX-HANDOFF.md` identifies the next work.

Earlier `qa/3.01`, `qa/3.01-polish/native-linux/pass-1`, `pass-2-before-map-polish` and `QA-3.0.md` are explicitly historical evidence, not certification of the final source or native platforms.
