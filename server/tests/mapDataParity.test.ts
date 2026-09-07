import { describe, expect, it } from "vitest";
import clientMap from "../../client/src/game/world/harbor-warehouse.json";
import serverMap from "../src/data/maps/harbor-warehouse.json";

describe("Harbor map data parity", () => {
  it("keeps gameplay layout and wall occlusion synchronized", () => {
    expect(clientMap.bounds).toEqual(serverMap.bounds);
    expect(clientMap.hunterSpawnPoints).toEqual(serverMap.hunterSpawnPoints);
    expect(clientMap.propSpawnPoints).toEqual(serverMap.propSpawnPoints);
    expect(clientMap.props).toEqual(serverMap.props);
    expect(clientMap.killZoneY).toEqual(serverMap.killZoneY);
    expect(clientMap.waterHazards).toEqual(serverMap.waterHazards);
    expect(clientMap.wallOcclusion).toEqual(serverMap.wallOcclusion);
  });
});
