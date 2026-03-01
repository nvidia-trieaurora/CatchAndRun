import { describe, it, expect } from "vitest";
import { SnapshotBuffer } from "../../src/utils/SnapshotBuffer";

describe("SnapshotBuffer", () => {
  function makePositions(entries: [string, number, number, number][]) {
    const map = new Map<string, { x: number; y: number; z: number }>();
    for (const [id, x, y, z] of entries) {
      map.set(id, { x, y, z });
    }
    return map;
  }

  it("should return null when empty", () => {
    const buf = new SnapshotBuffer();
    expect(buf.getLatest()).toBeNull();
    expect(buf.getAtTime(1000)).toBeNull();
  });

  it("should store and retrieve the latest snapshot", () => {
    const buf = new SnapshotBuffer();
    const pos = makePositions([["p1", 1, 2, 3]]);
    buf.push(100, pos);

    const latest = buf.getLatest();
    expect(latest).not.toBeNull();
    expect(latest!.timestamp).toBe(100);
    expect(latest!.positions.get("p1")).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("should retrieve snapshot closest to requested time (at or before)", () => {
    const buf = new SnapshotBuffer();
    buf.push(100, makePositions([["p1", 0, 0, 0]]));
    buf.push(200, makePositions([["p1", 5, 0, 0]]));
    buf.push(300, makePositions([["p1", 10, 0, 0]]));

    const snap = buf.getAtTime(250);
    expect(snap).not.toBeNull();
    expect(snap!.timestamp).toBe(200);
    expect(snap!.positions.get("p1")!.x).toBe(5);
  });

  it("should return earliest snapshot when requested time is before all snapshots", () => {
    const buf = new SnapshotBuffer();
    buf.push(100, makePositions([["p1", 1, 0, 0]]));
    buf.push(200, makePositions([["p1", 2, 0, 0]]));

    const snap = buf.getAtTime(50);
    expect(snap).not.toBeNull();
    expect(snap!.timestamp).toBe(100);
  });

  it("should return exact match when timestamp matches", () => {
    const buf = new SnapshotBuffer();
    buf.push(100, makePositions([["p1", 1, 0, 0]]));
    buf.push(200, makePositions([["p1", 2, 0, 0]]));
    buf.push(300, makePositions([["p1", 3, 0, 0]]));

    const snap = buf.getAtTime(200);
    expect(snap!.timestamp).toBe(200);
  });

  it("should cap at MAX_SNAPSHOTS (20) and evict oldest", () => {
    const buf = new SnapshotBuffer();
    for (let i = 0; i < 25; i++) {
      buf.push(i * 100, makePositions([["p1", i, 0, 0]]));
    }

    const earliest = buf.getAtTime(0);
    expect(earliest!.timestamp).toBe(500);
  });

  it("should store independent copies of positions (no shared references)", () => {
    const buf = new SnapshotBuffer();
    const pos = makePositions([["p1", 1, 2, 3]]);
    buf.push(100, pos);

    pos.set("p1", { x: 99, y: 99, z: 99 });

    const snap = buf.getLatest();
    expect(snap!.positions.get("p1")).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("should handle multiple players in a snapshot", () => {
    const buf = new SnapshotBuffer();
    buf.push(100, makePositions([
      ["p1", 0, 0, 0],
      ["p2", 5, 5, 5],
      ["p3", -3, 1, 7],
    ]));

    const snap = buf.getLatest();
    expect(snap!.positions.size).toBe(3);
    expect(snap!.positions.get("p2")).toEqual({ x: 5, y: 5, z: 5 });
  });
});
