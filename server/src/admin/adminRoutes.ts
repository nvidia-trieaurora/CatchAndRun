import { Router } from "express";
import session from "express-session";
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

  router.get("/admin/api/stats", requireAdmin, (_req, res) => {
    const daily = analyticsDB.getDailyStats(30);
    const today = analyticsDB.getTodayStats();
    const active = analyticsDB.getActiveSessions();
    res.json({ daily, today, activeCount: active.length });
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

  router.get("/admin", requireAdmin, (_req, res) => {
    res.send(getDashboardHTML());
  });

  return router;
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a1a; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 20px; }
    h1 { font-size: 1.5rem; margin-bottom: 20px; background: linear-gradient(135deg, #00d4ff, #7b2ff7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; display: inline-block; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header a { color: #888; text-decoration: none; font-size: 0.85rem; }
    .header a:hover { color: #fff; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: rgba(255,255,255,0.04); border: 1px solid #222; border-radius: 10px; padding: 16px; }
    .card .label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 1px; }
    .card .value { font-size: 1.8rem; font-weight: 700; margin-top: 4px; }
    .card .value.cyan { color: #00d4ff; }
    .card .value.green { color: #4caf50; }
    .card .value.orange { color: #ff9800; }
    .card .value.purple { color: #7b2ff7; }
    .chart-container { background: rgba(255,255,255,0.04); border: 1px solid #222; border-radius: 10px; padding: 16px; margin-bottom: 24px; }
    .chart-container h3 { font-size: 0.85rem; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 0.7rem; color: #666; text-transform: uppercase; letter-spacing: 1px; padding: 8px 12px; border-bottom: 1px solid #222; }
    td { padding: 8px 12px; font-size: 0.85rem; border-bottom: 1px solid #1a1a2e; }
    tr:hover td { background: rgba(255,255,255,0.03); }
    .section { background: rgba(255,255,255,0.04); border: 1px solid #222; border-radius: 10px; padding: 16px; margin-bottom: 24px; }
    .section h3 { font-size: 0.85rem; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
    .badge-green { background: rgba(76,175,80,0.2); color: #4caf50; }
    .badge-orange { background: rgba(255,152,0,0.2); color: #ff9800; }
    .badge-cyan { background: rgba(0,212,255,0.2); color: #00d4ff; }
    .badge-red { background: rgba(255,80,80,0.2); color: #ff5555; }
    canvas { max-height: 250px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 768px) { .grid2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>CATCH&RUN Admin</h1>
    <a href="/admin/logout">Logout</a>
  </div>

  <div class="cards" id="cards">
    <div class="card"><div class="label">Players Today</div><div class="value cyan" id="stat-players">-</div></div>
    <div class="card"><div class="label">Active Now</div><div class="value green" id="stat-active">-</div></div>
    <div class="card"><div class="label">Sessions Today</div><div class="value orange" id="stat-sessions">-</div></div>
    <div class="card"><div class="label">Avg Play Time</div><div class="value purple" id="stat-avgtime">-</div></div>
  </div>

  <div class="chart-container">
    <h3>Daily Players (30 days)</h3>
    <canvas id="dailyChart"></canvas>
  </div>

  <div class="grid2">
    <div class="section">
      <h3>Live Rooms</h3>
      <table><thead><tr><th>Room</th><th>Players</th><th>Phase</th></tr></thead><tbody id="live-rooms"><tr><td colspan="3">Loading...</td></tr></tbody></table>
    </div>
    <div class="section">
      <h3>Player Locations</h3>
      <table><thead><tr><th>Country</th><th>City</th><th>Players</th></tr></thead><tbody id="locations"><tr><td colspan="3">Loading...</td></tr></tbody></table>
    </div>
  </div>

  <div class="section">
    <h3>Recent Sessions</h3>
    <table><thead><tr><th>Nickname</th><th>Location</th><th>Duration</th><th>Role</th><th>Score</th><th>Kills</th></tr></thead><tbody id="sessions"><tr><td colspan="6">Loading...</td></tr></tbody></table>
  </div>

  <script>
    let chart = null;

    function fmtDuration(ms) {
      if (!ms || ms <= 0) return '-';
      const s = Math.floor(ms / 1000);
      if (s < 60) return s + 's';
      return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    }

    function badge(text, cls) { return '<span class="badge badge-' + cls + '">' + text + '</span>'; }

    async function loadStats() {
      const res = await fetch('/admin/api/stats');
      const data = await res.json();
      document.getElementById('stat-players').textContent = data.today.players;
      document.getElementById('stat-active').textContent = data.activeCount;
      document.getElementById('stat-sessions').textContent = data.today.sessions;
      document.getElementById('stat-avgtime').textContent = fmtDuration(data.today.avgDuration);

      const labels = data.daily.map(d => d.date.slice(5));
      const players = data.daily.map(d => d.players);
      const sessions = data.daily.map(d => d.sessions);

      if (chart) chart.destroy();
      chart = new Chart(document.getElementById('dailyChart'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Unique Players', data: players, borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)', fill: true, tension: 0.3 },
            { label: 'Sessions', data: sessions, borderColor: '#ff9800', backgroundColor: 'rgba(255,152,0,0.1)', fill: true, tension: 0.3 },
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: '#888' } } },
          scales: {
            x: { ticks: { color: '#666' }, grid: { color: '#1a1a2e' } },
            y: { ticks: { color: '#666' }, grid: { color: '#1a1a2e' }, beginAtZero: true }
          }
        }
      });
    }

    async function loadLive() {
      const res = await fetch('/admin/api/live');
      const rooms = await res.json();
      const tbody = document.getElementById('live-rooms');
      if (rooms.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="color:#666">No active rooms</td></tr>'; return; }
      tbody.innerHTML = rooms.map(r =>
        '<tr><td>' + r.name + '</td><td>' + r.clients + '/' + r.maxClients + '</td><td>' +
        badge(r.phase === 'waiting' ? 'LOBBY' : 'ACTIVE', r.phase === 'waiting' ? 'green' : 'orange') + '</td></tr>'
      ).join('');
    }

    async function loadSessions() {
      const res = await fetch('/admin/api/sessions');
      const list = await res.json();
      document.getElementById('sessions').innerHTML = list.slice(0, 50).map(s =>
        '<tr><td>' + s.nickname + '</td><td>' + s.country + ', ' + s.city +
        '</td><td>' + fmtDuration(s.durationMs) + '</td><td>' +
        (s.role === 'hunter' ? badge('HUNTER','red') : s.role === 'prop' ? badge('PROP','cyan') : (s.role || '-')) +
        '</td><td>' + (s.score || 0) + '</td><td>' + (s.kills || 0) + '</td></tr>'
      ).join('');
    }

    async function loadLocations() {
      const res = await fetch('/admin/api/locations');
      const list = await res.json();
      document.getElementById('locations').innerHTML = list.length === 0
        ? '<tr><td colspan="3" style="color:#666">No data yet</td></tr>'
        : list.map(l => '<tr><td>' + l.country + '</td><td>' + l.city + '</td><td>' + l.count + '</td></tr>').join('');
    }

    async function refresh() {
      await Promise.all([loadStats(), loadLive(), loadSessions(), loadLocations()]);
    }

    refresh();
    setInterval(refresh, 30000);
  </script>
</body>
</html>`;
}
