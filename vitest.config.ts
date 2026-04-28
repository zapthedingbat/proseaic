import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    maxWorkers: 8,
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/smoke/**"],
    reporters: ["default", "junit"],
    outputFile: { junit: "test-results/junit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json-summary"],
      include: ["src/browser/**/*.ts"],
      exclude: [
        "src/browser/**/*.d.ts",
        // Entry point — bootstrap wiring only
        "src/browser/script.ts",
        "src/browser/app.ts",
        // WebComponents — DOM rendering logic, covered by smoke tests
        "src/browser/components/**",
        // Trivial wrappers / DI infrastructure
        "src/browser/lib/logging/console-logger.ts",
        "src/browser/lib/ui/component-factory.ts",
      ],
      // Thresholds are intentionally low while test coverage is being built out.
      // Ratchet these up as more tests are added.
      thresholds: {
        lines: 25,
        functions: 23,
        branches: 15,
        statements: 24,
      },
    },
  },
});
