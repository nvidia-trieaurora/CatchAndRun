# RP04 practical-light diagnosis — not promotion proof

2026-09-10. Isolated headless Chrome, WebGPU High, 1600×900, QA client `localhost:5174` / QA server 2568. No tracked runtime, asset, production URL, or server changes were made for this experiment. Three browser sessions were run sequentially; each completed and closed its own browser. Other user services/processes were left alone.

## Question and control

The first candidate review showed coast/wall shooting slower than an older two-view production control. The hypothesis was that the two new `harbor-market-practical-*` PointLights imposed a global rendering cost.

All three new runs use the same five ordered presets as the original candidate: `harborMarketFront`, `harborMarketExterior`, `harborMarketInterior`, `harborMarketShelf`, `harborMarketFridge`. Each preset has 3.5s settling, 4s static measurement, and 4s 360° pan. Shooting follows all five views: coast then warehouse-wall, each 4s idle + 12s held fire. Initial map settling is 16s. Audio is muted. These are short local observations, not device-wide FPS guarantees.

The no-practicals run changes only the browser instance: before the first world animation/render, remove PointLights named exactly `harbor-market-practical-0` and `harbor-market-practical-1`. Recheck only when the mapObjects array changes, avoiding per-frame traversal. Fixture meshes and their emissive materials stay unchanged. The log proves exactly those two lights were removed once. This modified browser state is diagnostic, not an unmodified final QA approval.

The temporary helper was copied from the current capture helper to `/tmp/catchandrun-no-practicals.nIKrBY/capture_runtime_review.mjs`. Its only behavior change was the removal hook in `GameManager.prototype.animate`; its verifier import was made absolute for execution outside the repository. The checked-in capture helper was not edited.

Both candidate runs attest the same runtime source SHA-256:

`2449157375bbfb905e0a4bb34552644cfa9c5e492fc102fec03f38eab49feeea`

Both loaded exactly nine candidate GLBs, including `container-bd.glb`, 6,001,596 bytes:

`3e593113f9e820e80d24430b736adda7e22ae9f28ed350065a85be26db1a8ca5`

## Shooting results

Each cell is **FPS / p95 ms / maximum ms / frames over 50ms**.

| Run | Coast firing | Wall firing |
|---|---|---|
| Original candidate with lights, five views | 46.35 / 33.4 / 199.9 / 13 | 43.36 / 33.4 / 66.7 / 3 |
| Candidate without practicals, five views | 49.28 / 49.9 / 83.3 / 11 | 23.20 / 50.1 / 133.3 / 32 |
| Production control, five views | 59.75 / 16.7 / 33.3 / 0 | 50.85 / 33.4 / 66.7 / 3 |
| Candidate with lights repeated, five views | 59.75 / 16.8 / 33.3 / 0 | 54.18 / 33.3 / 83.4 / 1 |

The no-light candidate still degraded severely: wall idle was already 22.91 FPS, before firing. Removing the practicals therefore did not cure the reported late slowdown. The unchanged with-light candidate subsequently recovered to ~60 FPS coast firing and outperformed the adjacent production control at wall firing. A reproducible light-caused shooting regression was **not established**; deleting the lights would not be an evidence-backed fix.

This does **not** certify stable 60 FPS. In the with-light repeat, Shelf static was 47.80 FPS and Fridge static 29.63 FPS, yet both pans improved to 57.25 / 51.00 FPS and the later coast firing recovered. The no-light run had ~60 FPS at both static views but an Interior pan dip to 44.25 FPS. Production also had 83–150ms isolated static stalls and late wall slowdown. The inconsistent location/timing needs a quieter-host controlled profile if a strict performance gate is required; do not discard the failed samples or claim the asset is lag-free.

A read-only host snapshot between the first two sessions found unrelated Defender enterprise ~89% CPU, Defender unprivileged ~33%, WindowServer ~42%, and an existing user Chrome renderer ~32%. This is evidence of a confounder, not proof that those processes caused any individual frame. No security software, user applications, or services were stopped or changed.

## Resource and validity checks

Counts below remained fixed across all five measured views in each new run. No growing geometry/texture count was observed during this bounded sample; this does not rule out other leaks.

| Runtime inventory | Production | Candidate, lights on or off |
|---|---:|---:|
| Scene meshes / estimated scene draw batches | 254 | 257 |
| Scene triangles | 280,705 | 286,897 |
| Renderer geometries | 327 | 330 |
| Renderer textures | 311 | 326 |
| Estimated texture memory bytes | 205,439,232 | 215,466,240 |
| Environment transfer bytes | 32,041,208 | 32,708,300 |
| Instanced meshes | 23 | 23 |
| Colliders | 836 | 836 |

Actual renderer draw calls at the five static presets were **197/231/190/225/186** production versus **203/237/196/231/192** candidate (+6 each; includes rendering passes). This is distinct from the scene-wide estimated draw-batch count.

All three new sessions: zero console errors; only expected microphone-denied warning. Coast registered 40–43 actual water impacts, wall registered 39–41 marks, 40–43 fire calls per target. Maximum mark world span remained 0.13m. Geometry count remained 327 production / 330 candidate through both shooting targets.

## Reports

- `no-practicals-webgpu-high-report.json`: modified browser diagnosis, exact removal log and candidate hashes.
- `production-five-webgpu-high-report.json`: same five-view sequence on production assets, unmodified capture helper.
- `candidate-repeat-webgpu-high-report.json`: same five-view sequence with candidate assets and both practicals, unmodified capture helper.
- Original comparison: `../candidate-reviewed/rp04-webgpu-high-report.json` and `../baseline-reviewed/production-webgpu-high-report.json` (the original baseline had only two views).

Recommendation: retain the existing lighting source pending a reproducible targeted result. Treat this experiment as inconclusive for universal smoothness, not a reason for a speculative lighting change or automatic promotion. Browser resources are released; no further runs are pending.
