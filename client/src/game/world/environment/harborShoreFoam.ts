import { abs, float, max, mix, smoothstep } from "three/tsl";

type ScalarNode = ReturnType<typeof float>;

/** Shore-only color/opacity response; it never displaces water or changes the
 * sampled surface. Both receivers use the existing Gerstner height, so foam
 * breaks as a crest reaches the quay instead of running on a separate clock.
 */
export function createHarborShoreFoam(
  shoreDistance: ScalarNode,
  normalizedHeight: ScalarNode,
  patch: ScalarNode,
) {
  const crest = smoothstep(-0.1, 0.55, normalizedHeight);
  const width = mix(float(0.24), float(1.35), crest);
  const crestBand = float(1).sub(smoothstep(0.04, width, max(shoreDistance, 0)));
  const contact = float(1).sub(smoothstep(0.02, 0.22, abs(shoreDistance)));
  const wetSide = smoothstep(-0.08, -0.02, shoreDistance);
  const breakup = patch.clamp(0, 1).mul(0.75).add(0.25);
  return {
    surfaceFoam: contact.mul(0.11).add(crestBand.mul(crest).mul(0.54))
      .mul(breakup).mul(wetSide),
    washStrength: crest.mul(0.4).add(0.22).mul(breakup),
  };
}
