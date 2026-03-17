import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { GameRoom } from "./rooms/GameRoom";
import { DEFAULT_SERVER_PORT } from "@catch-and-run/shared";
import { AnalyticsDB } from "./analytics/AnalyticsDB";
import { createAdminRouter } from "./admin/adminRoutes";

const app = express();
app.use(cors());
app.use(express.json());

const analyticsDB = new AnalyticsDB();
GameRoom.analyticsDB = analyticsDB;

const httpServer = createServer(app);

const gameServer = new Server({
  server: httpServer,
});

gameServer.define("game_room", GameRoom)
  .enableRealtimeListing()
  .sortBy({ clients: -1 });

app.use(createAdminRouter(analyticsDB, gameServer));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;

void gameServer.listen(port).then(() => {
  console.log(`[Catch&Run] Server listening on http://localhost:${port}`);
  console.log(`[Catch&Run] Admin Dashboard: http://localhost:${port}/admin`);
  console.log(`[Catch&Run] Colyseus Monitor: http://localhost:${port}/colyseus`);
});
