import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { GameRoom } from "./rooms/GameRoom";
import { DEFAULT_SERVER_PORT } from "@catch-and-run/shared";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

const gameServer = new Server({
  server: httpServer,
});

gameServer.define("game_room", GameRoom).enableRealtimeListing();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;

gameServer.listen(port).then(() => {
  console.log(`[Catch&Run] Server listening on http://localhost:${port}`);
  console.log(`[Catch&Run] Colyseus Monitor: http://localhost:${port}/colyseus`);
});
