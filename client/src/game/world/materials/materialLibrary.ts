import * as THREE from "three";

export const PALETTE = {
  concreteWarm:  0xc9c2b8,
  concreteCool:  0xb0aba3,
  concreteDark:  0x8a8580,
  steel:         0x5b6770,
  steelLight:    0x7a8590,
  steelDark:     0x3a4048,
  woodWarm:      0xba7d3a,
  woodDark:      0x7a5228,
  woodOld:       0x9a7a52,
  woodPlank:     0xc4903d,
  accentYellow:  0xd4ac0d,
  accentOrange:  0xe8872a,
  hazardStripe:  0x222222,
  containerRed:  0xb03a2e,
  containerBlue: 0x2e5eaa,
  containerGreen:0x2e8b57,
  containerYlow: 0xc4a820,
  dockWood:      0x8a7a60,
  ropeBeige:     0xb8a880,
  tarpBlue:      0x3868a8,
  tarpGreen:     0x3a6838,
  cementBag:     0xc8c0b0,
  scaffoldYellow:0xd4a810,
  asphalt:       0x4a4a4a,
  asphaltWorn:   0x5a5858,
  grass:         0x6a8a3e,
  grassDark:     0x5a7830,
  water:         0x4a88aa,
  waterDeep:     0x2a5a7a,
  white:         0xf0ede8,
  offWhite:      0xe8e0d8,
  signRed:       0xcc2222,
  signGreen:     0x228833,
  lampWarm:      0xffeedd,
  skyTop:        0x5588cc,
  skyBottom:     0xd0dde8,
  fogColor:      0xc0ccd8,
} as const;

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

export type MaterialKey =
  | "concrete" | "concreteDark" | "concreteFloor"
  | "steel" | "steelDark" | "steelLight"
  | "wood" | "woodDark" | "woodPlank" | "woodOld"
  | "accentYellow" | "accentOrange" | "hazard"
  | "containerRed" | "containerBlue" | "containerGreen" | "containerYellow"
  | "dockWood" | "tarpBlue" | "tarpGreen"
  | "cement" | "scaffold"
  | "asphalt" | "grass"
  | "white" | "offWhite"
  | "rope";

const MATERIAL_DEFS: Record<MaterialKey, { color: number; roughness: number; metalness: number }> = {
  concrete:        { color: PALETTE.concreteWarm, roughness: 0.92, metalness: 0.02 },
  concreteDark:    { color: PALETTE.concreteDark, roughness: 0.9, metalness: 0.03 },
  concreteFloor:   { color: PALETTE.concreteCool, roughness: 0.95, metalness: 0.01 },
  steel:           { color: PALETTE.steel, roughness: 0.5, metalness: 0.6 },
  steelDark:       { color: PALETTE.steelDark, roughness: 0.45, metalness: 0.65 },
  steelLight:      { color: PALETTE.steelLight, roughness: 0.55, metalness: 0.5 },
  wood:            { color: PALETTE.woodWarm, roughness: 0.85, metalness: 0.02 },
  woodDark:        { color: PALETTE.woodDark, roughness: 0.88, metalness: 0.02 },
  woodPlank:       { color: PALETTE.woodPlank, roughness: 0.82, metalness: 0.02 },
  woodOld:         { color: PALETTE.woodOld, roughness: 0.9, metalness: 0.01 },
  accentYellow:    { color: PALETTE.accentYellow, roughness: 0.7, metalness: 0.1 },
  accentOrange:    { color: PALETTE.accentOrange, roughness: 0.7, metalness: 0.1 },
  hazard:          { color: PALETTE.hazardStripe, roughness: 0.8, metalness: 0.05 },
  containerRed:    { color: PALETTE.containerRed, roughness: 0.65, metalness: 0.2 },
  containerBlue:   { color: PALETTE.containerBlue, roughness: 0.65, metalness: 0.2 },
  containerGreen:  { color: PALETTE.containerGreen, roughness: 0.65, metalness: 0.2 },
  containerYellow: { color: PALETTE.containerYlow, roughness: 0.65, metalness: 0.2 },
  dockWood:        { color: PALETTE.dockWood, roughness: 0.9, metalness: 0.01 },
  tarpBlue:        { color: PALETTE.tarpBlue, roughness: 0.92, metalness: 0.0 },
  tarpGreen:       { color: PALETTE.tarpGreen, roughness: 0.92, metalness: 0.0 },
  cement:          { color: PALETTE.cementBag, roughness: 0.95, metalness: 0.0 },
  scaffold:        { color: PALETTE.scaffoldYellow, roughness: 0.6, metalness: 0.3 },
  asphalt:         { color: PALETTE.asphalt, roughness: 0.95, metalness: 0.02 },
  grass:           { color: PALETTE.grass, roughness: 0.98, metalness: 0.0 },
  white:           { color: PALETTE.white, roughness: 0.8, metalness: 0.02 },
  offWhite:        { color: PALETTE.offWhite, roughness: 0.85, metalness: 0.02 },
  rope:            { color: PALETTE.ropeBeige, roughness: 0.92, metalness: 0.0 },
};

export function getMaterial(key: MaterialKey): THREE.MeshStandardMaterial {
  if (materialCache.has(key)) return materialCache.get(key)!;
  const def = MATERIAL_DEFS[key];
  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: def.roughness,
    metalness: def.metalness,
  });
  materialCache.set(key, mat);
  return mat;
}

export function getCustomMaterial(color: number, roughness = 0.8, metalness = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function getEmissiveMaterial(color: number, emissive: number, intensity = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.1,
  });
}
