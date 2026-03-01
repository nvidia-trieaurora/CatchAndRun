import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/systems/**", "src/utils/**"],
    },
  },
  resolve: {
    alias: {
      "@catch-and-run/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
