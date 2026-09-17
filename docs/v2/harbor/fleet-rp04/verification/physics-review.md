# Fleet RP04 — independent bounded physics evidence review

Reviewed 2026-09-10. Read-only inspection of the completed headless reports and relevant test/source bytes; no tests, browser sessions, source edits or GPU work were launched during this review.

## Evidence identity

- Gate: `docs/v2/harbor/fleet-rp04/final-gate-01/summary.json`, completed with `status: bounded-headless-pass`, no errors, and deliberately `readyToPromote: false` pending visual/backend/performance QA.
- Selected root: `/Users/tlle/Documents/PersonalProject/CatchAndRun/art-source/harbor-v2/_staging/fleet-rp04/assets`.
- Actual final Fleet file: `zones/ferris-harbor.glb`, 3,990,856 bytes; independently hashed as `b51a69ec535d54b440f35a9aa11fe69b8fc7adc8ba777e840daf75bfa3cc08bc`, matching both summary inventory and raw static inventory. This is the final asset, not the earlier `4b830c28…` development export.
- SHA-256 of all four raw child reports matches the summary. Fleet movement, support-chain tests, candidate helper, `SupportSurfaces.ts`, and `GameManager.ts` also match their recorded source fingerprints at review time.

## Executed coverage

All 104 required candidate titles occur exactly once, pass, and identify the selected candidate root in their raw ancestor metadata. There are no skipped/todo substitutions. The five-vessel × two-tier × three-subject grid was additionally reconstructed independently from the raw titles.

| Candidate suite | Passed | Bounded coverage |
| --- | ---: | --- |
| `AssetMovementVerification.test.ts` | 24 | Existing wall, doorway, roof, deck and assembled rescue-lane contracts, High/Low Hunter/Prop |
| `HarborMarketMovement.test.ts` | 40 | Existing doors, five aisles, glazing, shelves, ceiling/details, roof, hatch and ladder |
| `HarborFleetMovement.test.ts` | 30 | Workboat, launch, red skiff, green skiff and barge; both tiers; Hunter, Prop and a loose solid |
| `BoatObjectSupportChain.test.ts` | 10 | Both-tier/reverse-order stacking and actor carry; High-tier thin-ring dry support |

The separate raw reports also pass 96 production/default regressions and 18 server regressions. Those are not candidate-GLB or live multiplayer proof.

Fleet actor cases sample 1,500 moving frames with occasional 50 ms steps, compare feet to downward visible-geometry rays within 25 mm, then test a jump, landing, departure into lethal water, and removal of that vessel's support references. The real moored skiffs descend below the server water threshold without falsely drowning a supported actor. Loose-object cases use production `GameManager` methods, 900 moving frames, plane-contact checks, visible rays, and support removal. The barge retains its authored non-moored behavior.

## Negative-control evidence

Raw `static-audit.json` contains 43 passing probes and three explicit controls per tier. All six controls have `baselinePassed`, `detected`, `restored`, and overall `passed` set true, while their deliberately mutated evidence has `passed: false`:

| Mutation, in both High and Low | Raw detected failure |
| --- | --- |
| Remove visible house floor | `missing_visual_surface` |
| Add invisible ticket-entry blocker | `invisible_blocker` |
| Seal ticket entry with visible geometry | `visible_seal` |

Movement controls are executable assertions inside the passing candidate test cases, not six additional raw static controls. Their fingerprint-matched source confirms: deleting each boat's supports causes actors to drown/loose objects to fall; a lone duplicate cannot support itself; an ascending actor only about 47 mm above a carried crate receives no carry; a stationary next frame does not replay movement. Both normal and reversed duplicate creation order remain non-overlapping. The thin-ring test uses the actual registry mesh on a controlled lowered native skiff and verifies dry classification plus jumping.

## What is fixed, and what is not certified

The evidence supports the fixes for tilted-deck AABB hovering/false side blockers, duplicate stacking, exact-once rider carry, and thin-object dry support. Cosmetic `boatDetailOnly` fittings cannot become phantom floors; separate unit controls verify both mesh and ancestor-group tags. Generic static AABB semantics are retained. No shared/server gameplay code changed in this slice.

Known limitations and next-pass priorities:

1. Arbitrary yaw can reject a valid corner-only square-foot overlap near a rotated deck edge. A synthetic 20-degree yaw reproduction exists; current five authored boat roots do not yaw. This was explicitly deferred, not claimed fixed.
2. Physics uses registered finite local support patches and upright controller/duplicate bodies, not general triangle-mesh rigid-body dynamics, friction or tumbling. The sampled deck tracks do not certify every rail/cabin edge, every prop shape, arbitrary stack depth, or every inter-boat jump trajectory.
3. Server hazard functions are exercised headlessly, but real network latency, reconciliation, remote-player support and cross-client duplicate behavior require multiplayer verification.
4. The existing CPU wave-height sampler does not invert GPU Gerstner horizontal displacement. An independent water audit reported a few-centimeter visual/CPU difference (about 5.2 cm maximum in its High-tier sample grid); this pass preserves the wave parameters and does not solve that approximation.
5. Static geometry rays do not decode alpha-map pixels and do not certify waterline visuals, lighting, reflections, frame pacing or all-island collision completeness. Final browser/backend/performance results must be assessed separately before promotion.

Conclusion: the final Fleet bytes have a valid **bounded headless physics pass** with traceable negative controls. This document is not an exhaustive whole-island, visual-quality or performance sign-off.

## Live WebGL2 Low contact-surface caveat

Historical reproduction retained for traceability. The corrected Low live run is documented in [Resolution: designated-deck-v1, WebGL2 Low V3](#resolution-designated-deck-v1-webgl2-low-v3) below; the older capture is not release evidence for five decks.

The subsequent `final-webgl2-low/final-webgl2-low-report.json` reports five passing Hunter vessel-support checks. **Two of those contacts are cabin roofs, not decks.** This was confirmed by a lightweight read-only decode of the same final Low GLB, extraction of its real support patches, and downward visible-geometry rays; no controller test or browser session was rerun.

| Vessel | Capture track at rest (x, z) | Actual deck top | Visible cabin-roof top | Recorded live feet range |
| --- | --- | ---: | ---: | ---: |
| Launch | (-8, 49.4) | -0.20 m | 1.70 m | 1.586–1.821 m |
| Workboat | (7, 49.9) | -0.05 m | 1.85 m | 1.772–1.897 m |

The visible roof meshes are `MESH_FERRIS_HARBOR_BOAT_LAUNCH_HULL_CREAM_LOD1` and `MESH_FERRIS_HARBOR_BOAT_WORKBOAT_HULL_CREAM_LOD1`. Their cabin footprints cover the capture tracks. The capture chooses the lowest sufficiently large support's centre, but that deck centre is beneath the cabin. `HunterController.setPosition` takes physical feet height, so `deck.max.y + 1.8` spawns the actor near the cabin roof (rest heights 1.60/1.75 m), within step-up distance. The contact oracle accepts any native support patch under the actor; it does not assert that contact remains on the selected deck patch.

Thus this Low live report demonstrates supported/alive/not-swimming Hunter contact on **three deck/hull-top surfaces and two cabin roofs**, including normal server state updates. Its `boats.passed: true` must not be described as five live deck checks. It does not demonstrate deck traversal, deck jumping, or low-deck water-threshold contact on the Launch/Workboat. The Low-tier `lowDeckThresholdExercised: true` field is also a bypass for non-High-skiff cases, not evidence that a negative threshold was crossed.

The 104-case headless result remains valid and separate: fixed Launch (-9.8, 49.4) and Workboat (9.05, 49.9) tracks are outside those cabin footprints, and their deck contacts are compared to actual visible rays. A future explicit live deck test should use those independently chosen tracks and identify the expected deck surface; the current raw report is retained unchanged.

## Resolution: designated-deck-v1, WebGL2 Low V3

Historical Low-only result retained. High V3 subsequently exposed a different selector defect; [designated-deck-v2 V4 evidence](#resolution-designated-deck-v2-high-and-low-v4) below supersedes V3 for the final release gate.

The corrected live capture, [final-webgl2-low-v3-report.json](../final-webgl2-low-v3/final-webgl2-low-v3-report.json), passes on all five **designated deck** tracks. Its source fingerprint is `f9f1b562de516dc4deb06a564d8209a9c8ef07d8d3cf85b98a5747034317f7d4`, matching the fresh [final-gate-03 summary](../final-gate-03/summary.json). Gate 03 passes 104 candidate, 96 production/default, and 18 server regression cases plus 86 static probes and six negative controls. Gate 01 above is historical evidence; Gate 03 is the corresponding headless result for this corrected capture protocol. The Fleet asset remains `b51a69ec535d54b440f35a9aa11fe69b8fc7adc8ba777e840daf75bfa3cc08bc`.

The capture now records `boats.protocol: designated-deck-v1`. Each vessel has a fixed independently audited track, `selectedDeck.boxIndex`, the selected bounds and exact height, a 0.20 m feet-height drop, and per-sample `deckBoxIndex`, `deckHeight`, feet position and contact error. The oracle queries only that same selected live box reference, not the nearest of any vessel supports. All raw Low V3 samples use their declared selected box index and remain on that plane.

| Vessel | Selected deck index | Observed feet range | Deck-contact samples | Out-of-deck / wet samples | Server-position matches |
| --- | ---: | ---: | ---: | ---: | ---: |
| Barge | 0 | -0.3851 to +0.2383 m | 48 | 0 / 0 | 48 |
| Launch | 1 | -0.3397 to -0.0868 m | 48 | 0 / 0 | 48 |
| Green skiff | 0 | -0.4932 to -0.2428 m | 48 | 0 / 0 | 44 |
| Red skiff | 0 | -0.4752 to -0.3218 m | 48 | 0 / 0 | 39 |
| Workboat | 1 | -0.1394 to +0.0732 m | 48 | 0 / 0 | 46 |

All 240 sampled contacts have recorded `contactError: 0`, `onDesignatedDeck: true`, and no swimming classification; every vessel ends with both client and server alive. Each measured sample interval spans about 4.75 seconds after settling, longer than the three-second drowning grace. Launch and Workboat now occupy their low deck heights, clearly separated from the historical 1.7/1.85 m cabin-roof contacts. Server-position matches are the bounded synchronization check reported above, not a claim that every sample matched or that multiplayer latency/reconciliation is exhaustively verified.

This resolves the Low cabin-roof substitution in the verification protocol. Zero sampled error means agreement with the designated physical support plane, not zero render-pixel waterline error or certification of every hull edge. Low skiffs still use their authored low-detail hull tops, and this Low run does not exercise High skiffs below the -0.9 m threshold. High V3 live evidence is pending at this documentation update; all earlier general physics/network/visual limitations remain in scope.

## Historical High V3 failure: buried hull selected as the deck

The retained [High V3 report](../final-webgpu-high-v3/final-webgpu-high-v3-report.json) failed the first Barge check. Its `lowest-usable-plane-at-fixed-track` rule chose support index 7, `MESH_FERRIS_HARBOR_BOAT_BARGE_PALETTE_LOD0`, whose local bounds are approximately `[-6.01, 0.05, -2.31]` to `[6.01, 0.17, 2.31]`. That patch is beneath the actual deck. The authored timber deck is index 0, `MESH_FERRIS_HARBOR_BOAT_BARGE_DECK_TIMBER_LOD0`, with local bounds `[-5.90, 0.70, -2.20]` to `[5.90, 0.74, 2.20]`. Its local top is 0.57 m higher. The live actor correctly rested on the deck while the V3 oracle compared against the buried hull; all 48 sampled contacts failed that wrong-plane check. This was a verification selector defect, not evidence that gameplay was hovering 0.57 m above the actual deck.

The V3 Barge also had only 15 server-position matches. Its first match arrived around 5.145 seconds after a roughly 61.6 m diagnostic relocation from the shooting preset. That delay agrees with the existing server anti-cheat distance allowance and normal convergence; no server state, anti-cheat or networking rule was overridden to fix the report. V3 is retained as failed-oracle evidence and is not a five-deck High sign-off.

## Resolution: designated-deck-v2, High and Low V4

Independently reviewed [WebGPU High V4](../final-webgpu-high-v4/final-webgpu-high-v4-report.json) and [WebGL2 Low V4](../final-webgl2-low-v4/final-webgl2-low-v4-report.json). Both identify source SHA-256 `70e5105104f47c443197fc0a54e9e9cd9638bb3b8669917b3239017ddf331ac9`, matching [Gate 04](../final-gate-04/summary.json), and their actual redirected Fleet requests identify the same 3,990,856-byte `b51a69ec535d54b440f35a9aa11fe69b8fc7adc8ba777e840daf75bfa3cc08bc` candidate. Gate 04 records 104 candidate, 96 production/default and 18 server cases, plus 86 static probes and six negative controls, all passing. Gate 01 and Gate 03 above are historical source snapshots, not the final V4 fingerprint.

V2 selects by an independently audited **source mesh name and exact rig-local finite bounds**, not by the lowest plane, highest arbitrary fitting, or any nearby support. `selectedDeck.selectionRule` is `audited-local-deck-bounds`. High uses the five authored `DECK_TIMBER_LOD0` patches; Low uses the corresponding three `HULL_NAVY_LOD1` tops and two `PLANK_RED/GREEN_LOD1` tops. The fixed Launch and Workboat tracks remain outside their cabin footprints. Each spawn is exactly 0.20 m above the selected plane and each subsequent sample references the same box index. Adding diagnostic local-bound snapshots did not change simulation or server physics.

The independent raw-data check did not trust the aggregate pass flags: it checked all ten selected mesh identities and local bounds within 0.1 mm, plan coordinates, spawn height, every per-sample selected index, `abs(feetY - deckHeight)`, the finite deck-height and track-distance bounds, swimming flags, client/server alive state, and all reported counts/minima/maxima. Server matches were recomputed from recorded server coordinates within the declared 0.7 m horizontal and 0.3 m vertical tolerances; every matched record is an alive Hunter in the active phase. Each boat has at least 30 such samples spanning at least three seconds. That is a bounded normal-network synchronization check, not exact zero-latency agreement.

| High V4 vessel | Specific-deck contacts | Raw server matches | First-to-last matched span | Observed feet range |
| --- | ---: | ---: | ---: | --- |
| Barge | 63 | 31 | 3.0355 s | -0.3506 to +0.1115 m |
| Launch | 48 | 48 | 4.7485 s | -0.2587 to -0.1066 m |
| Green skiff | 153 | 148 | 14.8363 s | -0.9094 to -0.4617 m |
| Red skiff | 95 | 86 | 8.5917 s | -0.9105 to -0.5029 m |
| Workboat | 48 | 45 | 4.4472 s | -0.2947 to +0.1677 m |

| Low V4 vessel | Specific-deck contacts | Raw server matches | First-to-last matched span | Observed feet range |
| --- | ---: | ---: | ---: | --- |
| Barge | 48 | 48 | 4.7688 s | -0.3820 to +0.2383 m |
| Launch | 47 | 47 | 4.6696 s | -0.3397 to -0.0923 m |
| Green skiff | 48 | 44 | 4.3558 s | -0.4931 to -0.2427 m |
| Red skiff | 48 | 39 | 3.8627 s | -0.4759 to -0.3218 m |
| Workboat | 48 | 46 | 4.5626 s | -0.1394 to +0.0731 m |

All **407 High and 239 Low contacts (646 total)** have recomputed deck error exactly zero in the recorded floating-point data, zero out-of-deck samples and zero swimming samples. Every vessel finishes with both client and server alive. Zero error means contact with the designated physical plane, not a render-pixel or water-surface alignment guarantee.

Both High client skiffs naturally sampled feet below -0.9 m while remaining on their dry support; the longer High sampling loops exercised those troughs. The matched spans above are total supported-contact time, **not three continuous seconds below -0.9 m**. In Green's own matched High records the minimum raw server Y is -0.89938 m, while Red reaches -0.90250 m. Thus this live evidence does not claim both server positions stayed below the threshold for a drowning-grace interval. Headless full-cycle hazard/support tests remain separate evidence. Low's threshold flag is not treated as an actual crossing: its authored coarse hull tops stay well above that threshold.

This closes the two identified live-oracle substitutions (cabin roof and buried hull) for these ten fixed boat/tier tracks. It does not expand the result to arbitrary deck edges, all prop shapes, general multi-client reconciliation, or whole-island/performance/visual approval. Existing physics and wave-sampler limitations listed above remain documented. No source/test files or browser/GPU runs were changed or launched during this final independent report review.
