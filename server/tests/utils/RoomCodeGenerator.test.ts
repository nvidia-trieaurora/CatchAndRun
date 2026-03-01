import { describe, it, expect } from "vitest";
import { generateRoomCode } from "../../src/utils/RoomCodeGenerator";
import { ROOM_CODE_LENGTH } from "@catch-and-run/shared";

describe("generateRoomCode", () => {
  const VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  it("should generate a code of correct length", () => {
    const code = generateRoomCode();
    expect(code.length).toBe(ROOM_CODE_LENGTH);
  });

  it("should only contain valid characters (no ambiguous 0/O, 1/I)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(VALID_CHARS).toContain(char);
      }
    }
  });

  it("should not contain ambiguous characters O, I, 0, 1", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[OI01]/);
    }
  });

  it("should generate unique codes (high probability)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateRoomCode());
    }
    expect(codes.size).toBeGreaterThan(95);
  });
});
