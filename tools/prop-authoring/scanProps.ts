/**
 * Prop Authoring Tool
 *
 * Scans a map data JSON file and outputs a summary of all
 * PROP_SPAWNABLE objects with their bounding sizes and rarity.
 *
 * Usage: npx tsx tools/prop-authoring/scanProps.ts [map-json-path]
 */

import * as fs from "fs";
import * as path from "path";

interface PropDef {
  id: string;
  name: string;
  meshType: string;
  dimensions: { x: number; y: number; z: number };
  color: number;
  rarity: string;
  minScale: number;
  maxScale: number;
}

interface MapData {
  id: string;
  name: string;
  props: PropDef[];
}

const mapPath = process.argv[2] ||
  path.join(__dirname, "../../server/src/data/maps/harbor-warehouse.json");

const raw = fs.readFileSync(mapPath, "utf-8");
const mapData: MapData = JSON.parse(raw);

console.log(`\n=== Prop Authoring Report: ${mapData.name} ===\n`);
console.log(`Total props: ${mapData.props.length}\n`);

const byRarity: Record<string, PropDef[]> = {};
for (const prop of mapData.props) {
  if (!byRarity[prop.rarity]) byRarity[prop.rarity] = [];
  byRarity[prop.rarity].push(prop);
}

for (const [rarity, props] of Object.entries(byRarity)) {
  console.log(`--- ${rarity.toUpperCase()} (${props.length}) ---`);
  for (const p of props) {
    const vol = p.dimensions.x * p.dimensions.y * p.dimensions.z;
    console.log(
      `  ${p.id.padEnd(20)} ${p.meshType.padEnd(10)} ` +
      `size: ${p.dimensions.x}x${p.dimensions.y}x${p.dimensions.z} ` +
      `vol: ${vol.toFixed(3)} ` +
      `scale: ${p.minScale}-${p.maxScale}`
    );
  }
  console.log();
}

console.log("=== Summary ===");
console.log(`  Common:   ${byRarity["common"]?.length || 0}`);
console.log(`  Uncommon: ${byRarity["uncommon"]?.length || 0}`);
console.log(`  Rare:     ${byRarity["rare"]?.length || 0}`);

const avgVol = mapData.props.reduce(
  (sum, p) => sum + p.dimensions.x * p.dimensions.y * p.dimensions.z, 0
) / mapData.props.length;
console.log(`  Avg volume: ${avgVol.toFixed(3)} m³`);
