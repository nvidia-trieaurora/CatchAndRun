# Harbor V2 snapshot gates

The Harbor art pass is reviewed from broad composition to zone detail. Keep
these filenames stable so later passes can be compared directly.

## Baseline

- `00-overview-before.png`: whole island before the Warehouse/Dock fidelity pass.
- `01-warehouse-before.png`: Warehouse authoring baseline.
- `02-dock-before.png`: Dock authoring baseline.
- `00-metrics-before.json`: baseline authored-asset metrics.

## Warehouse gate

- `11-warehouse-overview-after.png`: final authored Warehouse overview.
- `12-warehouse-loading-after.png`: loading entrance and interior sightline.
- `13-warehouse-stairs-after.png`: complete exterior stair and handrail route.
- `14-warehouse-interior-after.png`: playable interior route.
- `10-warehouse-metrics-after.json`: payload, geometry, draw-call and collider gate.

## Working Dock and fleet gate

- `20-overview-dock-after.png`: whole authored island after the Dock pass.
- `21-dock-after.png`: market, seawall and mooring detail.
- `22-fleet-after.png`: hero workboat detail.
- `20-dock-metrics-after.json`: optimized cinematic environment gate.

## Runtime gate

- `30-runtime-overview-final.png`: final whole-island WebGPU view.
- `31-runtime-warehouse-final.png`: final Warehouse runtime view.
- `32-runtime-dock-final.png`: final Working Dock runtime view.
- `33-runtime-fleet-final.png`: final fleet and water runtime view.
- `34-runtime-webgl2-final.png`: forced WebGL2 fallback overview.
- `30-runtime-metrics-final.json`: WebGPU high-tier measurement.
- `34-runtime-webgl2-metrics-final.json`: WebGL2 medium-tier measurement.

Development builds expose `window.__catchAndRunView()` with `overview`,
`warehouse`, `dock`, and `fleet` presets for deterministic recaptures. This
hook is excluded from production behavior.
