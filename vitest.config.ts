import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/smoke/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/browser/**/*.ts"],
      exclude: [
        "src/browser/**/*.test.ts",
        "src/browser/**/*.d.ts",
        "src/browser/script.ts",
      ],
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 14,
        statements: 20,
      },
    },
  },
});
