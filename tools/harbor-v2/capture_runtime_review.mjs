// Runtime review helper: drive headless Chrome over CDP, start a private solo
// explore room and capture Harbor runtime snapshots from the development view
// presets exposed by GameManager (window.__catchAndRunView).
//
//   node tools/harbor-v2/capture_runtime_review.mjs --out-dir <dir> --prefix rl01 \
//        --presets overview,acGarden,acGardenRoute --renderer webgl2|webgpu
//
// Run from the repository root with client/server dev services already started.
// --chrome or CHROME_PATH can override the platform browser executable.
// --quality high|low; --shoot true verifies real impact events and mark sizes.
// --water-check true observes a real client fall + server drowning event while holding Jump.
// --boat-check true checks real-client/server dry contact on designated decks
// of all 5 animated boats, never accepting a cabin roof as a substitute.
// --shore-sequence true records 6 timed, close quay-wash frames and actual sampled
// water heights; observation only, with shader time/materials/physics untouched.
// --pan true measures a full 360-degree pan at each preset as well as the static view.
// FPS is a short headless local sample, not a device-wide performance guarantee.
// Never joins an existing room, so live sessions are not disturbed.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { sourceFingerprint, REPO_ROOT } from "./verify_asset_pipeline.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const CHROME = opt("chrome", process.env.CHROME_PATH ?? (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome"));
const outDir = opt("out-dir", "art-source/harbor-v2/_staging/snapshots");
const prefix = opt("prefix", "snapshot");
const presets = opt("presets", "overview").split(",").map((s) => s.trim()).filter(Boolean);
const rendererParam = opt("renderer", "webgl2");
const quality = opt("quality", "high");
const shootTest = opt("shoot", "false") === "true";
const inspectWarmup = opt("inspect-warmup", "false") === "true";
const repairCheck = opt("repair-check", "false") === "true";
const waterCheck = opt("water-check", "false") === "true";
const boatCheck = opt("boat-check", "false") === "true";
const shoreSequence = opt("shore-sequence", "false") === "true";
const panCheck = opt("pan", "false") === "true";
const traceJank = opt("trace-jank", "false") === "true";
const sampleMs = Number(opt("sample-ms", "4000"));
const panMs = Number(opt("pan-ms", "4000"));
const settleMs = Number(opt("settle-ms", "16000"));
// extra query params, e.g. --query harborZones=staging to review unpromoted candidates
const extraQuery = opt("query", "");
// Read-only QA redirection: serve a complete candidate inventory without changing
// live game URLs, global fetch, physics, materials, or user production assets.
const candidateRoot = opt("candidate-root", "");
if (candidateRoot && !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(candidateRoot)) {
  throw new Error('--candidate-root must be a relative staging directory without dot segments');
}
// Separate QA services can point at a rebuilt server without interrupting a
// developer's long-running client or live multiplayer rooms.
const baseUrl = opt("base-url", "http://localhost:5173").replace(/\/$/, "");
const url = `${baseUrl}/?renderer=${rendererParam}${extraQuery ? `&${extraQuery}` : ""}`;
const PORT = Number(opt("port", "9333"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
const sourceBefore = candidateRoot ? await sourceFingerprint(REPO_ROOT) : null;

// Never attach to an existing browser on this port, including another QA run.
let portOccupied = false;
try { await fetch(`http://127.0.0.1:${PORT}/json/version`); portOccupied = true; } catch { /* unused */ }
if (portOccupied) throw new Error(`CDP port ${PORT} is already in use; choose another --port`);
const profileDirectory = mkdtempSync(path.join(tmpdir(), "cr-cdp-catchandrun-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan,WebGPU",
  ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
  "--ignore-gpu-blocklist",
  "--hide-scrollbars",
  "--window-size=1600,900",
  `--user-data-dir=${profileDirectory}`,
  "about:blank",
], { stdio: "ignore" });
let spawnFailure = null;
chrome.on("error", (error) => { spawnFailure = error; });

try {
  let targets = [];
  for (let i = 0; i < 40 && targets.length === 0; i += 1) {
    await sleep(500);
    if (spawnFailure) throw new Error(`Cannot start Chrome executable ${CHROME}: ${spawnFailure.message}`);
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before CDP startup (code ${chrome.exitCode}); check --chrome and platform GPU support`);
    try {
      targets = (await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()))
        .filter((t) => t.type === "page");
    } catch { /* not up yet */ }
  }
  if (targets.length === 0) throw new Error("Chrome CDP endpoint never came up");
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const logs = [];
  const candidateRequests = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === "Fetch.requestPaused") {
      const original = new URL(msg.params.request.url);
      const relative = original.pathname.slice('/assets/maps/harbor-v2/'.length);
      const redirected = `${baseUrl}/staging-assets/${candidateRoot}/${relative}`;
      // Fetch once, then fulfill the browser request with these exact bytes.
      // Hashing a second fetch after screenshots could attest a rebuilt asset
      // that was never actually rendered by this browser session.
      void (async () => {
        const response=await fetch(redirected);
        if(!response.ok) throw new Error(`Candidate HTTP ${response.status}: ${redirected}`);
        const bytes=Buffer.from(await response.arrayBuffer());
        candidateRequests.push({original:original.href,relative,redirected,bytes:bytes.length,
          sha256:createHash('sha256').update(bytes).digest('hex')});
        await send('Fetch.fulfillRequest',{requestId:msg.params.requestId,responseCode:200,
          responseHeaders:[{name:'Content-Type',value:'model/gltf-binary'},{name:'Cache-Control',value:'no-store'}],body:bytes.toString('base64')});
      })().catch(error=>{
        logs.push('[error] '+error.message);
        void send('Fetch.failRequest',{requestId:msg.params.requestId,errorReason:'Failed'});
      });
    } else if (msg.method === "Runtime.consoleAPICalled") {
      logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      logs.push(`[exception] ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description ?? ""}`);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response=await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if(response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
    return response.result?.result?.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  if(candidateRoot) await send('Fetch.enable',{patterns:[{urlPattern:`${baseUrl}/assets/maps/harbor-v2/*.glb*`,requestStage:'Request'}]});
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('catchandrun_config', JSON.stringify({graphicsQuality:${JSON.stringify(quality)},harborVisualVersion:'v2',masterVolume:0,sfxVolume:0}));` });
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  // A cold dev-module graph can take longer while a build or another isolated
  // smoke is running. Wait for actual interactive UI, not a fixed six seconds.
  let menuReady = false;
  for (let i=0; i<90; i++) {
    menuReady = await evaluate("Boolean(document.querySelector('#nickname-input') && performance.getEntriesByType('resource').some(entry=>new URL(entry.name).pathname.endsWith('/src/game/GameManager.ts')))");
    if(menuReady) break;
    await sleep(500);
  }
  if(!menuReady) throw new Error('Client menu did not become interactive within 45 seconds');
  // Browser-only instrumentation: capture the existing instance through its
  // next animation frame, without adding QA hooks to production source.
  const hook = await evaluate(`(async () => {
    const moduleUrl = performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.endsWith('/src/game/GameManager.ts')).at(-1)?.name;
    if(!moduleUrl) return {error:'Cannot find loaded GameManager resource',resources:performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('GameManager'))};
    const { GameManager } = await import(moduleUrl);
    if(${inspectWarmup}) {
      const weaponUrl=performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname.endsWith('/src/game/systems/WeaponSystem.ts'))?.name;
      const {WeaponSystem}=await import(weaponUrl);
      window.__qaRealWarmup=WeaponSystem.prototype.prepareVisualEffects;
      WeaponSystem.prototype.prepareVisualEffects=()=>Promise.resolve();
    }
    const original = GameManager.prototype.animate;
    GameManager.prototype.animate = function(...args) {
      window.__qaGame = this;
      return original.apply(this, args);
    };
    window.__qaFrameSample = (milliseconds) => new Promise(resolve => {
      const times = []; let last = performance.now(); const end = last + milliseconds;
      const longTasks=[];
      const supported=PerformanceObserver.supportedEntryTypes??[];
      const observers=${traceJank} ? ['longtask','long-animation-frame'].filter(type=>supported.includes(type)).map(type=>{
        const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(entry=>entry.toJSON())));
        observer.observe({type}); return observer;
      }) : [];
      const step = now => { times.push(now-last); last=now; if(now<end) requestAnimationFrame(step); else {
        times.shift(); const sorted=[...times].sort((a,b)=>a-b);
        for(const observer of observers){longTasks.push(...observer.takeRecords().map(entry=>entry.toJSON()));observer.disconnect();}
        resolve({frames:times.length, fps:1000*times.length/times.reduce((a,b)=>a+b,0), p95Ms:sorted[Math.ceil(sorted.length*.95)-1], maxMs:Math.max(...times), over50Ms:times.filter(t=>t>50).length,...(${traceJank}?{longTasks}: {})});
      }}; requestAnimationFrame(step);
    });
    return {moduleUrl};
  })()`);
  await sleep(250);
  console.log('instrumentation', JSON.stringify({hook,instance:await evaluate('Boolean(window.__qaGame)')}));

  const created = await evaluate(`(() => {
    const nick = document.querySelector('#nickname-input');
    if (!nick) return 'no-nickname-input';
    nick.value = 'AssetAudit'; nick.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#create-join-details')?.setAttribute('open', '');
    const name = document.querySelector('#room-name-input');
    if (name) { name.value = 'asset-audit'; name.dispatchEvent(new Event('input', { bubbles: true })); }
    const privateRoom = document.querySelector('#private-check');
    if(privateRoom){privateRoom.checked=true;privateRoom.dispatchEvent(new Event('change',{bubbles:true}));}
    const passcode=document.querySelector('#passcode-input');
    if(passcode){passcode.value='QA'+Date.now().toString(36).slice(-5).toUpperCase();passcode.dispatchEvent(new Event('input',{bubbles:true}));}
    const create = document.querySelector('#btn-create');
    if (!create) return 'no-create-button';
    create.click();
    return 'created-room';
  })()`);
  console.log("ui:", created);
  await sleep(5000);
  await evaluate(`document.querySelector('#btn-ready')?.click(); 'ready'`);
  await sleep(1500);
  const started = await evaluate(`(() => {
    const start = document.querySelector('#btn-start');
    if (!start) return 'no-start-button';
    if (start.disabled) return 'start-disabled';
    start.click();
    return 'solo-explore-started';
  })()`);
  console.log("ui:", started);
  await sleep(settleMs);

  let running = false;
  for (let i=0; i<30; i++) {
    running = await evaluate("Boolean(window.__qaGame?.mapBuilt && window.__catchAndRunMetrics?.visualVersion === 'v2' && window.__qaGame?.activeHarborZones?.length >= 5)");
    if (running) break;
    await sleep(1000);
  }
  if (!running) {
    const diagnostic = await evaluate("JSON.stringify({text:document.body.innerText, phase:window.__qaGame?.currentPhase, mapBuilt:window.__qaGame?.mapBuilt, room:window.__qaGame?.latestRoomState, metrics:window.__catchAndRunMetrics,resources:performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('GameManager'))})");
    writeFileSync(path.join(outDir, `${prefix}-startup-failure.json`), JSON.stringify({diagnostic,logs},null,2));
    throw new Error(`No active V2 map; refusing menu-only QA. See ${prefix}-startup-failure.json`);
  }

  const backend = await evaluate("window.__catchAndRunMetrics?.backend ?? 'unknown'");
  if (backend !== rendererParam) throw new Error(`Requested ${rendererParam}, but active backend is ${backend}`);
  const results = [];
  for (const preset of presets) {
    const view = await evaluate(`(() => {
      const preset=${JSON.stringify(preset)};
      if(!window.__catchAndRunViewPresets?.().includes(preset)) throw new Error('Unknown QA view '+preset);
      window.__catchAndRunView(preset); return 'view-'+preset;
    })()`);
    await sleep(3500);
    const frameSample = await evaluate(`window.__qaFrameSample(${sampleMs})`);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = path.join(outDir, `${prefix}-${preset}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    const metrics = await evaluate("JSON.stringify(window.__catchAndRunMetrics ?? null)");
    if (!metrics || metrics === "null") throw new Error(`Missing in-game metrics for ${preset}`);
    const rendererStats = await evaluate("JSON.stringify({render:window.__qaGame.renderer.info.render,quality:window.__qaGame.quality.getTier(),water:window.__qaGame.harborWater?.kind})");
    let panSample = null;
    if(panCheck) panSample = await evaluate(`(async()=>{
      const g=window.__qaGame, pose=g.debugCameraPose;
      if(!pose) throw new Error('No active QA camera pose');
      const original=pose.target.clone(), direction=original.clone().sub(pose.position);
      const started=performance.now(), duration=${panMs};
      const sampling=window.__qaFrameSample(duration);
      await new Promise(resolve=>{
        const step=now=>{
          const angle=Math.min(1,(now-started)/duration)*Math.PI*2;
          pose.target.set(pose.position.x+direction.x*Math.cos(angle)-direction.z*Math.sin(angle),original.y,
            pose.position.z+direction.x*Math.sin(angle)+direction.z*Math.cos(angle));
          if(now-started<duration) requestAnimationFrame(step); else resolve();
        }; requestAnimationFrame(step);
      });
      pose.target.copy(original);
      return {...await sampling, degrees:360};
    })()`);
    results.push({ preset, view, file, metrics: JSON.parse(metrics), frameSample, panSample, rendererStats: JSON.parse(rendererStats) });
    console.log("saved", file, view);
  }
  let shorelineSequence = null;
  if (shoreSequence) {
    // South quay exterior is z=47.5 (harborShoreline.ts). Look toward its
    // waterline from just offshore, away from the five boat footprints: this
    // is a close wall/water contact view, not an ocean-only panoramic preset.
    const shoreView = { position: [40, 1.8, 51.5], target: [36, -.65, 47.5], fov: 55 };
    const samplePoints = [32, 36, 40].flatMap(x => [47.515, 47.9, 48.7].map(z => ({ x, z })));
    const setup = await evaluate(`(() => {
      const g=window.__qaGame, water=g?.harborWater;
      if(typeof window.__catchAndRunView!=='function'||!water||typeof water.sampleHeight!=='function') {
        throw new Error('Shore sequence requires the existing dev-view API and a sampleable installed water surface');
      }
      // Preserve the current fog setting. The supported API changes only the
      // review camera; do not touch shader uniforms, simulation clocks or rigs.
      const fogScale=typeof g.scene.fog?.density==='number'&&g.devFogBaseDensity>0
        ? g.scene.fog.density/g.devFogBaseDensity : 1;
      const previousView=g.debugCameraPose?{
        position:g.debugCameraPose.position.toArray(),target:g.debugCameraPose.target.toArray(),fov:g.camera.fov,fogScale,
      }:null;
      const view={...${JSON.stringify(shoreView)},fogScale};
      window.__catchAndRunView(view);
      return {waterKind:water.kind,view,previousView};
    })()`);
    const observeWater = () => evaluate(`(async () => {
      const g=window.__qaGame, water=g.harborWater;
      const samples=await Promise.all(${JSON.stringify(samplePoints)}.map(async point=>{
        const performanceMs=performance.now();
        const height=await water.sampleHeight(point.x,point.z);
        if(typeof height!=='number'||!Number.isFinite(height)) throw new Error('Invalid sampled shore height at '+JSON.stringify(point));
        return {...point,height,performanceMs};
      }));
      const performanceMs=performance.now();
      return {performanceMs,timeOriginMs:performance.timeOrigin,timestamp:new Date(performance.timeOrigin+performanceMs).toISOString(),
        waterKind:water.kind,cameraPosition:g.camera.position.toArray(),
        cameraTarget:g.debugCameraPose?.target.toArray()??null,samples};
    })()`);
    const frames = [];
    try {
      await sleep(750);
      const started = performance.now();
      for (let index = 0; index < 6; index++) {
        const targetElapsedMs = index * 1000;
        await sleep(Math.max(0, started + targetElapsedMs - performance.now()));
        const before = await observeWater();
        const captureStartedAt = new Date().toISOString();
        const shot = await send("Page.captureScreenshot", { format: "png" });
        const captureCompletedAt = new Date().toISOString();
        if (!shot.result?.data) throw new Error(`Shore sequence screenshot ${index} did not return image bytes`);
        const after = await observeWater();
        const file = path.join(outDir, `${prefix}-shore-sequence-${String(index).padStart(2, "0")}.png`);
        writeFileSync(file, Buffer.from(shot.result.data, "base64"));
        frames.push({ index, targetElapsedMs, observedElapsedMs: before.performanceMs - (frames[0]?.before.performanceMs ?? before.performanceMs),
          captureStartedAt, captureCompletedAt, before, after, file });
        console.log("saved shore sequence", file, before.timestamp);
      }
      shorelineSequence = {
        observationalOnly: true, manualVisualReviewPending: true,
        view: setup.view, waterKind: setup.waterKind, targetFrameIntervalMs: 1000,
        sampleMethod: "Actual harborWater.sampleHeight(x,z); CPU surface samples bracket each native CDP screenshot, not pixel-height measurements",
        scope: "Six close south-quay waterline frames during natural animation; no shader time, boat pose, live physics or materials were changed",
        samplePoints, frames,
      };
    } finally {
      if (setup.previousView) await evaluate(`window.__catchAndRunView(${JSON.stringify(setup.previousView)})`);
      else await evaluate("window.__qaGame.clearDevView()");
    }
    console.log("SHORE_SEQUENCE", JSON.stringify({ frames: frames.length, view: setup.view,
      sampledFrom: frames[0]?.before.timestamp, sampledUntil: frames.at(-1)?.after.timestamp }));
  }
  if(inspectWarmup) {
    const inspection=await evaluate(`(async()=>{
      const g=window.__qaGame;
      const snapshot=()=>({background:g.scene.background?.uuid,backgroundIntensity:g.scene.backgroundIntensity,backgroundBlurriness:g.scene.backgroundBlurriness,environment:g.scene.environment?.uuid,environmentIntensity:g.scene.environmentIntensity,envPmremVersion:g.scene.environment?.pmremVersion,post:g.post.enabled,target:g.renderer.getRenderTarget()?.texture?.name??null});
      const before=snapshot();
      await window.__qaRealWarmup.call(g.weaponSystem,g.renderer,g.camera);
      return {before,after:snapshot()};
    })()`);
    await sleep(1000);
    const shot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(path.join(outDir,`${prefix}-after-warm.png`),Buffer.from(shot.result.data,'base64'));
    writeFileSync(path.join(outDir,`${prefix}-warm-inspection.json`),JSON.stringify(inspection,null,2));
    console.log('WARMUP_INSPECTION',JSON.stringify(inspection));
  }
  const shooting = [];
  if (shootTest) {
    for (const target of ["coast", "warehouse-wall"]) {
      const setup = await evaluate(`(() => {
        const g=window.__qaGame; g.clearDevView();
        const atCoast=${JSON.stringify(target)}==='coast';
        g.hunterController.setPosition(atCoast?26:25, atCoast ? .9 : 0, atCoast?46:0);
        g.hunterController.setRotation(atCoast?-.3:0, atCoast?Math.PI:Math.PI/2);
        window.__qaShots=0; const original=g.weaponSystem.fire.bind(g.weaponSystem);
        if(!g.weaponSystem.__qaOriginalFire) g.weaponSystem.__qaOriginalFire=original;
        window.__qaFireMs=[]; window.__qaWaterImpacts=0;
        const originalWater=g.weaponSystem.onWaterImpact.bind(g.weaponSystem);
        if(!g.weaponSystem.__qaOriginalWater)g.weaponSystem.__qaOriginalWater=originalWater;
        g.weaponSystem.onWaterImpact=(...args)=>{window.__qaWaterImpacts++;return g.weaponSystem.__qaOriginalWater(...args);};
        g.weaponSystem.fire=(...args)=>{window.__qaShots++;const start=performance.now();try{return g.weaponSystem.__qaOriginalFire(...args)}finally{window.__qaFireMs.push(performance.now()-start)}};
        return {role:g.localRole,alive:g.localIsAlive,ammo:g.localAmmo};
      })()`);
      await sleep(1000);
      const idle = await evaluate("window.__qaFrameSample(4000)");
      // Begin observation before holding fire in the same browser task, so the
      // first-shot frame cannot disappear between separate CDP round trips.
      const firing = await evaluate("(async()=>{const sample=window.__qaFrameSample(12000);window.__qaGame.input.setMouseDown(true);try{return await sample}finally{window.__qaGame.input.setMouseDown(false)}})()");
      const details = await evaluate(`JSON.stringify((()=>{
        const g=window.__qaGame;
        let maxHoleWorldSpan=0;
        for(const {mesh} of g.weaponSystem.bulletHoles){
          mesh.updateWorldMatrix(true,false);
          const position=mesh.geometry.getAttribute('position');
          const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
          const point=g.camera.position.clone();
          for(let i=0;i<position.count;i++){
            point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
            [point.x,point.y,point.z].forEach((v,axis)=>{lo[axis]=Math.min(lo[axis],v);hi[axis]=Math.max(hi[axis],v)});
          }
          maxHoleWorldSpan=Math.max(maxHoleWorldSpan,...hi.map((v,axis)=>v-lo[axis]));
        }
        return {shots:window.__qaShots,waterImpacts:window.__qaWaterImpacts,fireCpuMs:window.__qaFireMs,ammo:g.localAmmo,holes:g.weaponSystem.bulletHoles.length,maxHoleWorldSpan,geometryCount:g.renderer.info.memory.geometries,waterKind:g.harborWater?.kind};
      })())`);
      const shot = await send("Page.captureScreenshot", {format:"png"});
      const file=path.join(outDir,`${prefix}-shoot-${target}.png`);
      writeFileSync(file,Buffer.from(shot.result.data,"base64"));
      shooting.push({target,setup,idle,firing,details:JSON.parse(details),file});
      console.log("shooting", target, details);
      if(JSON.parse(details).shots<10) throw new Error(`Shooting audit did not fire enough shots at ${target}`);
      if(target==='coast' && JSON.parse(details).waterImpacts<10) throw new Error('Coast shooting audit did not actually hit the water');
      if(JSON.parse(details).maxHoleWorldSpan>0.14) throw new Error(`Oversized impact mark at ${target}`);
    }
  }
  let repair = null;
  if (repairCheck) {
    repair = await evaluate(`(() => {
      const g=window.__qaGame;
      const gate=g.gateMesh;
      if(!gate || gate.userData.gateMotion!=='roller') throw new Error('Native station gate not installed');
      const legacy=['BACK','LEFT','RIGHT','FRONT_L','FRONT_R','HEADER'].map(p=>'COL_MOVE_CINE_TICKET_'+p);
      const zones=[]; g.activeHarborZones.forEach(root=>root.traverse(o=>{if(o.userData.harborZone) zones.push(o.userData.harborZone)}));
      for(const zone of ['hunter-spawn','rescue-quay']) if(!zones.includes(zone)) throw new Error('Missing runtime zone '+zone);
      g.closeHunterGate();
      const closed={visible:gate.visible,scaleY:gate.scale.y,collider:g.colliders.includes(g.gateColliderTemplate)};
      if(!closed.visible||!closed.collider||closed.scaleY!==1) throw new Error('Closed gate mismatch');
      window.__catchAndRunView('responseStation');
      return {gate:gate.name,closed,activeZones:[...new Set(zones)],legacyBoothNodes:legacy.filter(n=>g.activeHarborCinematic.getObjectByName(n))};
    })()`);
    await sleep(700);
    let shot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(path.join(outDir,`${prefix}-station-closed.png`),Buffer.from(shot.result.data,'base64'));
    await evaluate('window.__qaGame.openHunterGate()');
    await sleep(650);
    const opened=await evaluate(`(()=>{const g=window.__qaGame;return {visible:g.gateMesh.visible,collider:g.colliders.includes(g.gateColliderTemplate),scaleY:g.gateMesh.scale.y}})()`);
    if(opened.visible||opened.collider) throw new Error('Open roller gate still blocks the exit');
    repair.opened=opened;
    shot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(path.join(outDir,`${prefix}-station-open.png`),Buffer.from(shot.result.data,'base64'));
    console.log('REPAIR_CHECK',JSON.stringify(repair));
  }
  let boats = null;
  let boatFailure = null;
  if(boatCheck) {
    boats = await evaluate(`(async()=>{
      const g=window.__qaGame, rig=g.boatCollisionRig;
      if(!rig||rig.getBoats().length!==5||g.localRole!=='hunter'||!g.localIsAlive) throw new Error('Expected 5 installed boat rigs and living Hunter');
      const wasMobile=g.input.isMobileMode;
      g.clearDevView(); g.input.isMobileMode=true; g.input.setMouseDown(false);
      ['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft'].forEach(k=>g.input.injectKeyUp(k));
      const self=()=>g.latestRoomState?.players?.find(p=>p.sessionId===g.network.getSessionId());
      // Independent audited tracks match the candidate headless deck tests.
      // A hull centre can be under a cabin, and a skiff centre under a bench.
      const tracks={
        WORKBOAT:{id:'workboat',x:9.05,z:49.9},
        LAUNCH:{id:'launch',x:-9.8,z:49.4},
        SKIFF_RED:{id:'skiff-red',x:-15.5,z:48.6},
        SKIFF_GREEN:{id:'skiff-green',x:17.5,z:48.7},
        BARGE:{id:'barge',x:.4,z:56.5},
      };
      // Independently measured authored support patches, in each native
      // boat rig's local coordinates. A buried hull band may be lower than
      // the deck, while a decorative fitting may be higher: neither is it.
      const auditedDecks={
        high:{
          WORKBOAT:{material:'DECK_TIMBER',min:[-4.6,.66,-1.45],max:[4.7,.72,1.45]},
          LAUNCH:{material:'DECK_TIMBER',min:[-3.2,.52,-1.05],max:[3.3,.57,1.05]},
          SKIFF_RED:{material:'DECK_TIMBER',min:[-1.5,.04,-.45],max:[1.6,.08,.45]},
          SKIFF_GREEN:{material:'DECK_TIMBER',min:[-1.5,.04,-.45],max:[1.6,.08,.45]},
          BARGE:{material:'DECK_TIMBER',min:[-5.9,.70,-2.2],max:[5.9,.74,2.2]},
        },
        low:{
          WORKBOAT:{material:'HULL_NAVY',min:[-4.95,-.6,-1.55],max:[4.95,.75,1.55]},
          LAUNCH:{material:'HULL_NAVY',min:[-3.45,-.6,-1.15],max:[3.45,.60,1.15]},
          SKIFF_RED:{material:'PLANK_RED',min:[-2.05,-.6,-.70],max:[2.05,.42,.70]},
          SKIFF_GREEN:{material:'PLANK_GREEN',min:[-2.05,-.6,-.70],max:[2.05,.42,.70]},
          BARGE:{material:'HULL_NAVY',min:[-5.95,-.6,-2.25],max:[5.95,.70,2.25]},
        },
      };
      const tier=${JSON.stringify(quality)};
      const sameVector=(vector,expected)=>vector.toArray().every((value,index)=>Math.abs(value-expected[index])<1e-4);
      const results=[];
      try {
        // Teleport local controller only. Normal network/anti-cheat/server
        // drowning run unmodified. Each contact lasts longer than the3s grace.
        for(const boat of rig.getBoats()) {
          const suffix=boat.name.replace('RIG_FERRIS_HARBOR_BOAT_','');
          const track=tracks[suffix],expected=auditedDecks[tier]?.[suffix];
          if(!track||!expected) throw new Error('Boat has no audited deck contract '+boat.name);
          const {x,z}=track;
          const sourceMeshName='MESH_FERRIS_HARBOR_BOAT_'+suffix+'_'+expected.material+'_LOD'+(tier==='high'?'0':'1');
          if(boat.localBoxes?.length!==boat.boxes.length||boat.sourceMeshNames?.length!==boat.boxes.length)
            throw new Error('Missing parallel local support diagnostics '+boat.name);
          const decks=boat.boxes.map((box,boxIndex)=>({box,boxIndex,local:boat.localBoxes[boxIndex],height:rig.supportHeightAt(box,x,z,0)}))
            .filter(({boxIndex,local})=>boat.sourceMeshNames[boxIndex]===sourceMeshName
              &&sameVector(local.min,expected.min)&&sameVector(local.max,expected.max));
          if(decks.length!==1) throw new Error('Expected one exact authored deck patch '+boat.name+', got '+decks.length);
          const selected=decks[0];
          if(selected.height===null||!Number.isFinite(selected.height)||selected.height>=.75)
            throw new Error('Audited deck does not cover its planned track '+boat.name);
          const deck=selected.box;
          const plannedTrack={...track,source:'client/tests/helpers/candidateHarborFleet.ts:FLEET_TRACKS'};
          const selectedDeck={boxIndex:selected.boxIndex,selectionRule:'audited-local-deck-bounds',sourceMeshName,
            localBounds:{min:selected.local.min.toArray(),max:selected.local.max.toArray()},boundsAtSelection:{min:deck.min.toArray(),max:deck.max.toArray()},
            heightAtSelection:selected.height,spawn:{x,feetY:selected.height+.2,z},spawnDrop:.2};
          // setPosition takes feet, not eye height. A small gravity drop avoids
          // materializing inside a cabin and stepping onto its roof.
          g.hunterController.setPosition(x,selectedDeck.spawn.feetY,z);
          g.hunterController.setRotation(-.2,Math.PI);
          let contactSamples=0,wetSamples=0,serverSamples=0,outOfDeckSamples=0,minFeet=Infinity,maxFeet=-Infinity,maxDeckContactError=0;
          let firstServerMatchMs=null,lastServerMatchMs=null;
          const deckSamples=[];
          const start=performance.now();
          const lowSkiff=${JSON.stringify(quality)}==='high'&&boat.name.includes('SKIFF_');
          // A first QA teleport can legitimately be rejected for several
          // seconds after shooting. Observe normal anti-cheat convergence;
          // never reset or override authoritative state to obtain a pass.
          const serverSpan=()=>firstServerMatchMs===null||lastServerMatchMs===null?0:lastServerMatchMs-firstServerMatchMs;
          while(performance.now()-start<6500
            ||(results.length===0&&(serverSamples<30||serverSpan()<3000)&&performance.now()-start<12000)
            ||(lowSkiff&&minFeet>-.9&&performance.now()-start<30000)) {
            await new Promise(r=>setTimeout(r,100));
            const feet=g.hunterController.getFeetY(),p=g.hunterController.getPosition(),s=self();
            if(performance.now()-start>1800) {
              // Keep this exact selected live box reference through carry.
              // Other native boat supports, including roofs, cannot satisfy it.
              const deckHeight=rig.supportHeightAt(deck,p.x,p.z,.28);
              const contactError=deckHeight!==null&&Number.isFinite(deckHeight)?Math.abs(feet-deckHeight):null;
              const onDesignatedDeck=contactError!==null&&contactError<.06&&deckHeight<.75
                &&Math.abs(p.x-x)<.6&&Math.abs(p.z-z)<.6;
              const inWater=g.hunterController.isInWater();
              const serverPositionMatched=!!s&&Math.abs(s.x-p.x)<.7&&Math.abs(s.z-p.z)<.7&&Math.abs(s.y-feet)<.3;
              const elapsedMs=performance.now()-start;
              deckSamples.push({elapsedMs,deckBoxIndex:selected.boxIndex,x:p.x,feetY:feet,z:p.z,
                deckHeight,contactError,onDesignatedDeck,inWater,serverPositionMatched,
                serverPosition:s?{x:s.x,y:s.y,z:s.z}:null,serverRole:s?.role??null,
                serverAlive:s?.isAlive??null,serverPhase:g.latestRoomState?.phase??null});
              maxDeckContactError=contactError===null?Infinity:Math.max(maxDeckContactError,contactError);
              if(onDesignatedDeck)contactSamples++;else outOfDeckSamples++;
              if(inWater)wetSamples++;
              if(serverPositionMatched){serverSamples++;firstServerMatchMs??=elapsedMs;lastServerMatchMs=elapsedMs;}
              minFeet=Math.min(minFeet,feet);maxFeet=Math.max(maxFeet,feet);
            }
            if(!g.localIsAlive)break;
          }
          const result={name:boat.name,contactSurface:'designated-deck',plannedTrack,selectedDeck,deckSamples,
            contactSamples,wetSamples,serverSamples,serverMatchedSpanMs:serverSpan(),outOfDeckSamples,minFeet,maxFeet,maxDeckContactError,alive:g.localIsAlive,serverAlive:self()?.isAlive};
          result.lowDeckThresholdExercised=!lowSkiff||minFeet<-.9;
          result.passed=contactSamples>25&&outOfDeckSamples===0&&Number.isFinite(maxDeckContactError)&&maxDeckContactError<.06&&wetSamples===0&&serverSamples>=30&&result.serverMatchedSpanMs>=3000&&result.alive&&result.serverAlive&&result.lowDeckThresholdExercised;
          results.push(result); if(!result.passed)break;
        }
        return {protocol:'designated-deck-v2',passed:results.length===5&&results.every(r=>r.passed),role:'hunter',inputMode:'supported-mobile-input-headless-fallback',results};
      }finally{g.input.isMobileMode=wasMobile;}
    })()`);
    if(!boats.passed)boatFailure='Boat contact or authoritative alive-state check failed';
    console.log('BOAT_CHECK',JSON.stringify(boats));
    const shot=await send('Page.captureScreenshot',{format:'png'});
    boats.file=path.join(outDir,`${prefix}-boat-check.png`);
    writeFileSync(boats.file,Buffer.from(shot.result.data,'base64'));
  }
  let water = null;
  let waterFailure = null;
  if (waterCheck) {
    // Headless pointer lock support varies by Chrome build. Try a normal user
    // gesture first; the supported touch input path is an explicit fallback.
    const pointerResponse = await send('Runtime.evaluate', {
      expression: `(async()=>{
        const g=window.__qaGame;
        if(g.input.isPointerLocked()) return {locked:true,alreadyLocked:true};
        try {
          await Promise.race([
            Promise.resolve(g.renderer.domElement.requestPointerLock()),
            new Promise(resolve=>setTimeout(resolve,500)),
          ]);
          return {locked:g.input.isPointerLocked()};
        } catch(error) {return {locked:false,reason:String(error)}}
      })()`,
      returnByValue: true, awaitPromise: true, userGesture: true,
    });
    const pointerLock = pointerResponse.result?.result?.value ?? {locked:false,reason:'Pointer lock request did not return a value'};
    water = await evaluate(`(async()=>{
      const g=window.__qaGame;
      const room=g.network.getRoom();
      const sessionId=g.network.getSessionId();
      const self=()=>g.latestRoomState?.players?.find(player=>player.sessionId===sessionId);
      const setup={sessionId,phase:g.currentPhase,localRole:g.localRole,localAlive:g.localIsAlive,serverRole:self()?.role,serverAlive:self()?.isAlive};
      if(!room||g.currentPhase!=='active'||g.localRole!=='hunter'||!g.localIsAlive) {
        return {passed:false,reason:'Water audit needs a living Hunter in an ACTIVE room; no role/phase/death state was overridden',setup};
      }
      if(typeof g.input.injectKeyDown!=='function'||typeof g.input.injectKeyUp!=='function') {
        return {passed:false,reason:'Supported keyboard injection is unavailable',setup};
      }
      const waterCandidates=[{x:7,feetY:8,z:50},{x:7,feetY:8,z:53},{x:7,feetY:8,z:56},{x:3,feetY:8,z:56}].map(position=>({
        position,
        blockingColliders:g.colliders.filter(box=>box.max.y>-.9&&box.min.y<position.feetY+1.8
          &&box.max.x>position.x-.35&&box.min.x<position.x+.35
          &&box.max.z>position.z-.35&&box.min.z<position.z+.35)
          .map(box=>({min:box.min.toArray(),max:box.max.toArray()})),
      }));
      const startPosition=waterCandidates.find(candidate=>candidate.blockingColliders.length===0)?.position;
      if(!startPosition) return {passed:false,reason:'All candidate fall columns have a dry boat/pier/object support; refusing to treat a supported deck as lethal water',setup,waterCandidates};
      g.clearDevView();
      g.input.setMouseDown(false);
      g.input.setRightMouseDown(false);
      const wasMobile=g.input.isMobileMode;
      const touchFallback=!g.input.isPointerLocked();
      if(touchFallback) g.input.isMobileMode=true;
      const inputMode=touchFallback?'supported-mobile-input-headless-fallback':'pointer-lock';
      const keys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space'];
      keys.forEach(key=>g.input.injectKeyUp(key));
      const started=performance.now();
      const elapsed=()=>Math.round(performance.now()-started);
      const events=[];
      const samples=[];
      const dispose=room.onMessage('playerDrowned',payload=>{
        if(payload.victimSessionId===sessionId) events.push({elapsedMs:elapsed(),payload});
      });
      let clientEnteredMs=null;
      let serverEnteredMs=null;
      const sample=()=>{
        const pos=g.hunterController.getPosition();
        const server=self();
        const result={elapsedMs:elapsed(),phase:g.currentPhase,jumpHeld:g.input.getState().jump,
          client:{x:pos.x,feetY:g.hunterController.getFeetY(),z:pos.z,inWater:g.hunterController.isInWater(),isAlive:g.localIsAlive,role:g.localRole},
          server:server?{x:server.x,feetY:server.y,z:server.z,isAlive:server.isAlive,role:server.role,health:server.health}:null};
        if(clientEnteredMs===null&&result.client.inWater) clientEnteredMs=result.elapsedMs;
        // This audit is positioned inside the south ocean's real footprint.
        if(serverEnteredMs===null&&server&&server.z>=47.01&&server.y<=-.9) serverEnteredMs=result.elapsedMs;
        samples.push(result);
        return result;
      };
      try {
        // Only position the local controller. Its normal animation, feet sync,
        // anti-cheat validation and room clock must perform the rest of the test.
        g.hunterController.setPosition(startPosition.x,startPosition.feetY,startPosition.z);
        g.hunterController.setRotation(-.3,Math.PI);
        sample();
        // Let gravity establish airborne state before holding Space; setPosition
        // itself initially marks any spawn position grounded.
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        g.input.injectKeyDown('Space');
        while(elapsed()<15000) {
          await new Promise(resolve=>setTimeout(resolve,100));
          const state=sample();
          if(events.length&&state.client.isAlive===false&&state.server?.isAlive===false&&state.elapsedMs-events[0].elapsedMs>=100) break;
        }
        const final=sample();
        const passed=events.length===1&&clientEnteredMs!==null&&serverEnteredMs!==null&&final.client.isAlive===false&&final.server?.isAlive===false;
        return {passed,reason:passed?null:'No matching server drowning event and dead room/client state within 15 seconds',setup,inputMode,
          startPosition,waterCandidates,jumpInput:'held Space after initial gravity frames',clientEnteredMs,serverEnteredMs,
          clientEntryToEventMs:events.length&&clientEnteredMs!==null?events[0].elapsedMs-clientEnteredMs:null,
          serverObservedEntryToEventMs:events.length&&serverEnteredMs!==null?events[0].elapsedMs-serverEnteredMs:null,
          events,samples,final};
      } finally {
        g.input.injectKeyUp('Space');
        g.input.isMobileMode=wasMobile;
        if(typeof dispose==='function') dispose();
      }
    })()`);
    water ??= {passed:false,reason:'Browser water audit did not return a result'};
    water.pointerLock=pointerLock;
    const shot=await send('Page.captureScreenshot',{format:'png'});
    water.file=path.join(outDir,`${prefix}-water-check.png`);
    writeFileSync(water.file,Buffer.from(shot.result.data,'base64'));
    if(!water.passed) waterFailure=water.reason;
    console.log('WATER_CHECK',JSON.stringify({passed:water.passed,reason:water.reason,inputMode:water.inputMode,clientEnteredMs:water.clientEnteredMs,serverEnteredMs:water.serverEnteredMs,events:water.events,final:water.final,file:water.file}));
  }
  const errors = logs.filter((l) => /^\[(error|exception)\]/.test(l) && !/pointer lock|Mic access/i.test(l));
  const report = { capturedAt: new Date().toISOString(), viewport: {width:1600,height:900,deviceScaleFactor:1}, headless:true, gpuFlags:["enable-unsafe-webgpu","enable-features=Vulkan,WebGPU","ignore-gpu-blocklist",...(process.platform==="darwin"?["use-angle=metal"]:[])], audioMuted:true, profileDirectory, url, backend, quality, presets: results, shooting, consoleErrors: errors, consoleWarnings: logs.filter((l) => /^\[warn/.test(l)).slice(-20), logs };
  report.repair=repair;
  report.water=water;
  report.boats=boats;
  report.shorelineSequence=shorelineSequence;
  if(candidateRoot) {
    const sourceAfter=await sourceFingerprint(REPO_ROOT);
    if(sourceBefore.sha256!==sourceAfter.sha256) throw new Error('Source changed during candidate browser review; rerun on a frozen checkout');
    report.sourceSHA256=sourceAfter.sha256;
    report.candidateRoot=candidateRoot;
    for(const entry of candidateRequests) if(candidateRequests.some(other=>other.relative===entry.relative && other.sha256!==entry.sha256)) throw new Error('Candidate changed within browser session: '+entry.relative);
    report.candidateRequests=[...new Map(candidateRequests.map(entry=>[entry.relative,entry])).values()];
    if(report.candidateRequests.length!==9) throw new Error(`Expected all9 candidate map assets; observed ${report.candidateRequests.length}`);
  }
  writeFileSync(path.join(outDir, `${prefix}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log("backend:", backend, "| console errors:", errors.length);
  for (const e of errors.slice(-10)) console.log("  ", e.slice(0, 300));
  await evaluate(`document.querySelector('#btn-leave')?.click(); 'left'`);
  await sleep(1500);
  ws.close();
  if (waterFailure) throw new Error(`Water audit failed: ${waterFailure}; inspect ${prefix}-report.json`);
  if (boatFailure) throw new Error(`${boatFailure}; inspect ${prefix}-report.json`);
  if (errors.length > 0) throw new Error(`Runtime review recorded ${errors.length} renderer/application errors; inspect ${prefix}-report.json`);
} finally {
  chrome.kill("SIGTERM");
}
