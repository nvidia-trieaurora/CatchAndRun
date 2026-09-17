/** Isolated Chrome/CDP review. Run against private QA services, not a public server.
 * Live performance samples are separate from fixed-time visual fixtures/video.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (key, fallback) => args.includes('--'+key) ? args[args.indexOf('--'+key)+1] : fallback;
const out = path.resolve(opt('out', 'art-source/harbor-v2/_staging/visual-qa-rp05/baseline'));
const base = opt('url','http://127.0.0.1:5175');
const quality = opt('quality','high'), backend = opt('renderer','webgpu');
const port = Number(opt('port','9346'));
const candidate=opt('station-candidate','');
const candidateBytes=candidate?readFileSync(candidate):null;
const servedCandidates=[];
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const sha = b => createHash('sha256').update(b).digest('hex');
if(existsSync(path.join(out,'report.json')) || existsSync(path.join(out,'original'))) {
  throw Error('Evidence directory already contains a run or backups; choose a fresh --out directory');
}
mkdirSync(out,{recursive:true});
const git = (...a) => execFileSync('git',a,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
const sourceFiles = git('ls-files','--cached','--others','--exclude-standard','client/src','server/src','shared/src','tools','package-lock.json').trim().split('\n').filter(p=>/\.(ts|mjs|py|json)$/.test(p));
const provenance = {
  commit:git('rev-parse','HEAD').trim(), branch:git('branch','--show-current').trim(),
  dirty:git('status','--porcelain'), sourceHashes:Object.fromEntries(sourceFiles.map(p=>[p,sha(readFileSync(path.join(root,p)))])),
  assetHashes:Object.fromEntries(git('ls-files','--cached','--others','--exclude-standard','client/public/assets/maps/harbor-v2').trim().split('\n').filter(p=>p.endsWith('.glb')).map(p=>[p,sha(readFileSync(path.join(root,p)))])),
};
writeFileSync(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2));
if(opt('backup','false')==='true') {
  writeFileSync(path.join(out,'preexisting-tracked.patch'),git('diff','--binary'));
  for(const p of ['client/src/game/world/HunterGateState.ts','client/src/game/world/maps/harborV2Map.ts','client/public/assets/maps/harbor-v2/zones/response-station.glb']) {
    const dest=path.join(out,'original',p+(p.endsWith('.ts')?'.snapshot':''));mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(path.join(root,p),dest);
  }
}
let occupied=false;
try {await fetch(`http://127.0.0.1:${port}/json/version`);occupied=true;}catch{/* no browser */}
if(occupied)throw Error('CDP port occupied; refusing to attach');
const profile=mkdtempSync(path.join(os.tmpdir(),'catchandrun-rp05-'));
const chrome=spawn(process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',...(process.platform==='darwin'?['--use-angle=metal']:[]),
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--hide-scrollbars','about:blank',
],{stdio:'ignore'});
let spawnError;chrome.on('error',e=>spawnError=e);
const sessions=[];
async function connect(target) {
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const pending=new Map(),logs=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.j(Error(JSON.stringify(m.error))):p.r(m.result);}return;}
    if(m.method==='Fetch.requestPaused'){
      servedCandidates.push({url:m.params.request.url,sha256:sha(candidateBytes)});
      void send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'model/gltf-binary'},{name:'Cache-Control',value:'no-store'}],body:candidateBytes.toString('base64')}).catch(e=>logs.push(String(e)));
    }
    if(m.method==='Runtime.exceptionThrown')logs.push(m.params.exceptionDetails);
    if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')logs.push(m.params.args.map(a=>a.value??a.description));};
  const send=(method,params={})=>new Promise((r,j)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);j(Error('CDP timeout '+method));},90000);pending.set(n,{r,j,timer});ws.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value;};
  const wait=async(expression,timeout=90000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await sleep(200);}throw Error('Readiness timeout: '+expression);};
  const shot=async name=>{await send('Page.bringToFront');const r=await send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));};
  const s={ws,send,evaluate,wait,shot,logs};sessions.push(s);
  await send('Page.enable');await send('Runtime.enable');
  if(candidateBytes)await send('Fetch.enable',{patterns:[{urlPattern:'*/assets/maps/harbor-v2/zones/response-station.glb*',requestStage:'Request'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    {let seed=17092026;Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};}
    localStorage.setItem('catchandrun_config',JSON.stringify({graphicsQuality:${JSON.stringify(quality)},harborVisualVersion:'v2',masterVolume:0,sfxVolume:0}));
  `});
  await send('Page.navigate',{url:base+'/?renderer='+backend});
  await wait("Boolean(document.querySelector('#nickname-input') && performance.getEntriesByType('resource').some(e=>e.name.includes('/src/game/GameManager.ts')))");
  await evaluate(`(async()=>{
    window.__loadedModule=pathname=>performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===pathname).at(-1)?.name??pathname;
    const {GameManager}=await import(window.__loadedModule('/src/game/GameManager.ts'));
    const animate=GameManager.prototype.animate;
    GameManager.prototype.animate=function(...args){window.__qa=this;return animate.apply(this,args);};
    window.__phaseEvents=[];const phase=GameManager.prototype.onPhaseChange;
    GameManager.prototype.onPhaseChange=function(oldPhase,newPhase){const result=phase.call(this,oldPhase,newPhase);window.__phaseEvents.push({oldPhase,phase:newPhase,at:performance.now(),gateVisible:this.gateMesh?.visible,gateColliderPresent:!!this.gateCollider,gateOpen:this.gateMesh?.userData.gateOpen});return result;};
    window.__warm={pending:0,completed:0,failed:[]};
    for(const [file,name,method] of [['/src/game/rendering/MapRenderWarmup.ts','MapRenderWarmup','prepare'],['/src/game/systems/WeaponSystem.ts','WeaponSystem','prepareVisualEffects']]){
      const C=(await import(window.__loadedModule(file)))[name], original=C.prototype[method];
      C.prototype[method]=async function(...args){window.__warm.pending++;try{const result=await original.apply(this,args);window.__warm.completed++;return result;}catch(e){window.__warm.failed.push(String(e));throw e;}finally{window.__warm.pending--;}};
    }
    window.__sample=ms=>new Promise(resolve=>{const frames=[];let last;const start=performance.now();const tasks=[];
      const po=new PerformanceObserver(l=>tasks.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration}))));
      if(PerformanceObserver.supportedEntryTypes.includes('longtask'))po.observe({type:'longtask'});
      function step(t){if(last!==undefined)frames.push(t-last);last=t;if(t-start<ms)requestAnimationFrame(step);else{po.disconnect();const sorted=[...frames].sort((a,b)=>a-b);resolve({frames,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],p99Ms:sorted[Math.ceil(sorted.length*.99)-1],maxMs:Math.max(...frames),over50:frames.filter(x=>x>50).length,longTasks:tasks});}}requestAnimationFrame(step);});
  })()`);
  await wait('Boolean(window.__qa)');return s;
}
async function ready(s){await s.wait("window.__qa.mapBuilt && window.__qa.activeHarborZones?.length===7 && window.__warm.completed>=2 && window.__warm.pending===0",120000);await sleep(1500);}
const report={startedAt:new Date().toISOString(),headless:true,platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,ramBytes:os.totalmem(),osRelease:os.release(),viewport:[1280,720],dpr:1,quality,backend,seed:17092026,profile,provenance:'provenance.json',limitations:['Headless local run; not a real-device FPS guarantee.','Static fixture freezes client dt after warm-up; ocean phase and network/HUD time are not pixel-deterministic.','Gate sequence is fixed-time local fixture; separate multiplayer observations use actual server phases.']};
try {
  let targets=[];for(let i=0;i<80 && !targets.length;i++){if(spawnError)throw spawnError;await sleep(250);try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{/*starting*/}}
  const a=await connect(targets.find(t=>t.type==='page'));
  report.browser=await a.send('Browser.getVersion');
  await a.evaluate(`document.querySelector('#nickname-input').value='ReviewA';document.querySelector('#private-check').checked=true;document.querySelector('#passcode-input').value='RP05QA';document.querySelector('#btn-create').click()`);
  await a.wait("Boolean(document.querySelector('#btn-ready'))");await sleep(600);
  await a.evaluate("document.querySelector('#btn-ready').click()");await a.wait("Boolean(document.querySelector('#btn-start')&&!document.querySelector('#btn-start').disabled)");
  await a.evaluate("document.querySelector('#btn-start').click()");await ready(a);
  await a.wait("window.__qa.currentPhase==='active' && window.__qa.gateMesh?.visible===false",60000);
  report.ready=await a.evaluate("({warm:window.__warm,zones:window.__qa.activeHarborZones.map(z=>z.name),backend:window.__qa.renderer.backend.isWebGPUBackend?'webgpu':'webgl2',loadMs:performance.now(),resources:performance.getEntriesByType('resource').filter(e=>/\\.(glb|hdr)/.test(e.name)).map(e=>({url:e.name,durationMs:e.duration,transferBytes:e.transferSize}))})");
  if(report.ready.backend!==backend)throw Error('Wrong renderer backend');
  report.performance=[];
  for(const view of ['responseStationEntry','responseStation','harborMarketFront','overview']){
    await a.evaluate(`window.__catchAndRunView(${JSON.stringify(view)})`);await sleep(2000);
    const sample=await a.evaluate('window.__sample(4000)');
    const metrics=await a.evaluate('({metrics:window.__catchAndRunMetrics,render:window.__qa.renderer.info.render})');
    await a.shot('live-'+view);report.performance.push({view,sample,...metrics});
  }
  // Gate fixture: same real asset, renderer, sun and camera. No server state changes.
  await a.evaluate(`(async()=>{const g=window.__qa;window.__savedDelta=g.clock.getDelta.bind(g.clock);g.clock.getDelta=()=>0;
    const m=await import(window.__loadedModule('/src/game/world/HunterGateState.ts'));window.__gateModule=m;
    window.__catchAndRunView({position:[-29,2.2,0],target:[-42,2.6,0],fov:65});
    m.setHunterGateOpen([],null,g.gateMesh,false);
  })()`);
  report.gateFrames=[];
  for(let i=0;i<=15;i++){
    const t=i*.03;
    const pose=await a.evaluate(`(()=>{const g=window.__qa,m=window.__gateModule;
      m.setHunterGateOpen([],null,g.gateMesh,false);m.setHunterGateOpen([],null,g.gateMesh,true);m.updateHunterGateVisual(g.gateMesh,${t});
      return {seconds:${t},scale:g.gateMesh.scale.toArray(),position:g.gateMesh.position.toArray(),visible:g.gateMesh.visible,gateMode:g.gateMesh.userData.gateTravelMode??'compress'};})()`);
    await sleep(65);const name='gate-'+String(i).padStart(2,'0');await a.shot(name);report.gateFrames.push({file:name+'.png',...pose});
  }
  // A clearly labelled 8x slow-motion fixed-step review clip (not FPS evidence).
  execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','4.1666667','-i',path.join(out,'gate-%02d.png'),'-c:v','libx264','-pix_fmt','yuv420p',path.join(out,'gate-review-8x-slow.mp4')]);
  await a.evaluate('window.__qa.clock.getDelta=window.__savedDelta');
  // Second actual browser client joins this private solo room -> real match transition.
  const room=await a.evaluate('({id:window.__qa.network.room.id})');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  const b=await connect(target);
  await b.evaluate(`window.__qa.joinRoomById('ReviewB',${JSON.stringify(room.id)},'RP05QA')`);
  await ready(b);
  report.multiplayer=[];
  const state=()=>`(()=>{const g=window.__qa;return {phase:g.currentPhase,role:g.localRole,session:g.network.room.sessionId,room:g.network.room.id,players:g.latestRoomState?.players,gateOpen:g.gateMesh?.userData.gateOpen,gateVisible:g.gateMesh?.visible,gateColliderPresent:!!g.gateCollider};})()`;
  await a.wait("window.__phaseEvents.some(e=>e.phase==='hiding')",45000);
  for(const [index,s] of [a,b].entries()){await s.evaluate("window.__catchAndRunView('responseStationEntry')");const observed=await s.evaluate(state());await s.shot('client-'+index+'-first-observation');report.multiplayer.push({client:index,file:'client-'+index+'-first-observation.png',...observed});}
  await a.wait("window.__qa.currentPhase==='active'",60000);await sleep(650);
  for(const [index,s] of [a,b].entries()){await s.send('Page.bringToFront');await s.wait('window.__qa.gateMesh?.visible===false',10000);await s.shot('client-'+index+'-active');report.multiplayer.push({client:index,...await s.evaluate(state())});}
  report.phaseEvents=await Promise.all([a,b].map(s=>s.evaluate('window.__phaseEvents')));
  if(!report.phaseEvents.every(events=>events.some(e=>e.phase==='hiding'&&e.gateVisible&&e.gateColliderPresent&&!e.gateOpen)&&events.some(e=>e.phase==='active'&&e.gateOpen&&!e.gateColliderPresent)))throw Error('Two-client gate phase mismatch');
  const hunter=(await a.evaluate("window.__qa.localRole==='hunter'"))?a:b;
  const observer=hunter===a?b:a;
  // Synthetic keyboard/pointer-lock flag, REAL controller/colliders/network, no teleport.
  await hunter.evaluate(`(()=>{const g=window.__qa;g.debugCameraPose=null;g.input.isPointerLocked=()=>true;g.camera.rotation.set(0,-Math.PI/2,0,'YXZ');g.camera.fov=75;g.camera.updateProjectionMatrix();if(g.fpGun)g.fpGun.visible=true;})()`);
  await observer.evaluate("window.__catchAndRunView({position:[-29,3.5,8],target:[-38,1.5,0],fov:65})");
  report.movement=[];
  for(let i=0;i<16;i++){
    await hunter.evaluate(`(()=>{const keys=window.__qa.input.keys;keys.clear();if(${i}<6)keys.add('KeyW');if(${i}===3)keys.add('Space');if(${i}>=8&&${i}<12)keys.add('KeyD');})()`);
    await sleep(180);
    const sample=await hunter.evaluate("({at:performance.now(),feet:window.__qa.hunterController.getFeetY(),local:window.__qa.hunterController.getPosition().toArray(),camera:window.__qa.camera.position.toArray(),fov:window.__qa.camera.fov,players:window.__qa.latestRoomState.players})");
    const name='movement-'+String(i).padStart(2,'0');await hunter.shot(name);
    if([0,5,10,15].includes(i)){
      await observer.shot('remote-'+String(i).padStart(2,'0'));
      sample.observer=await observer.evaluate("({players:window.__qa.latestRoomState.players,entities:[...window.__qa.playerEntities.entries()].map(([id,e])=>({id,position:e.group.position.toArray(),visible:e.group.visible}))})");
    }
    report.movement.push({file:name+'.png',input:i<6?'forward'+(i===3?'+jump':''):i>=8&&i<12?'right':'idle',...sample});
  }
  await hunter.evaluate('window.__qa.input.keys.clear()');
  execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','4','-i',path.join(out,'movement-%02d.png'),'-c:v','libx264','-pix_fmt','yuv420p',path.join(out,'movement-sequence.mp4')]);
  report.movementNote='Time-sampled real controller + two-client network; video shown at 4 fps, measured sample timestamps in movement[]. Synthetic input, not manual device testing.';
  report.servedCandidates=servedCandidates;
  if(candidateBytes&&servedCandidates.length!==2)throw Error('Candidate not served to both clients');
  report.logs=sessions.map(s=>s.logs);
  report.runtimeErrors=report.logs.flat().filter(entry=>!/pointer lock/i.test(typeof entry==='string'?entry:JSON.stringify(entry)));
  if(report.runtimeErrors.length)throw Error('Unexpected browser errors; see runtimeErrors');
  report.finishedAt=new Date().toISOString();writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log('QA complete',out);
} catch(e){report.failure=String(e.stack??e);report.logs=sessions.map(s=>s.logs);writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));throw e;}
finally{for(const s of sessions)s.ws.close();chrome.kill();}
