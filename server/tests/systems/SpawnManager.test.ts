import { describe, it, expect } from "vitest";
import { SpawnManager } from "../../src/systems/SpawnManager";
import { TEST_MAP_DATA } from "../helpers/factories";

describe("SpawnManager", () => {
  it("should return hunter spawn points in round-robin order", () => {
    const mgr = new SpawnManager(TEST_MAP_DATA as any);

    const s1 = mgr.getHunterSpawn();
    expect(s1.position).toEqual(TEST_MAP_DATA.hunterSpawnPoints[0].position);

    const s2 = mgr.getHunterSpawn();
    expect(s2.position).toEqual(TEST_MAP_DATA.hunterSpawnPoints[1].position);

    const s3 = mgr.getHunterSpawn();
    expect(s3.position).toEqual(TEST_MAP_DATA.hunterSpawnPoints[0].position);
  });

  it("should return prop spawn points in round-robin order", () => {
    const mgr = new SpawnManager(TEST_MAP_DATA as any);

    const s1 = mgr.getPropSpawn();
    expect(s1.position).toEqual(TEST_MAP_DATA.propSpawnPoints[0].position);

    const s2 = mgr.getPropSpawn();
    expect(s2.position).toEqual(TEST_MAP_DATA.propSpawnPoints[1].position);

    const s3 = mgr.getPropSpawn();
    expect(s3.position).toEqual(TEST_MAP_DATA.propSpawnPoints[2].position);

    const s4 = mgr.getPropSpawn();
    expect(s4.position).toEqual(TEST_MAP_DATA.propSpawnPoints[0].position);
  });

  it("should reset spawn counters", () => {
    const mgr = new SpawnManager(TEST_MAP_DATA as any);

    mgr.getHunterSpawn();
    mgr.getHunterSpawn();
    mgr.getPropSpawn();

    mgr.resetSpawnCounters();

    const h = mgr.getHunterSpawn();
    expect(h.position).toEqual(TEST_MAP_DATA.hunterSpawnPoints[0].position);

    const p = mgr.getPropSpawn();
    expect(p.position).toEqual(TEST_MAP_DATA.propSpawnPoints[0].position);
  });

  it("should handle hunter and prop spawns independently", () => {
    const mgr = new SpawnManager(TEST_MAP_DATA as any);

    mgr.getHunterSpawn();
    const p1 = mgr.getPropSpawn();
    expect(p1.position).toEqual(TEST_MAP_DATA.propSpawnPoints[0].position);

    mgr.getHunterSpawn();
    const p2 = mgr.getPropSpawn();
    expect(p2.position).toEqual(TEST_MAP_DATA.propSpawnPoints[1].position);
  });
});
