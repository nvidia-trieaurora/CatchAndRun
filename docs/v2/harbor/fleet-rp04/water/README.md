# Fleet RP04 — bounded water shader pass

10 September 2026. This pass changes shoreline foam appearance only. It does not change the mean sea level, Gerstner wave parameters, sampled water height, ripple lifetimes/strength, hull masks, boats, player motion, or drowning rules.

## Change and rationale

RP03 already uses a single opaque Gerstner ocean with no transmission copy, quality-scaled geometry, pooled impact ripples, two local hull-interior masks and one eight-triangle shoreline wash. Those budgets are retained.

Previously, surface shore foam followed an independent `time * 1.5 + distance * 2.8` sine oscillator while the wall wash followed the Gerstner height. This could brighten surface foam at a trough independently of the visible crest. The replacement expression consumes the existing normalized Gerstner height: the breaking band expands at a crest and recedes to a thin residual contact line at a trough. Wall-wash intensity uses the same crest response and broken patch factor. The old additional sine/power oscillator is removed.

The signed-shore-distance branch still skips shore work in open water. The foam has no separate surface/deck mesh; it uses the already masked water material, so it does not add an overlay onto dry decks. The existing wash receiver remains at the concrete faces. There are no new textures, uniforms, full-scene renders or per-frame CPU calculations.

Files:

- `client/src/game/world/environment/harborWater.ts`
- `client/src/game/world/environment/harborShoreFoam.ts`
- `client/tests/harborWater.test.ts`
- `client/tests/HarborShoreFoam.test.ts`

## Focused tests

**26/26 pass**, single-worker Vitest: 22 water tests and 4 new foam-expression tests. The latter execute the actual TSL expression with scalar operator substitutes, not a separately copied CPU foam formula. Known crest/trough, reversed/equal-height negative controls, narrow wet-side bounds and shared patch breakup are checked. These scalar tests do not replace real GPU shader compilation or temporal visual review.

Three fixed pre-upgrade water-height snapshots per quality tier protect the existing height/phase contract. Existing cases preserve hull-mask independence, stable geometry/material version during 200 impacts, disposal ownership and one opaque + one single-pass transparent draw classification. Targeted ESLint passes. The two existing RenderList test type errors were corrected using the real Three Lighting object and a single-material guard; all 26 focused tests pass afterward. Root also corrected the island UV test's Vector2/interleaved-attribute typing without changing assertions. Full client typecheck and production TypeScript compile now pass (`../verification/typecheck.log`, `../verification/client-compile.log`), with 381/381 full client tests.

Command (from `client`):

```sh
node ../node_modules/vitest/vitest.mjs run --maxWorkers=1 --config vitest.config.ts tests/HarborShoreFoam.test.ts tests/harborWater.test.ts
```

## Real browser observations — preliminary, not promotion proof

Before: `../before/before-water-webgpu-high-report.json` and corresponding PNGs. Candidate: `../candidate-preliminary/preliminary-water-webgpu-high-report.json` and PNGs. Isolated headless Chrome, WebGPU High, 1600×900, 16s initial settle, same three presets, 3s static + 3s 360° pan each, then coast/wall shooting. Audio muted; no Blender render or test suite was run concurrently. Background machine load was not externally controlled.

Candidate loaded all nine staged GLBs; Ferris/fleet was 4,035,184 bytes, SHA-256 `4b830c280989332d5d95aaec45a7986acb6928f8858f984326c24c17d4ccebfc`. The captured source SHA was `ecdf867fd3d8c7e6aed45d1f333a73700afac7c5decb9456f5e7d22c52a81276`. **This art candidate was subsequently rejected:** some rotated crate fittings were exported near the world origin before the Blender dependency graph was updated. The corrected art has a different hash. These retained captures show preliminary water shader compilation only, not approval of current art or fresh final-gate evidence.

| View | Before static / pan FPS | Candidate static / pan FPS | Before / candidate actual draw calls |
|---|---:|---:|---:|
| workboatDetail | 60.0 / 56.0 | 53.3 / 55.0 | 242 / 247 |
| fleetDetail | 50.1 / 52.0 | 47.5 / 52.4 | 334 / 339 |
| ferrisHarborWater | 48.8 / 55.0 | 42.5 / 55.0 | 430 / 434 |

Candidate static/pans had no frames above 50ms. Before workboat pan had one 66.7ms frame. Overall FPS is not certified equal/better: the candidate also includes new boat geometry. Geometry count was 330 before / 335 candidate, while texture count stayed 326 and estimated texture bytes stayed 215,466,240. The foam change itself adds no meshes or material batches.

Shooting remains an open issue. Before coast firing: 49.85 FPS, max100ms, 1 frame >50ms; candidate: 46.02 FPS, max116.6ms, 11 frames >50ms. Before wall firing: 35.85 FPS, max316.7ms, 21 frames >50ms; candidate: 28.88 FPS, max66.7ms, 11 frames >50ms. Wall idle was already 30.87 / 28.51 FPS. These mixed, short runs are not a controlled isolation of shader cost and do not justify claiming a performance fix.

Both reports retain microphone-denied warnings and two headless pointer-lock `WrongDocumentError` exceptions. The helper's filtered non-permission error count was zero. Candidate coast produced 48 actual water impacts; wall marks stayed at maximum 0.13m world span.

All three candidate PNGs were inspected: frames/hinges/rope and crate straps read more constructed; visible workboat decks remain dry; a thin shore contact line is visible. The wide presets do not prove crest/trough timing. Open water still has procedural parallel/quilt-like patterns rather than the concept's irregular fine chop. A close-quay timed visual check and final WebGL/WebGPU/quality matrix remain required before calling the water appearance finished. No 4K, whole-island, multiplayer or universal-60-FPS claim is made.

## Corrected candidate — historical High-02 visual inspection

This subsection retains visual/timing observations from an intermediate protocol/source version. Later review found that its ANY-support oracle could accept cabin roofs in the Low sibling run. These physics flags and source hashes are not final promotion proof. The subsequent `designated-deck-v1` / `*-v3` attempt also failed on a buried barge hull plane (see below). Fresh reports using the frozen `designated-deck-v2` audited local mesh/bounds contract are required for promotion; they are not certified by this historical subsection.

Reviewed the actual 1600×900 PNGs in `../final-webgpu-high-02/`: `workboatDetail`, `fleetDetail`, `ferrisHarborWater`, and all six `shore-sequence-00` through `05` frames. These are in-game screenshots, not generated concept images or a Blender beauty render. The corrected candidate asset is SHA-256 `b51a69ec535d54b440f35a9aa11fe69b8fc7adc8ba777e840daf75bfa3cc08bc`.

Cross-checked `../final-webgpu-high-02/final-webgpu-high-02-report.json`, completed at 14:51:18 UTC on 10 September: it binds source SHA-256 `bb72714637efb0309bd70d668548e43a41bab4e2d0b0940cced3d167a99bbb14` and the same 3,990,856-byte staged fleet GLB. The six captures ran from 14:49:43.460 to 14:49:48.864 UTC at approximately one-second start intervals with the fixed camera. At the middle wall sample `(36,47.515)`, CPU height brackets range from approximately −0.936m to −0.464m across this sequence, consistent with visible rise/recession; these are not pixel-height measurements or proof of exact GPU/CPU surface identity.

The fixed-camera shoreline sequence shows the water/wash contact moving vertically against the concrete wall. The pale cyan contact band changes thickness and extent as different portions of the wave pass: frames 00–02 show a lower contact line toward the left/middle; frames 03–04 rise there; frame 05 recedes. The band remains at the water-facing lower wall in these views rather than coating the top of the quay. This is visibly animated contact, not a static decal. Six spaced screenshots do not measure every rendered frame, exact foam-to-crest phase error, or continuous-motion flicker.

In the three boat views, the visible workboat/launch/barge timber decks stay readable and dry, with no water/shore-foam sheet seen across them. Cabin window frames and wipers, door hardware, crate bands, rope reel and boat identification are visible and attached plausibly in the inspected views. No obvious newly added floating fittings were seen. This is limited visual evidence; it does not replace the all-five live deck tests, hidden-side inspection, or collision checks for every prop.

The realistic-art target is **not yet reached**. Broad offshore highlights still form regular parallel/oval patterns; nearshore foam reads as a fairly continuous pale rim instead of turbulent breakup, spray or convincing small breaking waves. Cabin panels and cargo retain large clean/flat regions, while repeated timber and concrete patterns remain conspicuous. The next art iteration should prioritize less regular water highlight structure, subtle interrupted shoreline foam and better roughness/wear variation on the largest cabin/cargo surfaces. Those are remaining improvements, not changes claimed in this bounded pass. No photorealistic, 4K runtime, whole-island, or stable-60-FPS certification is inferred from these images.

High-02 performance observations are favorable but bounded: all three static/pan samples are approximately 60 FPS, p95≤16.8ms, with no frame above 50ms; actual draw calls are 247 / 340 / 434. Coast and warehouse-wall firing are also approximately 60 FPS in this run, with 40 water impacts and 41 wall marks (maximum world span 0.13m). These are requestAnimationFrame intervals, not GPU timestamps or certified presented-frame throughput. This differs substantially from the earlier mixed-load baseline/preliminary runs and is **not a controlled attribution of a performance gain to the foam shader**. The historical report records five Hunter vessel-support contacts alive/dry using the old ANY-support oracle and one matching authoritative held-jump drowning event ending in dead spectators with server health zero; it is not final designated-deck proof. Escape/climb-out was not exercised. Filtered non-permission errors are zero, while two headless pointer-lock exceptions and microphone denial remain in the raw log. Other backend/tier checks are reported separately; this subsection reviews WebGPU High only.

## Historical High-V3 — visual observations only, boat proof failed

The `../final-webgpu-high-v3/` report binds source `f9f1b562de516dc4deb06a564d8209a9c8ef07d8d3cf85b98a5747034317f7d4` and the same corrected fleet asset. Its boat proof failed: the `designated-deck-v1` lowest-usable-plane selector chose a barge hull plane approximately 0.57m below the timber deck. It recorded zero designated-deck contacts, 48 out-of-deck samples and maximum contact error 0.5711m; only the first boat was attempted before failure. Being alive and dry in that capture does not establish correct deck contact. Preserve this report as failed/intermediate evidence, not five-vessel approval.

Inspected the three actual boat preset PNGs plus shoreline frames 00 and 03 from this run. Visible decks and fittings, the rise/recession of the quay contact rim, and the regular offshore highlight pattern are materially consistent with the High-02 observations above. This inspection does not cover all six V3 shoreline frames or provide a new continuous-motion test. The approximately 60 FPS static/pan samples remain bounded observations from an intermediate source; they do not override the failed boat proof or establish a controlled performance improvement.

## Final-source High-V4 — independent visual inspection

Reviewed all nine native 1600×900 PNGs in `../final-webgpu-high-v4/`: the three boat presets and every `shore-sequence-00` through `05` frame. The completed report (15:53:01.263 UTC, 10 September) binds frozen source `70e5105104f47c443197fc0a54e9e9cd9638bb3b8669917b3239017ddf331ac9` and fleet asset `b51a69ec535d54b440f35a9aa11fe69b8fc7adc8ba777e840daf75bfa3cc08bc`, 3,990,856 bytes. This is a staged-candidate WebGPU High inspection, not evidence that the production URL was already promoted.

The fixed-camera six-frame sequence ran from 15:51:27.197 through 15:51:32.511 UTC. The lower quay contact visibly recedes/thins around frames 00–01, advances up the left/middle wall in 02–03, then recedes again by 05. Frame 04 retains a broad pale wash farther right as the wave travels. The middle CPU sample `(36,47.515)` spans approximately −0.952m to −0.473m across the before/after capture brackets. The pale contact stays below the quay top in these images; no foam sheet is seen over the pavement or visible timber decks. This supports visible moving shoreline contact, not an exact GPU/CPU phase measurement or a guarantee against flicker between the six stills.

The workboat close view shows attached window frames and wipers, hinges/handle, readable identification, crate bands and rope reel. The fleet and Ferris-wide views retain readable dry timber decks and plausible attachment of the added fittings, with no obvious newly detached fitting in the inspected angles. The realistic-art gap remains substantial: broad, regular oval/parallel water highlights, a fairly continuous cyan shoreline rim, clean flat cabin panels and repeated surface textures still look stylized. These images do not meet the photorealistic concept target; turbulent wave breakup/spray and convincing weathered cabin/cargo materials are not claimed.

The three four-second static and 360° pan samples each record approximately 60 FPS, p95≤16.8ms, maximum 16.8ms and zero frames above 50ms. Actual renderer draw calls for the captured views are 246 / 340 / 434. Coast and warehouse-wall firing also record approximately 60 FPS in this run; there are 41 actual water impacts and 40 wall marks with maximum world span 0.13m. As before, these are short requestAnimationFrame observations, not GPU timestamps, a controlled shader-cost A/B, or an all-angle/all-device performance guarantee. Two headless pointer-lock exceptions and microphone denial remain in the raw log, with zero filtered non-permission errors.

Separately from the image review, this report records `designated-deck-v2` success for all five named vessel tracks, zero out-of-deck/wet samples, and matching live authoritative Hunter samples for at least 30 observations spanning at least three seconds per vessel. Its held-jump open-water scenario records one matching elimination event, dead client/server spectators and server health zero. Those structured proofs and the other backend/quality runs belong to the promotion guard/matrix; the screenshots alone do not certify them. No escape/climb-out, every loose object, 4K runtime or whole-island certification is added here.

## Existing sampled-height approximation

The rendered Gerstner mesh shifts X/Z horizontally, while `sampleHeight(x,z)` evaluates height at un-inverted X/Z. This pre-existing approximation is unchanged. An analytical fleet-region sweep (x −30..20 in 2m steps, z44..62 in 2m steps, t0..30 in0.25s steps; no ripples or mesh interpolation) observed maximum height discrepancy of approximately **5.17cm High / 2.32cm Medium / 0.91cm Low** between the displaced surface location and direct CPU sampling. This is not a global bound.

The physics agent was informed; no sampling inversion or wave-amplitude change was made because those changes would alter buoyancy and the existing server support envelope. Do not describe GPU water and CPU support height as mathematically identical.
