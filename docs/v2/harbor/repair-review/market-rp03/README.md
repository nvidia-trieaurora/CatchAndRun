# Harbor Market RP03 — native Blender repair

Authoring source: `art-source/harbor-v2/container-bd/container-bd-market-rp03.blend`.
It is a non-destructive derivative of `container-bd-realism.blend`, not an image concept or replacement of the whole yard.

## What changed

- New restrained wordmark/tagline, timber facade fins and soffit, supported canopy beams, storefront trim, attached number/open-hours signs and suspended checkout wayfinding.
- The High upper-door transom had a solid steel box behind glass; replaced with a perimeter frame and genuinely clear glazing. Shop/refrigerator glazing opacity is 0.17.
- Low no longer seals the front door with one full-width glass sheet/plinth, fills the stock/office rooms with solid boxes, or caps the roof/ceiling hatch. Both tiers retain the same entry, aisles and ladder route.
- Twelve new, tightly bounded colliders protect the previously pass-through door operator, suspended ceiling and staff-door headers. Ceiling panels are split at existing procedural partitions to avoid duplicate volumes.
- Existing stocked High interiors, yard machinery/containers, RL01 dressing, 212 protected collider/reference nodes and 19,597 outside-shop triangles are preserved.

## Runtime contract

Shell stays x38..52, z-43..-33. Front entrance x43.5..46.5 at z-33; clear to the operator underside y2.9. Fixed side glazing remains solid through existing procedural wall boxes. Existing procedural roof height is y5.5..5.8, with hatch x38.2..39.3, z-41.9..-40.7. The stock ladder remains `COL_LADDER_CONTAINER_BD_STOCK_LADDER`.

Runtime integration must remove the eight retired `COL_MOVE_CINE_MART_*` copies **only when the replacement container-bd zone is active**. They encode the old narrower door, not this 3 m opening. Keep procedural shell, fixtures, roof and all other yard colliders.

Measured candidate: 5,334,504 bytes; High 54,896 triangles/17 draws, Low 4,465 triangles/6 draws; 58 zone colliders including the unchanged ladder. No new texture allocation: existing texture payload 224,158 bytes, estimated GPU textures 17,805,477 bytes. glTF validator: zero errors. Native zone validator: all naming, footprint, lane/door clearance, collider overlap and budget checks pass.

`market-front-4k.png` and `market-interior-4k.png` are actual 3840×2160 Blender Eevee renders. Runtime lighting may differ; these are not claimed to be game screenshots or 4K textures.

## Rebuild and validate

The RP03 derivative is the shipping source; rebuilding the legacy `harbor_market.py` alone does not include these repairs. After any RL01 base rebuild, run this versioned pass:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/upgrade_harbor_market.py
node tools/harbor-v2/finalize_harbor_market.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/validate_zone.py -- --glb art-source/harbor-v2/_staging/market-rp03/container-bd-runtime.glb --zone CONTAINER_BD --metrics art-source/harbor-v2/_staging/market-rp03/container-bd-runtime.metrics.json
HARBOR_MARKET_ASSET="$PWD/art-source/harbor-v2/_staging/market-rp03/container-bd-runtime.glb" npm --prefix client test -- tests/HarborMarketNative.test.ts
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/upgrade_harbor_market.py -- --render
```

After visual review, `node tools/harbor-v2/finalize_harbor_market.mjs --promote` verifies candidate bytes/metrics again, retains the prior production GLB under `_staging/market-rp03/pre-rp03-<sha>.glb`, and copies the validated GLB and metrics to production. Promotion details are recorded in `_staging/market-rp03/promotion.json`.
