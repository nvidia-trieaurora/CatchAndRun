#!/usr/bin/env node
/**
 * Auto-scan memes folder and generate manifest.json
 * Run: node tools/scan-memes.js
 * 
 * Just drop PNG/JPEG/GIF/WEBP files into client/public/assets/memes/
 * and run this script (or it runs automatically on dev start).
 * 
 * File naming: the filename (without extension) becomes the meme ID and display name.
 *   pig-kiss.jpeg  ->  id: "pig-kiss",  name: "Pig Kiss"
 *   nyan-cat.gif   ->  id: "nyan-cat",  name: "Nyan Cat"
 */

const fs = require("fs");
const path = require("path");

const MEMES_DIR = path.join(__dirname, "../client/public/assets/memes");
const MANIFEST_PATH = path.join(MEMES_DIR, "manifest.json");
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

function fileNameToDisplayName(filename) {
  const name = path.parse(filename).name;
  return name
    .replace(/[_-]/g, " ")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function fileNameToId(filename) {
  return path.parse(filename).name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const files = fs.readdirSync(MEMES_DIR).filter((f) => {
  const ext = path.extname(f).toLowerCase();
  return IMAGE_EXTS.includes(ext);
});

const memes = files.map((file) => ({
  id: fileNameToId(file),
  name: fileNameToDisplayName(file),
  file: file,
}));

if (memes.length === 0) {
  memes.push({ id: "default", name: "Default", file: "default.png" });
}

const manifest = { memes };
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

console.log(`[scan-memes] Found ${memes.length} meme(s):`);
memes.forEach((m) => console.log(`  ${m.id} -> ${m.file}`));
console.log(`[scan-memes] Wrote ${MANIFEST_PATH}`);
