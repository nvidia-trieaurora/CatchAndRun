import { describe, it, expect, beforeEach, vi } from "vitest";
import { PropTransformValidator } from "../../src/systems/PropTransformValidator";
import { createMockRoom, createPlayer, type MockGameRoom } from "../helpers/factories";
import { PROP_TRANSFORM_COOLDOWN_MS } from "@catch-and-run/shared";

describe("PropTransformValidator", () => {
  let room: MockGameRoom;
  let validator: PropTransformValidator;

  beforeEach(() => {
    room = createMockRoom();
    validator = new PropTransformValidator(room as any);
  });

  it("should accept valid prop ID", () => {
    const player = createPlayer({ currentPropId: "barrel", lastTransformTime: 0 });
    const result = validator.validate(player, "crate");

    expect(result.success).toBe(true);
    expect(result.propId).toBe("crate");
  });

  it("should reject invalid prop ID", () => {
    const player = createPlayer({ lastTransformTime: 0 });
    const result = validator.validate(player, "nonexistent-prop");

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Invalid prop ID");
  });

  it("should reject transform during cooldown", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const player = createPlayer({
      currentPropId: "barrel",
      lastTransformTime: now - 1000,
    });

    const result = validator.validate(player, "crate");

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Cooldown");
    vi.restoreAllMocks();
  });

  it("should allow transform after cooldown expires", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const player = createPlayer({
      currentPropId: "barrel",
      lastTransformTime: now - PROP_TRANSFORM_COOLDOWN_MS - 1,
    });

    const result = validator.validate(player, "crate");

    expect(result.success).toBe(true);
    vi.restoreAllMocks();
  });

  it("should reject transforming into the same prop", () => {
    const player = createPlayer({
      currentPropId: "crate",
      lastTransformTime: 0,
    });

    const result = validator.validate(player, "crate");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("Already transformed into this prop");
  });

  it("should allow first transform (lastTransformTime = 0)", () => {
    const player = createPlayer({
      currentPropId: "",
      lastTransformTime: 0,
    });

    const result = validator.validate(player, "crate");
    expect(result.success).toBe(true);
  });
});
