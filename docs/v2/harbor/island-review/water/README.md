# RP03 water review

Implemented in `client/src/game/world/environment/harborWater.ts` and `harborShoreline.ts`.

## Changes

- A single indexed coastal grid retains the original High/Medium/Low budgets: 9,409 / 4,225 / 1,089 vertices and 18,432 / 8,192 / 2,048 triangles. Existing vertices are concentrated around the actual exterior seawalls; no separate patch boundaries or T-junctions.
- The outer grid reaches ±1,600m, beyond the gameplay camera's 1,000m far plane. This removes the old 300×260m water-card corners. The aerial horizon still exposes a pre-existing mismatch between grey scene fog and the dark lower HDR hemisphere; environment-lighting work is separate from this water pass.
- Sub-metre, domain-warped wind ripples use distance and screen-derivative filtering. The ocean remains opaque, with zero transmission/refraction passes.
- Restrained incoming foam occupies only the 2.4m exterior shore band. A single eight-triangle, single-pass transparent wall-contact strip replaces four high-tier caustic planes previously buried 40cm inside the seawall. Ocean plus wash is two draws on every tier.
- Two persistent hull-mask slots clip water only inside the actual open-skiff floor rectangles, above their floors, using the current inverse boat transforms. Other sea pixels and physical wave heights are unchanged. A cheap world-space broad phase avoids inverse transforms outside the tiny hull footprints.
- Mean level remains -0.8m. Existing CPU Gerstner waves, ripple heights/envelopes, wave counts per tier and impact pooling are unchanged.

## Integration

Register `water.setHullInteriors(boatCollisionRig.hullInteriors)` once after building the map. The supplied array/matrix references are stable. Update real boat poses and collision-rig inverse matrices before `water.update(dt)`, which copies them into existing uniforms. Pass an empty array when no inset hull interiors exist. No new boat colliders are created by the water renderer.

## Verification

- `npm run test -w client -- --run tests/harborWater.test.ts`: 19 passing tests. Shore-density and horizon tests failed on their preceding implementations, then passed after the fixes. Tests also cover draw classification, world anchoring, disposal, impact stability and unchanged physics while hull masks move.
- Production TypeScript compilation and focused ESLint: clean.
- `rp03-water-final2-*` images and matching JSON reports correspond to the final shader/geometry source. High has both fleet and overview views; Medium and Low have fleet views. Both WebGL2 and WebGPU were exercised using the real native game map, renderer and quality settings.
- Earlier `rp03-water-review-*` and `rp03-water-final-*` captures are iteration history, not the final water source.

These captures are **visual/shader verification only**. Their frame samples were recorded while other native asset work was running and are not isolated performance benchmarks. Final performance gating belongs to the main map QA run.
