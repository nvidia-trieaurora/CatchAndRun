/**
 * Auto-generates manifest.json from all image files in the memes directory.
 * Run: npx tsx tools/sync-meme-manifest.ts
 * Also runs automatically as part of `npm run build` via the prebuild hook.
 */

import * as fs from "fs";
import * as path from "path";

const MEMES_DIR = path.join(__dirname, "../client/public/assets/memes");
const MANIFEST_PATH = path.join(MEMES_DIR, "manifest.json");
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

function fileToId(filename: string): string {
  const name = path.basename(filename, path.extname(filename));
  return name
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function fileToDisplayName(filename: string): string {
  const name = path.basename(filename, path.extname(filename));
  return name
    .replace(/[-_]/g, " ")
    .replace(/\s*\(\d+\)\s*/g, "")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function syncManifest() {
  if (!fs.existsSync(MEMES_DIR)) {
    console.log("Memes directory not found, skipping manifest sync.");
    return;
  }

  const files = fs.readdirSync(MEMES_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext) && f !== "manifest.json";
  });

  const memes = files.map((file) => ({
    id: fileToId(file),
    name: fileToDisplayName(file),
    file,
  }));

  const manifest = { memes };
  const json = JSON.stringify(manifest, null, 2) + "\n";

  fs.writeFileSync(MANIFEST_PATH, json);
  console.log(`Meme manifest synced: ${memes.length} images found.`);
  memes.forEach((m) => console.log(`  - ${m.id}: ${m.file}`));
}

syncManifest();
