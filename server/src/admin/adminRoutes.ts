import { Router } from "express";
import session from "express-session";
import PDFDocument from "pdfkit";
import { authRouter, requireAdmin } from "./auth";
import type { AnalyticsDB } from "../analytics/AnalyticsDB";
import type { Server } from "colyseus";

export function createAdminRouter(analyticsDB: AnalyticsDB, gameServer: Server) {
  const router = Router();

  router.use(session({
    secret: process.env.SESSION_SECRET || "catchandrun-admin-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
  }));

  router.use("/admin", authRouter);

  router.get("/admin/api/stats", requireAdmin, (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const daily = analyticsDB.getDailyStats(days);
    const today = analyticsDB.getTodayStats();
    const active = analyticsDB.getActiveSessions();
    const allTime = analyticsDB.getDailyStats(365);
    const totalSessions = allTime.reduce((s, d) => s + d.sessions, 0);
    const totalPlayers = allTime.reduce((s, d) => s + d.players, 0);
    const avgDurationAll = allTime.length > 0
      ? allTime.reduce((s, d) => s + d.avgDuration, 0) / allTime.filter(d => d.avgDuration > 0).length || 0
      : 0;
    res.json({ daily, today, activeCount: active.length, totalSessions, totalPlayers, avgDurationAll });
  });

  router.get("/admin/api/live", requireAdmin, async (_req, res) => {
    try {
      const rooms = await (gameServer as any).matchMaker.query({ name: "game_room" });
      const result = rooms.map((r: any) => ({
        roomId: r.roomId,
        name: r.metadata?.roomName || "Game Room",
        clients: r.clients,
        maxClients: r.maxClients,
        phase: r.metadata?.phase || "unknown",
        createdAt: r.createdAt,
      }));
      res.json(result);
    } catch {
      res.json([]);
    }
  });

  router.get("/admin/api/sessions", requireAdmin, (_req, res) => {
    res.json(analyticsDB.getRecentSessions(100));
  });

  router.get("/admin/api/locations", requireAdmin, (_req, res) => {
    res.json(analyticsDB.getLocationStats());
  });

  router.get("/admin/api/export-pdf", requireAdmin, (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const daily = analyticsDB.getDailyStats(days);
    const today = analyticsDB.getTodayStats();
    const locations = analyticsDB.getLocationStats();
    const sessions = analyticsDB.getRecentSessions(50);
    const allTime = analyticsDB.getDailyStats(365);
    const totalSessions = allTime.reduce((s, d) => s + d.sessions, 0);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const filename = `CatchAndRun_Report_${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Title
    doc.fontSize(22).fillColor("#00d4ff").text("CATCH & RUN", { align: "center" });
    doc.fontSize(12).fillColor("#888888").text("Analytics Report", { align: "center" });
    doc.fontSize(9).fillColor("#666666").text(`Generated: ${new Date().toLocaleString()} | Period: ${days} days`, { align: "center" });
    doc.moveDown(1.5);

    // Summary
    doc.fontSize(14).fillColor("#ffffff").text("Summary");
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#333333").stroke();
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#cccccc");
    doc.text(`Sessions Today: ${today.sessions}`);
    doc.text(`Unique Players Today: ${today.players}`);
    doc.text(`Avg Play Time Today: ${fmtMs(today.avgDuration)}`);
    doc.text(`Total Sessions (all time): ${totalSessions}`);
    doc.moveDown(1);

    // Daily stats table
    doc.fontSize(14).fillColor("#ffffff").text(`Daily Stats (${days} days)`);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#333333").stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor("#888888");
    const colW = [100, 100, 100, 140];
    const headers = ["Date", "Players", "Sessions", "Avg Duration"];
    let x = 40;
    headers.forEach((h, i) => { doc.text(h, x, doc.y, { width: colW[i], continued: i < headers.length - 1 }); x += colW[i]; });
    doc.moveDown(0.3);

    doc.fontSize(8).fillColor("#cccccc");
    for (const d of daily.slice(-20)) {
      x = 40;
      const row = [d.date, String(d.players), String(d.sessions), fmtMs(d.avgDuration)];
      row.forEach((v, i) => { doc.text(v, x, doc.y, { width: colW[i], continued: i < row.length - 1 }); x += colW[i]; });
      doc.moveDown(0.1);
      if (doc.y > 720) { doc.addPage(); }
    }
    doc.moveDown(1);

    // Locations
    if (locations.length > 0) {
      if (doc.y > 650) doc.addPage();
      doc.fontSize(14).fillColor("#ffffff").text("Player Locations");
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#333333").stroke();
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor("#888888");
      doc.text("Country", 40, doc.y, { width: 150, continued: true });
      doc.text("City", 190, doc.y, { width: 150, continued: true });
      doc.text("Players", 340, doc.y, { width: 80 });
      doc.moveDown(0.3);
      doc.fontSize(8).fillColor("#cccccc");
      for (const l of locations.slice(0, 20)) {
        doc.text(l.country, 40, doc.y, { width: 150, continued: true });
        doc.text(l.city, 190, doc.y, { width: 150, continued: true });
        doc.text(String(l.count), 340, doc.y, { width: 80 });
        doc.moveDown(0.1);
        if (doc.y > 720) doc.addPage();
      }
      doc.moveDown(1);
    }

    // Recent sessions
    if (doc.y > 550) doc.addPage();
    doc.fontSize(14).fillColor("#ffffff").text("Recent Sessions (last 50)");
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#333333").stroke();
    doc.moveDown(0.5);
    doc.fontSize(7).fillColor("#888888");
    const sCols = [90, 110, 70, 55, 45, 40];
    const sHeaders = ["Nickname", "Location", "Duration", "Role", "Score", "Kills"];
    x = 40;
    sHeaders.forEach((h, i) => { doc.text(h, x, doc.y, { width: sCols[i], continued: i < sHeaders.length - 1 }); x += sCols[i]; });
    doc.moveDown(0.3);
    doc.fontSize(7).fillColor("#cccccc");
    for (const s of sessions) {
      x = 40;
      const row = [s.nickname, `${s.country}, ${s.city}`, fmtMs(s.durationMs), s.role || "-", String(s.score || 0), String(s.kills || 0)];
      row.forEach((v, i) => { doc.text(v, x, doc.y, { width: sCols[i], continued: i < row.length - 1 }); x += sCols[i]; });
      doc.moveDown(0.1);
      if (doc.y > 720) doc.addPage();
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor("#555555").text("CatchAndRun - Prop Hunt Multiplayer Game | trieaurora-catchandrun.pro.vn", { align: "center" });

    doc.end();
  });

  router.get("/admin", requireAdmin, (_req, res) => {
    res.send(getDashboardHTML());
  });

  return router;
}

function fmtMs(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CatchAndRun Admin</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a1a;color:#e0e0e0;font-family:'Segoe UI',system-ui,sans-serif;padding:20px}
    h1{font-size:1.6rem;background:linear-gradient(135deg,#00d4ff,#7b2ff7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:inline-block}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
    .header a{color:#888;text-decoration:none;font-size:0.85rem}
    .header a:hover{color:#fff}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:28px}
    .card{background:linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.06));border:1px solid #1a1a3e;border-radius:14px;padding:20px;position:relative;overflow:hidden}
    .card::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;border-radius:4px 0 0 4px}
    .card.c1::before{background:#00d4ff} .card.c2::before{background:#4caf50} .card.c3::before{background:#ff9800}
    .card.c4::before{background:#7b2ff7} .card.c5::before{background:#ff6b6b} .card.c6::before{background:#ffdd44}
    .card .label{font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px}
    .card .value{font-size:2.2rem;font-weight:800;line-height:1}
    .card .sub{font-size:0.75rem;color:#666;margin-top:4px}
    .c1 .value{color:#00d4ff} .c2 .value{color:#4caf50} .c3 .value{color:#ff9800}
    .c4 .value{color:#7b2ff7} .c5 .value{color:#ff6b6b} .c6 .value{color:#ffdd44}
    .chart-box{background:rgba(255,255,255,0.03);border:1px solid #1a1a3e;border-radius:14px;padding:20px;margin-bottom:28px}
    .chart-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
    .chart-header h3{font-size:0.85rem;color:#aaa;text-transform:uppercase;letter-spacing:1px}
    .filter-btns{display:flex;gap:6px}
    .filter-btn{background:rgba(255,255,255,0.06);border:1px solid #333;color:#aaa;padding:4px 12px;border-radius:6px;font-size:0.75rem;cursor:pointer;transition:all 0.2s}
    .filter-btn:hover,.filter-btn.active{background:rgba(0,212,255,0.15);border-color:#00d4ff;color:#00d4ff}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:0.7rem;color:#555;text-transform:uppercase;letter-spacing:1px;padding:10px 14px;border-bottom:1px solid #1a1a3e}
    td{padding:10px 14px;font-size:0.85rem;border-bottom:1px solid #111128}
    tr:hover td{background:rgba(255,255,255,0.02)}
    .section{background:rgba(255,255,255,0.03);border:1px solid #1a1a3e;border-radius:14px;padding:20px;margin-bottom:28px}
    .section h3{font-size:0.85rem;color:#aaa;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px}
    .badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:0.7rem;font-weight:700}
    .badge-green{background:rgba(76,175,80,0.15);color:#4caf50} .badge-orange{background:rgba(255,152,0,0.15);color:#ff9800}
    .badge-cyan{background:rgba(0,212,255,0.15);color:#00d4ff} .badge-red{background:rgba(255,80,80,0.15);color:#ff5555}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;animation:pulse 2s infinite}
    .dot-green{background:#4caf50} .dot-red{background:#ff5555}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
    canvas{max-height:280px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    @media(max-width:768px){.grid2{grid-template-columns:1fr}.cards{grid-template-columns:repeat(2,1fr)}}
  </style>
</head>
<body>
  <div class="header">
    <h1>CATCH&RUN Admin</h1>
    <div style="display:flex;gap:12px;align-items:center">
      <a href="#" onclick="exportPDF()" style="background:rgba(0,212,255,0.12);border:1px solid #00d4ff;color:#00d4ff;padding:6px 14px;border-radius:8px;font-size:0.8rem;text-decoration:none;font-weight:600">Export PDF</a>
      <a href="/admin/logout">Logout</a>
    </div>
  </div>

  <div class="cards">
    <div class="card c1"><div class="label">Visits Today</div><div class="value" id="s-visits">-</div><div class="sub">sessions today</div></div>
    <div class="card c2"><div class="label"><span class="dot dot-green"></span>Active Now</div><div class="value" id="s-active">0</div><div class="sub">players online</div></div>
    <div class="card c3"><div class="label">Unique Players Today</div><div class="value" id="s-players">-</div><div class="sub">by IP address</div></div>
    <div class="card c4"><div class="label">Avg Play Time</div><div class="value" id="s-avgtime">-</div><div class="sub">today's average</div></div>
    <div class="card c5"><div class="label">Total Sessions</div><div class="value" id="s-total">-</div><div class="sub">all time</div></div>
    <div class="card c6"><div class="label">Total Avg Duration</div><div class="value" id="s-totalavg">-</div><div class="sub">all time average</div></div>
  </div>

  <div class="chart-box">
    <div class="chart-header">
      <h3>Game Sessions</h3>
      <div class="filter-btns">
        <button class="filter-btn" data-days="7">7D</button>
        <button class="filter-btn active" data-days="30">30D</button>
        <button class="filter-btn" data-days="90">3M</button>
        <button class="filter-btn" data-days="365">1Y</button>
      </div>
    </div>
    <canvas id="dailyChart"></canvas>
  </div>

  <div class="grid2">
    <div class="section">
      <h3>Live Rooms</h3>
      <table><thead><tr><th>Room</th><th>Players</th><th>Phase</th></tr></thead><tbody id="live-rooms"><tr><td colspan="3" style="color:#555">Loading...</td></tr></tbody></table>
    </div>
    <div class="section">
      <h3>Player Locations</h3>
      <table><thead><tr><th>Country</th><th>City</th><th>Players</th></tr></thead><tbody id="locations"><tr><td colspan="3" style="color:#555">Loading...</td></tr></tbody></table>
    </div>
  </div>

  <div class="section">
    <h3>Recent Sessions</h3>
    <table><thead><tr><th>Nickname</th><th>Location</th><th>Duration</th><th>Role</th><th>Score</th><th>Kills</th></tr></thead><tbody id="sessions"><tr><td colspan="6" style="color:#555">Loading...</td></tr></tbody></table>
  </div>

  <script>
    let chart=null, currentDays=30;
    function fmt(ms){if(!ms||ms<=0)return'-';const s=Math.floor(ms/1000);if(s<60)return s+'s';const m=Math.floor(s/60);return m+'m '+s%60+'s'}
    function badge(t,c){return'<span class="badge badge-'+c+'">'+t+'</span>'}

    async function loadStats(days){
      currentDays=days||currentDays;
      const r=await fetch('/admin/api/stats?days='+currentDays);
      const d=await r.json();
      document.getElementById('s-visits').textContent=d.today.sessions;
      document.getElementById('s-active').textContent=d.activeCount;
      document.getElementById('s-players').textContent=d.today.players;
      document.getElementById('s-avgtime').textContent=fmt(d.today.avgDuration);
      document.getElementById('s-total').textContent=d.totalSessions;
      document.getElementById('s-totalavg').textContent=fmt(d.avgDurationAll);

      const labels=d.daily.map(x=>x.date.slice(5));
      const sessions=d.daily.map(x=>x.sessions);
      const players=d.daily.map(x=>x.players);

      if(chart)chart.destroy();
      chart=new Chart(document.getElementById('dailyChart'),{
        type:'line',
        data:{labels,datasets:[
          {label:'Sessions',data:sessions,borderColor:'#ff9800',backgroundColor:'rgba(255,152,0,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'#ff9800'},
          {label:'Unique Players',data:players,borderColor:'#00d4ff',backgroundColor:'rgba(0,212,255,0.08)',fill:true,tension:0.4,pointRadius:3,pointBackgroundColor:'#00d4ff'}
        ]},
        options:{responsive:true,interaction:{intersect:false,mode:'index'},
          plugins:{legend:{labels:{color:'#888',usePointStyle:true,pointStyle:'circle'}},
            tooltip:{backgroundColor:'#1a1a3e',borderColor:'#333',borderWidth:1,titleColor:'#fff',bodyColor:'#ccc',padding:12}},
          scales:{x:{ticks:{color:'#555'},grid:{color:'rgba(255,255,255,0.03)'}},
                  y:{ticks:{color:'#555'},grid:{color:'rgba(255,255,255,0.03)'},beginAtZero:true}}}
      });
    }

    async function loadLive(){
      const r=await fetch('/admin/api/live');const rooms=await r.json();
      const t=document.getElementById('live-rooms');
      if(!rooms.length){t.innerHTML='<tr><td colspan="3" style="color:#555">No active rooms</td></tr>';return}
      t.innerHTML=rooms.map(r=>'<tr><td>'+r.name+'</td><td>'+r.clients+'/'+r.maxClients+'</td><td>'+
        badge(r.phase==='waiting'?'LOBBY':'ACTIVE',r.phase==='waiting'?'green':'orange')+'</td></tr>').join('');
    }

    async function loadSessions(){
      const r=await fetch('/admin/api/sessions');const list=await r.json();
      document.getElementById('sessions').innerHTML=list.slice(0,50).map(s=>
        '<tr><td>'+s.nickname+'</td><td>'+s.country+', '+s.city+'</td><td>'+fmt(s.durationMs)+'</td><td>'+
        (s.role==='hunter'?badge('HUNTER','red'):s.role==='prop'?badge('PROP','cyan'):(s.role||'-'))+
        '</td><td>'+(s.score||0)+'</td><td>'+(s.kills||0)+'</td></tr>').join('');
    }

    async function loadLocations(){
      const r=await fetch('/admin/api/locations');const list=await r.json();
      document.getElementById('locations').innerHTML=!list.length
        ?'<tr><td colspan="3" style="color:#555">No data yet</td></tr>'
        :list.map(l=>'<tr><td>'+l.country+'</td><td>'+l.city+'</td><td>'+l.count+'</td></tr>').join('');
    }

    document.querySelectorAll('.filter-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        loadStats(Number(btn.dataset.days));
      });
    });

    function exportPDF(){window.open('/admin/api/export-pdf?days='+currentDays,'_blank')}

    async function refresh(){await Promise.all([loadStats(),loadLive(),loadSessions(),loadLocations()])}
    refresh();setInterval(refresh,30000);
  </script>
</body>
</html>`;
}
