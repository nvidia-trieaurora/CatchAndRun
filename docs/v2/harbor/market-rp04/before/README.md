# Harbor Market RP04 — runtime before baseline

Captured 10 September 2026 using the existing private solo-room review tool, QA client `http://localhost:5174` and its existing server on port 2568. Production assets were read, not changed. No player room or user browser was reused.

## Art reference versus actual game

The approved [exterior concept](../../photoreal-direction-rp04/02-market-exterior.png) and [interior concept](../../photoreal-direction-rp04/03-market-interior.png) are AI direction images, not runtime renders. The existing store already has a glazed shopfront, open middle entry, stock shelves, produce crates, refrigerators, side service equipment and a roof route. Retain their physical layout; the main visual gap is materials, believable small-scale construction and lighting/contact detail.

Priority improvements observed in the actual before shots:

1. Replace the uniformly flat wall/ceiling and dark flat floor appearance with correctly scaled plaster/tile/ceiling finishes, restrained roughness variation and edge/contact detail. Preserve wall openings and headroom.
2. Improve stock silhouettes and labels: current boxes/bottles repeat very simple, saturated patterns. Use shared packaging atlases and instancing; do not create a new expensive material for every product.
3. Make refrigerators read as cabinets with depth, shelves, subtle glass and cooler lighting. Current near view is milky and the product silhouettes read as flat block icons.
4. Add supported ceiling fixtures/services, selected upper-wall signage and a coherent Harbor Market identity. Do not copy the concept's extra windows or its conflicting “Harbor Provisions” name into the authoritative layout.
5. Give exterior timber/fascia/metal and crates material detail and believable joinery while preserving the clear entry and kerb routes. More scattered boxes alone would not solve the realism gap.

## Captures

All images are 1600 × 900, WebGPU High, headless Chrome with Metal ANGLE and a fresh isolated profile. Audio is muted. Each view settles for 3.5 seconds, samples static performance for 4 seconds and pans 360° for 4 seconds. This is not a 4K, mobile, audio-on or multiplayer performance certification.

| View | Image | Static p95 | Actual renderer draw calls | Cold-run pan maximum |
| --- | --- | ---: | ---: | ---: |
| Front | [PNG](before-webgpu-high-harborMarketFront.png) | 16.8 ms | 197 | 433.4 ms |
| Exterior | [PNG](before-webgpu-high-harborMarketExterior.png) | 16.7 ms | 231 | 33.4 ms |
| Interior | [PNG](before-webgpu-high-harborMarketInterior.png) | 16.7 ms | 190 | 66.6 ms |
| Shelf | [PNG](before-webgpu-high-harborMarketShelf.png) | 16.8 ms | 225 | 33.5 ms |
| Fridge | [PNG](before-webgpu-high-harborMarketFridge.png) | 16.8 ms | 186 | 33.5 ms |

[Original capture report](before-webgpu-high-report.json). All five static samples were approximately 59–60 FPS, with no frame over 50 ms. The first Front pan had five frames over 50 ms. No renderer/application console errors; microphone denial is expected in the isolated muted browser. Use `rendererStats.render.drawCalls`, not cumulative WebGPU `render.calls`; the separate periodic map metrics are not the same per-view renderer measurement.

### Cold-pan regression explicitly retained

[Repeat experiment](before-pan-repeat-report.json) starts another fresh browser and records Front → Interior → Front → Interior in the same session. First Front pan reproduces a 433.3 ms maximum and five frames over 50 ms; its browser trace contains main-thread long tasks of 89, 234, 443, 199 and 114 ms. The second Front pan has no frame over 50 ms and a 33.4 ms maximum, although p95 is 33.3 ms. Both Interior pan samples in this repeat have no frame over 50 ms.

This supports a first-visibility/resource/shader-warmup hypothesis rather than proof of a persistent Market-only GPU bottleneck. The capture does not identify the exact function responsible, so the cause is not yet conclusively diagnosed or fixed. It is an explicit before baseline for the candidate review; do not discard cold samples and claim the camera lag has gone. Duplicate preset PNG names in this repeat contain the last occurrence; all four samples remain separately ordered in its JSON report.

## Served asset identity

A read-only fetch at `2026-09-10T08:58:53.660Z` confirmed the production Market URL responds HTTP 200 with `Cache-Control: no-cache` and byte-for-byte matches the local asset:

- URL: `/assets/maps/harbor-v2/zones/container-bd.glb?v=20260910-rp03`
- File: `client/public/assets/maps/harbor-v2/zones/container-bd.glb`
- Bytes: `5,334,504`
- SHA256: `f6944872ccada70a276d94348cba03c99d6fe8c5ddb43558f0c0aad25f51c7e0`

This fetch verifies served bytes at that time; the current review script does not record hashes of each original browser response. A candidate review must additionally bind the response URL/hash to the candidate it intends to test.

## Candidate → runtime and cache cautions

- `client/src/game/world/zones/harborZones.ts` selects the Market as part of the `container-bd` asset. At baseline its staging URL points to `/staging-assets/market-rp03/container-bd-runtime.glb`.
- `?harborZones=staging` swaps **all seven zones**, not just Market. Candidate-only art review must control this whole staging inventory or use an explicit scoped review mechanism. Never assume it changes only the shop.
- The existing Vite middleware serves `_staging` at `/staging-assets/` with `Cache-Control: no-store`; this is dev-only.
- `MapAssetLoader` keeps its template and load promise for the lifetime of the page. Start a fresh page/browser after changing an asset; starting another round does not reload a changed GLB.
- Headless `HARBOR_VERIFY_ASSET_ROOT` does not change Vite/browser asset URLs.
- After the validated bytes are deliberately promoted, bump the production `?v=` token so existing clients request the new asset. Do not use the old RP03 finalizer's `--promote` to bypass the RP04 verification flow.

Reproduction:

```sh
node tools/harbor-v2/capture_runtime_review.mjs --base-url http://localhost:5174 \
  --out-dir docs/v2/harbor/market-rp04/before --prefix before-webgpu-high \
  --presets harborMarketFront,harborMarketExterior,harborMarketInterior,harborMarketShelf,harborMarketFridge \
  --renderer webgpu --quality high --pan true --sample-ms 4000 --pan-ms 4000 --port 9344
```

Use a new output prefix or directory for later runs to retain this baseline.
