import { Client } from "colyseus.js";

const client = new Client("ws://localhost:2567");

async function test() {
  console.log("[DEBUG] Connecting...");
  const room = await client.joinOrCreate("game_room", { nickname: "DebugPlayer" });
  console.log("[DEBUG] Joined room:", room.id, "sessionId:", room.sessionId);
  console.log("[DEBUG] room.state:", room.state);
  console.log("[DEBUG] room.state type:", typeof room.state);

  if (room.state) {
    const s = room.state as any;
    console.log("[DEBUG] phase:", s.phase);
    console.log("[DEBUG] roomCode:", s.roomCode);
    console.log("[DEBUG] roomName:", s.roomName);
    console.log("[DEBUG] players:", s.players);
    console.log("[DEBUG] players type:", typeof s.players);
    console.log("[DEBUG] players.size:", s.players?.size);

    if (s.players) {
      console.log("[DEBUG] Trying forEach...");
      try {
        s.players.forEach((p: any, key: string) => {
          console.log("[DEBUG] Player:", key, "nickname:", p.nickname, "isHost:", p.isHost);
        });
      } catch (e) {
        console.error("[DEBUG] forEach failed:", e);
      }

      console.log("[DEBUG] Trying for-of entries...");
      try {
        for (const [key, p] of (s.players as any).entries()) {
          console.log("[DEBUG] Player entry:", key, p.nickname);
        }
      } catch (e) {
        console.error("[DEBUG] entries failed:", e);
      }

      console.log("[DEBUG] Trying keys...");
      try {
        const keys = Array.from((s.players as any).keys());
        console.log("[DEBUG] Player keys:", keys);
      } catch (e) {
        console.error("[DEBUG] keys failed:", e);
      }
    }

    console.log("[DEBUG] chat:", s.chat);
    console.log("[DEBUG] chat length:", s.chat?.length);
    if (s.chat) {
      s.chat.forEach((m: any) => {
        console.log("[DEBUG] Chat msg:", m.sender, m.message);
      });
    }
  }

  room.onStateChange((state: any) => {
    console.log("[DEBUG] onStateChange fired! phase:", state.phase, "players.size:", state.players?.size);
    if (state.players) {
      state.players.forEach((p: any, key: string) => {
        console.log("[DEBUG] SC Player:", key, "nick:", p.nickname);
      });
    }
  });

  setTimeout(() => {
    console.log("[DEBUG] After 2s - room.state.players.size:", (room.state as any)?.players?.size);
    (room.state as any)?.players?.forEach((p: any, key: string) => {
      console.log("[DEBUG] 2s Player:", key, "nick:", p.nickname);
    });
    room.leave();
  }, 2000);
}

test().catch(e => console.error("[DEBUG] Error:", e));
