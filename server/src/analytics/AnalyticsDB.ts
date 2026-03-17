import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export class AnalyticsDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.resolve(process.cwd(), "data", "analytics.db");
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT NOT NULL,
        nickname TEXT NOT NULL,
        ip TEXT DEFAULT '',
        country TEXT DEFAULT 'Unknown',
        city TEXT DEFAULT 'Unknown',
        joinedAt INTEGER NOT NULL,
        leftAt INTEGER DEFAULT 0,
        durationMs INTEGER DEFAULT 0,
        roomId TEXT DEFAULT '',
        role TEXT DEFAULT '',
        score INTEGER DEFAULT 0,
        kills INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_joined ON player_sessions(joinedAt);
      CREATE INDEX IF NOT EXISTS idx_sessions_ip ON player_sessions(ip);
    `);
  }

  logJoin(sessionId: string, nickname: string, ip: string, roomId: string, country = "Unknown", city = "Unknown") {
    this.db.prepare(
      `INSERT INTO player_sessions (sessionId, nickname, ip, country, city, joinedAt, roomId)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(sessionId, nickname, ip, country, city, Date.now(), roomId);
  }

  logLeave(sessionId: string, role: string, score: number, kills: number) {
    const now = Date.now();
    this.db.prepare(
      `UPDATE player_sessions
       SET leftAt = ?, durationMs = ? - joinedAt, role = ?, score = ?, kills = ?
       WHERE sessionId = ? AND leftAt = 0`
    ).run(now, now, role, score, kills, sessionId);
  }

  getDailyStats(days = 30): { date: string; players: number; sessions: number; avgDuration: number }[] {
    const since = Date.now() - days * 86400000;
    return this.db.prepare(`
      SELECT
        date(joinedAt / 1000, 'unixepoch', 'localtime') as date,
        COUNT(DISTINCT ip) as players,
        COUNT(*) as sessions,
        COALESCE(AVG(CASE WHEN durationMs > 0 THEN durationMs END), 0) as avgDuration
      FROM player_sessions
      WHERE joinedAt >= ?
      GROUP BY date
      ORDER BY date ASC
    `).all(since) as any[];
  }

  getTodayStats(): { players: number; sessions: number; avgDuration: number } {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const row = this.db.prepare(`
      SELECT
        COUNT(DISTINCT ip) as players,
        COUNT(*) as sessions,
        COALESCE(AVG(CASE WHEN durationMs > 0 THEN durationMs END), 0) as avgDuration
      FROM player_sessions
      WHERE joinedAt >= ?
    `).get(todayStart.getTime()) as any;
    return row || { players: 0, sessions: 0, avgDuration: 0 };
  }

  getRecentSessions(limit = 50): any[] {
    return this.db.prepare(`
      SELECT sessionId, nickname, ip, country, city, joinedAt, leftAt, durationMs, roomId, role, score, kills
      FROM player_sessions
      ORDER BY joinedAt DESC
      LIMIT ?
    `).all(limit);
  }

  getLocationStats(): { country: string; city: string; count: number }[] {
    return this.db.prepare(`
      SELECT country, city, COUNT(DISTINCT ip) as count
      FROM player_sessions
      WHERE country != 'Unknown'
      GROUP BY country, city
      ORDER BY count DESC
    `).all() as any[];
  }

  getActiveSessions(): any[] {
    return this.db.prepare(
      `SELECT sessionId, nickname, ip, country, city, joinedAt, roomId
       FROM player_sessions
       WHERE leftAt = 0`
    ).all();
  }
}
