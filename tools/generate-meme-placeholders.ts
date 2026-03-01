/**
 * Generates placeholder meme PNG images using canvas.
 * Run: npx tsx tools/generate-meme-placeholders.ts
 * 
 * Users should replace these with real meme images (256x256 or 512x512 PNG).
 */

import * as fs from "fs";
import * as path from "path";

const SIZE = 256;
const OUT_DIR = path.join(__dirname, "../client/public/assets/memes");

interface MemeConfig {
  id: string;
  bg: string;
  fg: string;
  emoji: string;
  label: string;
}

const memes: MemeConfig[] = [
  { id: "default", bg: "#FFD700", fg: "#000", emoji: "😃", label: "SMILE" },
  { id: "troll", bg: "#F0F0F0", fg: "#333", emoji: "🤪", label: "TROLL" },
  { id: "doge", bg: "#E8C96A", fg: "#654321", emoji: "🐕", label: "DOGE" },
  { id: "pepe", bg: "#5B8C3E", fg: "#FFF", emoji: "🐸", label: "PEPE" },
  { id: "chad", bg: "#4A90D9", fg: "#FFF", emoji: "💪", label: "CHAD" },
  { id: "amogus", bg: "#C51111", fg: "#FFF", emoji: "📮", label: "SUS" },
  { id: "nyan", bg: "#FF69B4", fg: "#FFF", emoji: "🌈", label: "NYAN" },
  { id: "stonks", bg: "#2E7D32", fg: "#FFF", emoji: "📈", label: "STONKS" },
];

function generatePPM(config: MemeConfig): Buffer {
  const { bg, fg, label } = config;

  const bgR = parseInt(bg.slice(1, 3), 16);
  const bgG = parseInt(bg.slice(3, 5), 16);
  const bgB = parseInt(bg.slice(5, 7), 16);

  const fgR = parseInt(fg.slice(1, 3), 16);
  const fgG = parseInt(fg.slice(3, 5), 16);
  const fgB = parseInt(fg.slice(5, 7), 16);

  const pixels = Buffer.alloc(SIZE * SIZE * 3);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;

      const borderSize = 8;
      const isBorder = x < borderSize || x >= SIZE - borderSize || y < borderSize || y >= SIZE - borderSize;

      const cx = x - SIZE / 2;
      const cy = y - SIZE / 2;
      const inCircle = cx * cx + cy * cy < (SIZE * 0.35) * (SIZE * 0.35);

      if (isBorder) {
        pixels[i] = fgR;
        pixels[i + 1] = fgG;
        pixels[i + 2] = fgB;
      } else if (inCircle && y > SIZE * 0.3 && y < SIZE * 0.7) {
        const shade = Math.min(255, bgR + 30);
        pixels[i] = shade;
        pixels[i + 1] = Math.min(255, bgG + 20);
        pixels[i + 2] = Math.min(255, bgB + 10);
      } else {
        pixels[i] = bgR;
        pixels[i + 1] = bgG;
        pixels[i + 2] = bgB;
      }
    }
  }

  const header = `P6\n${SIZE} ${SIZE}\n255\n`;
  return Buffer.concat([Buffer.from(header), pixels]);
}

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

for (const meme of memes) {
  const ppmData = generatePPM(meme);
  const ppmPath = path.join(OUT_DIR, `${meme.id}.ppm`);
  const pngPath = path.join(OUT_DIR, `${meme.id}.png`);

  fs.writeFileSync(ppmPath, ppmData);
  console.log(`Generated: ${meme.id}.ppm (replace ${meme.id}.png with real meme image)`);
}

console.log(`\nPlaceholder PPM files generated in ${OUT_DIR}`);
console.log("Convert to PNG with: for f in *.ppm; do convert $f ${f%.ppm}.png && rm $f; done");
console.log("Or just replace with real meme PNG images (256x256 recommended).");
