/** Original authored PBR surfaces and packaging for the Blender RP04 market.
 * No downloaded brands, no AI concept pixels baked into gameplay geometry.
 * Run before upgrade_market_rp04.py. All maps are deterministic and tileable.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./textures/market-rp04/_derived/', import.meta.url));
await mkdir(dir, { recursive: true });
const clamp = x => Math.max(0, Math.min(255, Math.round(x)));
const hash = (x, y) => { let v = Math.imul(x + 73, 374761393) ^ Math.imul(y + 19, 668265263); v = Math.imul(v ^ v >>> 13, 1274126177); return ((v ^ v >>> 16) >>> 0) / 4294967295; };
const smooth = t => t * t * (3 - 2 * t);
function noise(u, v, count) {
  const x = u * count, y = v * count, ix = Math.floor(x), iy = Math.floor(y), a = smooth(x - ix), b = smooth(y - iy);
  const h = (dx, dy) => hash((ix + dx) % count, (iy + dy) % count);
  return (h(0, 0) * (1-a) + h(1, 0) * a) * (1-b) + (h(0, 1) * (1-a) + h(1, 1) * a) * b;
}
const specs = {};
for (const [name, size, tile] of [['limestone',512,2.4],['plaster',128,1.2],['oak',256,1.2]]) {
  const base = Buffer.alloc(size*size*3), orm = Buffer.alloc(base.length), normal = Buffer.alloc(base.length);
  const heights = new Float32Array(size*size);
  for (let y=0; y<size; y++) for(let x=0;x<size;x++) {
    const u=x/size, v=y/size, n=noise(u,v,8), fine=noise(u,v,64), grain=hash(x,y)-.5;
    let color, rough, h;
    if(name==='limestone') {
      // Quiet honed stone, not marbled concrete noise; joint grid is 1.2 m.
      const variation=hash(Math.floor(u*2),Math.floor(v*2))*7 + n*9 + grain*2;
      const joint=Math.min((u*2)%1,1-(u*2)%1,(v*2)%1,1-(v*2)%1)<.0025;
      color=joint?[139,134,123]:[193+variation,183+variation,163+variation];
      rough=joint?211:156+fine*20; h=joint?-.3:(fine-.5)*.04;
    } else if(name==='plaster') {
      const tone=n*5+grain*2; color=[221+tone,215+tone,200+tone]; rough=220+fine*10; h=(fine-.5)*.045+grain*.025;
    } else {
      const bend=Math.sin(v*Math.PI*2)*.035+noise(u,v,4)*.04;
      const fiber=Math.sin((u+bend)*Math.PI*160)*.5+.5;
      const growth=Math.pow(Math.sin((u+bend)*Math.PI*20)*.5+.5,8);
      const tone=fiber*8+growth*18+n*16+grain*3;
      color=[143+tone,100+tone*.82,61+tone*.55]; rough=166+fine*28; h=fiber*.025+growth*.03;
    }
    const i=(y*size+x)*3; for(let c=0;c<3;c++)base[i+c]=clamp(color[c]);
    orm[i]=255;orm[i+1]=clamp(rough);orm[i+2]=0;heights[y*size+x]=h;
  }
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])*1.7;
    const dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])*1.7;
    const len=Math.hypot(dx,dy,1),i=(y*size+x)*3;
    normal[i]=clamp(127.5-dx/len*127.5);normal[i+1]=clamp(127.5+dy/len*127.5);normal[i+2]=clamp(127.5+127.5/len);
  }
  for(const [kind,buffer] of [['base',base],['orm',orm],['normal',normal]])
    await sharp(buffer,{raw:{width:size,height:size,channels:3}}).png().toFile(`${dir}${name}_${kind}.png`);
  specs[name]={base:`${name}_base.png`,orm:`${name}_orm.png`,normal:`${name}_normal.png`,tile,source:'Original procedural RP04 material, authored for CatchAndRun'};
}

const cells=[
  ['TOMATO','SOUP','#8c382d','#ece3c9','#314f32'],['SEA SALT','SARDINES','#243b4b','#e5d1a3','#a14735'],
  ['GARDEN','PEAS','#3e6043','#eee8cc','#c99b52'],['PORT','TONIC','#aeb0a3','#193e4f','#efe5c6'],
  ['OAT & HONEY','GRANOLA','#cdaa61','#f0e6ce','#894632'],['STONE GROUND','CRACKERS','#436477','#f2e6c8','#334536'],
  ['DOCKSIDE','COFFEE','#ac865c','#342e25','#e6ca99'],['WILDFLOWER','HONEY','#a87326','#f1e7bb','#5c4827'],
  ['COLD PRESSED','ORANGE','#dba342','#f5efd9','#426446'],['SPRING','WATER','#b7d1ce','#dce9e1','#365b67'],
  ['OLD HARBOR','COLA','#4a332b','#a44734','#f1dbad'],['FRESH DAILY','MILK','#e3e3d8','#315c71','#d1c4aa'],
  ['SEA SALT','CRISPS','#cfbd93','#6d4333','#f2e4c6'],
];
const xml = str => str.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=(x,y,size,fill,str,weight=600)=>`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="middle" fill="${fill}">${xml(str)}</text>`;
const parts=[];
for(let cell=0;cell<16;cell++) {
  // Blender UV origin is bottom-left; each cell retains the old UV contract.
  const ox=(cell%4)*512,oy=(3-Math.floor(cell/4))*512;
  let content='';
  if(cell<13) {
    const [title,product,body,label,accent]=cells[cell];
    content=`<rect width="512" height="512" fill="${body}"/><rect x="0" y="28" width="397" height="452" rx="4" fill="${label}"/>
      <path d="M16 47H380 M16 458H380" stroke="${accent}" stroke-width="3"/>
      ${text(198,86,21,accent,'H A R B O R')}${text(198,115,13,accent,'PROVISIONS  •  EST. 1986')}
      ${text(198,175,25,accent,title)}${text(198,218,38,accent,product)}
      <circle cx="198" cy="289" r="46" fill="${body}"/>
      <path d="M177 300Q197 255 220 294M176 282Q199 319 222 277" fill="none" stroke="${label}" stroke-width="7"/>
      ${text(198,370,16,accent,'SELECTED FOR THE COAST')}${text(198,397,14,accent,'QUALITY INGREDIENTS')}
      ${text(294,445,17,accent,cell===12?'150 g':cell===11?'1 litre':cell>7?'330 ml':'250 g')}`;
    for(let b=0;b<40;b++)content+=`<rect x="${27+b*3}" y="423" width="${1+b%2}" height="24" fill="${accent}"/>`;
    // Visible side seam, nutrition panel and metallic rim. Rightmost cap area stays plain.
    content+=`<path d="M403 0V512" stroke="${accent}" opacity=".35" stroke-width="5"/>`;
  } else {
    content='<rect width="512" height="512" fill="#233136"/><rect y="468" width="512" height="30" fill="#d9d8ca"/>';
    for(let c=0;c<5;c++) {
      const [title,product,body,label,accent]=cells[(cell===13?8:cell===14?11:0)+(c% (cell===13?3:cell===14?2:4))];
      const x=9+c*99;
      content+=cell===13?`<path d="M${x+25} 51h38v72l21 45v289h-80V168l21-45z" fill="${body}"/><rect x="${x+25}" y="43" width="38" height="23" rx="3" fill="#e1e0d5"/>`:
        `<rect x="${x+3}" y="${cell===14?78:130}" width="83" height="${cell===14?379:327}" rx="${cell===14?3:16}" fill="${body}"/>`;
      content+=`<rect x="${x+8}" y="229" width="73" height="130" fill="${label}"/>${text(x+44,267,13,accent,'HARBOR')}${text(x+44,300,12,accent,product.split(' ')[0])}<path d="M${x+11} 172V217" stroke="white" opacity=".35" stroke-width="5"/>`;
    }
  }
  parts.push(`<g transform="translate(${ox},${oy})">${content}</g>`);
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048">${parts.join('')}</svg>`;
await writeFile(`${dir}packaging-source.svg`,svg);
await sharp(Buffer.from(svg)).png().toFile(`${dir}product_atlas_master.png`);
await sharp(Buffer.from(svg)).resize(1024,1024).png().toFile(`${dir}product_atlas_base.png`);
await writeFile(`${dir}spec.json`,JSON.stringify(specs,null,2)+'\n');
await writeFile(`${dir}README.md`,'# RP04 original material sources\n\nGenerated by `prepare_market_rp04.mjs`; no third-party artwork or brands. Base maps are sRGB; ORM and OpenGL tangent normals are linear. Packaging uses the existing 4×4 bottom-up Blender UV cell contract; the right 16% of each individual product cell is reserved for plain caps. Surfaces are reusable tileable maps, not concept screenshots.\n');
console.log('Prepared RP04 PBR textures; 2048px packaging master / 1024px runtime atlas: '+dir);
