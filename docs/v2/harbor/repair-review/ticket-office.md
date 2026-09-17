# Ferris ticket office — RP02

The former office showed a counter and glass across the old doorway, but inherited
six cinematic colliders describing an open doorway. The roof had no collider and
the Low mesh was a solid box. The replacement is authored in native Blender and
shipped in the game's Ferris GLB.

The new office has a 1.45 m west entrance, a physically blocked glazed front
counter, a roof that stops upward jumps and supports landing, window mullions,
standing-seam roof details and extruded `HARBOR TICKETS` lettering. Both High and
Low preserve the entrance, glazing, roof and interior. The east wall ends at
x = -17.15 m, leaving the Ferris platform approach clear.

![Native Blender 4K front view](/Users/tlle/Documents/PersonalProject/CatchAndRun/docs/v2/harbor/repair-review/ticket-office-front.png)

![Native Blender 4K entrance view](/Users/tlle/Documents/PersonalProject/CatchAndRun/docs/v2/harbor/repair-review/ticket-office-entrance.png)

These images are native Blender preview renders; in-game lighting is configured
separately. They are not AI concept images.

## Source and verification

- Source: `art-source/harbor-v2/ferris-harbor/ferris-harbor-ticket-repair.blend`.
- The RL01 input remains unchanged, with 432 existing collision/reference/rig/socket
  nodes preserved. Only seven exact old booth mesh component sets were removed.
- Twelve new matching colliders are exported. The six legacy
  `COL_MOVE_CINE_TICKET_*` colliders are removed by the Ferris runtime override.
- Native zone validation and glTF validation: zero errors.
- Production size: 3,014,476 bytes. LOD0: 36,388 triangles / 90 estimated draws;
  LOD1: 3,460 triangles / 26 estimated draws. These counts cover the entire Ferris
  district, not just the office. The added office costs one draw per quality tier.
- Regression checks load the real production GLBs: the legacy invisible wall is
  removed, High/Low visible surfaces match collider positions, and the real Hunter
  controller cannot cross the front window, can enter from the west, lands on the
  roof, and cannot jump through its underside.
- The previous production GLB is retained at the path in `ticket-promotion.json`.

## Rebuild

Run this repair after any full RL01 regeneration; the guarded repair script reads
the RL01 source and writes the separate repaired source. It does not modify the
original Blender scene or the user's open Blender window.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/repair_ticket_booth.py
node tools/harbor-v2/finalize_ticket_booth.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/validate_zone.py -- --glb art-source/harbor-v2/_staging/ticket-repair/ferris-harbor-runtime.glb --zone FERRIS_HARBOR --metrics art-source/harbor-v2/_staging/ticket-repair/ferris-harbor-runtime.metrics.json
node tools/harbor-v2/finalize_ticket_booth.mjs --promote
npm run test --workspace client -- FerrisTicketBooth.test.ts MapAssetLoaderRealAssets.test.ts
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python tools/harbor-v2/repair_ticket_booth.py -- --render
```
