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
        // Test files
        "src/browser/**/*.test.ts",
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
      thresholds: {
        lines: 25,
        functions: 23,
        branches: 15,
        statements: 24,
      },
    },
  },
});
