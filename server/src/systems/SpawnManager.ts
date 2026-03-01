import type { MapData, SpawnPoint } from "@catch-and-run/shared";

export class SpawnManager {
  private mapData: MapData;
  private hunterSpawnIndex = 0;
  private propSpawnIndex = 0;

  constructor(mapData: MapData) {
    this.mapData = mapData;
  }

  getHunterSpawn(): SpawnPoint {
    const spawns = this.mapData.hunterSpawnPoints;
    const spawn = spawns[this.hunterSpawnIndex % spawns.length];
    this.hunterSpawnIndex++;
    return spawn;
  }

  getPropSpawn(): SpawnPoint {
    const spawns = this.mapData.propSpawnPoints;
    const spawn = spawns[this.propSpawnIndex % spawns.length];
    this.propSpawnIndex++;
    return spawn;
  }

  resetSpawnCounters() {
    this.hunterSpawnIndex = 0;
    this.propSpawnIndex = 0;
  }
}
