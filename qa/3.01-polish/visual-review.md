# SCOUT 3.01 visual and rendering review

Review date: 4 October 2026. This review covers the current source and the fresh Linux Electron captures referenced below. Historical captures in `qa/3.01` were used only for orientation; they are not evidence for this checkpoint.

## Confirmed defects corrected before the final build

| Defect | Evidence | Correction | Verification |
| --- | --- | --- | --- |
| Transparent compact windows cast fully opaque shadow silhouettes; the final model traversal also overrode the dashboard needles' explicit noncasting flag. | An isolated model inspection found all four 10%-opacity windows and four instrument needles had `castShadow = true`. The bundled Three shadow depth pass does not apply ordinary material opacity. | `src/lib/immersive-assets.ts`: transparent glass excludes casting/receiving shadows and needles keep their noncasting flag. Solid bodywork retains casting. | `tests/immersive-art.mjs` checks the constructed model's glass, needles and bodywork. |
| The front and rear glass/pillars leaned away from the roof. The rendered front windshield also disagreed with the existing Cannon contact slope. | Transformed front glass had an approximately 0.30 m longitudinal gap to the roof. The renderer used a negative front X tilt while Cannon used positive X tilt. | `src/lib/immersive-assets.ts`: front glass/A-pillars lean toward the roof with positive X tilt; rear glass/pillars use negative X tilt. The front now agrees with the existing physical surface. | Real transformed vertices of both windows and all four corner pillars must lie within 0.08 m of the roof bounds. The former front tilt fails this geometric condition. |
| The compact tires spun backward during forward driving. | Forward motion is local -Z around an X axle, but the former positive roll angle moved the ground-facing tire surface in -Z too. | `src/lib/immersive-assets.ts`: wheel roll subtracts signed travel divided by radius. | A forward step must move the ground-facing surface in +Z relative to the body; reversing equal distance must return it to its initial orientation. |

Focused verification: `node --experimental-strip-types tests/immersive-art.mjs` passed after these changes. This also retains the dashboard damping, damage/repair, meadow budget, shader state, character animation and exact resource disposal checks.

Police and ordinary traffic used the same reversed roll sign. Their owning developers corrected both in `immersive-police.ts` and `immersive-traffic.ts`; the final native captures include the resulting models, while the compact's motion direction is verified by the focused geometric check.

The new police status initially shared the topbar's vertical space. Source review identified likely overlap with the brand and journal/pause controls, especially at the small QA viewport. Root moved it below those controls and the location/map row in `immersive-world.css`. Final native DOM bounds and synchronized pixel review verify its placement; wrapped transient messages and police status now flow in one stack with a 12 px gap.

The physics reviewer also confirmed that a resident/officer route advance followed by the same velocity in Cannon doubled their motion. The controller now supplies previous-to-desired movement, and the scene adopts actual engine displacement, including the officer. Coupled real-controller regressions cover the correction. This resolves a source-proven movement defect; it is not a hardware smoothness measurement.

## Source review scope

- `ImmersiveWorld.tsx`: scene camera, lights/fog, fixed-step interpolation, graphics pressure changes, cockpit presentation, local activity, articulated pose application and player overlays.
- `immersive-assets.ts`: original palette, material/texture ownership, compact geometry/instruments and articulated character binding.
- `immersive-atmosphere.ts`: sky/water shaders, bounded meadow instances, cloud motion, hill bounds and disposal.
- `immersive-world.ts`, `regional-scenery.ts`, `regional-wayfinding.ts`: buildings, road geometry, static batches, spatial visibility, trees, plazas, service pumps and sign atlas.
- `immersive-pedestrians.ts`, `immersive-police.ts`, `immersive-traffic.ts`: bounded local models, interpolation, emergency livery/lights, physical pose presentation and rendering visibility.

The original cream, teal, celadon, coral and brass direction is preserved. Geometry and locally drawn texture atlases remain bundled. No reference game's assets or branding were introduced.

## Fresh pixel inspection

The final frozen source passed 45 actual native Linux checks plus six separate compositor-synchronized art checks. Root and the independent pixel reviewer inspected the final images. No remaining confirmed clipping or UI stacking defect was found in the inspected views.

| Final capture/evidence | Observed result |
| --- | --- |
| `native-linux/native-linux-title.png` | Original coastal illustration and three journal cards have clear hierarchy; title controls are readable. |
| `native-linux-art-review/native-linux-cockpit.png` | Connected glass/pillars/roof and physical instruments render inside the cabin. Route card ends near y219, above the dashboard near y270; gauges are clear. |
| `native-linux-art-review/native-linux-regional-map.png` and `native-linux-nearby-map.png` | Actual selected Region/Nearby states, full Cirrus Harbor labels, isolated modal header/close controls. Computed settlement bounds agree with the visible correction. |
| `native-linux/native-linux-service.png` | Service heading, close control, fuel/condition and paid actions are readable with the gameplay header hidden. The small viewport scrolls normally. |
| `native-linux-art-review/native-linux-eastmere-interstate-sign.png` and `native-linux-eastmere-welcome-sign.png` | Grounded directional/welcome sign panels render and the road-facing buildings show modeled window rows/awnings. |
| `native-linux-art-review/native-linux-tideglass-coast-overlook.png` | Camera actually faces the water; continuous shore/horizon/hills have no obvious gap. |
| Final `native-linux` pending/arrival/impound/settled captures | Wrapped strike toast clears police status by 12 px; route information yields to the response. Patrols are visible on the road; impound uses a transition; settled compact is grounded with a readable entry prompt. |
| Final `native-linux` chapter-restart-confirm/headquarters captures | The actual Career confirmation dialog is visible and legible; reset returns to a coherent headquarters interior with no preceding vehicle scene. |

Further defects corrected during this review: vertical-street facades were reversed, map labels clipped at their boundary, a small-window route card grazed a speedometer rim, and a wrapped strike toast overlapped police status. Facade orientation is checked against 702 constructed mesh/footprint pairs; text/overlay corrections use actual native DOM bounds and synchronized pixels, not a CSS-string test.

The old 150 ms capture delay sometimes read a preceding compositor frame: one Region filename contained an exterior view and an older Nearby filename showed Region. These are retained as QA timing evidence, not interpreted as product navigation failures. The helper now waits for renderer animation frames and a native compositor paint. The separate final art-review folder supplies definitive modal/scene retakes using another profile and the same final build hashes. Later resolve/restart images also use the synchronized helper.

The initial contact still can show an upright torso very early in the articulated response. It does not prove the full ragdoll animation; actual Cannon contact/constraint/trajectory and rig-binding regressions provide that evidence. No gore or borrowed game assets were added.

## Reasonable art follow-up, separate from confirmed bugs

Static regional chunks have a 1600 m hard visibility limit, while the scene's current exponential fog leaves substantial distant contrast at that distance. This can produce visible distant building/forest changes during a long drive. It is a bounded rendering tradeoff, not a failure established by a still image; any follow-up should preserve the scene budget and be evaluated in motion on target hardware.

The scene has a working original stylized foundation with simple modeled silhouettes. More authored street composition, variation in interiors and small environment storytelling would improve richness. That is additional art production, not proof that the current game meets AAA content density or visual quality.

## Limits

Static captures verify actual visible rendering, framing, text legibility and obvious clipping. They do not measure smoothness, frame pacing or sustained hardware performance. The Linux fixture uses software rendering and headless monitor/pointer accommodations; it does not establish native Apple silicon Metal behavior, native Mac/Windows display or mouse capture, audio listening quality, installers or signing. Final QA must retain those separate release gates.
